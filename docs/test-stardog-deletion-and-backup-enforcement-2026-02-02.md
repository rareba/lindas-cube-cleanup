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

## Verification Steps

1. Start with `ENABLE_DESTRUCTIVE_API=true` -- deletion should work normally when a backup exists
2. Start without `ENABLE_DESTRUCTIVE_API=true` -- deletion should show a clear 403 error in the wizard log
3. Attempt deletion without a backup -- should fail with 400 error requiring backupId
4. Create a backup and inspect the ZIP -- should contain `restore-instructions.json` and enhanced `README.txt`
5. Verify the restore-instructions.json has correct connection details and cube list
