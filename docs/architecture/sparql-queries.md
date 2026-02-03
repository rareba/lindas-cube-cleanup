# LINDAS Cube Version Cleanup - SPARQL Queries

This document contains all SPARQL queries needed to cleanup old cube versions from LINDAS.
These queries can be run directly against a SPARQL endpoint (Fuseki, LINDAS, etc.) without using the web application.

## Overview

The LINDAS cube cleanup process involves:
1. **Identifying** cubes with multiple versions
2. **Ranking** versions to determine which to keep (newest 2) and which to delete
3. **Backing up** cube data before deletion (optional but recommended)
4. **Deleting** old versions while preserving cube integrity

## Cube Structure

LINDAS cubes follow the [cube.link](https://cube.link/) vocabulary and have this structure:

```
cube:Cube
  |-- schema:name (title)
  |-- schema:dateCreated
  |-- cube:observationConstraint -> SHACL Shape
  |      |-- sh:property -> Property definitions
  |-- cube:observationSet -> Observation Set
         |-- cube:observation -> Individual observations (data points)
```

Cube URIs follow the pattern: `{base-uri}/{cube-name}/{version-number}`
Example: `https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/7`

## Configuration

Replace the following placeholders in all queries:
- `<GRAPH_URI>` - The named graph containing the cubes (e.g., `https://lindas.admin.ch/sfoe/cube`)
- `<CUBE_URI>` - The specific cube version URI to operate on

---

## Read Queries (SELECT)

### 1. List All Cube Versions

**Purpose**: Lists all cubes in a graph with their version numbers, grouped by base cube.

**Use Case**: Get an overview of all cubes and their versions before deciding which to clean up.

**How It Works**:
- Finds all resources of type `cube:Cube`
- Extracts the version number from the URI using regex (assumes `/version` pattern)
- Extracts the base cube URI (without version number)
- Returns metadata like title and creation date

```sparql
PREFIX cube: <https://cube.link/>
PREFIX schema: <http://schema.org/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT DISTINCT ?baseCube ?cube ?version ?dateCreated ?title
WHERE {
  GRAPH <GRAPH_URI> {
    ?cube a cube:Cube .

    OPTIONAL { ?cube schema:dateCreated ?dateCreated }
    OPTIONAL { ?cube schema:name ?title . FILTER(lang(?title) = "en" || lang(?title) = "") }

    # Extract version number from URI pattern /baseCube/version
    BIND(REPLACE(STR(?cube), "^.*/([^/]+)/([0-9]+)$", "$2") AS ?versionStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+$"), xsd:integer(?versionStr), 0) AS ?version)

    # Extract base cube URI (without version)
    BIND(REPLACE(STR(?cube), "^(.*/[^/]+)/[0-9]+$", "$1") AS ?baseCubeStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+$"), IRI(?baseCubeStr), ?cube) AS ?baseCube)
  }
}
ORDER BY ?baseCube DESC(?version)
```

**Expected Output**:
| baseCube | cube | version | dateCreated | title |
|----------|------|---------|-------------|-------|
| .../co2wirkung | .../co2wirkung/7 | 7 | 2024-01-15 | CO2 Impact |
| .../co2wirkung | .../co2wirkung/6 | 6 | 2023-12-01 | CO2 Impact |

---

### 2. Count Versions Per Base Cube

**Purpose**: Shows how many versions each base cube has - useful for identifying cleanup candidates.

**Use Case**: Quickly find cubes that have accumulated many versions and need cleanup. Only shows cubes with more than 2 versions.

**How It Works**:
- Groups cubes by their base URI (without version)
- Counts the number of versions per base cube
- Filters to show only those with >2 versions (cleanup candidates)
- Concatenates all version numbers for reference

```sparql
PREFIX cube: <https://cube.link/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?baseCube (COUNT(?cube) AS ?versionCount) (GROUP_CONCAT(?version; separator=", ") AS ?versions)
WHERE {
  GRAPH <GRAPH_URI> {
    ?cube a cube:Cube .

    BIND(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1") AS ?versionStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[0-9]+/?$"), xsd:integer(?versionStr), 0) AS ?version)

    BIND(REPLACE(STR(?cube), "^(.*)/[0-9]+/?$", "$1") AS ?baseCubeStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[0-9]+/?$"), IRI(?baseCubeStr), ?cube) AS ?baseCube)
  }
}
GROUP BY ?baseCube
HAVING (COUNT(?cube) > 2)
ORDER BY DESC(?versionCount)
```

**Expected Output**:
| baseCube | versionCount | versions |
|----------|--------------|----------|
| .../co2wirkung | 7 | 1, 2, 3, 4, 5, 6, 7 |
| .../energiewirkung | 9 | 1, 2, 3, 4, 5, 6, 7, 8, 9 |

---

### 3. Preview Versions to Delete (Keep Newest 2)

**Purpose**: Shows all cube versions ranked by version number, indicating which will be deleted (rank > 2).

**Use Case**: This is the core cleanup preview query. Run this before any deletion to see exactly what will be kept and what will be deleted.

**How It Works**:
- Ranks each cube version within its base cube group (1 = newest, highest version number)
- Uses a subquery to count how many newer versions exist for each cube
- Assigns KEEP to rank 1-2 (newest two versions) and DELETE to rank 3+ (older versions)
- The ranking is based on version number extracted from the URI, not creation date

**Key Concept - Version Ranking**:
```
Version 7 -> Rank 1 -> KEEP (newest)
Version 6 -> Rank 2 -> KEEP (second newest)
Version 5 -> Rank 3 -> DELETE
Version 4 -> Rank 4 -> DELETE
...
```

```sparql
PREFIX cube: <https://cube.link/>
PREFIX schema: <http://schema.org/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?baseCube ?cube ?version ?rank
       (IF(?rank <= 2, "KEEP", "DELETE") AS ?action)
WHERE {
  GRAPH <GRAPH_URI> {
    ?cube a cube:Cube .

    BIND(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1") AS ?versionStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[0-9]+/?$"), xsd:integer(?versionStr), 0) AS ?version)

    BIND(REPLACE(STR(?cube), "^(.*)/[0-9]+/?$", "$1") AS ?baseCubeStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[0-9]+/?$"), IRI(?baseCubeStr), ?cube) AS ?baseCube)
  }

  # Calculate rank within each base cube (1 = newest)
  {
    SELECT ?cube (COUNT(?newerCube) + 1 AS ?rank)
    WHERE {
      GRAPH <GRAPH_URI> {
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
ORDER BY ?baseCube ?rank
```

**Expected Output**:
| baseCube | cube | version | rank | action |
|----------|------|---------|------|--------|
| .../co2wirkung | .../co2wirkung/7 | 7 | 1 | KEEP |
| .../co2wirkung | .../co2wirkung/6 | 6 | 2 | KEEP |
| .../co2wirkung | .../co2wirkung/5 | 5 | 3 | DELETE |
| .../co2wirkung | .../co2wirkung/4 | 4 | 4 | DELETE |

---

### 4. Preview Single Cube (Count Components)

**Purpose**: Counts the components of a specific cube version before deletion.

**Use Case**: Before deleting a cube, check how much data it contains. This helps estimate deletion time and verify you're deleting the correct cube.

**How It Works**:
- Takes a specific cube URI as input
- Counts distinct SHACL shapes (data structure definitions)
- Counts distinct shape properties (dimension/measure definitions)
- Counts observation sets (usually 1 per cube)
- Counts individual observations (data points - can be thousands)

**Component Explanation**:
- **Shapes**: SHACL constraints defining the cube's structure
- **Properties**: Dimension and measure definitions (e.g., year, region, value)
- **Observation Sets**: Container for all observations
- **Observations**: Individual data points (the actual statistical data)

```sparql
PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX schema: <http://schema.org/>

SELECT
    ?cube
    ?title
    ?dateCreated
    (COUNT(DISTINCT ?shape) AS ?shapeCount)
    (COUNT(DISTINCT ?property) AS ?propertyCount)
    (COUNT(DISTINCT ?obsSet) AS ?observationSetCount)
    (COUNT(DISTINCT ?obs) AS ?observationCount)
WHERE {
    GRAPH <GRAPH_URI> {
        BIND(<CUBE_URI> AS ?cube)
        ?cube rdf:type cube:Cube .

        OPTIONAL { ?cube schema:name ?title . FILTER(lang(?title) = "en" || lang(?title) = "") }
        OPTIONAL { ?cube schema:dateCreated ?dateCreated }

        OPTIONAL { ?cube cube:observationConstraint ?shape }
        OPTIONAL { ?cube cube:observationConstraint/sh:property ?property }
        OPTIONAL { ?cube cube:observationSet ?obsSet }
        OPTIONAL { ?cube cube:observationSet/cube:observation ?obs }
    }
}
GROUP BY ?cube ?title ?dateCreated
```

### 5. Count Total Triples in Graph

```sparql
SELECT (COUNT(*) AS ?tripleCount)
WHERE {
  GRAPH <GRAPH_URI> {
    ?s ?p ?o .
  }
}
```

## Write Queries (DELETE/UPDATE)

**WARNING**: These queries permanently delete data. Always backup before running!

### 6. Delete Single Cube Version

Deletes a specific cube version including all its metadata, shapes, and observations.

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

## Batch Deletion Process

To delete all old versions (keeping newest 2), follow this process:

### Step 1: Identify Versions to Delete

Run the "Preview Versions to Delete" query (Query #3) to get a list of all cube URIs that should be deleted (where action = "DELETE").

### Step 2: Export/Backup Data (Optional but Recommended)

For each cube to delete, export its data first:

```sparql
CONSTRUCT { ?s ?p ?o }
WHERE {
  GRAPH <GRAPH_URI> {
    {
      <CUBE_URI> ?p ?o .
      BIND(<CUBE_URI> AS ?s)
    }
    UNION
    {
      <CUBE_URI> cube:observationConstraint ?shape .
      ?shape ?p ?o .
      BIND(?shape AS ?s)
    }
    UNION
    {
      <CUBE_URI> cube:observationSet ?set .
      ?set ?p ?o .
      BIND(?set AS ?s)
    }
    UNION
    {
      <CUBE_URI> cube:observationSet/cube:observation ?obs .
      ?obs ?p ?o .
      BIND(?obs AS ?s)
    }
  }
}
```

### Step 3: Delete Each Version

Run the "Delete Single Cube Version" query (Query #6) for each cube URI identified in Step 1.

**Example for co2wirkung cube with 7 versions (delete versions 1-5, keep 6-7):**

```sparql
# Delete version 1
# Replace CUBE_URI with: https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/1

# Delete version 2
# Replace CUBE_URI with: https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/2

# ... and so on for versions 3, 4, 5
```

### Step 4: Verify Deletion

Run the "List All Cube Versions" query (Query #1) to confirm only the newest 2 versions remain.

## Notes

- **Version Detection**: Queries assume cube URIs follow the pattern `baseCubeUri/versionNumber`
- **Graph Isolation**: All queries operate within a specific named graph
- **Large Datasets**: For cubes with many observations, deletion may need to be chunked
- **Timeout**: Complex queries may timeout on large datasets - use LIMIT/OFFSET for pagination

## Using with Fuseki

```bash
# SELECT query
curl -X POST "http://localhost:3030/lindas/query" \
  -H "Content-Type: application/sparql-query" \
  -H "Accept: application/sparql-results+json" \
  --data-binary @query.rq

# UPDATE query
curl -X POST "http://localhost:3030/lindas/update" \
  -H "Content-Type: application/sparql-update" \
  --data-binary @update.rq
```

## Using with LINDAS (Read-only)

```bash
curl -X POST "https://lindas.admin.ch/query" \
  -H "Content-Type: application/sparql-query" \
  -H "Accept: application/sparql-results+json" \
  --data-binary @query.rq
```
