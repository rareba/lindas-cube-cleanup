#!/bin/bash
# =============================================================================
# LINDAS Cube Restore Script
# Restores a cube from an N-Triples backup file
#
# Usage:
#   ./restore-cube.sh [OPTIONS] <backup-file>
#
# Options:
#   -e, --endpoint URL    SPARQL endpoint base URL (default: http://localhost:3030/lindas)
#   -g, --graph URI       Target named graph URI (default: https://lindas.admin.ch/sfoe/cube)
#   -o, --overwrite       Overwrite if cube already exists
#   -d, --dry-run         Preview without restoring
#   -u, --username USER   Basic auth username
#   -p, --password PASS   Basic auth password
#   -h, --help            Show this help message
#
# Environment variables:
#   SPARQL_ENDPOINT       SPARQL endpoint base URL
#   SPARQL_USERNAME       Basic auth username
#   SPARQL_PASSWORD       Basic auth password
#   GRAPH_URI             Target named graph URI
#
# Examples:
#   ./restore-cube.sh backup.nt
#   ./restore-cube.sh -e https://lindas.admin.ch -g https://lindas.admin.ch/sfoe/cube backup.nt
#   ./restore-cube.sh --dry-run backup.nt
# =============================================================================

set -e

# Default configuration
ENDPOINT="${SPARQL_ENDPOINT:-http://localhost:3030/lindas}"
GRAPH_URI="${GRAPH_URI:-https://lindas.admin.ch/sfoe/cube}"
OVERWRITE=false
DRY_RUN=false
USERNAME="${SPARQL_USERNAME:-}"
PASSWORD="${SPARQL_PASSWORD:-}"
BACKUP_FILE=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--endpoint)
            ENDPOINT="$2"
            shift 2
            ;;
        -g|--graph)
            GRAPH_URI="$2"
            shift 2
            ;;
        -o|--overwrite)
            OVERWRITE=true
            shift
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -u|--username)
            USERNAME="$2"
            shift 2
            ;;
        -p|--password)
            PASSWORD="$2"
            shift 2
            ;;
        -h|--help)
            head -35 "$0" | tail -30
            exit 0
            ;;
        -*)
            echo "Unknown option: $1"
            exit 1
            ;;
        *)
            BACKUP_FILE="$1"
            shift
            ;;
    esac
done

# Validate backup file
if [[ -z "$BACKUP_FILE" ]]; then
    echo "Error: Backup file is required"
    echo "Usage: $0 [OPTIONS] <backup-file>"
    exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Build auth header if credentials provided
AUTH_HEADER=""
if [[ -n "$USERNAME" && -n "$PASSWORD" ]]; then
    AUTH_HEADER="-u ${USERNAME}:${PASSWORD}"
fi

QUERY_ENDPOINT="${ENDPOINT}/query"
UPDATE_ENDPOINT="${ENDPOINT}/update"
DATA_ENDPOINT="${ENDPOINT}/data"

echo "=============================================="
echo "LINDAS Cube Restore Script"
echo "=============================================="
echo "Query endpoint:  $QUERY_ENDPOINT"
echo "Data endpoint:   $DATA_ENDPOINT"
echo "Graph URI:       $GRAPH_URI"
echo "Backup file:     $BACKUP_FILE"
echo "Overwrite:       $OVERWRITE"
echo "Dry run:         $DRY_RUN"
echo ""

# Get file info
FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
TRIPLE_COUNT=$(wc -l < "$BACKUP_FILE")
echo "Backup file size:   $FILE_SIZE"
echo "Approximate triples: $TRIPLE_COUNT"
echo ""

# Extract cube URI from backup (first subject that's a cube:Cube)
echo "Step 1: Analyzing backup file..."
CUBE_URI=$(grep -m1 'cube:Cube\|<https://cube.link/Cube>' "$BACKUP_FILE" | head -1 | sed -E 's/^<([^>]+)>.*/\1/')

if [[ -z "$CUBE_URI" ]]; then
    echo "Warning: Could not detect cube URI from backup file"
    echo "The file will be loaded but cube existence check will be skipped"
else
    echo "Detected cube URI: $CUBE_URI"

    # Check if cube already exists
    echo ""
    echo "Step 2: Checking if cube already exists..."

    EXISTS_QUERY="PREFIX cube: <https://cube.link/>
ASK WHERE {
  GRAPH <${GRAPH_URI}> {
    <${CUBE_URI}> a cube:Cube .
  }
}"

    RESULT=$(curl -s $AUTH_HEADER \
        -X POST \
        -H "Accept: application/sparql-results+json" \
        -H "Content-Type: application/sparql-query" \
        --data "$EXISTS_QUERY" \
        "$QUERY_ENDPOINT")

    EXISTS=$(echo "$RESULT" | jq -r '.boolean')

    if [[ "$EXISTS" == "true" ]]; then
        echo "Cube already exists in target graph!"
        if [[ "$OVERWRITE" == "false" ]]; then
            echo "Error: Use --overwrite to replace existing cube"
            exit 1
        fi
        echo "Will delete existing cube before restore (--overwrite specified)"

        if [[ "$DRY_RUN" == "false" ]]; then
            echo ""
            echo "Deleting existing cube..."

            DELETE_QUERY="PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>

WITH <${GRAPH_URI}>
DELETE {
  ?s ?p ?o .
}
WHERE {
  {
    BIND(<${CUBE_URI}> AS ?s)
    <${CUBE_URI}> ?p ?o .
  }
  UNION
  {
    <${CUBE_URI}> cube:observationConstraint ?shape .
    ?shape (<>|!<>)* ?s .
    ?s ?p ?o .
  }
  UNION
  {
    <${CUBE_URI}> cube:observationSet ?set .
    ?set ?p ?o .
    BIND(?set AS ?s)
  }
  UNION
  {
    <${CUBE_URI}> cube:observationSet/cube:observation ?obs .
    ?obs ?p ?o .
    BIND(?obs AS ?s)
  }
}"

            RESPONSE=$(curl -s -w "\n%{http_code}" $AUTH_HEADER \
                -X POST \
                -H "Content-Type: application/sparql-update" \
                --data "$DELETE_QUERY" \
                "$UPDATE_ENDPOINT")

            HTTP_CODE=$(echo "$RESPONSE" | tail -1)
            if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "204" ]]; then
                echo "Error deleting existing cube: HTTP $HTTP_CODE"
                exit 1
            fi
            echo "Existing cube deleted."
        fi
    else
        echo "Cube does not exist - proceeding with restore"
    fi
fi

if [[ "$DRY_RUN" == "true" ]]; then
    echo ""
    echo "DRY RUN - No changes will be made."
    echo "Remove --dry-run flag to perform actual restore."
    exit 0
fi

# Step 3: Load backup file
echo ""
echo "Step 3: Loading backup file into graph..."

# Use Graph Store Protocol to load the data
RESPONSE=$(curl -s -w "\n%{http_code}" $AUTH_HEADER \
    -X POST \
    -H "Content-Type: application/n-triples" \
    --data-binary "@${BACKUP_FILE}" \
    "${DATA_ENDPOINT}?graph=${GRAPH_URI}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "201" || "$HTTP_CODE" == "204" ]]; then
    echo "Data loaded successfully!"
else
    echo "Error loading data: HTTP $HTTP_CODE"
    echo "$RESPONSE" | head -n -1
    exit 1
fi

# Step 4: Verify restore
if [[ -n "$CUBE_URI" ]]; then
    echo ""
    echo "Step 4: Verifying restore..."

    VERIFY_QUERY="PREFIX cube: <https://cube.link/>
SELECT (COUNT(DISTINCT ?obs) AS ?obsCount)
WHERE {
  GRAPH <${GRAPH_URI}> {
    <${CUBE_URI}> cube:observationSet/cube:observation ?obs .
  }
}"

    RESULT=$(curl -s $AUTH_HEADER \
        -X POST \
        -H "Accept: application/sparql-results+json" \
        -H "Content-Type: application/sparql-query" \
        --data "$VERIFY_QUERY" \
        "$QUERY_ENDPOINT")

    OBS_COUNT=$(echo "$RESULT" | jq -r '.results.bindings[0].obsCount.value')
    echo "Restored cube has $OBS_COUNT observations"
fi

echo ""
echo "=============================================="
echo "Restore complete!"
echo "=============================================="
