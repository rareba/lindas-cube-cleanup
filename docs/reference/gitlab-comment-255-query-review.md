# GitLab Comment for Issue #255 - Query Review Response

**Ready to post as a reply to Sven's Jan 29 comment.**

---

## Review of Delete Queries and Sven's Fix

I reviewed all the delete queries (the ones I posted on Jan 27, Sven's working query, and the cleanup service code).

### Root Cause: Why the Queries Failed

The queries I posted use this pattern:

```sparql
{
  ?s ?p ?o .
  FILTER(?s = ?targetCube)
}
```

This is semantically correct SPARQL, and CONSTRUCT correctly finds the triples. However, **Stardog's DELETE execution engine does not properly materialize deletions with this pattern**. The `FILTER` approach requires the engine to scan all `?s ?p ?o` triples in the graph and filter afterward. In a DELETE context, Stardog appears to optimize this in a way that silently fails to remove matching triples.

Sven's query uses:

```sparql
{ ?targetcube ?p ?o  BIND(?targetcube AS ?s) }
```

This uses the bound URI directly as the subject in the triple pattern, which hits Stardog's index directly and works correctly in DELETE operations.

### Review of Sven's Query

Sven's approach is correct and the BIND pattern is the right fix. For his test dataset (kleeblatter) the query works completely. For production cubes with SHACL constraints, additional blocks are needed:

**What Sven's query handles correctly:**
- Cube triples (both directions) - outgoing and incoming
- ObservationSet triples (both directions)
- Observation triples (both directions)

**What it misses (would leave orphaned data on production cubes):**
- SHACL NodeShape (`cube:observationConstraint ?shape`) - constraint shape triples
- SHACL PropertyShape (`?shape sh:property ?prop`) - property shape triples
- RDF Lists (`sh:in` lists with `rdf:first`/`rdf:rest` chains)
- Blank node metadata (e.g., `<cube> schema:creator _:b1 . _:b1 schema:name "..."`)

### Corrected Query 9: Delete Single Cube Version

This combines Sven's working BIND approach with full SHACL and blank node coverage:

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
      # Cube outgoing triples (metadata, type, links)
      ?targetCube ?p ?o .
      BIND(?targetCube AS ?s)
    }
    UNION
    {
      # Cube incoming triples (anything pointing TO this cube)
      ?s ?p ?targetCube .
      BIND(?targetCube AS ?o)
    }
    UNION
    {
      # Blank node properties attached to the cube
      ?targetCube ?p1 ?bn .
      FILTER(isBlank(?bn))
      ?bn ?p ?o .
      BIND(?bn AS ?s)
    }
    UNION
    {
      # SHACL NodeShape (observationConstraint) - outgoing
      ?targetCube cube:observationConstraint ?shape .
      ?shape ?p ?o .
      BIND(?shape AS ?s)
    }
    UNION
    {
      # SHACL NodeShape - incoming
      ?targetCube cube:observationConstraint ?shape .
      ?s ?p ?shape .
      BIND(?shape AS ?o)
    }
    UNION
    {
      # SHACL PropertyShape
      ?targetCube cube:observationConstraint ?shape .
      ?shape sh:property ?propShape .
      ?propShape ?p ?o .
      BIND(?propShape AS ?s)
    }
    UNION
    {
      # RDF List nodes in PropertyShapes (sh:in lists)
      ?targetCube cube:observationConstraint ?shape .
      ?shape sh:property ?propShape .
      ?propShape sh:in ?list .
      ?list rdf:rest*/rdf:first ?item .
      ?list ?p ?o .
      BIND(?list AS ?s)
    }
    UNION
    {
      # ObservationSet - outgoing
      ?targetCube cube:observationSet ?obsSet .
      ?obsSet ?p ?o .
      BIND(?obsSet AS ?s)
    }
    UNION
    {
      # ObservationSet - incoming
      ?targetCube cube:observationSet ?obsSet .
      ?s ?p ?obsSet .
      BIND(?obsSet AS ?o)
    }
    UNION
    {
      # Observations - outgoing
      ?targetCube cube:observationSet ?obsSet .
      ?obsSet cube:observation ?obs .
      ?obs ?p ?o .
      BIND(?obs AS ?s)
    }
    UNION
    {
      # Observations - incoming
      ?targetCube cube:observationSet ?obsSet .
      ?obsSet cube:observation ?obs .
      ?s ?p ?obs .
      BIND(?obs AS ?o)
    }
  }
}
```

### Corrected Query 10: Delete All Old Versions (Keep Newest 2)

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

    {
      ?cube ?p ?o .
      BIND(?cube AS ?s)
    }
    UNION
    {
      ?s ?p ?cube .
      BIND(?cube AS ?o)
    }
    UNION
    {
      ?cube ?p1 ?bn .
      FILTER(isBlank(?bn))
      ?bn ?p ?o .
      BIND(?bn AS ?s)
    }
    UNION
    {
      ?cube cube:observationConstraint ?shape .
      ?shape ?p ?o .
      BIND(?shape AS ?s)
    }
    UNION
    {
      ?cube cube:observationConstraint ?shape .
      ?s ?p ?shape .
      BIND(?shape AS ?o)
    }
    UNION
    {
      ?cube cube:observationConstraint ?shape .
      ?shape sh:property ?propShape .
      ?propShape ?p ?o .
      BIND(?propShape AS ?s)
    }
    UNION
    {
      ?cube cube:observationSet ?obsSet .
      ?obsSet ?p ?o .
      BIND(?obsSet AS ?s)
    }
    UNION
    {
      ?cube cube:observationSet ?obsSet .
      ?s ?p ?obsSet .
      BIND(?obsSet AS ?o)
    }
    UNION
    {
      ?cube cube:observationSet ?obsSet .
      ?obsSet cube:observation ?obs .
      ?obs ?p ?o .
      BIND(?obs AS ?s)
    }
    UNION
    {
      ?cube cube:observationSet ?obsSet .
      ?obsSet cube:observation ?obs .
      ?s ?p ?obs .
      BIND(?obs AS ?o)
    }
  }
}
```

### Verification Query

Run this after deletion to confirm nothing remains:

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

Expected: empty result (no rows).

@sven.schneider please test the corrected Query 9 above. The key differences from your query:
1. Added SHACL NodeShape blocks (outgoing + incoming)
2. Added SHACL PropertyShape block
3. Added RDF List traversal for `sh:in` lists
4. Added blank node metadata traversal

For your test dataset these may not matter (kleeblatter may not have complex shapes), but production cubes often do.
