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
 * Delete cube - Step 1: Delete observations (chunked)
 */
function deleteObservationsQuery(graphUri, cubeUri, limit = 50000) {
    return `${PREFIXES}
WITH <${graphUri}>
DELETE {
  ?obs ?p ?o .
}
WHERE {
  <${cubeUri}> cube:observationSet/cube:observation ?obs .
  ?obs ?p ?o .
}
LIMIT ${limit}`;
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
  ?cube ?p1 ?o1 .
  ?shape ?p2 ?o2 .
  ?prop ?p3 ?o3 .
  ?set ?p4 ?o4 .
}
WHERE {
  BIND(<${cubeUri}> AS ?cube)
  ?cube rdf:type cube:Cube .
  {
    ?cube ?p1 ?o1 .
  }
  UNION
  {
    ?cube cube:observationConstraint ?shape .
    ?shape ?p2 ?o2 .
  }
  UNION
  {
    ?cube cube:observationConstraint/sh:property ?prop .
    ?prop (<>|!<>)* ?propNode .
    ?propNode ?p3 ?o3 .
    BIND(?propNode AS ?prop)
  }
  UNION
  {
    ?cube cube:observationSet ?set .
    ?set ?p4 ?o4 .
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
    countTriplesQuery
};
