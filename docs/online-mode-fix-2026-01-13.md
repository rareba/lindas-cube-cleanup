# Online Mode Fix - 2026-01-13

## Issue Summary

The Deletion Wizard was not working in Online mode with Stardog Cloud. When switching from Offline to Online mode, the endpoint URL was being reset to a placeholder value (`https://sd-xxxxx.stardog.cloud:5820`) instead of preserving the user-entered Stardog Cloud URL.

## Root Cause

The `updateConnectionUI()` function in `app.js` was resetting the endpoint URL to default values whenever the mode changed, without checking if the user had already entered a custom URL.

## Fix Applied

Modified `app.js` to preserve user-entered URLs when switching between modes:

1. Added a check for known default URLs before overwriting the endpoint URL
2. Added input event listeners to track manual changes to connection fields
3. The fix ensures that user-entered URLs are preserved when changing connection modes

### Code Changes

In `updateConnectionUI()`:
- Added check for known default URLs before overwriting
- Only resets to defaults if the current URL is empty or matches a known placeholder

In `initConnectionSection()`:
- Added event listeners for endpoint-url, datasetName, stardogDatabase, authUsername, authPassword inputs
- These listeners update the state when users manually change values

## Test Results

### Test Environment
- **Mode**: Online Mode with Remote Server / Cloud connection
- **Triplestore**: Stardog Cloud
- **Endpoint**: `https://sd-85766d45.stardog.cloud:5820`
- **Database**: `lindas`
- **Graph URI**: `https://lindas.admin.ch/sfoe`

### Test Data Setup
Inserted 5 cube versions (v1-v5) using the Query Editor with an INSERT DATA query.

### Deletion Wizard Test (Online Mode)

| Step | Test | Result | Details |
|------|------|--------|---------|
| 1 | Load Graph | PASS | Successfully loaded graph from Stardog Cloud |
| 2 | Explore Versions | PASS | Found 1 Base Cube, 5 Total Versions, 3 to Delete |
| 3 | Preview Deletions | PASS | Correctly ranked: v5(KEEP), v4(KEEP), v3(DELETE), v2(DELETE), v1(DELETE) |
| 4 | Execute Cleanup | PASS | Checkbox confirmation, deletion executed |
| 5 | Cleanup Summary | PASS | 3 Versions Deleted, 2 Preserved, Backups created |

### Verification Query

After deletion, SELECT query confirmed only 2 cube versions remain:
- `.../cube/version/4`
- `.../cube/version/5`

Versions v1, v2, v3 were successfully deleted.

## Connection Configuration Verified

The fix correctly preserves connection settings when switching modes:
1. User enters Stardog Cloud URL in Offline mode
2. Tests connection successfully
3. Switches to Online mode
4. URL is preserved (not reset to placeholder)
5. Deletion Wizard uses correct endpoint

## Files Modified

- `web-app/public/app.js`
  - `updateConnectionUI()` function
  - `initConnectionSection()` function

## Conclusion

The Online mode Deletion Wizard now works correctly with Stardog Cloud. The fix ensures user-entered connection URLs are preserved when switching between Offline and Online modes, allowing the tool to be used in production environments with remote triplestores.
