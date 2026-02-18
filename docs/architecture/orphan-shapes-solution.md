# Orphan Shapes Cleanup Solution

## Problem Statement

When cube versions are deleted from the LINDAS triplestore using queries 06-09,
the cube's metadata, observations, and observation sets are removed. However,
the SHACL constraint shapes referenced by those cubes via `cube:observationConstraint`
may be left behind as unreferenced data -- "orphan shapes."

These orphan shapes:
- Waste storage space in the triplestore
- Create noise when querying for shapes or NodeShapes
- Accumulate over time as more cube versions are cleaned up
- Can cause confusion when analyzing the graph structure

## Data Model: How Shapes Relate to Cubes

A cube references its constraint shape through the `cube:observationConstraint` predicate:

```
cube:Cube --[cube:observationConstraint]--> sh:NodeShape
```

Each NodeShape contains nested property shapes that define the cube's dimensions and measures:

```
sh:NodeShape --[sh:property]--> PropertyShape1
             --[sh:property]--> PropertyShape2
             --[sh:property]--> PropertyShapeN
```

Each property shape has constraint properties:

```
PropertyShape --[sh:path]--> dimension/measure IRI
              --[sh:datatype]--> xsd:decimal (or other type)
              --[sh:minCount]--> 1
              --[sh:maxCount]--> 1
              --[sh:nodeKind]--> sh:IRI
              --[sh:in]--> (rdf:List of allowed values)
```

The `sh:in` predicate links to an RDF list, which is a chain of blank nodes:

```
sh:in --> _:list1 --[rdf:first]--> value1
                  --[rdf:rest]---> _:list2 --[rdf:first]--> value2
                                           --[rdf:rest]---> rdf:nil
```

### Key Predicates

| Predicate | Description |
|-----------|-------------|
| `cube:observationConstraint` | Links a cube to its constraint shape |
| `sh:property` | Links a NodeShape to its property shapes |
| `sh:path` | The dimension/measure this property shape describes |
| `sh:datatype` | Expected datatype of values |
| `sh:minCount` / `sh:maxCount` | Cardinality constraints |
| `sh:in` | List of allowed values (uses RDF list) |
| `sh:nodeKind` | Expected node kind (IRI, literal, blank node) |
| `rdf:type sh:NodeShape` | Type declaration for shapes |

## What Makes a Shape an Orphan

A shape is considered an orphan when:

1. It is typed as `sh:NodeShape` in the graph
2. There is NO triple pattern `?anyCube cube:observationConstraint ?shape` where
   `?anyCube` is also typed as `cube:Cube`

In SPARQL:
```sparql
?shape a sh:NodeShape .
FILTER NOT EXISTS {
    ?anyCube cube:observationConstraint ?shape .
    ?anyCube a cube:Cube .
}
```

This is the core pattern used in all five orphan shape queries (11-15).

### Important Safety Check

The `FILTER NOT EXISTS` clause checks for the combination of both conditions:
- The shape must be the object of a `cube:observationConstraint` predicate
- AND the subject of that predicate must be a `cube:Cube`

This ensures that if only the cube was deleted but the `observationConstraint`
triple somehow remains (pointing to nothing), the shape is still correctly
identified as an orphan.

## Solution Design

### Approach

The solution follows the same safety-first approach used for cube version deletion:

1. **Discovery** (Query 11): Find orphan shapes with counts
2. **Summary** (Query 14): Quick count of orphans and total triples
3. **Preview** (Query 12): CONSTRUCT the exact triples that will be deleted
4. **Inspection** (Query 15): Examine a specific orphan shape in detail
5. **Deletion** (Query 13): Delete all orphan shapes and nested structures

### What Gets Deleted

Query 13 deletes four categories of triples for each orphan shape:

1. **Shape outgoing triples**: All triples where the orphan shape is the subject
   - `?orphanShape rdf:type sh:NodeShape`
   - `?orphanShape sh:closed true`
   - `?orphanShape sh:property ?propShape`
   - etc.

2. **Shape incoming triples**: All triples where the orphan shape is the object
   - This catches any remaining references pointing TO the shape
   - By definition, no `cube:observationConstraint` triple exists (that is what
     makes it an orphan), but other references might exist

3. **Property shape triples**: All triples for property shapes linked via `sh:property`
   - `?propShape sh:path ?dimension`
   - `?propShape sh:datatype xsd:decimal`
   - `?propShape sh:minCount 1`
   - etc.

4. **RDF list nodes**: All nodes in `sh:in` value lists
   - `?listNode rdf:first ?value`
   - `?listNode rdf:rest ?nextNode`

### Why Not Use Property Paths for Deep Traversal?

The existing query 05 uses `(<>|!<>)*` for deep traversal of property shapes.
The orphan shape queries use explicit UNION blocks instead because:

1. **Performance**: Property paths with wildcards can be very expensive on large graphs
2. **Predictability**: Explicit patterns make it clear exactly what will be matched
3. **Compatibility**: Some triplestores (e.g., Stardog) have limitations with
   complex property paths in DELETE queries
4. **Safety**: Bounded traversal prevents accidentally matching unrelated triples

The known SHACL structure has a fixed depth:
- Shape -> property shape (1 level via `sh:property`)
- Property shape -> RDF list (1 level via `sh:in`, then `rdf:rest*` for list traversal)

This bounded structure means explicit UNION blocks are sufficient and safer.

## Execution Steps

### Step 1: Quick Assessment

Run query 14 to get a summary count:

```
# Using SFOE graph:
queries/14-count-orphan-shapes.rq

# Expected output:
# orphanShapeCount | totalOrphanTriples
# 15               | 342
```

If the count is 0, there are no orphan shapes and no cleanup is needed.

### Step 2: Detailed Discovery

Run query 11 to see each orphan shape:

```
queries/11-find-orphan-shapes.rq

# Expected output:
# shape | shapeType | propertyShapeCount | estimatedTriples
# https://energy.ld.admin.ch/sfoe/.../shape/1 | sh:NodeShape | 8 | 45
# ...
```

### Step 3: Preview (Optional but Recommended)

For each shape you want to inspect, run query 15:

```
# Replace SHAPE_URI_HERE in queries/15-preview-single-orphan-shape.rq
# with a specific shape URI from step 2
```

Or run query 12 to get the full CONSTRUCT output of all triples that would be deleted.
Save this output as a backup:

```
queries/12-preview-orphan-shape-triples.rq
# Save output to data/orphan-shapes-backup.nt
```

### Step 4: Delete

Run query 13 to delete all orphan shapes:

```
queries/13-delete-orphan-shapes.rq
```

### Step 5: Verify

Run query 14 again to confirm cleanup:

```
queries/14-count-orphan-shapes.rq

# Expected output:
# orphanShapeCount | totalOrphanTriples
# 0                | 0
```

## Performance Considerations

- Orphan shapes are typically much smaller than observations (tens of triples
  per shape vs. thousands per cube version), so the delete query should execute
  quickly without chunking.
- If a graph has hundreds of orphan shapes, the `FILTER NOT EXISTS` pattern
  requires the triplestore to check each shape against all cubes. This is
  generally fast because the number of shapes is small compared to observations.
- The `rdf:rest*` property path for RDF lists is bounded by list length (typically
  under 100 items per list), so performance is predictable.

## Relationship to Existing Queries

| Existing Query | Purpose | Orphan Shape Relevance |
|---------------|---------|----------------------|
| 06 - delete-single-cube | Deletes a cube and its shape | The shape is deleted along with the cube, but only because it traverses `cube:observationConstraint`. If two cubes share a shape, the shape triples may be matched but the shape itself is not orphaned. |
| 09 - delete-cube-metadata | Deletes metadata and shapes | Same as above - deletes the shape if it is referenced by the target cube. |
| 11-15 - orphan shape queries | Finds and deletes unreferenced shapes | Handles the case where the cube was deleted but the shape was NOT deleted (or was shared and the last referencing cube was deleted). |

The orphan shape queries (11-15) are designed to be run AFTER the cube deletion
queries (06-09) as a cleanup step. They are safe to run independently and will
only affect shapes that have no remaining cube references.
