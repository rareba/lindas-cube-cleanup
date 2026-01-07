# Test Data Setup

## Downloaded Test Data

For local testing, we downloaded the `bfe_ogd18_gebaeudeprogramm_co2wirkung` cube (all 7 versions).

This cube was chosen because:
- Small size (< 1000 triples per version)
- 7 versions available (5 to delete, 2 to keep)
- Representative of building program cube structure

### Files

| File | Triples | Description |
|------|---------|-------------|
| `data/cubes/co2wirkung_v1.nt` | 1,046 | Version 1 (DELETE) |
| `data/cubes/co2wirkung_v2.nt` | 885 | Version 2 (DELETE) |
| `data/cubes/co2wirkung_v3.nt` | 535 | Version 3 (DELETE) |
| `data/cubes/co2wirkung_v4.nt` | 535 | Version 4 (DELETE) |
| `data/cubes/co2wirkung_v5.nt` | 570 | Version 5 (DELETE) |
| `data/cubes/co2wirkung_v6.nt` | 570 | Version 6 (KEEP) |
| `data/cubes/co2wirkung_v7.nt` | 604 | Version 7 (KEEP) |
| `data/test-cubes.nt` | 4,745 | All versions merged |

### Expected Deletion

- **Versions to delete**: 1, 2, 3, 4, 5 (rank 3-7)
- **Versions to keep**: 6, 7 (rank 1-2)
- **Triples to delete**: ~3,571
- **Triples to keep**: ~1,174

## Full Graph Download

The full SFOE graph contains **30,544,904 triples** which is too large for a single download.

Options:
1. Use incremental download script (`download-graph-incremental.ps1`)
2. Download specific cubes only (`download-cube.ps1`)
3. Use partial download for testing

### Partial Download

A partial download was attempted but timed out after ~722,000 triples:
- File: `data/sfoe-cube.nt`
- Size: ~156 MB
- Triples: ~722,697 (incomplete)

## Local Testing Instructions

1. **Setup Fuseki**:
   ```powershell
   cd scripts
   .\setup-fuseki.ps1
   .\start-fuseki.ps1
   ```

2. **Load test data** (in new terminal):
   ```powershell
   # For quick testing with small dataset
   curl -X POST -H "Content-Type: application/n-triples" `
     --data-binary @"..\data\test-cubes.nt" `
     "http://localhost:3030/lindas/data?graph=https://lindas.admin.ch/sfoe/cube"
   ```

3. **Verify data**:
   ```powershell
   .\run-query.ps1 -QueryFile "..\queries\02-count-versions-per-cube.rq"
   ```

4. **Run deletion preview**:
   ```powershell
   .\run-query.ps1 -QueryFile "..\queries\03-identify-versions-to-delete.rq"
   ```

5. **Execute deletion**:
   ```powershell
   .\delete-old-versions.ps1 -DryRun
   .\delete-old-versions.ps1
   ```
