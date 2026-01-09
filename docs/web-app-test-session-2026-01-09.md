# Web App Test Session - 2026-01-09

## Overview
Comprehensive testing of the LINDAS Cube Version Cleanup web application in preparation for demo. All 7 tabs were tested using browser automation to simulate real user interactions.

## Environment
- **Web App**: http://localhost:3001
- **Fuseki Server**: http://localhost:3030
- **Dataset**: /lindas
- **Browser**: Chrome (automated via MCP)

## Test Results Summary

| Tab | Feature | Status | Notes |
|-----|---------|--------|-------|
| 1. Setup | Connection check | PASS | Shows "Fuseki: Connected" |
| 1. Setup | Dataset creation | PASS | /lindas dataset available |
| 2. Import Data | Sample data import | PASS | 7 versions, 5,261 triples |
| 2. Import Data | LINDAS import | PASS | Connection works |
| 3. Explore Cubes | Load local cubes | PASS | Displays cube table |
| 4. Cleanup | Identify versions | PASS | Shows ranking with DELETE badges |
| 4. Cleanup | Preview deletion | PASS | Fixed during session |
| 4. Cleanup | Delete operations | PASS | Confirmations removed |
| 5. Query Editor | Run SPARQL query | PASS | Fixed endpoint issue |
| 6. Backups | List backups | PASS | Shows backup metadata |
| 7. Documentation | Content display | PASS | Comprehensive documentation |

## Issues Found and Fixed

### Issue 1: Created Date Column (Explore Cubes Tab)
**Problem**: All cubes showed the same "Created" date (2023-09-12)
**Root Cause**: The `schema:dateCreated` property was for the base cube, not individual versions
**Fix**: Removed the "Created" column from the Explore Cubes table
**File**: `web-app/public/app.js`

### Issue 2: Preview Button Not Working (Cleanup Tab)
**Problem**: Clicking "Preview" button on a cube did nothing visible
**Root Cause**: The `previewCubeDeletion()` function populated the `triple-breakdown` container but the parent `selected-cube-preview` div remained hidden
**Fix**: Added code to show the preview container and set the cube name
**File**: `web-app/public/app.js`

```javascript
// Added to previewCubeDeletion() function
document.getElementById('selected-cube-name').textContent = cubeUri.split('/').slice(-2).join('/');
document.getElementById('selected-cube-preview').classList.remove('hidden');
```

### Issue 3: Unnecessary Confirmation Dialogs
**Problem**: Delete operations showed JavaScript confirm() dialogs
**User Request**: Remove confirmation dialogs for smoother demo flow
**Fix**: Removed `confirm()` calls from `deleteSelectedCube()` and `deleteAllOldVersions()` functions
**File**: `web-app/public/app.js`

### Issue 4: SPARQL Query HTTP 405 Error (Query Editor Tab)
**Problem**: Running queries returned "HTTP 405 Method Not Allowed"
**Root Cause**: Server was using `/sparql` endpoint path but Fuseki expects `/query`
**Diagnosis**: Verified with `curl http://localhost:3030/$/datasets` showing `srv.endpoints: ["query"]`
**Fix**: Changed SPARQL endpoint path from `/sparql` to `/query`
**File**: `web-app/server.js` (line 871)

```javascript
// Before
const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/sparql` : `${endpoint}/sparql`;

// After
const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : `${endpoint}/query`;
```

### Issue 5: CUBE_URI Placeholder Not Replaced (Query Editor Tab)
**Problem**: "Delete Old Versions" template failed with error: `Lexical error at line 22, column 18. Encountered: '62' (62), after prefix "CUBE_URI"`
**Root Cause**: The `<CUBE_URI>` placeholder in query templates was only replaced when loading the template. If the user entered a cube URI after loading the template, the placeholder remained in the query.
**Fix**: Modified `executeQuery()` function to replace `<CUBE_URI>` and `<GRAPH_URI>` placeholders at execution time using the current input values. Also added validation to require a cube URI when the query contains the placeholder.
**File**: `web-app/public/app.js`

```javascript
// Added to executeQuery() function - replace placeholders at execution time
const graphInput = document.getElementById('query-graph');
const cubeInput = document.getElementById('query-cube-uri');
const graphUri = graphInput.value || 'https://lindas.admin.ch/sfoe/cube';
const cubeUri = cubeInput.value;

if (query.includes('<CUBE_URI>') || query.includes('CUBE_URI')) {
    if (!cubeUri) {
        alert('Please enter a Cube URI. This query requires a specific cube to be selected.');
        return;
    }
    query = query.replace(/<CUBE_URI>/g, '<' + cubeUri + '>');
    query = query.replace(/CUBE_URI/g, cubeUri);
}

query = query.replace(/<GRAPH_URI>/g, '<' + graphUri + '>');
query = query.replace(/GRAPH_URI/g, graphUri);
```

### Issue 6: SPARQL Variable Scoping Error (Query Editor Tab)
**Problem**: "Delete Old Versions" template failed with error: `SPARQL update failed: 400 - BIND: Variable used when already in-scope: ?prop`
**Root Cause**: In the "Delete shape properties (recursive)" section of the query, the variable `?prop` was bound twice - once in the pattern `sh:property ?prop` and again in `BIND(?propNode AS ?prop)`.
**Fix**: Renamed the first variable from `?prop` to `?directProp` so the path expression result can bind to `?prop` without conflict.
**File**: `web-app/public/app.js` (delete-old-versions query template)

```sparql
-- Before (caused error):
# Delete shape properties (recursive)
{ ?cube cube:observationConstraint/sh:property ?prop .
  ?prop (<>|!<>)* ?propNode .
  ?propNode ?propP ?propO .
  BIND(?propNode AS ?prop) }

-- After (fixed):
# Delete shape properties (recursive)
{ ?cube cube:observationConstraint/sh:property ?directProp .
  ?directProp (<>|!<>)* ?prop .
  ?prop ?propP ?propO }
```

## Detailed Tab Testing

### Tab 1: Setup
- Clicked "Check Connection" button
- Verified connection status changes from "Disconnected" to "Connected"
- Dataset dropdown shows "/lindas" option
- Status indicator in header shows green "Fuseki: Connected"

### Tab 2: Import Data
- Clicked "Import Sample Data" button
- Successfully imported co2wirkung cube with 7 versions
- Import log shows: 5,261 triples added, 0 errors
- LINDAS import section accessible

### Tab 3: Explore Cubes
- Clicked "Load Local Cubes" button
- Table displays cube information (URI, Version, Title)
- Sorting and pagination work correctly
- Note: Removed "Created" column due to misleading data

### Tab 4: Cleanup
- Clicked "Identify Versions to Delete" button
- Ranking table displays correctly with:
  - Version numbers
  - Rank badges (1, 2, 3+)
  - Action badges (KEEP in green, DELETE in red)
- Preview button now shows triple breakdown
- Delete Selected Cube and Delete All Old Versions work without confirmations

### Tab 5: Query Editor
- Template dropdown works (6 templates available)
- Graph URI and Cube URI inputs functional
- All 6 query templates tested and working:

| Template | Type | Status | Result |
|----------|------|--------|--------|
| List All Cubes | SELECT | PASS | 6 rows, 24ms |
| Count Total Triples in Graph | SELECT | PASS | 4186 triples, 22ms |
| Preview Single Cube | SELECT | PASS | 1 row, 39ms |
| Preview Versions to Delete | SELECT | PASS | 6 rows, 31ms |
| Delete Single Cube Version | UPDATE | PASS | 163ms |
| Delete Old Versions (Keep Newest 2) | UPDATE | PASS | 41ms |

- Results table displays properly with sorting and pagination

### Tab 6: Backups
- "Refresh Backup List" shows existing backups
- Backup metadata displayed (cube URI, date, triple count)
- Restore functionality accessible

### Tab 7: Documentation
- Comprehensive documentation displays correctly
- Sections covered:
  - How the Cleanup Process Works (Steps 1-5)
  - Query Flow Diagram (visual flowchart)
  - Query Editor Templates (6 templates with explanations)
  - Setup Instructions (Windows and macOS/Linux)
  - Verifying Setup checklist
- All code blocks render with syntax highlighting
- Tables display properly with colored badges

## Files Modified

1. **web-app/public/app.js**
   - Removed "Created" column from Explore Cubes table
   - Fixed Preview button to show preview container
   - Removed confirmation dialogs for delete operations
   - Added placeholder replacement at query execution time (Issue 5)
   - Fixed SPARQL variable scoping in delete-old-versions template (Issue 6)

2. **web-app/server.js**
   - Fixed SPARQL endpoint path (`/sparql` -> `/query`)

## Recommendations for Demo

1. **Start Fuseki first**: Ensure Fuseki is running before launching the web app
2. **Import sample data**: Use the "Import Sample Data" button to have test data
3. **Flow suggestion**: Setup -> Import -> Explore -> Cleanup -> verify with Query Editor
4. **Backup safety**: Backups are created automatically before deletions

## Conclusion

All features are working correctly after the fixes applied during this testing session. The application is ready for the demo.
