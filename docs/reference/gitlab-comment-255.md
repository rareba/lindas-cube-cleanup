Good catch Sven. The metadata not being deleted is indeed unintended. The delete queries are missing the `cube:observationConstraint` branch -- cubes have a shape (via `cube:observationConstraint`) with `sh:property` nodes that describe the dimensions, and those triples are not covered by the current UNION branches.

Here are the fixed queries with 3 new UNION branches:
- `cube:observationConstraint` -- the shape describing the cube's structure
- `sh:property` -- the dimension/measure property nodes within that shape
- Inbound references -- any triples pointing to the cube as object

### 9. Delete Single Cube Version (Stardog Syntax) - Fixed

```sparql
PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>

DELETE {
  GRAPH <GRAPH_URI> {
    ?s ?p ?o .
  }
}
WHERE {
  GRAPH <GRAPH_URI> {
    VALUES ?targetCube { <CUBE_URI> }

    {
      ?s ?p ?o .
      FILTER(?s = ?targetCube)
    }
    UNION
    {
      ?targetCube cube:observationSet ?set .
      ?s ?p ?o .
      FILTER(?s = ?set)
    }
    UNION
    {
      ?targetCube cube:observationSet ?set .
      ?set cube:observation ?obs .
      ?s ?p ?o .
      FILTER(?s = ?obs)
    }
    UNION
    {
      ?targetCube cube:observationConstraint ?constraint .
      ?s ?p ?o .
      FILTER(?s = ?constraint)
    }
    UNION
    {
      ?targetCube cube:observationConstraint ?constraint .
      ?constraint sh:property ?prop .
      ?s ?p ?o .
      FILTER(?s = ?prop)
    }
    UNION
    {
      ?s ?p ?o .
      FILTER(?o = ?targetCube)
    }
  }
}
```

### 10. Delete All Old Versions (Keep Newest 2) (Stardog Syntax) - Fixed

```sparql
PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

DELETE {
  GRAPH <GRAPH_URI> {
    ?s ?p ?o .
  }
}
WHERE {
  GRAPH <GRAPH_URI> {
    {
      SELECT ?cube ?version (COUNT(?higherVersion) + 1 AS ?rank)
      WHERE {
        ?cube a cube:Cube .
        BIND(REPLACE(STR(?cube), "^(.*/[^/]+)/[0-9]+/?$", "$1") AS ?baseCube)
        BIND(xsd:integer(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1")) AS ?version)

        OPTIONAL {
          ?otherCube a cube:Cube .
          BIND(REPLACE(STR(?otherCube), "^(.*/[^/]+)/[0-9]+/?$", "$1") AS ?otherBase)
          BIND(xsd:integer(REPLACE(STR(?otherCube), "^.*/([0-9]+)/?$", "$1")) AS ?higherVersion)
          FILTER(?otherBase = ?baseCube && ?higherVersion > ?version)
        }
      }
      GROUP BY ?cube ?version
      HAVING (COUNT(?higherVersion) + 1 > 2)
    }

    {
      ?s ?p ?o .
      FILTER(?s = ?cube)
    }
    UNION
    {
      ?cube cube:observationSet ?set .
      ?s ?p ?o .
      FILTER(?s = ?set)
    }
    UNION
    {
      ?cube cube:observationSet ?set .
      ?set cube:observation ?obs .
      ?s ?p ?o .
      FILTER(?s = ?obs)
    }
    UNION
    {
      ?cube cube:observationConstraint ?constraint .
      ?s ?p ?o .
      FILTER(?s = ?constraint)
    }
    UNION
    {
      ?cube cube:observationConstraint ?constraint .
      ?constraint sh:property ?prop .
      ?s ?p ?o .
      FILTER(?s = ?prop)
    }
    UNION
    {
      ?s ?p ?o .
      FILTER(?o = ?cube)
    }
  }
}
```

Can you test these on the same dataset and confirm the metadata is fully cleaned up?
