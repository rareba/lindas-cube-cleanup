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
