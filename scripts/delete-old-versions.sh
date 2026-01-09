#!/bin/bash
# =============================================================================
# LINDAS Cube Version Cleanup Script
# Deletes all cube versions except the newest 2 per base cube
#
# Usage:
#   ./delete-old-versions.sh [OPTIONS]
#
# Options:
#   -e, --endpoint URL    SPARQL endpoint base URL (default: http://localhost:3030/lindas)
#   -g, --graph URI       Named graph URI (default: https://lindas.admin.ch/sfoe/cube)
#   -k, --keep N          Number of versions to keep (default: 2)
#   -d, --dry-run         Preview changes without deleting
#   -b, --bulk            Use bulk delete mode (single query, faster)
#   -u, --username USER   Basic auth username
#   -p, --password PASS   Basic auth password
#   -h, --help            Show this help message
#
# Environment variables:
#   SPARQL_ENDPOINT       SPARQL endpoint base URL
#   SPARQL_USERNAME       Basic auth username
#   SPARQL_PASSWORD       Basic auth password
#   GRAPH_URI             Named graph URI
# =============================================================================

set -e

# Default configuration
ENDPOINT="${SPARQL_ENDPOINT:-http://localhost:3030/lindas}"
GRAPH_URI="${GRAPH_URI:-https://lindas.admin.ch/sfoe/cube}"
VERSIONS_TO_KEEP=2
DRY_RUN=false
BULK_MODE=false
USERNAME="${SPARQL_USERNAME:-}"
PASSWORD="${SPARQL_PASSWORD:-}"

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
        -k|--keep)
            VERSIONS_TO_KEEP="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -b|--bulk)
            BULK_MODE=true
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
            head -30 "$0" | tail -25
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Build auth header if credentials provided
AUTH_HEADER=""
if [[ -n "$USERNAME" && -n "$PASSWORD" ]]; then
    AUTH_HEADER="-u ${USERNAME}:${PASSWORD}"
fi

QUERY_ENDPOINT="${ENDPOINT}/query"
UPDATE_ENDPOINT="${ENDPOINT}/update"

echo "=============================================="
echo "LINDAS Cube Version Cleanup Script"
echo "=============================================="
echo "Query endpoint:  $QUERY_ENDPOINT"
echo "Update endpoint: $UPDATE_ENDPOINT"
echo "Graph URI:       $GRAPH_URI"
echo "Versions to keep: $VERSIONS_TO_KEEP"
echo "Dry run:         $DRY_RUN"
echo "Bulk mode:       $BULK_MODE"
echo ""

# Step 1: Find cubes to delete
echo "Step 1: Finding cube versions to delete..."

FIND_QUERY="PREFIX cube: <https://cube.link/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?cubeToDelete ?version ?rank
WHERE {
  {
    SELECT ?cube (COUNT(?newerCube) + 1 AS ?rank)
    WHERE {
      GRAPH <${GRAPH_URI}> {
        ?cube a cube:Cube .
        FILTER(REGEX(STR(?cube), \"^.*/[0-9]+/?$\"))
        BIND(xsd:integer(REPLACE(STR(?cube), \"^.*/([0-9]+)/?$\", \"\$1\")) AS ?v)
        BIND(REPLACE(STR(?cube), \"^(.*)/[0-9]+/?$\", \"\$1\") AS ?baseStr)

        OPTIONAL {
          ?newerCube a cube:Cube .
          FILTER(REGEX(STR(?newerCube), \"^.*/[0-9]+/?$\"))
          FILTER(REPLACE(STR(?newerCube), \"^(.*)/[0-9]+/?$\", \"\$1\") = ?baseStr)
          FILTER(xsd:integer(REPLACE(STR(?newerCube), \"^.*/([0-9]+)/?$\", \"\$1\")) > ?v)
        }
      }
    }
    GROUP BY ?cube
  }
  FILTER(?rank > ${VERSIONS_TO_KEEP})
  BIND(?cube AS ?cubeToDelete)

  # Get version number for display
  BIND(xsd:integer(REPLACE(STR(?cubeToDelete), \"^.*/([0-9]+)/?$\", \"\$1\")) AS ?version)
}
ORDER BY ?cubeToDelete"

RESULT=$(curl -s $AUTH_HEADER \
    -X POST \
    -H "Accept: application/sparql-results+json" \
    -H "Content-Type: application/sparql-query" \
    --data "$FIND_QUERY" \
    "$QUERY_ENDPOINT")

# Parse results
CUBES_TO_DELETE=$(echo "$RESULT" | jq -r '.results.bindings[] | "\(.cubeToDelete.value)\t\(.version.value)\t\(.rank.value)"')

if [[ -z "$CUBES_TO_DELETE" ]]; then
    echo "No cube versions to delete. All cubes have $VERSIONS_TO_KEEP or fewer versions."
    exit 0
fi

CUBE_COUNT=$(echo "$CUBES_TO_DELETE" | wc -l)
echo "Found $CUBE_COUNT cube versions to delete:"
echo ""
echo "CUBE_URI                                                              VERSION  RANK"
echo "--------------------------------------------------------------------------------"
echo "$CUBES_TO_DELETE" | while IFS=$'\t' read -r cube version rank; do
    printf "%-70s %-8s %s\n" "$cube" "$version" "$rank"
done
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY RUN - No changes will be made."
    echo "Remove --dry-run flag to perform actual deletion."
    exit 0
fi

# Step 2: Delete cubes
if [[ "$BULK_MODE" == "true" ]]; then
    echo "Step 2: Bulk deleting all old versions in single query..."

    # Generate FILTER EXISTS for versionsToKeep newer versions
    NEWER_FILTERS=""
    DISTINCT_FILTERS=""
    for i in $(seq 1 $VERSIONS_TO_KEEP); do
        NEWER_FILTERS="${NEWER_FILTERS}
    ?newer${i} a cube:Cube .
    FILTER(REGEX(STR(?newer${i}), \"^.*/[0-9]+/?\$\"))
    FILTER(REPLACE(STR(?newer${i}), \"^(.*)/[0-9]+/?\$\", \"\$1\") = ?baseStr)
    FILTER(xsd:integer(REPLACE(STR(?newer${i}), \"^.*/([0-9]+)/?\$\", \"\$1\")) > ?v)
"
    done

    for i in $(seq 2 $VERSIONS_TO_KEEP); do
        for j in $(seq 1 $((i-1))); do
            DISTINCT_FILTERS="${DISTINCT_FILTERS}
    FILTER(?newer${i} != ?newer${j})"
        done
    done

    BULK_DELETE_QUERY="PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

WITH <${GRAPH_URI}>
DELETE {
  ?cube ?p1 ?o1 .
  ?shape ?shapeP ?shapeO .
  ?prop ?propP ?propO .
  ?set ?setP ?setO .
  ?obs ?obsP ?obsO .
}
WHERE {
  ?cube a cube:Cube .
  FILTER(REGEX(STR(?cube), \"^.*/[0-9]+/?\$\"))
  BIND(xsd:integer(REPLACE(STR(?cube), \"^.*/([0-9]+)/?\$\", \"\$1\")) AS ?v)
  BIND(REPLACE(STR(?cube), \"^(.*)/[0-9]+/?\$\", \"\$1\") AS ?baseStr)

  FILTER EXISTS {
${NEWER_FILTERS}${DISTINCT_FILTERS}
  }

  {
    { ?cube ?p1 ?o1 }
    UNION
    { ?cube cube:observationConstraint ?shape . ?shape ?shapeP ?shapeO }
    UNION
    { ?cube cube:observationConstraint/sh:property ?directProp . ?directProp (<>|!<>)* ?prop . ?prop ?propP ?propO }
    UNION
    { ?cube cube:observationSet ?set . ?set ?setP ?setO }
    UNION
    { ?cube cube:observationSet/cube:observation ?obs . ?obs ?obsP ?obsO }
  }
}"

    echo "Executing bulk delete query..."
    RESPONSE=$(curl -s -w "\n%{http_code}" $AUTH_HEADER \
        -X POST \
        -H "Content-Type: application/sparql-update" \
        --data "$BULK_DELETE_QUERY" \
        "$UPDATE_ENDPOINT")

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "204" ]]; then
        echo "Bulk delete completed successfully!"
    else
        echo "Error: HTTP $HTTP_CODE"
        echo "$RESPONSE" | head -n -1
        exit 1
    fi

else
    echo "Step 2: Deleting cube versions one by one..."

    echo "$CUBES_TO_DELETE" | while IFS=$'\t' read -r CUBE_URI version rank; do
        echo ""
        echo "Deleting: $CUBE_URI (version: $version, rank: $rank)"

        # Delete all cube components
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
        if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "204" ]]; then
            echo "  Deleted successfully!"
        else
            echo "  Error: HTTP $HTTP_CODE"
            echo "$RESPONSE" | head -n -1
        fi
    done
fi

echo ""
echo "=============================================="
echo "Cleanup complete!"
echo "=============================================="
