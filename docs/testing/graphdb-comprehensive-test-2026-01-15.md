# GraphDB Comprehensive Test Session - 2026-01-15

## Overview

Complete API and functionality test of the LINDAS Cube Manager against a local GraphDB instance.

## Test Environment

- **GraphDB Version**: 10.6.0
- **Container**: `rdf-forge-graphdb` on port 7200
- **Repository**: `lindas`
- **Named Graph**: `https://energy.ld.admin.ch/sfoe/cube`
- **Test Data**: 7 cube versions (co2wirkung v1-v7), 4745 triples

## Bugs Found and Fixed

### 1. Duplicate Cubes in Query Editor

**Issue**: `/api/query/cubes` endpoint was returning each cube twice

**Cause**: The SPARQL query returns multiple rows per cube due to OPTIONAL language variants on `schema:name`. The code extracted cube URIs but didn't deduplicate.

**Fix** (server.js line ~1603-1606):
```javascript
// Before (bug):
const cubes = bindings.map(b => b.cube?.value).filter(Boolean);

// After (fixed):
const cubes = [...new Set(bindings.map(b => b.cube?.value).filter(Boolean))];
```

## Test Results

### Core API Tests (All Passed)

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/triplestore/check` | POST | PASS | Connected to GraphDB, listed repositories |
| `/api/triplestore/defaults` | GET | PASS | Returns triplestore configuration |
| `/api/cubes/list-versions` | POST | PASS | Found 7 versions (v1-v7) |
| `/api/cubes/count-versions` | POST | PASS | 7 versions for 1 base cube |
| `/api/cubes/identify-deletions` | POST | PASS | Keep v6,v7; Delete v1-v5 |
| `/api/cubes/preview-deletion` | POST | PASS | 34 meta + 3 shape + 967 obs triples for v1 |
| `/api/backup/create` | POST | PASS | 1046 triples backed up |
| `/api/cubes/delete-observations` | POST | PASS | Deleted observations |
| `/api/cubes/delete-observation-links` | POST | PASS | Deleted links |
| `/api/cubes/delete-metadata` | POST | PASS | Deleted metadata |
| `/api/backup/restore` | POST | PASS | Restored 1046 triples |
| `/api/backup/list` | GET | PASS | Lists all backups with metadata |

### Query Editor Tests (All Passed)

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/query/graphs` | POST | PASS | Returns graph URIs |
| `/api/query/cubes` | POST | PASS | Returns cube URIs (deduplicated) |
| `/api/query/execute` (SELECT) | POST | PASS | Executes SELECT queries |
| `/api/query/execute` (UPDATE) | POST | PASS | Executes INSERT/DELETE queries |

### Deletion Workflow Test

```
Initial state:     4745 triples, 7 cube versions
After backup v1:   1046 triples backed up
After delete v1:   3699 triples remaining (1046 deleted)
After restore v1:  4745 triples (1046 restored)
```

## API Parameter Notes

Different endpoints use different parameter names for the triplestore type:

| Endpoint | Type Parameter |
|----------|---------------|
| `/api/query/execute` | `triplestoreType` |
| `/api/query/graphs` | `type` |
| `/api/query/cubes` | `type` |
| `/api/cubes/*` | `type` |
| `/api/backup/*` | `type` |

This inconsistency should be addressed in a future update.

## Stardog Cloud Status

Stardog Cloud authentication failed with 401 error. The error message indicates:
- SSO credentials do not work for API access
- Need to create a dedicated API user in Stardog Studio

**Action Required**: Create API user in Stardog Studio before testing Stardog Cloud.

## Files Modified

- `web-app/server.js` - Fixed duplicate cubes bug in `/api/query/cubes`

## Conclusion

All GraphDB functionality is working correctly:
- Connection and repository listing
- Cube version management (list, count, identify)
- Preview and deletion workflow
- Backup creation and restoration
- Query Editor (SELECT and UPDATE)

The tool is fully compatible with GraphDB Free Edition.
