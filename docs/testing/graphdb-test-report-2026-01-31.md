# GraphDB Test Report - 2026-01-31

## Test Summary

**Tester:** Kilo Code Debug Mode  
**Date:** 2026-01-31  
**GraphDB Version:** 10.8.2 (Docker)  
**Web-App Version:** Current (as of 2026-01-31)  
**Test Duration:** ~30 minutes  

## Prerequisites Status

| Component | Status | Details |
|-----------|--------|---------|
| GraphDB Docker Container | ✅ Running | Container `graphdb-lindas-test` on port 7200 |
| Web-App Server | ✅ Running | Node.js server on port 3001 |
| LINDAS Repository | ✅ Exists | Repository created and contains data |
| SPARQL Endpoint | ✅ Accessible | Direct curl tests successful |

## Issues Discovered

### Issue 1: Triplestore Preset Button Not Updating Dropdown (CRITICAL)

**Description:**  
Clicking the "Use GraphDB" preset button highlights the GraphDB card (blue border) but does NOT update the "Triplestore Type" dropdown from "Apache Fuseki" to "GraphDB".

**Steps to Reproduce:**
1. Open browser to http://localhost:3001
2. Scroll down to see the triplestore preset cards
3. Click "Use GraphDB" button
4. Observe that the card is highlighted but the dropdown still shows "Apache Fuseki"

**Expected Behavior:**  
The preset button should update both the visual card selection AND the Triplestore Type dropdown.

**Actual Behavior:**  
Only the card is highlighted; the form fields are not updated.

**Workaround:**  
Manually click the Triplestore Type dropdown and use keyboard navigation (Arrow Down + Enter) to select GraphDB.

**Severity:** HIGH - Users cannot use the convenient preset buttons.

---

### Issue 2: Create Dataset Button Fails for GraphDB (CRITICAL)

**Description:**  
The "Create Dataset" button returns an error when used with GraphDB. The web-app appears to be calling the wrong API endpoint or expecting the wrong response format.

**Error Message:**
```
Failed to create dataset: Unexpected token '<', "<!DOCTYPE"... is not valid JSON
```

**Root Cause Analysis:**  
The error suggests the web-app is receiving an HTML response (likely an error page) instead of JSON. This indicates:
1. The API endpoint URL for GraphDB repository creation is incorrect
2. The request format doesn't match GraphDB's REST API requirements
3. The response handling assumes JSON but receives HTML

**Expected Behavior:**  
Should create a new repository in GraphDB with the specified name.

**Actual Behavior:**  
Returns a JSON parsing error because it received HTML instead of JSON.

**Workaround:**  
Manually create the repository using GraphDB's REST API:
```bash
curl -X POST http://localhost:7200/rest/repositories \
  -H "Content-Type: application/json" \
  -d '{"id":"lindas","title":"LINDAS Test Repository","type":"graphdb"}'
```

**Severity:** HIGH - Users cannot create new datasets through the UI.

---

### Issue 3: Connection Test Fails with Correct Configuration (MEDIUM)

**Description:**  
After configuring the correct settings (Triplestore Type: GraphDB, Endpoint URL: http://localhost:7200, Repository Name: lindas), the "Test Connection" button still fails with "Connection failed: Could not connect to triplestore".

**Investigation:**
- Direct SPARQL queries to http://localhost:7200/repositories/lindas work correctly
- The repository exists and contains data
- GraphDB container is healthy and responding

**Possible Causes:**
1. CORS issues between web-app and GraphDB
2. The connection test logic may not be constructing the correct URL for GraphDB
3. The test may expect a specific response format that GraphDB doesn't provide

**Code Review Finding:**
In `server.js` line 456, the GraphDB connection test uses:
```javascript
checkUrl = `${base}/rest/repositories`;
```

This should work, but there may be issues with how the base URL is being passed or how the response is parsed.

**Severity:** MEDIUM - Connection cannot be established through the UI, though the backend appears to work.

---

### Issue 4: Documentation/UX Confusion on Endpoint URL Format (LOW)

**Description:**  
The test instructions specify to use `http://localhost:7200/repositories/lindas` as the endpoint, but the web-app expects just `http://localhost:7200` as the base URL (the repository name is handled separately in the "Repository Name" field).

**Expected Documentation:**  
Clear instructions on whether to include the full path or just the base URL.

**Severity:** LOW - Can be worked around once understood.

---

## Test Steps Completed

### Step 1: Connect to GraphDB
- ✅ Opened browser to http://localhost:3001
- ✅ Selected "GraphDB" from triplestore dropdown (workaround required due to Issue 1)
- ✅ Set endpoint: http://localhost:7200
- ✅ Set repository name: lindas
- ❌ Connection test failed (Issue 3)

### Step 2: Test Backup Creation
- ❌ Could not proceed - connection not established

### Step 3: Test Restore
- ❌ Could not proceed - connection not established

### Step 4: Test Import
- ❌ Could not proceed - connection not established

### Step 5: Test Deletion with Orphan Cleanup
- ❌ Could not proceed - connection not established

## Verification Tests

### Direct SPARQL Query Test
```bash
curl -X POST http://localhost:7200/repositories/lindas \
  -H "Content-Type: application/sparql-query" \
  -d "SELECT * WHERE { ?s ?p ?o } LIMIT 1"
```
**Result:** ✅ SUCCESS - Returns data

### Repository Creation Test
```bash
curl -X POST http://localhost:7200/rest/repositories \
  -H "Content-Type: application/json" \
  -d '{"id":"test-repo","title":"Test","type":"graphdb"}'
```
**Result:** ✅ SUCCESS - Repository created (or "already exists" message)

### GraphDB Container Status
```bash
docker ps
```
**Result:** ✅ Container running and healthy

## Recommendations

1. **Fix Preset Button:** Update the JavaScript to properly set the dropdown value when preset buttons are clicked.

2. **Fix Create Dataset:** Update the API call to use GraphDB's correct repository creation endpoint and handle the response properly.

3. **Debug Connection Test:** Add logging to the server.js `checkTriplestoreConnection` function to see the actual URL being called and the response received.

4. **Update Documentation:** Clarify the expected format for endpoint URLs in the UI (base URL vs full path).

5. **Add GraphDB-Specific Testing:** Create automated tests for GraphDB connectivity in the test suite.

## Conclusion

The web-app currently has **critical issues** that prevent it from working correctly with GraphDB:

- The preset buttons don't work properly
- The dataset creation feature fails
- The connection test fails despite the SPARQL endpoint being accessible

**Recommendation:** The web-app needs fixes before it can be reliably used with GraphDB. The core SPARQL functionality appears to work (as verified by direct curl tests), but the UI and connection management have bugs that block normal usage.

## Related Files

- `web-app/server.js` - Contains connection test logic (lines 366-493)
- `web-app/public/app.js` - Contains UI logic for preset buttons
- `web-app/public/index.html` - Connection setup form
