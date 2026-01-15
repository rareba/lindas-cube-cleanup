# GraphDB Local Test Session - 2026-01-15

## Overview

Complete test session of the LINDAS Cube Version Cleanup tool against a local GraphDB instance.

## Test Environment

- **GraphDB Version**: 10.6.0 (existing local instance)
- **Container Name**: `rdf-forge-graphdb`
- **Port**: 7200
- **Repository**: `lindas`
- **Named Graph**: `https://energy.ld.admin.ch/sfoe/cube`
- **Test Data**: 7 cube versions (co2wirkung v1-v7), 4745 triples total

## Bug Fixes Applied During Testing

Several endpoints were missing GraphDB support. The following endpoints were updated to handle GraphDB's different URL patterns:

### Endpoints Fixed

1. **`/api/cubes/count-versions`** (line 1072)
   - Added `type`, `repository` parameters
   - GraphDB uses `/repositories/{repo}` not `/{db}/query`

2. **`/api/cubes/preview-deletion`** (line 1212)
   - Added GraphDB endpoint construction

3. **`/api/cubes/delete-observations`** (line 1288)
   - GraphDB uses `/repositories/{repo}/statements` for updates

4. **`/api/cubes/delete-observation-links`** (line 1329)
   - Same fix as delete-observations

5. **`/api/cubes/delete-metadata`** (line 1369)
   - Same fix as delete-observations

6. **`/api/backup/create`** (line 1706)
   - Added full GraphDB support with auth headers

7. **`/api/backup/restore`** (line 1895)
   - GraphDB uses `?context=` parameter instead of `?graph=`

### URL Pattern Differences

| Triplestore | Query Endpoint | Update Endpoint | Data Endpoint |
|-------------|----------------|-----------------|---------------|
| Fuseki      | `/{db}/query`  | `/{db}/update`  | `/{db}/data?graph=` |
| Stardog     | `/{db}/query`  | `/{db}/update`  | `/{db}` |
| GraphDB     | `/repositories/{repo}` | `/repositories/{repo}/statements` | `/repositories/{repo}/statements?context=` |

## Test Results

### 1. Connection Test
```
PASS - Connected to GraphDB at http://localhost:7200
Repositories found: lindas, rdf-forge
```

### 2. List Cube Versions
```
PASS - Found 7 versions:
- v7 (newest, dateModified: 2025-08-26)
- v6 (dateModified: 2024-08-27)
- v5 (dateModified: 2024-08-27)
- v4 (dateModified: 2023-09-15)
- v3 (dateModified: 2023-09-13)
- v2 (dateModified: 2023-09-13)
- v1 (oldest, dateModified: 2023-09-12)
```

### 3. Count Versions
```
PASS - Base cube: bfe_ogd18_gebaeudeprogramm_co2wirkung
Version count: 7
Versions: 1, 2, 3, 4, 5, 6, 7
```

### 4. Identify Deletions (Keep Newest 2)
```
PASS
TO KEEP (rank 1-2):
- v7 (rank 1)
- v6 (rank 2)

TO DELETE (rank 3+):
- v5 (rank 3)
- v4 (rank 4)
- v3 (rank 5)
- v2 (rank 6)
- v1 (rank 7)
```

### 5. Preview Deletion (v1)
```
PASS - Preview for v1:
- Metadata triples: 34
- Shape triples: 3
- Observation triples: 967
- Total: ~1004 (actual backup: 1046 including blank nodes)
```

### 6. Backup Creation (v1)
```
PASS
Backup ID: bfe_ogd18_gebaeudeprogramm_co2wirkung_1_2026-01-15T07-21-42-798Z
Triple count: 1046
Expires: 2026-01-22
```

### 7. Deletion Workflow (v1)
```
Step 1: Delete observations - PASS
Step 2: Delete observation links - PASS
Step 3: Delete metadata - PASS

Before: 4745 triples
After: 3699 triples
Deleted: 1046 triples (matches backup count exactly)
Remaining versions: v2, v3, v4, v5, v6, v7
```

### 8. Restore Backup (v1)
```
PASS
Restored triples: 1046
Final count: 4745 triples (back to original)
All 7 versions present again
```

## Summary

| Test | Status |
|------|--------|
| Connection | PASS |
| List Versions | PASS |
| Count Versions | PASS |
| Identify Deletions | PASS |
| Preview Deletion | PASS |
| Backup Creation | PASS |
| Delete Observations | PASS |
| Delete Observation Links | PASS |
| Delete Metadata | PASS |
| Restore Backup | PASS |

**All 10 tests passed successfully.**

## Docker Compose Configuration

A new Docker Compose file was created for GraphDB testing:

```yaml
# docker-compose.graphdb.yml
services:
  graphdb:
    image: ontotext/graphdb:10.8.2
    container_name: graphdb-lindas-test
    ports:
      - "7200:7200"
    volumes:
      - graphdb-data:/opt/graphdb/home
      - ./data:/data:ro
    environment:
      - GDB_HEAP_SIZE=2g
```

## Notes

1. **Named Graphs**: GraphDB requires data to be in a named graph for the GRAPH clause to work. Data loaded without specifying a context goes to the default graph.

2. **Context Parameter**: GraphDB uses `?context=<URI>` instead of `?graph=URI` for specifying the target graph in data operations.

3. **SPARQL Update**: GraphDB's update endpoint is `/repositories/{repo}/statements`, not `/repositories/{repo}/update`.

4. **Authentication**: The local GraphDB instance did not require authentication, but the code now supports Basic Auth for secured instances.

## Files Modified

- `web-app/server.js` - Added GraphDB support to 7 API endpoints
- `docker-compose.graphdb.yml` - New file for GraphDB container setup

## Next Steps

1. Commit the GraphDB fixes
2. Test with GraphDB Cloud (if access available)
3. Update the web UI to properly pass `type` and `repository` parameters for all operations
