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
 * List all cube versions in a graph
 */
function listCubeVersionsQuery(graphUri) {
    return `${PREFIXES}
SELECT DISTINCT ?baseCube ?cube ?version ?dateCreated ?title
WHERE {
  GRAPH <${graphUri}> {
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
    return `${PREFIXES}
SELECT ?baseCube ?cube ?version ?rank
       (IF(?rank <= ${versionsToKeep}, "KEEP", "DELETE") AS ?action)
WHERE {
  GRAPH <${graphUri}> {
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
    GRAPH <${graphUri}> {
        BIND(<${cubeUri}> AS ?cube)
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
 */
function exportCubeQuery(graphUri, cubeUri) {
    return `${PREFIXES}
CONSTRUCT { ?s ?p ?o }
WHERE {
  GRAPH <${graphUri}> {
    {
      BIND(<${cubeUri}> AS ?s)
      <${cubeUri}> ?p ?o .
    }
    UNION
    {
      <${cubeUri}> cube:observationConstraint ?shape .
      ?shape (<>|!<>)* ?s .
      ?s ?p ?o .
    }
    UNION
    {
      <${cubeUri}> cube:observationSet ?set .
      ?set ?p ?o .
      BIND(?set AS ?s)
    }
    UNION
    {
      <${cubeUri}> cube:observationSet/cube:observation ?obs .
      ?obs ?p ?o .
      BIND(?obs AS ?s)
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
    return `${PREFIXES}
WITH <${graphUri}>
DELETE {
  ?obs ?p ?o .
}
WHERE {
  <${cubeUri}> cube:observationSet/cube:observation ?obs .
  ?obs ?p ?o .
}`;
}

/**
 * Delete cube - Step 2: Delete observation set links
 */
function deleteObservationLinksQuery(graphUri, cubeUri) {
    return `${PREFIXES}
WITH <${graphUri}>
DELETE {
  ?set cube:observation ?obs .
}
WHERE {
  <${cubeUri}> cube:observationSet ?set .
  ?set cube:observation ?obs .
}`;
}

/**
 * Delete cube - Step 3: Delete remaining metadata
 */
function deleteCubeMetadataQuery(graphUri, cubeUri) {
    return `${PREFIXES}
WITH <${graphUri}>
DELETE {
  ?s ?p ?o .
}
WHERE {
  {
    <${cubeUri}> ?p ?o .
    BIND(<${cubeUri}> AS ?s)
  }
  UNION
  {
    <${cubeUri}> ?p1 ?bn .
    FILTER(isBlank(?bn))
    ?bn ?p ?o .
    BIND(?bn AS ?s)
  }
  UNION
  {
    <${cubeUri}> cube:observationConstraint ?shape .
    ?shape ?p ?o .
    BIND(?shape AS ?s)
  }
  UNION
  {
    <${cubeUri}> cube:observationConstraint ?shape .
    ?shape sh:property ?propShape .
    ?propShape ?p ?o .
    BIND(?propShape AS ?s)
  }
  UNION
  {
    <${cubeUri}> cube:observationSet ?set .
    ?set ?p ?o .
    BIND(?set AS ?s)
  }
}`;
}

/**
 * Count remaining observations for a cube
 */
function countObservationsQuery(graphUri, cubeUri) {
    return `${PREFIXES}
SELECT (COUNT(*) AS ?count)
WHERE {
  GRAPH <${graphUri}> {
    <${cubeUri}> cube:observationSet/cube:observation ?obs .
    ?obs ?p ?o .
  }
}`;
}

/**
 * Check if cube exists
 */
function cubeExistsQuery(graphUri, cubeUri) {
    return `${PREFIXES}
ASK WHERE {
  GRAPH <${graphUri}> {
    <${cubeUri}> a cube:Cube .
  }
}`;
}

/**
 * Count triples in graph
 */
function countTriplesQuery(graphUri) {
    return `
SELECT (COUNT(*) AS ?count)
WHERE {
  GRAPH <${graphUri}> {
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
    return `${PREFIXES}
# WARNING: This query deletes ALL cube versions except the newest ${versionsToKeep} per base cube
# Make sure to backup data before running!

WITH <${graphUri}>
DELETE {
  ?cube ?p1 ?o1 .
  ?shape ?shapeP ?shapeO .
  ?prop ?propP ?propO .
  ?set ?setP ?setO .
  ?obs ?obsP ?obsO .
}
WHERE {
  # Find cubes to delete: those with rank > ${versionsToKeep} (at least ${versionsToKeep} newer versions exist)
  ?cube a cube:Cube .

  # Only process cubes that follow the /baseCube/version URI pattern
  FILTER(REGEX(STR(?cube), "^.*/[0-9]+/?$"))

  # Extract version number and base cube from URI
  BIND(xsd:integer(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1")) AS ?v)
  BIND(REPLACE(STR(?cube), "^(.*)/[0-9]+/?$", "$1") AS ?baseStr)

  # Filter: only delete cubes where at least ${versionsToKeep} newer versions exist (rank > ${versionsToKeep})
  ${generateNewerVersionsFilter(versionsToKeep)}

  # Delete all related triples for selected cubes
  {
    # Cube metadata
    { ?cube ?p1 ?o1 }
    UNION
    # Shape constraints
    { ?cube cube:observationConstraint ?shape .
      ?shape ?shapeP ?shapeO }
    UNION
    # Shape properties (recursive)
    { ?cube cube:observationConstraint/sh:property ?directProp .
      ?directProp (<>|!<>)* ?prop .
      ?prop ?propP ?propO }
    UNION
    # Observation sets
    { ?cube cube:observationSet ?set .
      ?set ?setP ?setO }
    UNION
    # Observations
    { ?cube cube:observationSet/cube:observation ?obs .
      ?obs ?obsP ?obsO }
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

module.exports = {
    PREFIXES,
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
    generateNewerVersionsFilter
};
