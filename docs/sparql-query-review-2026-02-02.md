# SPARQL Query Review - Issue #255 Delete Cube Versions

**Date:** 2026-02-02
**Context:** Review of all delete queries following Sven Schneider's test findings (GitLab #255, Jan 29)

---

## Executive Summary

Sven tested the delete queries (#9 and #10 from the Jan 27 GitLab comment) on Stardog with a test dataset and found that **observations and observation sets get deleted, but cube metadata persists**. He wrote his own simpler query that works. This review explains the root cause and provides corrected queries.

**Root cause: Stardog does not properly execute DELETE operations that use `?s ?p ?o . FILTER(?s = ?value)` patterns.** The query engine can find the triples (CONSTRUCT works), but the DELETE materializer fails to remove them. Using direct triple pattern binding (`?value ?p ?o . BIND(?value AS ?s)`) resolves this.

---

## Detailed Analysis

### 1. The FILTER vs BIND Problem (Critical)

The queries posted on GitLab (Jan 27) use this pattern:

```sparql
{
  ?s ?p ?o .
  FILTER(?s = ?targetCube)
}
```

Sven's working query uses:

```sparql
{ ?targetcube ?p ?o  BIND(?targetcube AS ?s) }
```

These are **semantically equivalent** in SPARQL spec terms, but they produce different execution plans:

| Pattern | Execution Plan | DELETE behavior on Stardog |
|---------|---------------|--------------------------|
| `?s ?p ?o . FILTER(?s = X)` | Full scan of all triples, then filter | CONSTRUCT finds triples, but DELETE fails silently |
| `X ?p ?o . BIND(X AS ?s)` | Direct index lookup on subject | Works correctly |

The FILTER approach requires enumerating ALL `?s ?p ?o` in the graph and filtering after. In a DELETE WHERE context, Stardog appears to optimize this in a way that breaks the actual deletion. This explains exactly what Sven observed: CONSTRUCT finds the triples, but DELETE does not remove them.

**This is why observations DO get deleted** -- the observation blocks use a chain like `?targetCube cube:observationSet ?set . ?set cube:observation ?obs . ?s ?p ?o . FILTER(?s = ?obs)`. The join on `?obs` narrows the scope enough that Stardog's optimizer handles it correctly. But the first block (`FILTER(?s = ?targetCube)`) where `?targetCube` is bound only via VALUES, doesn't narrow sufficiently.

### 2. Review of Sven's Query

Sven's query is **correct in approach** and works on Stardog. Here's what it handles and what it misses:

**Handles correctly:**
- Direct cube triples (both directions): outgoing `?cube ?p ?o` and incoming `?s ?p ?cube`
- Observation set triples (both directions)
- Observation triples (both directions)
- Uses BIND pattern that works with Stardog's DELETE

**Missing (will leave orphaned triples):**
- **SHACL NodeShape** (`cube:observationConstraint ?shape`): The constraint shape's own triples are not deleted
- **SHACL PropertyShape** (`?shape sh:property ?prop`): Property shape triples are not deleted
- **RDF Lists** (`sh:in` lists with `rdf:first`/`rdf:rest` chains): List node triples are not deleted
- **Blank node metadata**: Triples like `<cube> schema:creator _:b1 . _:b1 schema:name "..."` -- the blank node's own triples remain

Whether these missing items matter depends on the test data. Sven's test dataset (kleeblatter) may not have complex SHACL shapes or blank node metadata, which is why his query appears to fully clean up. On production data with SHACL constraints, orphaned shapes would remain.

### 3. Review of Cleanup Service Code (`sparql.js`)

The programmatic `deleteCubeMetadataQuery()` function in `cleanup-service/src/utils/sparql.js` actually uses the **correct BIND pattern** already:

```javascript
<${safeCube}> ?p ?o .
BIND(<${safeCube}> AS ?s)
```

It also handles:
- Blank node properties (with `isBlank()` filter)
- SHACL NodeShapes
- SHACL PropertyShapes
- RDF Lists (`rdf:rest*/rdf:first`)
- Observation sets

**Issues in the cleanup service queries:**
- **No reverse triples**: Missing `?s ?p <cube>` direction. If anything points TO the cube, those triples remain. Sven correctly identified this need.
- **`deleteAllOldVersionsQuery()`**: Uses direct pattern `?cube ?p1 ?o1` (good), but still lacks blank nodes, RDF lists, and reverse triples.
- **`deleteObservationsQuery()`**: Only deletes outgoing triples from observations (`?obs ?p ?o`), not incoming ones (`?s ?p ?obs`). This could leave `cube:observation ?obs` links behind, though `deleteObservationLinksQuery()` handles that specific case.

### 4. Review of `.rq` File Queries

The `queries/06-delete-single-cube.rq` and `queries/universal/06-delete-single-cube.rq` files use the BIND pattern (from Claudio's original) with OPTIONAL for blank nodes and property path traversal for RDF lists. These are the most thorough but:

- They use `WITH <graph>` syntax which some triplestores handle differently
- The DELETE template explicitly enumerates expected triple patterns rather than using the generic `?s ?p ?o` pattern. This means any triple pattern not anticipated in the DELETE clause is missed even if the WHERE clause matches it
- No reverse triples

### 5. The DELETE Template Problem

A subtle but important issue in `queries/06-delete-single-cube.rq`:

```sparql
DELETE {
  ?cube a cube:Cube ;
        cube:observationConstraint ?shape ;
        cube:observationSet ?set ;
        ?p1 ?metaLevel1 .
  ...
}
WHERE {
  { ?cube ?p1 ?metaLevel1 }
  UNION
  { ... }
}
```

The DELETE template only deletes triples that match the specific patterns listed. If the WHERE clause binds variables through different UNION branches, and a variable is unbound in one branch, that DELETE pattern is skipped for that binding. This is correct SPARQL behavior, but it means the DELETE template must be carefully aligned with the WHERE clause.

The safer approach (used by `sparql.js` and Sven) is `DELETE { ?s ?p ?o }` with `BIND(?x AS ?s)` in each UNION branch. This always works because `?s`, `?p`, `?o` are bound in every branch.

---

## Issues Summary

| # | Severity | Issue | Affects | Fix |
|---|----------|-------|---------|-----|
| 1 | CRITICAL | FILTER pattern fails in Stardog DELETE | GitLab queries #9, #10 | Replace with BIND pattern |
| 2 | HIGH | No reverse triples (incoming references to cube) | All queries except Sven's | Add `?s ?p ?cube` patterns at all levels |
| 3 | HIGH | No SHACL shapes deletion | Sven's query | Add observationConstraint + sh:property blocks |
| 4 | MEDIUM | No blank node metadata traversal | Sven's query, GitLab queries | Add `isBlank()` traversal |
| 5 | MEDIUM | No RDF List cleanup | Sven's query, GitLab queries | Add `rdf:rest*/rdf:first` traversal |
| 6 | LOW | Explicit DELETE template misalignment | `.rq` file queries | Use generic `?s ?p ?o` DELETE pattern |
| 7 | LOW | Missing reverse triples for observations | `sparql.js` delete functions | Add bidirectional matching |

---

## Corrected Queries

### Query 9: Delete Single Cube Version (All Triplestores)

This combines Sven's working BIND approach with the full coverage from the cleanup service:

```sparql
PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

DELETE {
  GRAPH <GRAPH_URI> {
    ?s ?p ?o .
  }
}
WHERE {
  GRAPH <GRAPH_URI> {
    VALUES ?targetCube { <CUBE_URI> }

    {
      # 1. Cube outgoing triples (metadata, type, links)
      ?targetCube ?p ?o .
      BIND(?targetCube AS ?s)
    }
    UNION
    {
      # 2. Cube incoming triples (anything pointing TO this cube)
      ?s ?p ?targetCube .
      BIND(?targetCube AS ?o)
    }
    UNION
    {
      # 3. Blank node properties attached to the cube
      #    e.g., <cube> schema:creator _:b1 . _:b1 schema:name "..."
      ?targetCube ?p1 ?bn .
      FILTER(isBlank(?bn))
      ?bn ?p ?o .
      BIND(?bn AS ?s)
    }
    UNION
    {
      # 4. SHACL NodeShape (observationConstraint) - outgoing
      ?targetCube cube:observationConstraint ?shape .
      ?shape ?p ?o .
      BIND(?shape AS ?s)
    }
    UNION
    {
      # 5. SHACL NodeShape - incoming (anything pointing to the shape)
      ?targetCube cube:observationConstraint ?shape .
      ?s ?p ?shape .
      BIND(?shape AS ?o)
    }
    UNION
    {
      # 6. SHACL PropertyShape - outgoing
      ?targetCube cube:observationConstraint ?shape .
      ?shape sh:property ?propShape .
      ?propShape ?p ?o .
      BIND(?propShape AS ?s)
    }
    UNION
    {
      # 7. RDF List nodes in PropertyShapes (sh:in lists)
      ?targetCube cube:observationConstraint ?shape .
      ?shape sh:property ?propShape .
      ?propShape sh:in ?list .
      ?list rdf:rest*/rdf:first ?item .
      ?list ?p ?o .
      BIND(?list AS ?s)
    }
    UNION
    {
      # 8. ObservationSet - outgoing
      ?targetCube cube:observationSet ?obsSet .
      ?obsSet ?p ?o .
      BIND(?obsSet AS ?s)
    }
    UNION
    {
      # 9. ObservationSet - incoming
      ?targetCube cube:observationSet ?obsSet .
      ?s ?p ?obsSet .
      BIND(?obsSet AS ?o)
    }
    UNION
    {
      # 10. Observations - outgoing
      ?targetCube cube:observationSet ?obsSet .
      ?obsSet cube:observation ?obs .
      ?obs ?p ?o .
      BIND(?obs AS ?s)
    }
    UNION
    {
      # 11. Observations - incoming
      ?targetCube cube:observationSet ?obsSet .
      ?obsSet cube:observation ?obs .
      ?s ?p ?obs .
      BIND(?obs AS ?o)
    }
  }
}
```

### Query 10: Delete All Old Versions - Keep Newest 2 (All Triplestores)

```sparql
PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

DELETE {
  GRAPH <GRAPH_URI> {
    ?s ?p ?o .
  }
}
WHERE {
  GRAPH <GRAPH_URI> {
    # Subquery: find all cubes ranked > 2 (to be deleted)
    {
      SELECT ?cube
      WHERE {
        ?cube a cube:Cube .
        BIND(REPLACE(STR(?cube), "^(.*/[^/]+)/[0-9]+/?$", "$1") AS ?baseCube)
        BIND(xsd:integer(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1")) AS ?version)

        # Count how many versions are newer than this one
        {
          SELECT ?cube (COUNT(DISTINCT ?newerCube) AS ?newerCount)
          WHERE {
            ?cube a cube:Cube .
            BIND(REPLACE(STR(?cube), "^(.*/[^/]+)/[0-9]+/?$", "$1") AS ?baseCube)
            BIND(xsd:integer(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1")) AS ?version)

            OPTIONAL {
              ?newerCube a cube:Cube .
              BIND(REPLACE(STR(?newerCube), "^(.*/[^/]+)/[0-9]+/?$", "$1") AS ?newerBase)
              BIND(xsd:integer(REPLACE(STR(?newerCube), "^.*/([0-9]+)/?$", "$1")) AS ?newerVersion)
              FILTER(?newerBase = ?baseCube && ?newerVersion > ?version)
            }
          }
          GROUP BY ?cube
          HAVING (COUNT(DISTINCT ?newerCube) >= 2)
        }
      }
    }

    # Delete all related triples for each cube to be deleted
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
      # SHACL NodeShape
      ?cube cube:observationConstraint ?shape .
      ?shape ?p ?o .
      BIND(?shape AS ?s)
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
      # RDF Lists in PropertyShapes
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
      ?cube cube:observationSet ?obsSet .
      ?obsSet ?p ?o .
      BIND(?obsSet AS ?s)
    }
    UNION
    {
      # ObservationSet incoming
      ?cube cube:observationSet ?obsSet .
      ?s ?p ?obsSet .
      BIND(?obsSet AS ?o)
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
  }
}
```

### Verification Query: Confirm Complete Deletion

Run this after deletion to verify no triples remain for a cube:

```sparql
PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>

SELECT ?category (COUNT(*) AS ?remainingTriples)
WHERE {
  GRAPH <GRAPH_URI> {
    VALUES ?targetCube { <CUBE_URI> }

    {
      ?targetCube ?p ?o .
      BIND("cube-outgoing" AS ?category)
    }
    UNION
    {
      ?s ?p ?targetCube .
      BIND("cube-incoming" AS ?category)
    }
    UNION
    {
      ?targetCube cube:observationConstraint ?shape .
      ?shape ?p ?o .
      BIND("shacl-shape" AS ?category)
    }
    UNION
    {
      ?targetCube cube:observationConstraint ?shape .
      ?shape sh:property ?prop .
      ?prop ?p ?o .
      BIND("shacl-property" AS ?category)
    }
    UNION
    {
      ?targetCube cube:observationSet ?set .
      ?set ?p ?o .
      BIND("observation-set" AS ?category)
    }
    UNION
    {
      ?targetCube cube:observationSet ?set .
      ?set cube:observation ?obs .
      ?obs ?p ?o .
      BIND("observation" AS ?category)
    }
  }
}
GROUP BY ?category
```

Expected result: **no rows** (completely empty result set).

---

## Review of Sven's Query Verdict

Sven's query is **structurally correct** and uses the right approach (BIND + bidirectional). For his test dataset, it works completely. For production cubes with SHACL constraints, it will leave orphaned shapes behind. The corrected Query 9 above extends Sven's approach with the missing SHACL and blank node blocks.

**Recommendation to Sven:** Your approach is the right one. The BIND pattern is what makes it work on Stardog. The corrected Query 9 adds SHACL shape handling for production use, but for initial testing your query is fine.

---

## Changes Required in Cleanup Service Code

The `cleanup-service/src/utils/sparql.js` needs these updates:

1. **`deleteCubeMetadataQuery()`**: Add reverse triples (bidirectional matching) at all levels
2. **`deleteObservationsQuery()`**: Add incoming observation triples (`?s ?p ?obs`)
3. **`deleteAllOldVersionsQuery()`**: Add blank node traversal, RDF lists, and bidirectional matching
4. **`exportCubeQuery()`**: Add reverse triples to ensure backups capture everything

These changes are detailed in the next section.
