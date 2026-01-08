# SPARQL Queries - Complete Technical Documentation

This document provides a comprehensive explanation of all SPARQL queries used in the LINDAS Cube Version Cleanup solution, including the logic behind each query and how they work together.

## Overview

The cube version cleanup process uses a series of SPARQL queries to:
1. List all cube versions in a graph
2. Count versions per base cube
3. Identify which versions should be deleted (keeping newest 2)
4. Delete cube data in a structured, chunked manner

## Cube URI Structure

LINDAS cubes follow a versioned URI pattern:
```
https://energy.ld.admin.ch/sfoe/{cube_name}/{version_number}
```

Example:
- Base cube: `https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung`
- Version 7: `https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/7`
- Version 1: `https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/1`

---

## Query 01: List All Cube Versions

**File**: `queries/universal/01-list-all-cube-versions.rq`

**Purpose**: Retrieve all cubes in a graph with their version information, creation dates, and titles.

### SPARQL Query

```sparql
PREFIX cube: <https://cube.link/>
PREFIX schema: <http://schema.org/>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT DISTINCT ?baseCube ?cube ?version ?dateCreated ?dateModified ?title
WHERE {
  GRAPH <GRAPH_URI> {
    ?cube a cube:Cube .

    OPTIONAL { ?cube schema:dateCreated ?dateCreated }
    OPTIONAL { ?cube schema:dateModified ?dateModified }
    OPTIONAL { ?cube schema:name ?title . FILTER(lang(?title) = "en" || lang(?title) = "") }

    # Extract version number from URI
    BIND(REPLACE(STR(?cube), "^.*/([^/]+)/([0-9]+)$", "$2") AS ?versionStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+$"), xsd:integer(?versionStr), 0) AS ?version)

    # Extract base cube URI (without version number)
    BIND(REPLACE(STR(?cube), "^(.*/[^/]+)/[0-9]+$", "$1") AS ?baseCubeStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+$"), IRI(?baseCubeStr), ?cube) AS ?baseCube)
  }
}
ORDER BY ?baseCube DESC(?version)
```

### Logic Explanation

1. **Find all cubes**: `?cube a cube:Cube` matches all resources of type `cube:Cube`

2. **Extract version number**: Using regex to parse the URI
   - `REPLACE(STR(?cube), "^.*/([^/]+)/([0-9]+)$", "$2")` extracts the numeric version
   - Pattern breakdown:
     - `^.*/` - matches everything up to the last path segments
     - `([^/]+)/` - captures the cube name
     - `([0-9]+)$` - captures the version number at the end
   - `$2` returns the second capture group (version number)

3. **Extract base cube**: Similar regex to get the cube URI without version
   - `REPLACE(..., "$1")` returns just the base path

4. **Type safety**: `IF(REGEX(...), xsd:integer(...), 0)` ensures non-versioned cubes get version 0

### Web App API Endpoint

```
POST /api/cubes/list-versions
Body: { endpoint, dataset, graphUri }
```

---

## Query 02: Count Versions Per Cube

**File**: `queries/universal/02-count-versions-per-cube.rq`

**Purpose**: Group cubes by base URI and count how many versions exist. Filter to show only cubes with more than 2 versions (cleanup candidates).

### SPARQL Query

```sparql
PREFIX cube: <https://cube.link/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?baseCube (COUNT(DISTINCT ?cube) AS ?versionCount)
       (GROUP_CONCAT(DISTINCT ?version; separator=", ") AS ?versions)
WHERE {
  GRAPH <GRAPH_URI> {
    ?cube a cube:Cube .

    BIND(REPLACE(STR(?cube), "^.*/([^/]+)/([0-9]+)$", "$2") AS ?versionStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+$"), ?versionStr, "0") AS ?version)

    BIND(REPLACE(STR(?cube), "^(.*/[^/]+)/[0-9]+$", "$1") AS ?baseCubeStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+$"), ?baseCubeStr, STR(?cube)) AS ?baseCube)
  }
}
GROUP BY ?baseCube
HAVING (COUNT(DISTINCT ?cube) > 2)
ORDER BY DESC(?versionCount)
```

### Logic Explanation

1. **Grouping**: `GROUP BY ?baseCube` aggregates all versions of the same cube

2. **Counting**: `COUNT(DISTINCT ?cube)` counts unique cube URIs per base cube

3. **Version list**: `GROUP_CONCAT(DISTINCT ?version; separator=", ")` creates a comma-separated list of version numbers

4. **Filter**: `HAVING (COUNT(DISTINCT ?cube) > 2)` ensures only cubes with more than 2 versions are returned (these need cleanup)

### Example Output

| baseCube | versionCount | versions |
|----------|--------------|----------|
| .../bfe_ogd18_gebaeudeprogramm_co2wirkung | 7 | 1, 2, 3, 4, 5, 6, 7 |

### Web App API Endpoint

```
POST /api/cubes/count-versions
Body: { endpoint, dataset, graphUri }
```

---

## Query 03: Identify Versions to Delete

**File**: `queries/universal/03-identify-versions-to-delete.rq`

**Purpose**: Rank all cube versions and identify which should be deleted (rank > 2).

### SPARQL Query

```sparql
PREFIX cube: <https://cube.link/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?cube ?baseCube ?version ?rank
WHERE {
  {
    SELECT ?cube ?baseCube ?version (COUNT(DISTINCT ?newerCube) + 1 AS ?rank)
    WHERE {
      GRAPH <GRAPH_URI> {
        ?cube a cube:Cube .

        # Extract version and base cube (same as before)
        BIND(REPLACE(STR(?cube), "^.*/([^/]+)/([0-9]+)$", "$2") AS ?versionStr)
        BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+$"), xsd:integer(?versionStr), 0) AS ?version)
        BIND(REPLACE(STR(?cube), "^(.*/[^/]+)/[0-9]+$", "$1") AS ?baseCubeStr)
        BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+$"), IRI(?baseCubeStr), ?cube) AS ?baseCube)

        # Find newer versions of the same cube
        OPTIONAL {
          ?newerCube a cube:Cube .
          BIND(REPLACE(STR(?newerCube), "^.*/([^/]+)/([0-9]+)$", "$2") AS ?newerVersionStr)
          BIND(IF(REGEX(STR(?newerCube), "^.*/[^/]+/[0-9]+$"), xsd:integer(?newerVersionStr), 0) AS ?newerVersion)
          BIND(REPLACE(STR(?newerCube), "^(.*/[^/]+)/[0-9]+$", "$1") AS ?newerBaseCubeStr)
          BIND(IF(REGEX(STR(?newerCube), "^.*/[^/]+/[0-9]+$"), IRI(?newerBaseCubeStr), ?newerCube) AS ?newerBaseCube)

          FILTER(?newerBaseCube = ?baseCube && ?newerVersion > ?version)
        }
      }
    }
    GROUP BY ?cube ?baseCube ?version
  }
  FILTER(?rank > 2)
}
ORDER BY ?baseCube ?rank
```

### Logic Explanation - The Ranking Algorithm

This is the core algorithm that determines which versions to delete:

1. **Ranking concept**: A cube's rank = (number of newer versions) + 1
   - Newest version has 0 newer versions, so rank = 1
   - Second newest has 1 newer version, so rank = 2
   - Third newest has 2 newer versions, so rank = 3
   - etc.

2. **Finding newer versions**: The OPTIONAL block finds all cubes where:
   - Same base cube (`?newerBaseCube = ?baseCube`)
   - Higher version number (`?newerVersion > ?version`)

3. **Counting**: `COUNT(DISTINCT ?newerCube) + 1` gives the rank

4. **Filtering for deletion**: `FILTER(?rank > 2)` returns only versions that should be deleted

### Example Ranking

For a cube with versions 1, 2, 3, 4, 5, 6, 7:

| Version | Newer Versions | Rank | Action |
|---------|----------------|------|--------|
| 7 | 0 | 1 | KEEP |
| 6 | 1 (v7) | 2 | KEEP |
| 5 | 2 (v6, v7) | 3 | DELETE |
| 4 | 3 | 4 | DELETE |
| 3 | 4 | 5 | DELETE |
| 2 | 5 | 6 | DELETE |
| 1 | 6 | 7 | DELETE |

### Web App API Endpoint

```
POST /api/cubes/identify-deletions
Body: { endpoint, dataset, graphUri }
```

---

## Query 06: Delete Single Cube (Complete)

**File**: `queries/universal/06-delete-single-cube.rq`

**Purpose**: Delete a complete cube and all its associated data in a single query.

### SPARQL Query

```sparql
PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

WITH <GRAPH_URI>
DELETE {
  ?cube a cube:Cube ;
        cube:observationConstraint ?shape ;
        cube:observationSet ?set ;
        ?p1 ?metaLevel1 .

  ?metaLevel1 ?p2 ?metaLevel2 .

  ?shape ?shapeP ?shapeO .
  ?propertyS ?propertyP ?propertyO .

  ?set cube:observation ?observationS .
  ?set ?setP ?setO .
  ?observationS ?observationP ?observationO .
}
WHERE {
  BIND(<CUBE_URI> AS ?cube)
  ?cube rdf:type cube:Cube

  { ?cube ?p1 ?metaLevel1
    OPTIONAL {
      ?metaLevel1 ?p2 ?metaLevel2
      FILTER(isBlank(?metaLevel1))
    }
  }
  UNION
  { ?cube cube:observationConstraint ?shape .
    ?shape ?shapeP ?shapeO }
  UNION
  { ?cube cube:observationConstraint/sh:property ?property .
    ?property (<>|!<>)* ?propertyS .
    ?propertyS ?propertyP ?propertyO }
  UNION
  { ?cube cube:observationSet ?set .
    ?set ?setP ?setO . }
  UNION
  { ?cube cube:observationSet ?set .
    ?set cube:observation ?observationS .
    ?observationS ?observationP ?observationO }
}
```

### Logic Explanation - Cube Structure

A cube:Cube in LINDAS has the following structure:

```
cube:Cube
  |-- rdf:type cube:Cube
  |-- schema:name "Title"
  |-- schema:dateCreated "2023-09-12"
  |-- schema:creator [...blank node...]
  |       |-- schema:name "Author Name"
  |
  |-- cube:observationConstraint --> SHACL Shape
  |       |-- sh:property --> Property Shape 1
  |       |       |-- sh:path <dimension>
  |       |       |-- sh:in (list of values)
  |       |-- sh:property --> Property Shape 2
  |       |-- ...
  |
  |-- cube:observationSet --> Observation Set
          |-- cube:observation --> Observation 1
          |       |-- <dimension1> <value1>
          |       |-- <dimension2> <value2>
          |       |-- <measure> 123.45
          |-- cube:observation --> Observation 2
          |-- ...
```

### DELETE Pattern Breakdown

1. **Cube metadata**: `?cube ?p1 ?metaLevel1` - direct properties of the cube
2. **Blank node metadata**: `?metaLevel1 ?p2 ?metaLevel2` - properties of blank nodes (e.g., nested creator info)
3. **SHACL shapes**: `?cube cube:observationConstraint ?shape` - the constraint definition
4. **Property shapes**: `sh:property ?property` - dimension/measure definitions
5. **Observation set**: `cube:observationSet ?set` - container for observations
6. **Observations**: `cube:observation ?observationS` - actual data points

---

## Web App Chunked Deletion Process

For large cubes, the web app uses a three-step chunked approach to avoid timeouts:

### Step 1: Delete Observations (Chunked)

```sparql
DELETE {
  GRAPH <graphUri> {
    ?obs ?p ?o .
  }
}
WHERE {
  GRAPH <graphUri> {
    <cubeUri> cube:observationSet ?obsSet .
    ?obsSet cube:observation ?obs .
    ?obs ?p ?o .
  }
}
LIMIT 50000
```

This is repeated until no observations remain.

### Step 2: Delete Observation Links

```sparql
DELETE {
  GRAPH <graphUri> {
    ?obsSet cube:observation ?obs .
  }
}
WHERE {
  GRAPH <graphUri> {
    <cubeUri> cube:observationSet ?obsSet .
    ?obsSet cube:observation ?obs .
  }
}
```

### Step 3: Delete Metadata and Shapes

```sparql
DELETE {
  GRAPH <graphUri> {
    ?s ?p ?o .
  }
}
WHERE {
  GRAPH <graphUri> {
    {
      <cubeUri> ?p ?o .
      BIND(<cubeUri> AS ?s)
    }
    UNION
    {
      <cubeUri> ?p1 ?bn .
      FILTER(isBlank(?bn))
      ?bn ?p ?o .
      BIND(?bn AS ?s)
    }
    UNION
    {
      <cubeUri> cube:observationConstraint ?shape .
      ?shape ?p ?o .
      BIND(?shape AS ?s)
    }
    UNION
    {
      <cubeUri> cube:observationConstraint ?shape .
      ?shape sh:property ?propShape .
      ?propShape ?p ?o .
      BIND(?propShape AS ?s)
    }
    UNION
    {
      <cubeUri> cube:observationSet ?obsSet .
      ?obsSet ?p ?o .
      BIND(?obsSet AS ?s)
    }
  }
}
```

---

## Query Flow in the Web Application

```
                    +-------------------+
                    | 1. List Versions  |  (Query 01)
                    | Shows all cubes   |
                    +--------+----------+
                             |
                             v
                    +-------------------+
                    | 2. Count Versions |  (Query 02)
                    | Filter >2 versions|
                    +--------+----------+
                             |
                             v
                    +-------------------+
                    | 3. Identify for   |  (Query 03)
                    | Deletion (rank>2) |
                    +--------+----------+
                             |
                             v
               +-------------+-------------+
               |                           |
               v                           v
    +-------------------+       +-------------------+
    | Preview Deletion  |       | Execute Deletion  |
    | Count triples     |       | 3-step chunked    |
    +-------------------+       +-------------------+
                                           |
                                           v
                                +-------------------+
                                | Verify Results    |
                                | Reload cubes list |
                                +-------------------+
```

---

## Important Notes

1. **Parameter Replacement**: All queries use `<GRAPH_URI>` and `<CUBE_URI>` placeholders that are replaced at runtime

2. **Version Detection**: The version extraction relies on URIs ending with `/{cube_name}/{number}`. Non-standard URI patterns may not be detected

3. **Blank Node Handling**: The deletion queries specifically handle blank nodes in cube metadata (e.g., nested creator information)

4. **RDF List Handling**: SHACL property shapes may contain RDF lists (e.g., `sh:in`). The queries traverse these lists for complete deletion

5. **Offline Operation**: All queries can run against a local Fuseki instance, allowing safe testing before production use
