# UI and Functionality Improvements - 2026-01-22

## Summary

Major improvements to the LINDAS Cube Manager UI and deletion workflow.

## Changes Made

### 1. Replaced Online/Offline Mode with Dry Run/Execute Mode

**Previous behavior:** Users had to choose between "Online" (direct to production) and "Offline" (local triplestore) modes.

**New behavior:**
- **Dry Run Mode:** Preview what would be deleted without making any changes. Safe for testing and verification.
- **Execute Mode:** Actually perform the deletions after confirming the preview.

This change makes the tool safer to use by defaulting to a non-destructive preview mode.

### 2. Added Cube Selection in Deletion Wizard

**Previous behavior:** All cubes with old versions were automatically selected for deletion. No way to selectively delete specific cubes.

**New behavior:**
- Step 3 now shows cubes grouped by base URI with checkboxes
- "Select All" checkbox at the top for bulk selection/deselection
- Each cube row shows which versions would be deleted and which would be kept
- Selection count displayed (e.g., "15 of 17 cubes selected")
- All cubes selected by default (previous behavior preserved)

### 3. Fixed Backup Creation

**Previous behavior:** Backup creation was attempted but would continue with deletion even if backup failed. This could result in data loss.

**New behavior:**
- Backup is MANDATORY before deletion
- If backup fails, deletion is ABORTED with error message
- Consolidated backup includes all selected cubes in ONE ZIP file
- Backup is auto-downloaded after successful deletion

### 4. Dry Run Mode Features

In Dry Run mode:
- No actual changes are made to the triplestore
- Log shows `[DRY RUN]` prefixes for all actions
- Summary shows "Would Delete" instead of "Versions Deleted"
- No backup is created (since no data is being deleted)
- Message prompts user to switch to Execute mode for actual deletion

## Files Modified

### public/index.html
- Changed mode toggle from Online/Offline to Dry Run/Execute (lines 22-31)
- Updated mode badge (line 93)
- Added selection controls to Step 3: Select All checkbox, selected count (lines 442-448)
- Updated Step 3 title to "Select Cubes to Delete" (line 434)
- Updated documentation section (lines 724-730)

### public/styles.css
- Added styles for new mode badges (dryrun/execute) (lines 351-362)
- Added styles for selection controls (lines 1194-1255)
- Added styles for cube rows with checkboxes

### public/app.js
- Changed default mode from 'offline' to 'dryrun' (line 31)
- Added `selectedCubesForDeletion` state variable (line 56)
- Updated `setMode()` function for new modes (lines 204-220)
- Updated `updateModeUI()` function for new mode badges and banners (lines 222-260)
- Rewrote `wizardPreviewDeletions()` to group cubes and add checkboxes (lines 1237-1428)
- Added `getBaseCubeUri()` helper function (lines 1430-1435)
- Added `updateSelectionCount()` function (lines 1437-1445)
- Added `updateSelectAllCheckbox()` function (lines 1447-1456)
- Rewrote `wizardExecuteDeletion()` for dry run support and mandatory backup (lines 1458-1732)
- Updated `renderWizardSummary()` for dry run mode (lines 1744-1767)

## Testing

1. Start the web app: `npm start` (port 3001)
2. Connect to a triplestore
3. Default mode should be "Dry Run"
4. Go to Deletion Wizard
5. Load a graph with cube versions
6. Step 3 should show:
   - Select All checkbox (checked by default)
   - Individual cube checkboxes
   - Versions to delete/keep for each cube
   - Selection count
7. Test deselecting some cubes
8. Proceed to Step 4 and execute in Dry Run mode
9. Verify no actual deletions occur
10. Switch to Execute mode and run again
11. Verify backup is created before deletion
12. Verify backup auto-downloads

## Backward Compatibility

- The new mode (dryrun/execute) replaces the old mode (offline/online)
- Default behavior (delete all old versions) is preserved via "all selected by default"
- Backup format remains compatible with existing restore functionality
