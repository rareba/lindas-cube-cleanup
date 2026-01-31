# Web-App Testing Report with Stardog - 2026-01-31

## Executive Summary

This report documents the testing of the web-app with Stardog and other triplestores. **Stardog could not be tested** due to a missing license file. A **UI bug was discovered** that prevents switching between triplestore types.

## Test Environment

- **Date**: 2026-01-31
- **Web-App URL**: http://localhost:3001
- **Test Mode**: Debug/Development
- **Tester**: Automated testing via browser automation

## Test Results Summary

| Test Scenario | Status | Notes |
|---------------|--------|-------|
| Stardog Connection | ⚠️ BLOCKED | License file missing |
| GraphDB Connection | ❌ FAILED | UI bug prevents type selection |
| UI Triplestore Selection | ❌ BUG FOUND | Dropdown and preset buttons not working |
| Web-App Startup | ✅ PASSED | Server runs correctly on port 3001 |
| GraphDB Docker | ✅ RUNNING | GraphDB available on port 7200 |

---

## 1. Stardog Setup Status

### Prerequisites Check

✅ **Docker**: Available and working  
❌ **Stardog License**: **MISSING** - Required to run Stardog  
⚠️ **Stardog Container**: Not running (no license)  

### License File Location Expected At

```
web-app/stardog-setup/stardog-license-key.bin
```

### How to Obtain Stardog License

1. Visit https://www.stardog.com/get-started/
2. Click "Get Stardog Free" or "Request Trial License"
3. Fill out the registration form
4. Download the license file (`stardog-license-key.bin`)
5. Place it in `web-app/stardog-setup/` directory

### Starting Stardog (After License is Obtained)

**Windows (PowerShell):**
```powershell
cd web-app/stardog-setup
.\start-stardog.ps1
```

**Linux/macOS:**
```bash
cd web-app/stardog-setup
./start-stardog.sh
```

**Manual Docker:**
```bash
docker run -d --name stardog -p 5820:5820 \
  -v "$(pwd)/stardog-license-key.bin:/var/opt/stardog/stardog-license-key.bin" \
  -v stardog-data:/var/opt/stardog \
  stardog/stardog:latest

# Create lindas database
docker exec stardog stardog-admin db create -n lindas
```

---

## 2. UI Bug Discovered: Triplestore Type Selection

### Bug Description

**Severity**: High  
**Component**: Connection Setup Page  
**Affected Elements**:
- Triplestore Type dropdown (`#triplestore-type`)
- "Use Stardog" preset button
- "Use GraphDB" preset button  
- "Use Fuseki" preset button

### Expected Behavior

1. Clicking the "Triplestore Type" dropdown should allow selection of:
   - Apache Fuseki
   - Stardog
   - GraphDB
2. Clicking preset buttons ("Use Stardog", "Use GraphDB", "Use Fuseki") should:
   - Update the triplestore type
   - Update the endpoint URL to the default for that type
   - Show/hide relevant fields (dataset name, auth, etc.)

### Actual Behavior

1. **Dropdown Selection**: Clicking on dropdown options (Stardog/GraphDB) does **not** update the selection
2. **Preset Buttons**: Clicking preset buttons does **not** change the triplestore type
3. **UI State**: The form remains stuck on "Apache Fuseki" regardless of user interaction
4. **Connection Test**: Fails because wrong adapter is used (Fuseki adapter trying to connect to GraphDB/Stardog endpoint)

### Root Cause Analysis

Looking at [`app.js`](web-app/public/app.js:268-277):

```javascript
// Line 268-271
const typeSelect = document.getElementById('triplestore-type');
if (typeSelect) {
    typeSelect.addEventListener('change', updateConnectionUI);
}
```

The `change` event listener is attached, but the dropdown value is not being updated when options are clicked. This could be due to:

1. Event propagation issues
2. The dropdown HTML structure
3. CSS conflicts preventing proper selection

### Impact

- **Cannot test Stardog** even if license is available
- **Cannot test GraphDB** (which is running)
- Users cannot switch between triplestore types
- Only Fuseki (default) can be used

### Workaround

Manually editing the endpoint URL is not sufficient - the `type` field in the connection config determines which server-side adapter is used. The UI bug must be fixed.

---

## 3. GraphDB Test (Alternative to Stardog)

### GraphDB Status

✅ **Docker Container**: Running on port 7200  
✅ **Health Check**: Responding with HTTP 200  
❌ **Web-App Connection**: Blocked by UI bug  

### GraphDB Docker Compose

GraphDB was started using:
```bash
docker-compose -f docker-compose.graphdb.yml up -d
```

### Connection Details (What Would Be Used)

- **Endpoint**: http://localhost:7200
- **Type**: GraphDB
- **Repository**: test (default)
- **Auth**: Not required for local instance

### Test Attempt

1. ✅ Opened web-app at http://localhost:3001
2. ✅ Navigated to Connection Setup
3. ❌ Attempted to select "GraphDB" from dropdown - **FAILED**
4. ❌ Attempted to click "Use GraphDB" button - **FAILED**
5. ⚠️ Manually entered GraphDB endpoint (http://localhost:7200)
6. ❌ Test Connection failed - using wrong adapter (Fuseki)

---

## 4. Web-App Server Status

### Server Startup

✅ **Status**: Running successfully  
✅ **Port**: 3001  
✅ **Dependencies**: All installed (npm install completed)

### Console Output

```
[Security] API auth token: NOT SET (no auth required when destructive API is enabled)
LINDAS Cube Cleanup Demo Server running on http://localhost:3001
Fuseki expected at: http://localhost:3030
LINDAS endpoint: https://lindas.admin.ch/query
Backup directory: c:\Users\gva\repos\lindas-255-delete-cube-versions-except2\web-app\backups
Backup retention: 7 days
```

---

## 5. Recommendations

### Immediate Actions Required

1. **Fix UI Bug** (Priority: HIGH)
   - Debug triplestore type dropdown selection
   - Fix preset button click handlers
   - Ensure `state.triplestoreType` is updated correctly

2. **Stardog Setup** (Priority: MEDIUM)
   - Obtain Stardog trial license
   - Place license file in `web-app/stardog-setup/`
   - Start Stardog using provided scripts

3. **Re-test After Fixes**
   - Test Stardog connection
   - Test GraphDB connection
   - Run full test scenarios (backup, restore, deletion)

### Code Investigation Notes

The issue appears to be in the event handling. The `applyPreset` function at line 412 should work:

```javascript
function applyPreset(preset) {
    const typeSelect = document.getElementById('triplestore-type');
    const connectionMode = document.getElementById('connection-mode');

    if (typeSelect) typeSelect.value = preset;
    if (connectionMode) connectionMode.value = 'local';

    updateConnectionUI();
}
```

But the preset buttons may not be triggering this function, or the DOM elements may have different IDs than expected.

---

## 6. Test Scenarios Not Executed

Due to the UI bug and missing Stardog license, the following test scenarios could not be completed:

### Connection Test
- ❌ Connect to Stardog instance
- ❌ Verify connection works
- ❌ List cubes if any exist

### Backup Creation Test
- ❌ Create a backup with default options (metadata=true, orphans=true)
- ❌ Verify ZIP file is created in web-app/exports/
- ❌ Check manifest.json contains correct flags
- ❌ Check orphans.nt exists if orphans were found

### Restore Test
- ❌ Restore the created backup
- ❌ Verify data is restored correctly
- ❌ Check metadata is restored if included
- ❌ Check orphans are restored if included

### Import Test
- ❌ Use the import button to upload a ZIP file
- ❌ Verify upload works
- ❌ Verify import to triplestore works

### Deletion with Orphan Cleanup Test
- ❌ Delete a cube with orphan cleanup enabled
- ❌ Verify cube is deleted
- ❌ Verify orphans are cleaned up

---

## 7. Files and Resources

### Documentation
- `web-app/stardog-setup/README.md` - Stardog setup instructions
- `web-app/docs/comprehensive-review-report-2026-01-31.md` - Previous review

### Scripts
- `web-app/stardog-setup/start-stardog.ps1` - Windows Stardog starter
- `web-app/stardog-setup/start-stardog.sh` - Linux/macOS Stardog starter
- `docker-compose.graphdb.yml` - GraphDB Docker setup

### Web-App Code
- `web-app/public/app.js` - Frontend code with UI bug
- `web-app/server.js` - Backend server

---

## 8. Conclusion

The web-app **cannot be fully tested with Stardog** at this time due to:

1. **Missing Stardog License** - A license file is required to run Stardog
2. **UI Bug** - The triplestore type selection is broken, preventing connection to any non-Fuseki triplestore

### Next Steps

1. Fix the UI bug in `app.js` related to triplestore type selection
2. Obtain a Stardog trial license
3. Re-run the full test suite with Stardog
4. As an alternative, test with GraphDB (once UI bug is fixed) which doesn't require a license

---

*Report generated: 2026-01-31*  
*Test environment: Windows 11, Docker Desktop, Node.js*
