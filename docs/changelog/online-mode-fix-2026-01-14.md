# Online Mode URL Preservation Fix - Test Session 2026-01-14

## Summary

Successfully tested the LINDAS Cube Manager v2.0 in both Offline and Online modes with Stardog Cloud. The URL preservation fix was verified to work correctly.

## Bug Fix Verified

### Issue
When switching from Offline mode to Online mode, the custom Stardog Cloud endpoint URL was being reset to the placeholder URL `https://sd-xxxxx.stardog.cloud:5820`, causing connection failures.

### Root Cause
The `updateConnectionUI()` function in `app.js` was unconditionally resetting the endpoint URL to default values when switching modes.

### Fix Applied
Modified `updateConnectionUI()` to only reset the URL if:
1. The current URL is empty, OR
2. The current URL matches a known placeholder/default URL

Custom URLs entered by the user are now preserved when switching between modes.

### Code Change Location
- **File**: `web-app/public/app.js`
- **Function**: `updateConnectionUI()`

## Test Environment

- **Web App**: http://localhost:3001
- **Triplestore**: Stardog Cloud
- **Endpoint**: `https://sd-85766d45.stardog.cloud:5820`
- **Database**: `lindas`
- **Username**: `gva`

## Test Results

### 1. Offline Mode with Stardog Cloud

| Test | Result | Notes |
|------|--------|-------|
| Select Stardog triplestore | PASS | "Use Stardog" button works |
| Change to Remote Server/Cloud | PASS | Connection dropdown works |
| Enter Stardog Cloud URL | PASS | Custom URL accepted |
| Enter credentials | PASS | Username/password fields work |
| Test Connection | PASS | "Connected! Available databases: lindas, catalog" |
| Query Editor SELECT | PASS | 2 results in 1243ms |

### 2. Online Mode with Stardog Cloud

| Test | Result | Notes |
|------|--------|-------|
| Switch to Online mode | PASS | Mode toggle works |
| URL Preservation | PASS | Custom URL `https://sd-85766d45.stardog.cloud:5820` preserved |
| Credentials Preservation | PASS | Database, username, password all preserved |
| Connection status | PASS | Still connected after mode switch |
| Warning banner | PASS | Shows "Online Mode - CAUTION" message |
| Download Data hidden | PASS | Section correctly hidden in Online mode |
| Query Editor SELECT | PASS | 2 results in 840ms |

### 3. Deletion Wizard (Online Mode)

| Step | Test | Result | Notes |
|------|------|--------|-------|
| Step 1 | Load Graph | PASS | Graph `https://lindas.admin.ch/sfoe` loaded |
| Step 2 | Explore Cubes | PASS | Found 1 base cube, 5 versions, 3 to delete |
| Step 3 | Preview Deletions | PASS | Correct ranking: v5, v4 KEEP; v3, v2, v1 DELETE |

**Version Ranking Verified:**
| Cube URI | Version | Rank | Action |
|----------|---------|------|--------|
| .../cube/version/5 | 5 | 1 | KEEP |
| .../cube/version/4 | 4 | 2 | KEEP |
| .../cube/version/3 | 3 | 3 | DELETE |
| .../cube/version/2 | 2 | 4 | DELETE |
| .../cube/version/1 | 1 | 5 | DELETE |

## Graphs Found

Query: `SELECT DISTINCT ?graph WHERE { GRAPH ?graph { ?s ?p ?o } } LIMIT 10`

Results:
1. `https://test.lindas.admin.ch/test/cubes`
2. `https://lindas.admin.ch/sfoe`

## Key Observations

1. **URL Preservation Fix Works**: The custom Stardog Cloud URL is correctly preserved when switching between Offline and Online modes.

2. **Mode Switching**: Both modes work correctly:
   - Offline Mode: Shows "Download Data" section, allows local/remote triplestore selection
   - Online Mode: Hides "Download Data" section, locks connection to "Remote Server/Cloud", shows caution warning

3. **Connection Dropdown**: In Online mode, the Connection dropdown is disabled (greyed out) since Online mode always uses Remote Server/Cloud.

4. **Query Editor**: Works in both modes with the same Stardog Cloud connection.

5. **Deletion Wizard**: Correctly identifies cube versions and calculates which to keep (newest 2) and delete (older versions).

## Query Template Enhancement

Added triplestore-specific query templates for DELETE operations. The Query Editor now generates different query syntax based on the selected triplestore type.

### Triplestore-Specific Queries

| Template | Stardog | GraphDB | Fuseki |
|----------|---------|---------|--------|
| List Cubes | Standard SPARQL | Standard SPARQL | Standard SPARQL |
| Count Triples | Standard SPARQL | Standard SPARQL | Standard SPARQL |
| Preview Deletions | Standard SPARQL | Standard SPARQL | Standard SPARQL |
| Delete Single Cube | VALUES clause | BIND clause | BIND clause |
| Delete Old Versions | HAVING with subquery | HAVING with subquery | HAVING with subquery |

### Key Differences

**Stardog:**
- Uses `VALUES ?targetCube { <URI> }` for better compatibility
- Requires explicit DELETE and WHERE clauses
- DELETE WHERE shorthand doesn't work with FILTER/subqueries

**GraphDB & Fuseki:**
- Standard SPARQL 1.1 UPDATE syntax
- Uses `BIND(<URI> AS ?targetCube)`
- Full support for subqueries in DELETE

### Code Changes

- **File**: `web-app/public/app.js`
- **Function**: `getQueryTemplates(graphUri, cubeUri, triplestoreType)`
- Now accepts triplestore type parameter
- Returns triplestore-appropriate query templates

## Conclusion

The URL preservation fix is working correctly. All major features of the LINDAS Cube Manager have been tested and verified to work with Stardog Cloud in both Offline and Online modes. Query templates are now triplestore-aware for better compatibility.

## Test Methodology

- Browser automation via Claude in Chrome extension
- Manual verification of each feature
- Screenshot documentation throughout testing
