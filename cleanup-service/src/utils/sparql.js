/**
 * SPARQL Query Templates and Utilities
 */

const PREFIXES = `
PREFIX cube: <https://cube.link/>
PREFIX schema: <http://schema.org/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

/**
 * Validate and sanitize a URI to prevent SPARQL injection.
 * Only allows valid URI characters and rejects anything containing
 * SPARQL-breaking sequences like >, }, or query keywords.
 * @param {string} uri - The URI to validate
 * @returns {string} - The validated URI
 * @throws {Error} - If the URI is invalid or contains injection attempts
 */
function validateUri(uri) {
    if (!uri || typeof uri !== 'string') {
        throw new Error('URI must be a non-empty string');
    }

    // Trim whitespace
    uri = uri.trim();

    // Must start with a valid scheme
    if (!/^https?:\/\//.test(uri)) {
        throw new Error(`Invalid URI scheme: ${uri.substring(0, 50)}`);
    }

    // Reject characters that could break out of SPARQL URI delimiters
    const dangerousChars = /[<>"{}|\\^`\n\r\t]/;
    if (dangerousChars.test(uri)) {
        throw new Error(`URI contains invalid characters: ${uri.substring(0, 50)}`);
    }

    // Reject SPARQL injection patterns (query keywords after URI)
    const injectionPatterns = /(\bDELETE\b|\bINSERT\b|\bDROP\b|\bCLEAR\b|\bCREATE\b|\bLOAD\b|\bCOPY\b|\bMOVE\b|\bADD\b)/i;
    if (injectionPatterns.test(uri)) {
        throw new Error(`URI contains suspicious SPARQL keywords: ${uri.substring(0, 50)}`);
    }

    return uri;
}

/**
 * List all cube versions in a graph
 */
function listCubeVersionsQuery(graphUri) {
    const safeGraph = validateUri(graphUri);
    return `${PREFIXES}
SELECT DISTINCT ?baseCube ?cube ?version ?dateCreated ?title
WHERE {
  GRAPH <${safeGraph}> {
    ?cube a cube:Cube .
    OPTIONAL { ?cube schema:dateCreated ?dateCreated }
    OPTIONAL { ?cube schema:name ?title . FILTER(lang(?title) = "en" || lang(?title) = "") }
    BIND(REPLACE(STR(?cube), "^.*/([^/]+)/([0-9]+)$", "$2") AS ?versionStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+$"), xsd:integer(?versionStr), 0) AS ?version)
    BIND(REPLACE(STR(?cube), "^(.*/[^/]+)/[0-9]+$", "$1") AS ?baseCubeStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+$"), IRI(?baseCubeStr), ?cube) AS ?baseCube)
  }
}
ORDER BY ?baseCube DESC(?version)`;
}

/**
 * Identify versions to delete (keep newest N)
 */
function identifyDeletionsQuery(graphUri, versionsToKeep = 2) {
    const safeGraph = validateUri(graphUri);
    const safeKeep = parseInt(versionsToKeep, 10);
    if (isNaN(safeKeep) || safeKeep < 1) {
        throw new Error('versionsToKeep must be a positive integer');
    }
    return `${PREFIXES}
SELECT ?baseCube ?cube ?version ?rank
       (IF(?rank <= ${safeKeep}, "KEEP", "DELETE") AS ?action)
WHERE {
  GRAPH <${safeGraph}> {
    ?cube a cube:Cube .
    BIND(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1") AS ?versionStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[0-9]+/?$"), xsd:integer(?versionStr), 0) AS ?version)
    BIND(REPLACE(STR(?cube), "^(.*)/[0-9]+/?$", "$1") AS ?baseCubeStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[0-9]+/?$"), IRI(?baseCubeStr), ?cube) AS ?baseCube)
  }
  {
    SELECT ?cube (COUNT(?newerCube) + 1 AS ?rank)
    WHERE {
      GRAPH <${graphUri}> {
        ?cube a cube:Cube .
        BIND(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1") AS ?vStr)
        BIND(IF(REGEX(STR(?cube), "^.*/[0-9]+/?$"), xsd:integer(?vStr), 0) AS ?v)
        BIND(REPLACE(STR(?cube), "^(.*)/[0-9]+/?$", "$1") AS ?baseStr)
        OPTIONAL {
          ?newerCube a cube:Cube .
          BIND(REPLACE(STR(?newerCube), "^.*/([0-9]+)/?$", "$1") AS ?nvStr)
          BIND(IF(REGEX(STR(?newerCube), "^.*/[0-9]+/?$"), xsd:integer(?nvStr), 0) AS ?nv)
          BIND(REPLACE(STR(?newerCube), "^(.*)/[0-9]+/?$", "$1") AS ?nbaseStr)
          FILTER(?baseStr = ?nbaseStr && ?nv > ?v)
        }
      }
    }
    GROUP BY ?cube
  }
}
ORDER BY ?baseCube ?rank`;
}

/**
 * Preview single cube (count components)
 */
function previewCubeQuery(graphUri, cubeUri) {
    const safeGraph = validateUri(graphUri);
    const safeCube = validateUri(cubeUri);
    return `${PREFIXES}
SELECT
    ?cube
    ?title
    ?dateCreated
    (COUNT(DISTINCT ?shape) AS ?shapeCount)
    (COUNT(DISTINCT ?property) AS ?propertyCount)
    (COUNT(DISTINCT ?obsSet) AS ?observationSetCount)
    (COUNT(DISTINCT ?obs) AS ?observationCount)
WHERE {
    GRAPH <${safeGraph}> {
        BIND(<${safeCube}> AS ?cube)
        ?cube rdf:type cube:Cube .
        OPTIONAL { ?cube schema:name ?title . FILTER(lang(?title) = "en" || lang(?title) = "") }
        OPTIONAL { ?cube schema:dateCreated ?dateCreated }
        OPTIONAL { ?cube cube:observationConstraint ?shape }
        OPTIONAL { ?cube cube:observationConstraint/sh:property ?property }
        OPTIONAL { ?cube cube:observationSet ?obsSet }
        OPTIONAL { ?cube cube:observationSet/cube:observation ?obs }
    }
}
GROUP BY ?cube ?title ?dateCreated`;
}

/**
 * Export cube as CONSTRUCT (for backup)
 * Captures ALL cube data including:
 * - Cube direct properties (schema:name, schema:dateCreated, etc.)
 * - Blank node properties attached to the cube
 * - SHACL NodeShapes (observationConstraint)
 * - SHACL PropertyShapes (sh:property)
 * - RDF Lists (sh:in lists with rdf:first/rdf:rest chains)
 * - Observation sets
 * - All observations and their properties
 */
function exportCubeQuery(graphUri, cubeUri) {
    const safeGraph = validateUri(graphUri);
    const safeCube = validateUri(cubeUri);
    return `${PREFIXES}
CONSTRUCT { ?s ?p ?o }
WHERE {
  GRAPH <${safeGraph}> {
    {
      # Cube direct properties
      BIND(<${safeCube}> AS ?s)
      <${safeCube}> ?p ?o .
    }
    UNION
    {
      # Cube incoming triples (anything pointing TO this cube)
      ?s ?p <${safeCube}> .
      BIND(<${safeCube}> AS ?o)
    }
    UNION
    {
      # Blank node properties attached to the cube
      <${safeCube}> ?p1 ?bn .
      FILTER(isBlank(?bn))
      ?bn ?p ?o .
      BIND(?bn AS ?s)
    }
    UNION
    {
      # SHACL NodeShape (observationConstraint) - outgoing
      <${safeCube}> cube:observationConstraint ?shape .
      ?shape ?p ?o .
      BIND(?shape AS ?s)
    }
    UNION
    {
      # SHACL NodeShape - incoming
      <${safeCube}> cube:observationConstraint ?shape .
      ?s ?p ?shape .
      BIND(?shape AS ?o)
    }
    UNION
    {
      # SHACL PropertyShapes
      <${safeCube}> cube:observationConstraint ?shape .
      ?shape sh:property ?propShape .
      ?propShape ?p ?o .
      BIND(?propShape AS ?s)
    }
    UNION
    {
      # RDF list items (sh:in lists)
      <${safeCube}> cube:observationConstraint ?shape .
      ?shape sh:property ?propShape .
      ?propShape sh:in ?list .
      ?list rdf:rest*/rdf:first ?item .
      ?list ?p ?o .
      BIND(?list AS ?s)
    }
    UNION
    {
      # Observation sets - outgoing
      <${safeCube}> cube:observationSet ?set .
      ?set ?p ?o .
      BIND(?set AS ?s)
    }
    UNION
    {
      # Observation sets - incoming
      <${safeCube}> cube:observationSet ?set .
      ?s ?p ?set .
      BIND(?set AS ?o)
    }
    UNION
    {
      # Observations - outgoing
      <${safeCube}> cube:observationSet/cube:observation ?obs .
      ?obs ?p ?o .
      BIND(?obs AS ?s)
    }
    UNION
    {
      # Observations - incoming
      <${safeCube}> cube:observationSet/cube:observation ?obs .
      ?s ?p ?obs .
      BIND(?obs AS ?o)
    }
  }
}`;
}

/**
 * Delete cube - Step 1: Delete observations
 * Note: SPARQL UPDATE doesn't support LIMIT, so we delete all observations at once
 * For very large cubes, the triplestore may handle this in batches internally
 */
function deleteObservationsQuery(graphUri, cubeUri, limit = 50000) {
    // Note: limit parameter kept for API compatibility but not used
    // Fuseki handles large deletions efficiently
    const safeGraph = validateUri(graphUri);
    const safeCube = validateUri(cubeUri);
    return `${PREFIXES}
WITH <${safeGraph}>
DELETE {
  ?s ?p ?o .
}
WHERE {
  <${safeCube}> cube:observationSet ?set .
  ?set cube:observation ?obs .
  {
    # Observation outgoing triples
    ?obs ?p ?o .
    BIND(?obs AS ?s)
  }
  UNION
  {
    # Observation incoming triples (e.g. cube:observation link itself)
    ?s ?p ?obs .
    BIND(?obs AS ?o)
  }
}`;
}

/**
 * Delete cube - Step 2: Delete observation set links
 */
function deleteObservationLinksQuery(graphUri, cubeUri) {
    const safeGraph = validateUri(graphUri);
    const safeCube = validateUri(cubeUri);
    return `${PREFIXES}
WITH <${safeGraph}>
DELETE {
  ?set cube:observation ?obs .
}
WHERE {
  <${safeCube}> cube:observationSet ?set .
  ?set cube:observation ?obs .
}`;
}

/**
 * Delete cube - Step 3: Delete remaining metadata
 *
 * Deletes all cube-related triples with bidirectional matching:
 * - Cube direct properties (outgoing and incoming)
 * - Blank node properties attached to the cube
 * - SHACL NodeShapes (observationConstraint, both directions)
 * - SHACL PropertyShapes (sh:property)
 * - RDF Lists (sh:in lists with rdf:first/rdf:rest chains)
 * - Observation sets (both directions)
 *
 * Uses BIND pattern instead of FILTER for Stardog compatibility.
 * See: docs/sparql-query-review-2026-02-02.md for details.
 */
function deleteCubeMetadataQuery(graphUri, cubeUri) {
    const safeGraph = validateUri(graphUri);
    const safeCube = validateUri(cubeUri);
    return `${PREFIXES}
WITH <${safeGraph}>
DELETE {
  ?s ?p ?o .
}
WHERE {
  {
    # Cube outgoing triples
    <${safeCube}> ?p ?o .
    BIND(<${safeCube}> AS ?s)
  }
  UNION
  {
    # Cube incoming triples (anything pointing TO this cube)
    ?s ?p <${safeCube}> .
    BIND(<${safeCube}> AS ?o)
  }
  UNION
  {
    # Blank node properties attached to the cube
    <${safeCube}> ?p1 ?bn .
    FILTER(isBlank(?bn))
    ?bn ?p ?o .
    BIND(?bn AS ?s)
  }
  UNION
  {
    # SHACL NodeShape outgoing
    <${safeCube}> cube:observationConstraint ?shape .
    ?shape ?p ?o .
    BIND(?shape AS ?s)
  }
  UNION
  {
    # SHACL NodeShape incoming
    <${safeCube}> cube:observationConstraint ?shape .
    ?s ?p ?shape .
    BIND(?shape AS ?o)
  }
  UNION
  {
    # SHACL PropertyShape
    <${safeCube}> cube:observationConstraint ?shape .
    ?shape sh:property ?propShape .
    ?propShape ?p ?o .
    BIND(?propShape AS ?s)
  }
  UNION
  {
    # RDF list items (sh:in lists) - prevents orphaned list nodes
    <${safeCube}> cube:observationConstraint ?shape .
    ?shape sh:property ?propShape .
    ?propShape sh:in ?list .
    ?list rdf:rest*/rdf:first ?item .
    ?list ?p ?o .
    BIND(?list AS ?s)
  }
  UNION
  {
    # ObservationSet outgoing
    <${safeCube}> cube:observationSet ?set .
    ?set ?p ?o .
    BIND(?set AS ?s)
  }
  UNION
  {
    # ObservationSet incoming
    <${safeCube}> cube:observationSet ?set .
    ?s ?p ?set .
    BIND(?set AS ?o)
  }
}`;
}

/**
 * Count remaining observations for a cube
 */
/**
 * Count remaining observations for a cube.
 * Counts distinct observations (not triples) to give an accurate count.
 */
function countObservationsQuery(graphUri, cubeUri) {
    const safeGraph = validateUri(graphUri);
    const safeCube = validateUri(cubeUri);
    return `${PREFIXES}
SELECT (COUNT(DISTINCT ?obs) AS ?count)
WHERE {
  GRAPH <${safeGraph}> {
    <${safeCube}> cube:observationSet/cube:observation ?obs .
  }
}`;
}

/**
 * Check if cube exists
 */
function cubeExistsQuery(graphUri, cubeUri) {
    const safeGraph = validateUri(graphUri);
    const safeCube = validateUri(cubeUri);
    return `${PREFIXES}
ASK WHERE {
  GRAPH <${safeGraph}> {
    <${safeCube}> a cube:Cube .
  }
}`;
}

/**
 * Count triples in graph
 */
function countTriplesQuery(graphUri) {
    const safeGraph = validateUri(graphUri);
    return `
SELECT (COUNT(*) AS ?count)
WHERE {
  GRAPH <${safeGraph}> {
    ?s ?p ?o .
  }
}`;
}

/**
 * Delete ALL old versions automatically (keep newest N per base cube)
 * This query automatically finds and deletes all cube versions with rank > versionsToKeep
 * No specific cube URI is required - it works on all cubes in the graph
 */
function deleteAllOldVersionsQuery(graphUri, versionsToKeep = 2) {
    const safeGraph = validateUri(graphUri);
    const safeKeep = parseInt(versionsToKeep, 10);
    if (isNaN(safeKeep) || safeKeep < 1) {
        throw new Error('versionsToKeep must be a positive integer');
    }
    return `${PREFIXES}
# WARNING: This query deletes ALL cube versions except the newest ${safeKeep} per base cube
# Make sure to backup data before running!
# Uses BIND pattern for Stardog compatibility and bidirectional matching.

WITH <${safeGraph}>
DELETE {
  ?s ?p ?o .
}
WHERE {
  # Find cubes to delete: those with rank > ${safeKeep} (at least ${safeKeep} newer versions exist)
  ?cube a cube:Cube .

  # Only process cubes that follow the /baseCube/version URI pattern
  FILTER(REGEX(STR(?cube), "^.*/[0-9]+/?$"))

  # Extract version number and base cube from URI
  BIND(xsd:integer(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1")) AS ?v)
  BIND(REPLACE(STR(?cube), "^(.*)/[0-9]+/?$", "$1") AS ?baseStr)

  # Filter: only delete cubes where at least ${safeKeep} newer versions exist (rank > ${safeKeep})
  ${generateNewerVersionsFilter(safeKeep)}

  # Delete all related triples for selected cubes
  {
    # Cube outgoing
    ?cube ?p ?o .
    BIND(?cube AS ?s)
  }
  UNION
  {
    # Cube incoming
    ?s ?p ?cube .
    BIND(?cube AS ?o)
  }
  UNION
  {
    # Blank node metadata
    ?cube ?p1 ?bn .
    FILTER(isBlank(?bn))
    ?bn ?p ?o .
    BIND(?bn AS ?s)
  }
  UNION
  {
    # SHACL NodeShape outgoing
    ?cube cube:observationConstraint ?shape .
    ?shape ?p ?o .
    BIND(?shape AS ?s)
  }
  UNION
  {
    # SHACL NodeShape incoming
    ?cube cube:observationConstraint ?shape .
    ?s ?p ?shape .
    BIND(?shape AS ?o)
  }
  UNION
  {
    # SHACL PropertyShape
    ?cube cube:observationConstraint ?shape .
    ?shape sh:property ?propShape .
    ?propShape ?p ?o .
    BIND(?propShape AS ?s)
  }
  UNION
  {
    # RDF list items
    ?cube cube:observationConstraint ?shape .
    ?shape sh:property ?propShape .
    ?propShape sh:in ?list .
    ?list rdf:rest*/rdf:first ?item .
    ?list ?p ?o .
    BIND(?list AS ?s)
  }
  UNION
  {
    # ObservationSet outgoing
    ?cube cube:observationSet ?set .
    ?set ?p ?o .
    BIND(?set AS ?s)
  }
  UNION
  {
    # ObservationSet incoming
    ?cube cube:observationSet ?set .
    ?s ?p ?set .
    BIND(?set AS ?o)
  }
  UNION
  {
    # Observations outgoing
    ?cube cube:observationSet ?obsSet .
    ?obsSet cube:observation ?obs .
    ?obs ?p ?o .
    BIND(?obs AS ?s)
  }
  UNION
  {
    # Observations incoming
    ?cube cube:observationSet ?obsSet .
    ?obsSet cube:observation ?obs .
    ?s ?p ?obs .
    BIND(?obs AS ?o)
  }
}`;
}

/**
 * Generate FILTER EXISTS clause for N newer versions
 * A cube has rank > N if there exist N different cubes from same base with higher version
 */
function generateNewerVersionsFilter(count) {
    const filters = [];
    for (let i = 1; i <= count; i++) {
        filters.push(`    ?newer${i} a cube:Cube .
    FILTER(REGEX(STR(?newer${i}), "^.*/[0-9]+/?$"))
    FILTER(REPLACE(STR(?newer${i}), "^(.*)/[0-9]+/?$", "$1") = ?baseStr)
    FILTER(xsd:integer(REPLACE(STR(?newer${i}), "^.*/([0-9]+)/?$", "$1")) > ?v)`);
    }

    // Add filters to ensure all newer versions are distinct
    const distinctFilters = [];
    for (let i = 2; i <= count; i++) {
        for (let j = 1; j < i; j++) {
            distinctFilters.push(`    FILTER(?newer${i} != ?newer${j})`);
        }
    }

    return `FILTER EXISTS {
${filters.join('\n\n')}
${distinctFilters.length > 0 ? '\n' + distinctFilters.join('\n') : ''}
  }`;
}

// =============================================================================
// Orphan Detection and Cleanup Queries
// =============================================================================

/**
 * Query to get a summary of all orphan objects by type
 */
function findOrphansSummaryQuery(graphUri) {
    const safeGraph = validateUri(graphUri);
    return `${PREFIXES}
PREFIX sh: <http://www.w3.org/ns/shacl#>

SELECT ?orphanType (COUNT(DISTINCT ?orphan) AS ?count)
WHERE {
  GRAPH <${safeGraph}> {
    {
      # Orphan Observation Sets
      ?orphan cube:observation ?someObs .
      FILTER NOT EXISTS { ?anyCube cube:observationSet ?orphan }
      BIND("ObservationSet" AS ?orphanType)
    }
    UNION
    {
      # Orphan NodeShapes
      ?orphan a sh:NodeShape .
      FILTER NOT EXISTS { ?anyCube cube:observationConstraint ?orphan }
      BIND("NodeShape" AS ?orphanType)
    }
    UNION
    {
      # Orphan PropertyShapes
      ?orphan a sh:PropertyShape .
      FILTER NOT EXISTS { ?anyShape sh:property ?orphan }
      BIND("PropertyShape" AS ?orphanType)
    }
  }
}
GROUP BY ?orphanType
ORDER BY ?orphanType`;
}

/**
 * Query to find orphan observation sets with details
 */
function findOrphanObservationSetsQuery(graphUri) {
    const safeGraph = validateUri(graphUri);
    return `${PREFIXES}

SELECT ?orphanSet (COUNT(DISTINCT ?obs) AS ?observationCount) (COUNT(?p) AS ?totalTriples)
WHERE {
  GRAPH <${safeGraph}> {
    ?orphanSet cube:observation ?someObs .
    FILTER NOT EXISTS { ?anyCube cube:observationSet ?orphanSet }
    ?orphanSet ?p ?o .
    OPTIONAL { ?orphanSet cube:observation ?obs }
  }
}
GROUP BY ?orphanSet
ORDER BY DESC(?observationCount)
LIMIT 100`;
}

/**
 * Query to find orphan SHACL shapes
 */
function findOrphanShapesQuery(graphUri) {
    const safeGraph = validateUri(graphUri);
    return `${PREFIXES}
PREFIX sh: <http://www.w3.org/ns/shacl#>

SELECT ?orphanShape ?shapeType (COUNT(?p) AS ?tripleCount)
WHERE {
  GRAPH <${safeGraph}> {
    {
      ?orphanShape a sh:NodeShape .
      BIND("NodeShape" AS ?shapeType)
      FILTER NOT EXISTS { ?anyCube cube:observationConstraint ?orphanShape }
    }
    UNION
    {
      ?orphanShape a sh:PropertyShape .
      BIND("PropertyShape" AS ?shapeType)
      FILTER NOT EXISTS { ?anyShape sh:property ?orphanShape }
    }
    ?orphanShape ?p ?o .
  }
}
GROUP BY ?orphanShape ?shapeType
ORDER BY ?shapeType DESC(?tripleCount)
LIMIT 100`;
}

/**
 * Query to delete orphan observation sets and their observations
 */
function deleteOrphanObservationSetsQuery(graphUri) {
    const safeGraph = validateUri(graphUri);
    return `${PREFIXES}

WITH <${safeGraph}>
DELETE {
  ?orphanSet ?setP ?setO .
  ?obs ?obsP ?obsO .
}
WHERE {
  ?orphanSet cube:observation ?someObs .
  FILTER NOT EXISTS { ?anyCube cube:observationSet ?orphanSet }
  ?orphanSet ?setP ?setO .
  OPTIONAL {
    ?orphanSet cube:observation ?obs .
    ?obs ?obsP ?obsO .
  }
}`;
}

/**
 * Query to delete orphan SHACL shapes
 */
function deleteOrphanShapesQuery(graphUri) {
    const safeGraph = validateUri(graphUri);
    return `${PREFIXES}
PREFIX sh: <http://www.w3.org/ns/shacl#>

WITH <${safeGraph}>
DELETE {
  ?orphanShape ?p ?o .
  ?propShape ?propP ?propO .
}
WHERE {
  {
    ?orphanShape a sh:NodeShape .
    FILTER NOT EXISTS { ?anyCube cube:observationConstraint ?orphanShape }
    ?orphanShape ?p ?o .
    OPTIONAL {
      ?orphanShape sh:property ?propShape .
      ?propShape ?propP ?propO .
    }
  }
  UNION
  {
    ?orphanShape a sh:PropertyShape .
    FILTER NOT EXISTS { ?anyShape sh:property ?orphanShape }
    ?orphanShape ?p ?o .
  }
}`;
}

/**
 * Query to delete ALL orphans (sets, shapes) in one operation
 */
function deleteAllOrphansQuery(graphUri) {
    const safeGraph = validateUri(graphUri);
    return `${PREFIXES}
PREFIX sh: <http://www.w3.org/ns/shacl#>

WITH <${safeGraph}>
DELETE {
  ?orphan ?p ?o .
  ?child ?childP ?childO .
}
WHERE {
  {
    # Orphan Observation Sets and their observations
    ?orphan cube:observation ?someObs .
    FILTER NOT EXISTS { ?anyCube cube:observationSet ?orphan }
    ?orphan ?p ?o .
    OPTIONAL {
      ?orphan cube:observation ?child .
      ?child ?childP ?childO .
    }
  }
  UNION
  {
    # Orphan NodeShapes and their property shapes
    ?orphan a sh:NodeShape .
    FILTER NOT EXISTS { ?anyCube cube:observationConstraint ?orphan }
    ?orphan ?p ?o .
    OPTIONAL {
      ?orphan sh:property ?child .
      ?child ?childP ?childO .
    }
  }
  UNION
  {
    # Standalone Orphan PropertyShapes
    ?orphan a sh:PropertyShape .
    FILTER NOT EXISTS { ?anyShape sh:property ?orphan }
    ?orphan ?p ?o .
  }
}`;
}

module.exports = {
    PREFIXES,
    validateUri,
    listCubeVersionsQuery,
    identifyDeletionsQuery,
    previewCubeQuery,
    exportCubeQuery,
    deleteObservationsQuery,
    deleteObservationLinksQuery,
    deleteCubeMetadataQuery,
    countObservationsQuery,
    cubeExistsQuery,
    countTriplesQuery,
    deleteAllOldVersionsQuery,
    generateNewerVersionsFilter,
    // Orphan queries
    findOrphansSummaryQuery,
    findOrphanObservationSetsQuery,
    findOrphanShapesQuery,
    deleteOrphanObservationSetsQuery,
    deleteOrphanShapesQuery,
    deleteAllOrphansQuery
};
