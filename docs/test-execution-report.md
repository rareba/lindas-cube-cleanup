# Test Execution Report

**Date**: 2025-01-07
**Environment**: Local Apache Jena Fuseki 5.0.0
**Test Data**: bfe_ogd18_gebaeudeprogramm_co2wirkung (all 7 versions)

## Summary

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Total Triples | 4,745 | 1,174 | -3,571 |
| Cube Versions | 7 | 2 | -5 |

## Test Execution Steps

### 1. Setup
- Downloaded Apache Jena Fuseki 5.0.0
- Created configuration for LINDAS dataset
- Started server on port 3030

### 2. Data Loading
- Loaded test data: `data/test-cubes.nt`
- 4,745 triples loaded into graph `https://lindas.admin.ch/sfoe/cube`

### 3. Pre-Deletion Verification

**Query 02 - Version Counts:**
```
baseCube,versionCount,versions
bfe_ogd18_gebaeudeprogramm_co2wirkung,7,"1, 2, 3, 4, 5, 6, 7"
```

**Query 03 - Versions to Delete (rank > 2):**
| Cube | Version | Rank |
|------|---------|------|
| .../co2wirkung/5 | 5 | 3 |
| .../co2wirkung/4 | 4 | 4 |
| .../co2wirkung/3 | 3 | 5 |
| .../co2wirkung/2 | 2 | 6 |
| .../co2wirkung/1 | 1 | 7 |

### 4. Deletion Execution

Used `queries/06-delete-single-cube.rq` to delete each version:
- Version 1: Deleted
- Version 2: Deleted
- Version 3: Deleted
- Version 4: Deleted
- Version 5: Deleted

### 5. Post-Deletion Verification

**Triple Count:**
- Before: 4,745
- After: 1,174
- Deleted: 3,571 (75.3%)

**Remaining Cubes:**
```
https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/6
https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/7
```

## Results

The deletion queries worked correctly:
- Versions 6 and 7 (newest 2) were preserved
- Versions 1-5 (older) were deleted
- All associated triples (metadata, shapes, observations) were removed

## Saved Test Results

All query results are saved in `data/test-results/`:
- `01-all-versions.csv` - All versions before deletion
- `02-version-counts.csv` - Version counts per cube
- `03-versions-to-delete.csv` - Versions identified for deletion
- `04-count-before.csv` - Triple count before deletion
- `05-count-after.csv` - Triple count after first deletion
- `06-remaining-versions.csv` - Intermediate state
- `07-final-count.csv` - Final triple count
- `08-final-versions.csv` - Final version count (empty = success)
- `09-remaining-cubes.csv` - Final remaining cubes

## Conclusion

The deletion solution is validated and ready for production use.

### Recommended Production Steps

1. Run `queries/03-identify-versions-to-delete.rq` to verify deletion targets
2. Create backup of graph (CONSTRUCT query to file)
3. Execute deletion for each cube version using `queries/06-delete-single-cube.rq`
4. For large cubes, use chunked approach:
   - `queries/07-delete-observations-chunked.rq` (repeat until done)
   - `queries/08-delete-observation-links.rq`
   - `queries/09-delete-cube-metadata.rq`
5. Verify with `queries/02-count-versions-per-cube.rq`

### Notes

- The deletion queries handle all cube structure components:
  - Cube metadata and blank nodes
  - Observation constraints (SHACL shapes)
  - Property shapes (including RDF lists)
  - Observation sets and observations
- No orphaned triples were left after deletion
