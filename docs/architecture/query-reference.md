# Query Reference

This document describes each query in the `queries/` folder.

## Discovery Queries

### 01-list-all-cube-versions.rq

**Purpose**: Lists all cubes in the SFOE graph with their version information.

**Output columns**:
- `baseCube`: The base URI without version number
- `cube`: Full cube URI
- `version`: Extracted version number
- `dateCreated`: Creation date (if available)
- `dateModified`: Modification date (if available)
- `title`: Cube title

**Usage**: Run first to understand what cubes exist and their version structure.

---

### 02-count-versions-per-cube.rq

**Purpose**: Counts how many versions exist per base cube URI and identifies cleanup candidates.

**Output columns**:
- `baseCube`: The base cube URI
- `versionCount`: Number of versions
- `versions`: Comma-separated list of version numbers

**Filter**: Only shows cubes with more than 2 versions (cleanup candidates).

**Usage**: Use this to identify which cubes need version cleanup.

---

### 03-identify-versions-to-delete.rq

**Purpose**: Shows exactly which cube versions will be deleted (rank > 2).

**Output columns**:
- `cube`: Full cube URI to delete
- `baseCube`: Base cube URI
- `version`: Version number
- `rank`: Ranking (3+ means it will be deleted)

**Ranking logic**:
- Rank 1 = newest version (KEPT)
- Rank 2 = second newest (KEPT)
- Rank 3+ = older versions (DELETED)

**Usage**: Critical verification query before deletion.

---

## Preview Queries

### 04-preview-triples-to-delete.rq

**Purpose**: Counts triples that would be deleted per cube version.

**Output columns**:
- `cubeToDelete`: Cube URI
- `rank`: Version rank
- `metaTriples`: Count of metadata triples
- `shapeTriples`: Count of shape triples
- `observationTriples`: Count of observation triples

**Usage**: Understand the scale of deletion per cube.

---

### 05-preview-single-cube-triples.rq

**Purpose**: Shows all triples for a specific cube (parameterized).

**Parameters**: Replace `CUBE_URI_HERE` with actual cube URI.

**Output columns**:
- `subject`, `predicate`, `object`: The triple components
- `category`: Type of triple (metadata-direct, metadata-blank, shape, property-shape, observation, observation-set)

**Usage**: Deep inspection of a specific cube before deletion.

---

## Delete Queries

### 06-delete-single-cube.rq

**Purpose**: Deletes a single cube and all its data in one operation.

**Parameters**: Replace `CUBE_URI_HERE` with actual cube URI.

**Warning**: May timeout for large cubes. Use chunked approach instead.

---

### 07-delete-observations-chunked.rq

**Purpose**: Deletes observations in chunks (most triples are here).

**Parameters**:
- Replace `CUBE_URI_HERE` with actual cube URI
- Adjust `LIMIT` value for chunk size

**Usage**: Run repeatedly until no more observations remain.

---

### 08-delete-observation-links.rq

**Purpose**: Deletes the `cube:observation` links from observation sets.

**Parameters**: Replace `CUBE_URI_HERE` with actual cube URI.

**Usage**: Run after all observations are deleted.

---

### 09-delete-cube-metadata.rq

**Purpose**: Deletes cube metadata, shapes, and structure.

**Parameters**: Replace `CUBE_URI_HERE` with actual cube URI.

**Usage**: Final step - run after observations and links are deleted.

---

## Query Execution Order for Single Cube

1. Run `05-preview-single-cube-triples.rq` to verify
2. Run `07-delete-observations-chunked.rq` repeatedly until done
3. Run `08-delete-observation-links.rq` once
4. Run `09-delete-cube-metadata.rq` once

## Query Execution Order for Batch Deletion

1. Run `02-count-versions-per-cube.rq` for overview
2. Run `03-identify-versions-to-delete.rq` to get list
3. Run `04-preview-triples-to-delete.rq` for impact assessment
4. For each cube to delete:
   - Run `07-delete-observations-chunked.rq` repeatedly
   - Run `08-delete-observation-links.rq`
   - Run `09-delete-cube-metadata.rq`

Or use the automated `delete-old-versions.ps1` script.

---

## Orphan Shape Queries

These queries handle cleanup of SHACL shapes that are left behind after cube
version deletion. When a cube version is deleted, its observation constraint
shape (and all nested property shapes) may remain in the graph if no other
cube references them. These "orphan shapes" waste storage and create noise
in the data.

### 11-find-orphan-shapes.rq

**Purpose**: Finds all SHACL NodeShapes in the graph that are NOT referenced
by any remaining cube via `cube:observationConstraint`.

**Output columns**:
- `shape`: The orphan shape URI
- `shapeType`: The RDF type(s) of the shape
- `propertyShapeCount`: Number of property shapes nested under this shape
- `estimatedTriples`: Approximate count of all triples that belong to this shape tree

**Usage**: Run this first to discover orphan shapes and assess their count and size.

---

### 12-preview-orphan-shape-triples.rq

**Purpose**: CONSTRUCT query that returns all triples belonging to orphan shapes.
This produces the exact set of triples that query 13 would delete.

**Output**: An RDF graph containing all orphan shape triples (shape direct triples,
incoming references, property shapes, RDF list nodes).

**Usage**: Run before query 13 to verify exactly what will be deleted.
The output can be saved as a backup file.

---

### 13-delete-orphan-shapes.rq

**Purpose**: Deletes all orphan shapes and their complete nested structure.

**Deletes**:
- Shape node triples (rdf:type, sh:closed, sh:property links, etc.)
- All property shapes linked via `sh:property`
- All RDF list nodes inside property shapes (`sh:in` value lists)
- Any incoming references to the orphan shape

**Warning**: This is a destructive operation. Always run queries 11 and 12 first.

**Usage**: Run after cube version deletion to clean up leftover shapes.

---

### 14-count-orphan-shapes.rq

**Purpose**: Quick summary count of orphan shapes and their total triples.

**Output columns**:
- `orphanShapeCount`: Total number of orphan shapes found
- `totalOrphanTriples`: Total triples across all orphan shapes

**Usage**: Quick impact assessment before running the full cleanup.

---

### 15-preview-single-orphan-shape.rq

**Purpose**: Shows all triples for a specific orphan shape (parameterized).

**Parameters**: Replace `SHAPE_URI_HERE` with actual shape URI.

**Output columns**:
- `subject`, `predicate`, `object`: The triple components
- `category`: Type of triple (shape-direct, shape-incoming, property-shape, rdf-list-node)

**Usage**: Deep inspection of a specific orphan shape before deletion.

---

## Query Execution Order: Full Cleanup (Cube Versions + Orphan Shapes)

1. Run `02-count-versions-per-cube.rq` for overview
2. Run `03-identify-versions-to-delete.rq` to get list of cube versions to delete
3. Run `04-preview-triples-to-delete.rq` for impact assessment
4. For each cube to delete:
   - Run `07-delete-observations-chunked.rq` repeatedly
   - Run `08-delete-observation-links.rq`
   - Run `09-delete-cube-metadata.rq`
5. Run `14-count-orphan-shapes.rq` to check for orphan shapes
6. Run `11-find-orphan-shapes.rq` for detailed orphan shape list
7. Run `12-preview-orphan-shape-triples.rq` to preview cleanup scope
8. Run `13-delete-orphan-shapes.rq` to clean up orphan shapes
9. Run `14-count-orphan-shapes.rq` again to verify cleanup (should return 0)

## Wizard Integration

As of 2026-02-15, the orphan shape queries (11-15) are fully integrated into the
Deletion Wizard (Step 4). The wizard automates the full cleanup workflow:

1. **Detection**: After cube version deletion completes, the wizard automatically runs
   orphan detection (combining the general summary query with query 14 for shape-specific
   counts).

2. **Preview**: Users can click "Preview Orphan Triples" to run the CONSTRUCT query (12)
   and see a sample of the triples that would be deleted.

3. **Cleanup**: Clicking "Clean Up Orphans" runs the comprehensive delete queries for
   both orphan observation sets and orphan shapes (query 13 pattern).

4. **Verification**: After cleanup, the wizard automatically runs query 14 again to
   verify that remaining orphan shape count is 0.

The wizard flow is: delete old versions -> detect orphan shapes -> preview (optional)
-> delete orphan shapes -> verify.

All orphan shape queries are also available as templates in the Query Editor for
manual execution.
