# Stardog Cloud Test Report - 2026-01-31

## Test Overview

**Date:** 2026-01-31  
**Tester:** Automated Browser Testing  
**Test Environment:** Web App (localhost:3001)  
**Target:** Stardog Cloud Instance

## Credentials Used

| Setting | Value |
|---------|-------|
| Endpoint | `https://sd-85766d45.stardog.cloud:5820` |
| Database | `lindas` |
| Username | `gva` |
| Password | `Gund@m123gund@m123` |

*Source: web-app/docs/v2-ui-redesign-2026-01.md*

## Test Results Summary

| Test Step | Status | Notes |
|-----------|--------|-------|
| 1. Connect to Stardog Cloud | **FAILED** | DNS resolution error |
| 2. Backup Creation | SKIPPED | Connection failed |
| 3. Restore | SKIPPED | Connection failed |
| 4. Import | SKIPPED | Connection failed |
| 5. Deletion with Orphan Cleanup | SKIPPED | Connection failed |

## Detailed Test Results

### Step 1: Connect to Stardog Cloud

**Status:** ❌ FAILED

**Configuration Entered:**
- Triplestore Type: Stardog
- Connection: Local Instance (dropdown issue noted)
- Endpoint URL: `https://sd-85766d45.stardog.cloud:5820`
- Database Name: `lindas`
- Username: `gva`
- Password: `********` (masked)

**Error Message (UI):**
```
Connection failed: Connection error: fetch failed
```

**Error Details (Server Console):**
```
Stardog: Connecting to https://sd-85766d45.stardog.cloud:5820 with user gva
Stardog: Listing databases...
Stardog connection error: TypeError: fetch failed
    at node:internal/deps/undici/undici:13510:13
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async checkTriplestoreConnection (c:\Users\gva\repos\lindas-255-delete-cube-versions-except2\web-app\server.js:389:38)
    at async c:\Users\gva\repos\lindas-255-delete-cube-versions-except2\web-app\server.js:1139:24 {
  [cause]: Error: getaddrinfo ENOTFOUND sd-85766d45.stardog.cloud
      at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26) {
    errno: -3008,
    code: 'ENOTFOUND',
    syscall: 'getaddrinfo',
    hostname: 'sd-85766d45.stardog.cloud'
  }
}
```

**Root Cause Analysis:**
The hostname `sd-85766d45.stardog.cloud` cannot be resolved via DNS lookup. This indicates:
1. The Stardog Cloud instance may no longer exist
2. The hostname may have changed
3. The instance may have been deleted or suspended
4. Possible network connectivity issues (though other internet connections work)

**Error Code:** `ENOTFOUND` (DNS resolution failure)

### Step 2-5: Functional Tests

**Status:** ⏭️ SKIPPED

All functional tests (Backup Creation, Restore, Import, Deletion) were skipped because the initial connection test failed. These tests require a valid connection to the triplestore.

## UI Observations

### Positive Observations
1. **Form Validation:** The connection form properly validates and displays error messages
2. **Console Logging:** Server-side logging provides detailed error information
3. **UI Feedback:** Users receive clear visual feedback when connection fails

### Issues Noted
1. **Connection Dropdown:** The "Connection" dropdown (Local Instance vs Remote Server/Cloud) did not reliably update when clicked. This may be a UI bug.
2. **Form State:** Despite the dropdown showing "Local Instance", the form allowed entering a remote URL and credentials, and attempted the connection correctly.

## Conclusion

The Stardog Cloud test instance is **not accessible**. The hostname `sd-85766d45.stardog.cloud` does not resolve, preventing any connection attempts.

### Recommendations

1. **Verify Instance Status:** Check if the Stardog Cloud instance still exists in the Stardog Cloud console
2. **Update Documentation:** If the instance has been deleted, update `web-app/docs/v2-ui-redesign-2026-01.md` with new credentials or remove the test instance reference
3. **Create New Instance:** If needed, create a new Stardog Cloud instance for testing
4. **Fix UI Dropdown:** Investigate the Connection dropdown selection issue

### Alternative Testing

For continued testing, consider:
- Using a local Stardog instance (requires license)
- Using Apache Fuseki (license-free)
- Using GraphDB Free edition
- Creating a new Stardog Cloud instance

## Related Documentation

- [v2-ui-redesign-2026-01.md](./v2-ui-redesign-2026-01.md) - Source of credentials
- [stardog-local-test-report-2026-01-31.md](./stardog-local-test-report-2026-01-31.md) - Local Stardog testing results
- [graphdb-test-report-2026-01-31.md](./graphdb-test-report-2026-01-31.md) - GraphDB testing results
