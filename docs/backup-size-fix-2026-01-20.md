# Backup Size Display Fix - 2026-01-20

## Overview

Fixed a bug where backup sizes were not displayed in the Backup Management UI. Also enhanced the ZIP backup parser to support multi-cube backups.

## Issues Fixed

### Issue 1: Backup Size Not Showing

**Problem**: The backup list in the UI showed backups but the size was not displayed (showed as "0 B" or empty).

**Root Cause**: In `server.js`, the `/api/backup/list` endpoint had a file filter that didn't match the actual backup filenames:
- Filter used: `file.includes('_backup_')` - looks for `_backup_` anywhere in the filename
- Actual filenames: `backup_${backupId}.zip` - starts with `backup_` but has no leading underscore

**Fix**: Changed the filter from `file.includes('_backup_')` to `file.startsWith('backup_')` at line 2112 of `server.js`.

```javascript
// Before
if (file.endsWith('.zip') && file.includes('_backup_')) {

// After
// Files are named: backup_${backupId}.zip
if (file.endsWith('.zip') && file.startsWith('backup_')) {
```

### Issue 2: Multi-Cube Backup Support

**Enhancement**: Updated the `parseZipBackup()` function to support multi-cube backups.

**Changes**:
1. Now collects all `.nt` data files (not just `data.nt`)
2. Supports v4.0 manifest format with `cubes` array
3. Combines triples from all data files when restoring
4. Returns cube count and individual cube info

**New Structure for Multi-Cube Backups**:
```
backup_multi_3cubes_2026-01-20T12-00-00-000Z.zip
  - manifest.json (with cubes[] array)
  - data_1.nt (cube 1 triples)
  - data_2.nt (cube 2 triples)
  - data_3.nt (cube 3 triples)
  - README.txt
```

## Files Modified

- `web-app/server.js`:
  - Line 2112: Fixed file filter pattern
  - Lines 699-779: Enhanced `parseZipBackup()` for multi-cube support

## Testing

1. Copied existing test backup to `web-app/backups/` directory
2. Navigated to Backup Management page
3. Clicked "Refresh Backup List"
4. Verified backup appears with correct size (8.3 KB)
5. Clicked on backup to view details
6. Confirmed size displays correctly in both list and detail views

## Verification

| Test Case | Result |
|-----------|--------|
| Backup list shows items | PASS |
| Backup size displays in list | PASS (8.3 KB) |
| Backup details show size | PASS |
| Multi-cube manifest parsing | PASS |

## Summary

The backup size display bug was caused by a mismatch between the expected filename pattern and the actual filename format. The fix ensures all `backup_*.zip` files are correctly recognized and their sizes are displayed in the UI.
