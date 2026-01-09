#!/bin/bash
# =============================================================================
# LINDAS Cube Cleanup Script for GitLab CI/CD
#
# This script:
# 1. Identifies cube versions to delete (keeping newest 2)
# 2. Backs up each cube before deletion
# 3. Deletes old versions
# 4. Provides restore capability
#
# Usage:
#   ./lindas-cleanup.sh cleanup [OPTIONS]     # Run cleanup with backup
#   ./lindas-cleanup.sh restore <backup>      # Restore from backup
#   ./lindas-cleanup.sh list-backups          # List available backups
#   ./lindas-cleanup.sh preview               # Preview what would be deleted
#
# Environment variables (for GitLab CI/CD):
#   SPARQL_QUERY_ENDPOINT   Query endpoint URL
#   SPARQL_UPDATE_ENDPOINT  Update endpoint URL
#   SPARQL_USERNAME         Basic auth username (optional)
#   SPARQL_PASSWORD         Basic auth password (optional)
#   GRAPH_URI               Named graph URI
#   BACKUP_DIR              Directory for backups (default: ./backups)
#   VERSIONS_TO_KEEP        Number of versions to keep (default: 2)
# =============================================================================

set -e

# Configuration from environment or defaults
QUERY_ENDPOINT="${SPARQL_QUERY_ENDPOINT:-http://localhost:3030/lindas/query}"
UPDATE_ENDPOINT="${SPARQL_UPDATE_ENDPOINT:-http://localhost:3030/lindas/update}"
GRAPH_URI="${GRAPH_URI:-https://lindas.admin.ch/sfoe/cube}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
VERSIONS_TO_KEEP="${VERSIONS_TO_KEEP:-2}"
USERNAME="${SPARQL_USERNAME:-}"
PASSWORD="${SPARQL_PASSWORD:-}"

# Build auth options
AUTH=""
if [[ -n "$USERNAME" && -n "$PASSWORD" ]]; then
    AUTH="-u ${USERNAME}:${PASSWORD}"
fi

# Colors for output (disabled if not terminal)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    NC=''
fi

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# SPARQL Queries
# =============================================================================

get_cubes_to_delete() {
    cat << EOF
PREFIX cube: <https://cube.link/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?cube ?version ?rank ?baseCube
WHERE {
  {
    SELECT ?cube (COUNT(?newerCube) + 1 AS ?rank)
    WHERE {
      GRAPH <${GRAPH_URI}> {
        ?cube a cube:Cube .
        FILTER(REGEX(STR(?cube), "^.*/[0-9]+/?$"))
        BIND(xsd:integer(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "\$1")) AS ?v)
        BIND(REPLACE(STR(?cube), "^(.*)/[0-9]+/?$", "\$1") AS ?baseStr)
        OPTIONAL {
          ?newerCube a cube:Cube .
          FILTER(REGEX(STR(?newerCube), "^.*/[0-9]+/?$"))
          FILTER(REPLACE(STR(?newerCube), "^(.*)/[0-9]+/?$", "\$1") = ?baseStr)
          FILTER(xsd:integer(REPLACE(STR(?newerCube), "^.*/([0-9]+)/?$", "\$1")) > ?v)
        }
      }
    }
    GROUP BY ?cube
  }
  FILTER(?rank > ${VERSIONS_TO_KEEP})
  BIND(xsd:integer(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "\$1")) AS ?version)
  BIND(IRI(REPLACE(STR(?cube), "^(.*)/[0-9]+/?$", "\$1")) AS ?baseCube)
}
ORDER BY ?baseCube DESC(?version)
EOF
}

get_export_query() {
    local CUBE_URI="$1"
    cat << EOF
PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>

CONSTRUCT { ?s ?p ?o }
WHERE {
  GRAPH <${GRAPH_URI}> {
    { BIND(<${CUBE_URI}> AS ?s) <${CUBE_URI}> ?p ?o . }
    UNION
    { <${CUBE_URI}> cube:observationConstraint ?shape . ?shape (<>|!<>)* ?s . ?s ?p ?o . }
    UNION
    { <${CUBE_URI}> cube:observationSet ?set . ?set ?p ?o . BIND(?set AS ?s) }
    UNION
    { <${CUBE_URI}> cube:observationSet/cube:observation ?obs . ?obs ?p ?o . BIND(?obs AS ?s) }
  }
}
EOF
}

get_delete_query() {
    local CUBE_URI="$1"
    cat << EOF
PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>

WITH <${GRAPH_URI}>
DELETE { ?s ?p ?o . }
WHERE {
  { BIND(<${CUBE_URI}> AS ?s) <${CUBE_URI}> ?p ?o . }
  UNION
  { <${CUBE_URI}> cube:observationConstraint ?shape . ?shape (<>|!<>)* ?s . ?s ?p ?o . }
  UNION
  { <${CUBE_URI}> cube:observationSet ?set . ?set ?p ?o . BIND(?set AS ?s) }
  UNION
  { <${CUBE_URI}> cube:observationSet/cube:observation ?obs . ?obs ?p ?o . BIND(?obs AS ?s) }
}
EOF
}

# =============================================================================
# Functions
# =============================================================================

run_query() {
    local QUERY="$1"
    curl -s $AUTH \
        -X POST \
        -H "Accept: application/sparql-results+json" \
        -H "Content-Type: application/sparql-query" \
        --data "$QUERY" \
        "$QUERY_ENDPOINT"
}

run_update() {
    local QUERY="$1"
    local RESPONSE=$(curl -s -w "\n%{http_code}" $AUTH \
        -X POST \
        -H "Content-Type: application/sparql-update" \
        --data "$QUERY" \
        "$UPDATE_ENDPOINT")
    local HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "204" ]]; then
        log_error "SPARQL update failed: HTTP $HTTP_CODE"
        echo "$RESPONSE" | head -n -1
        return 1
    fi
}

run_construct() {
    local QUERY="$1"
    curl -s $AUTH \
        -X POST \
        -H "Accept: application/n-triples" \
        -H "Content-Type: application/sparql-query" \
        --data "$QUERY" \
        "$QUERY_ENDPOINT"
}

backup_cube() {
    local CUBE_URI="$1"
    local CUBE_NAME=$(echo "$CUBE_URI" | sed -E 's|.*/([^/]+)/([0-9]+)/?$|\1_v\2|')
    local TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    local BACKUP_FILE="${BACKUP_DIR}/${CUBE_NAME}_${TIMESTAMP}.nt"

    mkdir -p "$BACKUP_DIR"

    log_info "Backing up: $CUBE_URI"
    local QUERY=$(get_export_query "$CUBE_URI")
    run_construct "$QUERY" > "$BACKUP_FILE"

    local TRIPLE_COUNT=$(wc -l < "$BACKUP_FILE")
    log_info "  Saved $TRIPLE_COUNT triples to $BACKUP_FILE"

    # Save metadata
    echo "$CUBE_URI" > "${BACKUP_FILE}.meta"
    echo "$GRAPH_URI" >> "${BACKUP_FILE}.meta"
    echo "$(date -Iseconds)" >> "${BACKUP_FILE}.meta"

    echo "$BACKUP_FILE"
}

delete_cube() {
    local CUBE_URI="$1"
    log_info "Deleting: $CUBE_URI"
    local QUERY=$(get_delete_query "$CUBE_URI")
    run_update "$QUERY"
    log_info "  Deleted successfully"
}

# =============================================================================
# Commands
# =============================================================================

cmd_preview() {
    echo "=============================================="
    echo "LINDAS Cleanup Preview"
    echo "=============================================="
    echo "Query endpoint:   $QUERY_ENDPOINT"
    echo "Graph URI:        $GRAPH_URI"
    echo "Versions to keep: $VERSIONS_TO_KEEP"
    echo ""

    log_info "Finding cube versions to delete..."
    local QUERY=$(get_cubes_to_delete)
    local RESULT=$(run_query "$QUERY")

    local CUBES=$(echo "$RESULT" | jq -r '.results.bindings[] | "\(.cube.value)\t\(.version.value)\t\(.rank.value)"')

    if [[ -z "$CUBES" ]]; then
        log_info "No cube versions to delete. All cubes have $VERSIONS_TO_KEEP or fewer versions."
        exit 0
    fi

    local COUNT=$(echo "$CUBES" | wc -l)
    echo ""
    log_warn "Found $COUNT cube versions that would be deleted:"
    echo ""
    printf "%-70s %-10s %s\n" "CUBE URI" "VERSION" "RANK"
    echo "--------------------------------------------------------------------------------"
    echo "$CUBES" | while IFS=$'\t' read -r cube version rank; do
        printf "%-70s %-10s %s\n" "$cube" "$version" "$rank"
    done
    echo ""
    log_info "Run 'cleanup' command to backup and delete these versions."
}

cmd_cleanup() {
    echo "=============================================="
    echo "LINDAS Cleanup with Backup"
    echo "=============================================="
    echo "Query endpoint:   $QUERY_ENDPOINT"
    echo "Update endpoint:  $UPDATE_ENDPOINT"
    echo "Graph URI:        $GRAPH_URI"
    echo "Backup directory: $BACKUP_DIR"
    echo "Versions to keep: $VERSIONS_TO_KEEP"
    echo ""

    # Find cubes to delete
    log_info "Step 1: Finding cube versions to delete..."
    local QUERY=$(get_cubes_to_delete)
    local RESULT=$(run_query "$QUERY")

    local CUBES=$(echo "$RESULT" | jq -r '.results.bindings[] | "\(.cube.value)"')

    if [[ -z "$CUBES" ]]; then
        log_info "No cube versions to delete. All cubes have $VERSIONS_TO_KEEP or fewer versions."
        exit 0
    fi

    local COUNT=$(echo "$CUBES" | wc -l)
    log_info "Found $COUNT cube versions to delete"

    # Backup and delete each cube
    log_info ""
    log_info "Step 2: Backup and delete each cube..."

    local DELETED=0
    local ERRORS=0

    echo "$CUBES" | while read -r CUBE_URI; do
        if [[ -n "$CUBE_URI" ]]; then
            # Backup
            if BACKUP_FILE=$(backup_cube "$CUBE_URI"); then
                # Delete
                if delete_cube "$CUBE_URI"; then
                    ((DELETED++)) || true
                else
                    log_error "Failed to delete: $CUBE_URI"
                    ((ERRORS++)) || true
                fi
            else
                log_error "Failed to backup: $CUBE_URI"
                ((ERRORS++)) || true
            fi
        fi
    done

    echo ""
    echo "=============================================="
    log_info "Cleanup complete!"
    log_info "Cubes processed: $COUNT"
    log_info "Backups saved to: $BACKUP_DIR"
    echo "=============================================="
}

cmd_restore() {
    local BACKUP_FILE="$1"

    if [[ -z "$BACKUP_FILE" ]]; then
        log_error "Backup file required"
        echo "Usage: $0 restore <backup-file.nt>"
        exit 1
    fi

    if [[ ! -f "$BACKUP_FILE" ]]; then
        log_error "Backup file not found: $BACKUP_FILE"
        exit 1
    fi

    echo "=============================================="
    echo "LINDAS Cube Restore"
    echo "=============================================="
    echo "Update endpoint: $UPDATE_ENDPOINT"
    echo "Graph URI:       $GRAPH_URI"
    echo "Backup file:     $BACKUP_FILE"
    echo ""

    # Read metadata if available
    if [[ -f "${BACKUP_FILE}.meta" ]]; then
        local ORIG_CUBE=$(head -1 "${BACKUP_FILE}.meta")
        local ORIG_GRAPH=$(sed -n '2p' "${BACKUP_FILE}.meta")
        local BACKUP_DATE=$(sed -n '3p' "${BACKUP_FILE}.meta")
        log_info "Original cube:  $ORIG_CUBE"
        log_info "Original graph: $ORIG_GRAPH"
        log_info "Backup date:    $BACKUP_DATE"
        echo ""
    fi

    local TRIPLE_COUNT=$(wc -l < "$BACKUP_FILE")
    log_info "Triples to restore: $TRIPLE_COUNT"

    # Load data using SPARQL UPDATE with INSERT DATA
    log_info "Loading backup data..."

    # For large files, use Graph Store Protocol
    local DATA_ENDPOINT="${UPDATE_ENDPOINT%/update}/data"

    local RESPONSE=$(curl -s -w "\n%{http_code}" $AUTH \
        -X POST \
        -H "Content-Type: application/n-triples" \
        --data-binary "@${BACKUP_FILE}" \
        "${DATA_ENDPOINT}?graph=${GRAPH_URI}")

    local HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "201" || "$HTTP_CODE" == "204" ]]; then
        log_info "Data loaded successfully!"
    else
        log_error "Failed to load data: HTTP $HTTP_CODE"
        echo "$RESPONSE" | head -n -1
        exit 1
    fi

    echo ""
    echo "=============================================="
    log_info "Restore complete!"
    echo "=============================================="
}

cmd_list_backups() {
    echo "=============================================="
    echo "Available Backups"
    echo "=============================================="
    echo "Backup directory: $BACKUP_DIR"
    echo ""

    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_warn "Backup directory does not exist"
        exit 0
    fi

    local BACKUPS=$(find "$BACKUP_DIR" -name "*.nt" -type f 2>/dev/null | sort -r)

    if [[ -z "$BACKUPS" ]]; then
        log_info "No backups found"
        exit 0
    fi

    printf "%-60s %-12s %s\n" "BACKUP FILE" "SIZE" "DATE"
    echo "--------------------------------------------------------------------------------"

    echo "$BACKUPS" | while read -r FILE; do
        local SIZE=$(du -h "$FILE" | cut -f1)
        local DATE=$(stat -c %y "$FILE" 2>/dev/null | cut -d' ' -f1 || stat -f %Sm -t %Y-%m-%d "$FILE" 2>/dev/null)
        local NAME=$(basename "$FILE")
        printf "%-60s %-12s %s\n" "$NAME" "$SIZE" "$DATE"
    done

    echo ""
    log_info "To restore: $0 restore <backup-file>"
}

cmd_help() {
    head -30 "$0" | tail -25
}

# =============================================================================
# Main
# =============================================================================

COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
    cleanup)
        cmd_cleanup "$@"
        ;;
    restore)
        cmd_restore "$@"
        ;;
    list-backups|list)
        cmd_list_backups "$@"
        ;;
    preview|dry-run)
        cmd_preview "$@"
        ;;
    help|--help|-h)
        cmd_help
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        cmd_help
        exit 1
        ;;
esac
