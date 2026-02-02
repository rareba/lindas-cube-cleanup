# Stardog Deletion Fix and Backup Enforcement

**Date:** 2026-02-02
**Issue:** Deletion operations against Stardog TEST appeared to succeed but actually deleted nothing. The server returned 403 when `ENABLE_DESTRUCTIVE_API` was not set, but the frontend silently ignored the error.

## Root Cause

The frontend (`app.js`) did not check `response.ok` on the three delete API calls (`delete-observations`, `delete-observation-links`, `delete-metadata`). When the server returned HTTP 403 (destructive API disabled), the frontend parsed the JSON body, found `triplesDeleted: undefined`, defaulted to `0`, and displayed "Deleted successfully" -- misleading the user into thinking deletion occurred.

## Changes Made

### 1. Frontend: response.ok checks on delete calls (`web-app/public/app.js`)

For each of the 3 delete fetch calls:
- Added `if (!response.ok)` check immediately after `await fetch()`
- On failure, parses the error body and throws an `Error` with the server's error message
- This ensures HTTP 403, 400, 500, etc. are all surfaced clearly in the wizard log

### 2. Frontend: pass backupId to delete endpoints (`web-app/public/app.js`)

Each delete call now includes `backupId: state.deletionResults.consolidatedBackupId` in the request body. This ties deletion to a mandatory prior backup.

### 3. Server: backupId validation on delete endpoints (`web-app/server.js`)

All 3 delete endpoints (`/api/cubes/delete-observations`, `/api/cubes/delete-observation-links`, `/api/cubes/delete-metadata`) now:
- Require a `backupId` parameter in the request body
- Validate that a backup ZIP file with that ID exists in the backup directory
- Return HTTP 400 with a clear error message if no valid backup is provided

This guarantees that data cannot be deleted without a backup existing first.

### 4. Backup ZIP: restore-instructions.json (`web-app/server.js`)

The `createZipBackup()` function now adds a `restore-instructions.json` file to every backup ZIP. This file contains:
- Human-readable step-by-step restore instructions
- Target connection details (triplestore type, endpoint, database, graph URI)
- List of cubes with their data files and triple counts
- Machine-readable API endpoint configuration for automated restore

### 5. Backup ZIP: enhanced README.txt (`web-app/server.js`)

The README.txt in backup ZIPs now includes:
- Backup ID for reference
- Reference to the new `restore-instructions.json` file
- Detailed step-by-step restore instructions (web app, API, and manual methods)
- Triplestore-specific manual restore commands (Fuseki, Stardog, GraphDB)

## Files Modified

| File | Changes |
|------|---------|
| `web-app/public/app.js` | Added response.ok checks; added backupId to delete request bodies |
| `web-app/server.js` | Added backupId validation to 3 delete endpoints; added restore-instructions.json to backup ZIP; enhanced README.txt |

## Test Results (2026-02-02)

**Target:** Stardog TEST (`https://stardog-test.cluster.ldbar.ch/lindas`)
**Graph:** `https://lindas.admin.ch/sfoe/cube`
**User:** `lindas-cube-creator`

### Test 1: Connection and graph listing
- Connected to Stardog TEST successfully
- Listed 9 graphs in the `lindas` database

### Test 2: Cube version detection
- `gest_beq`: 8 versions (1-8)
- `bfe_ogd56_energieperspektiven2050`: 4 versions (1-4)
- Deletion wizard correctly identified 8 versions to delete (keeping newest 2 of each)

### Test 3: Backup creation with restore-instructions.json
- Created multi-cube backup of versions 1 and 2 of `bfe_ogd56_energieperspektiven2050`
- Backup ID: `multi_2cubes_2026-02-02T14-15-50-625Z`
- ZIP size: 17.7 MB, 3,450,134 triples (1,725,063 + 1,725,071)
- ZIP contents verified: `manifest.json`, `data_1.nt`, `data_2.nt`, `README.txt`, `restore-instructions.json`
- `restore-instructions.json` contains correct Stardog connection details and API payload

### Test 4: Deletion enforcement (backupId validation)
- **Without backupId:** HTTP 400 -- "backupId is required. A backup must be created before deletion."
- **With invalid backupId:** HTTP 400 -- "No backup found with the provided backupId. Create a backup first."
- **With valid backupId:** HTTP 200 -- deletion proceeded

### Test 5: Actual deletion on Stardog TEST
Deleted `bfe_ogd56_energieperspektiven2050/1`:
- Observations: 1,592,064 triples deleted
- Observation links: 132,672 triples deleted
- Metadata: 327 triples deleted
- **Total: 1,725,063 triples** (matches backup count exactly)
- Version count confirmed: 4 versions -> 3 versions (2,3,4)

### Test 6: Restore from backup
- Restored version 1 from backup using `/api/backup/restore-to`
- 1,725,063 triples restored
- Version count confirmed: 3 versions -> 4 versions (1,2,3,4) -- data fully restored

### Summary
All tests passed. The delete+backup+restore roundtrip works correctly against Stardog TEST. The backup enforcement prevents accidental data loss by requiring a valid backup before any deletion can proceed.
