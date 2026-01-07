# LINDAS Cube Version Cleanup Solution

## Problem Statement

LINDAS follows a design paradigm of never deleting triples, which causes issues with Cube-Creator. As cubes are updated over time (sometimes monthly over years), triples accumulate significantly. This project provides a solution to delete all cube versions except the newest 2 for the SFOE (Swiss Federal Office of Energy / BFE) graph.

## Solution Overview

### Approach

The solution uses a **ranked deletion approach**:

1. **Version Identification**: Extract version numbers from cube URIs (pattern: `.../cubename/version`)
2. **Ranking**: Rank versions per base cube URI, where rank 1 = newest, rank 2 = second newest, etc.
3. **Selection**: Select all versions with rank > 2 for deletion
4. **Chunked Deletion**: Delete observations first (in chunks), then metadata and shapes

### Why Chunked Deletion?

Large cubes can have millions of observations. Deleting everything in a single query can:
- Timeout on the SPARQL endpoint
- Consume excessive memory
- Lock the database for extended periods

The chunked approach:
1. Deletes observations in batches of 100,000 triples
2. Then deletes observation links
3. Finally deletes cube metadata, shapes, and structure

## File Structure

```
lindas-delete-cube-versions-except2/
├── docs/
│   ├── solution-overview.md      # This file
│   ├── query-reference.md        # Query documentation
│   └── execution-log.md          # Execution history
├── queries/
│   ├── 01-list-all-cube-versions.rq
│   ├── 02-count-versions-per-cube.rq
│   ├── 03-identify-versions-to-delete.rq
│   ├── 04-preview-triples-to-delete.rq
│   ├── 05-preview-single-cube-triples.rq
│   ├── 06-delete-single-cube.rq
│   ├── 07-delete-observations-chunked.rq
│   ├── 08-delete-observation-links.rq
│   └── 09-delete-cube-metadata.rq
├── scripts/
│   ├── download-graph.ps1
│   ├── download-graph-chunked.ps1
│   ├── setup-fuseki.ps1
│   ├── start-fuseki.ps1
│   ├── load-data.ps1
│   ├── run-query.ps1
│   └── delete-old-versions.ps1
├── data/                          # Downloaded graph data (gitignored)
├── fuseki/                        # Local Fuseki installation (gitignored)
└── task/
    └── task.txt                   # Original task description
```

## Execution Steps

### Option A: Local Testing (Recommended)

1. **Download the graph data**:
   ```powershell
   cd scripts
   .\download-graph.ps1
   # or for large graphs:
   .\download-graph-chunked.ps1
   ```

2. **Setup local Fuseki**:
   ```powershell
   .\setup-fuseki.ps1
   ```

3. **Start Fuseki server**:
   ```powershell
   .\start-fuseki.ps1
   ```

4. **Load data** (in a new terminal):
   ```powershell
   .\load-data.ps1
   ```

5. **Run preview queries**:
   ```powershell
   .\run-query.ps1 -QueryFile ..\queries\02-count-versions-per-cube.rq
   .\run-query.ps1 -QueryFile ..\queries\03-identify-versions-to-delete.rq
   ```

6. **Execute deletion (dry run first)**:
   ```powershell
   .\delete-old-versions.ps1 -DryRun
   # Then without -DryRun when satisfied
   .\delete-old-versions.ps1
   ```

### Option B: Direct Execution on LINDAS TEST

1. **Run preview queries on TEST endpoint**:
   ```powershell
   .\run-query.ps1 -QueryFile ..\queries\02-count-versions-per-cube.rq -Endpoint "https://test.ld.admin.ch/query"
   .\run-query.ps1 -QueryFile ..\queries\03-identify-versions-to-delete.rq -Endpoint "https://test.ld.admin.ch/query"
   ```

2. **Execute deletion on TEST**:
   ```powershell
   .\delete-old-versions.ps1 -Endpoint "https://test.ld.admin.ch" -DryRun
   # Then without -DryRun
   .\delete-old-versions.ps1 -Endpoint "https://test.ld.admin.ch"
   ```

## Graph Information

- **Graph URI**: `https://lindas.admin.ch/sfoe/cube`
- **VOID endpoint**: `https://energy.ld.admin.ch/.well-known/void`
- **Example cube**: `https://environment.ld.admin.ch/foen/ubd000501/10`

## Cube Structure

A cube consists of:

1. **Cube metadata**: Direct properties of the cube (type, dates, titles)
2. **Observation Constraint (Shape)**: SHACL shapes defining the cube structure
3. **Property Shapes**: Nested shapes for each dimension/measure
4. **Observation Set**: Container linking to observations
5. **Observations**: The actual data points (typically 90%+ of triples)

## Safety Considerations

1. **Always test locally first** before running on production
2. **Run preview queries** to verify what will be deleted
3. **Use dry run mode** (`-DryRun` flag) before actual deletion
4. **Keep backups** of the graph data before deletion
5. **Monitor the endpoint** during deletion for performance issues

## Related Resources

- LINDAS documentation: https://lindas.admin.ch/
- Cube specification: https://cube.link/
- SHACL specification: https://www.w3.org/TR/shacl/
