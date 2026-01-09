#!/bin/bash
# =============================================================================
# LINDAS Cube Backup Script
# Exports a cube to N-Triples format for backup
#
# Usage:
#   ./backup-cube.sh [OPTIONS] <cube-uri>
#
# Options:
#   -e, --endpoint URL    SPARQL endpoint base URL (default: http://localhost:3030/lindas)
#   -g, --graph URI       Named graph URI (default: https://lindas.admin.ch/sfoe/cube)
#   -o, --output FILE     Output file (default: auto-generated from cube URI)
#   -d, --output-dir DIR  Output directory (default: ./backups)
#   -u, --username USER   Basic auth username
#   -p, --password PASS   Basic auth password
#   -h, --help            Show this help message
#
# Environment variables:
#   SPARQL_ENDPOINT       SPARQL endpoint base URL
#   SPARQL_USERNAME       Basic auth username
#   SPARQL_PASSWORD       Basic auth password
#   GRAPH_URI             Named graph URI
#
# Examples:
#   ./backup-cube.sh https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/7
#   ./backup-cube.sh -o my-backup.nt https://example.org/cube/1
# =============================================================================

set -e

# Default configuration
ENDPOINT="${SPARQL_ENDPOINT:-http://localhost:3030/lindas}"
GRAPH_URI="${GRAPH_URI:-https://lindas.admin.ch/sfoe/cube}"
OUTPUT_FILE=""
OUTPUT_DIR="./backups"
USERNAME="${SPARQL_USERNAME:-}"
PASSWORD="${SPARQL_PASSWORD:-}"
CUBE_URI=""

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
        -o|--output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        -d|--output-dir)
            OUTPUT_DIR="$2"
            shift 2
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
            CUBE_URI="$1"
            shift
            ;;
    esac
done

# Validate cube URI
if [[ -z "$CUBE_URI" ]]; then
    echo "Error: Cube URI is required"
    echo "Usage: $0 [OPTIONS] <cube-uri>"
    exit 1
fi

# Build auth header if credentials provided
AUTH_HEADER=""
if [[ -n "$USERNAME" && -n "$PASSWORD" ]]; then
    AUTH_HEADER="-u ${USERNAME}:${PASSWORD}"
fi

QUERY_ENDPOINT="${ENDPOINT}/query"

# Generate output filename if not specified
if [[ -z "$OUTPUT_FILE" ]]; then
    # Extract cube name and version from URI
    CUBE_NAME=$(echo "$CUBE_URI" | sed -E 's|.*/([^/]+)/([0-9]+)/?$|\1_v\2|')
    if [[ "$CUBE_NAME" == "$CUBE_URI" ]]; then
        # Fallback: use hash of URI
        CUBE_NAME=$(echo "$CUBE_URI" | md5sum | cut -c1-12)
    fi
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    OUTPUT_FILE="${OUTPUT_DIR}/${CUBE_NAME}_${TIMESTAMP}.nt"
fi

# Create output directory
mkdir -p "$(dirname "$OUTPUT_FILE")"

echo "=============================================="
echo "LINDAS Cube Backup Script"
echo "=============================================="
echo "Query endpoint: $QUERY_ENDPOINT"
echo "Graph URI:      $GRAPH_URI"
echo "Cube URI:       $CUBE_URI"
echo "Output file:    $OUTPUT_FILE"
echo ""

# Step 1: Check if cube exists
echo "Step 1: Checking if cube exists..."

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

if [[ "$EXISTS" != "true" ]]; then
    echo "Error: Cube not found: $CUBE_URI"
    exit 1
fi
echo "Cube found!"

# Step 2: Get cube info
echo ""
echo "Step 2: Getting cube info..."

INFO_QUERY="PREFIX cube: <https://cube.link/>
PREFIX schema: <http://schema.org/>
SELECT ?title ?dateCreated (COUNT(DISTINCT ?obs) AS ?obsCount)
WHERE {
  GRAPH <${GRAPH_URI}> {
    <${CUBE_URI}> a cube:Cube .
    OPTIONAL { <${CUBE_URI}> schema:name ?title . FILTER(lang(?title) = \"en\" || lang(?title) = \"\") }
    OPTIONAL { <${CUBE_URI}> schema:dateCreated ?dateCreated }
    OPTIONAL { <${CUBE_URI}> cube:observationSet/cube:observation ?obs }
  }
}
GROUP BY ?title ?dateCreated"

RESULT=$(curl -s $AUTH_HEADER \
    -X POST \
    -H "Accept: application/sparql-results+json" \
    -H "Content-Type: application/sparql-query" \
    --data "$INFO_QUERY" \
    "$QUERY_ENDPOINT")

TITLE=$(echo "$RESULT" | jq -r '.results.bindings[0].title.value // "N/A"')
DATE_CREATED=$(echo "$RESULT" | jq -r '.results.bindings[0].dateCreated.value // "N/A"')
OBS_COUNT=$(echo "$RESULT" | jq -r '.results.bindings[0].obsCount.value // "0"')

echo "Title:        $TITLE"
echo "Date created: $DATE_CREATED"
echo "Observations: $OBS_COUNT"

# Step 3: Export cube
echo ""
echo "Step 3: Exporting cube to N-Triples..."

EXPORT_QUERY="PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>

CONSTRUCT { ?s ?p ?o }
WHERE {
  GRAPH <${GRAPH_URI}> {
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
  }
}"

curl -s $AUTH_HEADER \
    -X POST \
    -H "Accept: application/n-triples" \
    -H "Content-Type: application/sparql-query" \
    --data "$EXPORT_QUERY" \
    "$QUERY_ENDPOINT" \
    -o "$OUTPUT_FILE"

# Verify output
FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
TRIPLE_COUNT=$(wc -l < "$OUTPUT_FILE")

echo ""
echo "=============================================="
echo "Backup complete!"
echo "=============================================="
echo "Output file:    $OUTPUT_FILE"
echo "File size:      $FILE_SIZE"
echo "Triple count:   $TRIPLE_COUNT"
