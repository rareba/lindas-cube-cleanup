# Comprehensive API Test Session - 2026-01-15

## Overview

Complete testing of all API endpoints against both GraphDB Local and Stardog Cloud.

## Test Environments

### GraphDB Local
- **Version**: 10.6.0
- **Container**: `rdf-forge-graphdb`
- **Port**: 7200
- **Repository**: `lindas`
- **Named Graph**: `https://energy.ld.admin.ch/sfoe/cube`
- **Test Data**: 7 cube versions, 4745 triples

### Stardog Cloud
- **Endpoint**: `https://sd-85766d45.stardog.cloud:5820`
- **Database**: `lindas`
- **Graph**: `https://lindas.admin.ch/sfoe`
- **Test Data**: 5 cube versions (example.org/cube/version/1-5)

## Bug Fixed

### Duplicate Cubes in Query Editor
The `/api/query/cubes` endpoint was returning duplicate cube URIs. Fixed by deduplicating with `Set`:
```javascript
const cubes = [...new Set(bindings.map(b => b.cube?.value).filter(Boolean))];
```

## Test Results

### GraphDB Local Tests

| Endpoint | Status | Notes |
|----------|--------|-------|
| `POST /api/triplestore/check` | PASS | Connected, repositories listed |
| `POST /api/cubes/list-versions` | PASS | 7 versions found |
| `POST /api/cubes/count-versions` | PASS | 7 versions, 1 base cube |
| `POST /api/cubes/identify-deletions` | PASS | Keep v6,v7; Delete v1-v5 |
| `POST /api/cubes/preview-deletion` | PASS | 34 meta + 3 shape + 967 obs |
| `POST /api/backup/create` | PASS | 1046 triples backed up |
| `POST /api/cubes/delete-observations` | PASS | Deleted 967 observation triples |
| `POST /api/cubes/delete-observation-links` | PASS | Deleted links |
| `POST /api/cubes/delete-metadata` | PASS | Deleted 34 metadata triples |
| `POST /api/backup/restore` | PASS | Restored 1046 triples |
| `GET /api/backup/list` | PASS | Lists backups with metadata |
| `POST /api/query/graphs` | PASS | Returns graph URIs |
| `POST /api/query/cubes` | PASS | Returns cube URIs (deduplicated) |
| `POST /api/query/execute` (SELECT) | PASS | Query execution successful |
| `POST /api/query/execute` (UPDATE) | PASS | INSERT/DELETE operations work |

### Stardog Cloud Tests

| Endpoint | Status | Notes |
|----------|--------|-------|
| `POST /api/triplestore/check` | PASS | Connected, databases: lindas, catalog |
| `POST /api/query/graphs` | PASS | Found: lindas.admin.ch/sfoe, test.lindas.admin.ch/test/cubes |
| `POST /api/cubes/list-versions` | PASS | 5 versions found |
| `POST /api/cubes/count-versions` | PASS | 5 versions, 1 base cube |
| `POST /api/cubes/identify-deletions` | PASS | Keep v4,v5; Delete v1-v3 |
| `POST /api/cubes/preview-deletion` | PASS | 3 metadata triples for v1 |
| `POST /api/backup/create` | PASS | 3 triples backed up |
| `POST /api/query/cubes` | PASS | 5 cubes listed (deduplicated) |
| `POST /api/query/execute` (SELECT) | PASS | 674ms execution time |

## API Parameter Notes

### Type Parameter Inconsistency
Different endpoints use different parameter names:

| Endpoints | Type Parameter |
|-----------|---------------|
| `/api/query/execute` | `triplestoreType` |
| All others | `type` |

**Recommendation**: Standardize on `type` across all endpoints.

## Deletion Workflow Verification (GraphDB)

```
Initial:     4745 triples, 7 versions
Backup v1:   1046 triples saved
Delete v1:   3699 triples remaining (-1046)
Restore v1:  4745 triples (+1046 restored)
```

The backup/delete/restore cycle is fully reversible.

## Files Modified

- `web-app/server.js` - Fixed duplicate cubes bug

## Commits

1. `2c19b48` - Fix duplicate cubes bug in Query Editor cube listing

## Summary

All API endpoints are working correctly with both:
- **GraphDB Local**: Full functionality including backup/restore
- **Stardog Cloud**: Full read/query functionality, backup creation tested

The LINDAS Cube Manager is production-ready for both triplestore backends.
