# Multi-Cube Backup and Restore Test Report

**Date:** 2026-01-20
**Test Environment:** Windows 11, Node.js, localhost:3001

## Overview

This report documents the testing of the multi-cube backup and restore functionality in the LINDAS Cube Manager. The feature allows backing up multiple cubes into a single ZIP archive with selective restore capabilities.

## Test Suites Executed

### Test Suite 1: Multi-Cube Backup Creation (17 tests)

**File:** `web-app/test-multi-cube-backup.js`

| Test | Result | Details |
|------|--------|---------|
| Server connectivity | PASS | Status 200 |
| ZIP file creation | PASS | File size: ~2KB |
| ZIP contents verification | PASS | Contains: data_1.nt, data_2.nt, data_3.nt, manifest.json, README.txt |
| Backup in list | PASS | Found in backup list API |
| Multi-cube count detected | PASS | Cube count: 3 |
| Format version | PASS | Version: 4.0 |
| Cubes array present | PASS | 3 cubes in array |
| All cubes have dataFile | PASS | data_1.nt, data_2.nt, data_3.nt |
| data_1.nt content | PASS | 7 triples |
| data_2.nt content | PASS | 7 triples |
| data_3.nt content | PASS | 7 triples |
| Export endpoint accessible | PASS | Status: 200 |
| Selective filter works | PASS | Selected 2 of 3 cubes |
| Correct cubes selected | PASS | test1/1, test3/2 |
| Multi-cube has no legacy cube field | PASS | cube field correctly omitted |
| Single-cube has legacy cube field | PASS | Backward compatibility preserved |
| Single-cube uses data.nt | PASS | Correct single-file naming |

**Summary:** 17/17 tests passed

### Test Suite 2: Restore API Endpoints (9 tests)

**File:** `web-app/test-restore-api.js`

| Test | Result | Details |
|------|--------|---------|
| Test backup created | PASS | Backup ID generated |
| Backup found in list | PASS | Total backups: 2 |
| Backup has cube count | PASS | Cube count: 2 |
| Backup has cubes array | PASS | restore-test1/1, restore-test2/1 |
| Selective restore API endpoint | PASS | API processes selective restore request |
| Full restore API endpoint | PASS | API processes full restore request |
| Export endpoint returns data | PASS | Status: 200 |
| Delete endpoint works | PASS | Successfully deleted |
| Backup actually deleted | PASS | Removed from list |

**Summary:** 9/9 tests passed

## Features Tested

### 1. Multi-Cube Backup Format (v4.0)

The backup format supports multiple cubes with:
- Individual data files: `data_1.nt`, `data_2.nt`, etc.
- Single manifest.json with `cubes` array
- Full metadata for each cube (URI, baseCube, version, tripleCount)
- Backward compatibility with v3.0 readers (single-cube backups include legacy `cube` field)

### 2. Manifest Structure

```json
{
  "formatVersion": "4.0",
  "formatType": "lindas-cube-backup",
  "backupId": "multi_3cubes_2026-01-20T...",
  "cubes": [
    {
      "uri": "https://example.org/cube/test1/1",
      "baseCube": "https://example.org/cube/test1",
      "version": 1,
      "name": "test1/1",
      "dataFile": "data_1.nt",
      "tripleCount": 7
    },
    ...
  ],
  "stats": {
    "cubeCount": 3,
    "totalTripleCount": 21
  }
}
```

### 3. Selective Restore

The restore API supports filtering cubes via `selectedCubes` parameter:
- Pass array of cube URIs to restore only specific cubes
- Omit parameter to restore all cubes in backup

### 4. API Endpoints Tested

| Endpoint | Method | Function |
|----------|--------|----------|
| `/api/backup/list` | GET | List all backups with cube counts |
| `/api/backup/:id/export` | GET | Download backup ZIP |
| `/api/backup/restore-to` | POST | Restore to triplestore (selective or full) |
| `/api/backup/:id` | DELETE | Remove backup |

## Conclusion

All multi-cube backup and restore functionality tests pass. The system correctly:
- Creates multi-cube ZIP backups with separate data files
- Maintains backward compatibility with single-cube format
- Supports selective restore from multi-cube backups
- Provides accurate cube counts and metadata in API responses

## Test Files

- `web-app/test-multi-cube-backup.js` - Tests backup creation and format
- `web-app/test-restore-api.js` - Tests restore API endpoints
