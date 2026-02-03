# Backup/Restore Improvements - 2026-01-22

## Summary

This document describes the improvements made to the backup and restore functionality in the LINDAS Cube Manager.

## Issues Addressed

1. **Multiple backup files issue**: Previously, the deletion wizard created a separate backup file for each cube version being deleted. This made restoration difficult and cluttered the backup storage.

2. **Import file type mismatch**: The import function expected JSON or N-Triples files but users wanted to import ZIP backup files directly.

3. **Import 500 error**: The import endpoint failed with a 500 error when trying to import ZIP files because it didn't properly handle the parsed ZIP format.

4. **No auto-download**: Users had to manually navigate to the Backups section to download their backup files after deletion.

5. **Hardcoded versions to keep**: The number of versions to keep (2) was hardcoded throughout the application.

## Changes Made

### 1. Consolidated Multi-Cube Backup

**New endpoint:** `POST /api/backup/create-multi`

- Accepts an array of cube URIs and creates ONE consolidated ZIP file containing all cubes
- ZIP file includes:
  - `manifest.json` with metadata about all cubes
  - `data_1.nt`, `data_2.nt`, etc. for each cube's triples
  - `README.txt` with human-readable restore instructions

**Modified deletion flow:**
- Before: Created individual backup for each cube during deletion loop
- After: Creates ONE consolidated backup of ALL cubes before starting any deletions

### 2. Fixed Import Endpoint

**Endpoint:** `POST /api/backup/import`

- Now properly handles both JSON and ZIP parsed formats
- Supports multi-cube ZIP backups by combining all data files
- Better error handling with descriptive messages
- Extracts target graph from multiple possible sources in the manifest

### 3. Download Endpoint

**New endpoint:** `GET /api/backup/download/:backupId`

- Allows direct download of backup ZIP files by backup ID
- Used for auto-download after deletion completes

### 4. Auto-Download After Deletion

The deletion wizard now automatically downloads the consolidated backup ZIP to the user's default downloads folder after all deletions complete. This ensures users always have a copy of their deleted data.

### 5. Configurable Versions to Keep

**New setting:** "Versions to Keep" input in Step 1 of the Deletion Wizard

- Default value: 2
- Range: 1-10
- The setting is used throughout the application:
  - Filtering cubes that need cleanup
  - Calculating how many versions to delete per cube
  - Display text updates dynamically

## Files Modified

### server.js
- Added `POST /api/backup/create-multi` endpoint (lines 2126-2279)
- Added `GET /api/backup/download/:backupId` endpoint (lines 2281-2297)
- Fixed `POST /api/backup/import` endpoint to handle ZIP formats (lines 2565-2661)

### public/app.js
- Added `state.versionsToKeep` setting (line 55)
- Updated deletion wizard to use `state.versionsToKeep` instead of hardcoded "2" (lines 1110, 1116, 1189)
- Modified `wizardExecuteDeletion()` to create consolidated backup before deletion (lines 1457-1493)
- Added auto-download of backup ZIP after deletion (lines 1596-1614)
- Added event listener for versions-to-keep input (lines 919-932)

### public/index.html
- Added dynamic span for versions display (line 353)
- Added "Versions to Keep" input field in Step 1 (lines 393-397)

## Testing

To test these changes:

1. Start the web app: `npm start` (port 3001)
2. Connect to a triplestore (Fuseki, Stardog, or GraphDB)
3. Go to Deletion Wizard
4. Optionally change "Versions to Keep" setting
5. Load a graph with cube versions
6. Proceed through the wizard to delete old versions
7. Verify:
   - Only ONE backup ZIP is created
   - ZIP is automatically downloaded after deletion
   - ZIP contains all deleted cube data
   - ZIP can be imported back using the Import function

## Rollback

If issues arise, revert the changes in:
- `server.js`
- `public/app.js`
- `public/index.html`

Previous behavior created individual backups during the deletion loop.
