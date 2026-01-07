#!/bin/bash
# Script to download the SFOE cube graph from LINDAS for local testing
# This downloads the entire graph in N-Triples format

set -e

# Configuration
SPARQL_ENDPOINT="https://ld.admin.ch/query"
GRAPH_URI="https://lindas.admin.ch/sfoe/cube"
OUTPUT_DIR="../data"
OUTPUT_FILE="sfoe-cube.nt"

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "Downloading graph: $GRAPH_URI"
echo "From endpoint: $SPARQL_ENDPOINT"
echo "This may take a while for large graphs..."

# Method 1: Using CONSTRUCT query via curl
# This fetches all triples from the named graph
curl -X POST \
  -H "Accept: application/n-triples" \
  -H "Content-Type: application/sparql-query" \
  --data "CONSTRUCT { ?s ?p ?o } WHERE { GRAPH <$GRAPH_URI> { ?s ?p ?o } }" \
  "$SPARQL_ENDPOINT" \
  -o "$OUTPUT_DIR/$OUTPUT_FILE"

echo "Download complete: $OUTPUT_DIR/$OUTPUT_FILE"
echo "File size: $(du -h "$OUTPUT_DIR/$OUTPUT_FILE" | cut -f1)"
echo "Triple count: $(wc -l < "$OUTPUT_DIR/$OUTPUT_FILE")"
