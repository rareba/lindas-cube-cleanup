# Stardog Deletion Test & Bug Fixes Report

**Date:** 2026-01-30
**Scope:** Bug hunt across all deletion tools, Stardog API testing, metadata backup completeness, API security

---

## Summary

Comprehensive audit of the deletion pipeline uncovered **10 bugs** (3 critical, 4 high, 3 medium) across `sparql.js`, `cleanup.js`, `stardog.js`, and `server.js`. All have been fixed. A dedicated Stardog test script was created. Web app destructive APIs are now toggleable via environment variable.

---

## Bugs Found and Fixed

### CRITICAL

#### Bug #1: SPARQL Injection Vulnerability
- **Files:** `cleanup-service/src/utils/sparql.js`, `web-app/server.js`
- **Description:** All `graphUri` and `cubeUri` parameters were directly interpolated into SPARQL queries via template literals (`<${graphUri}>`). An attacker could craft a URI like `https://evil.org/> DELETE { ?s ?p ?o } WHERE { ?s ?p ?o } #` to execute arbitrary SPARQL UPDATE queries, including dropping all data.
- **Fix:** Added `validateUri()` function that:
  - Requires `https?://` scheme
  - Rejects dangerous characters: `< > " { } | \ ^ \` \n \r \t`
  - Rejects SPARQL keywords (DELETE, INSERT, DROP, CLEAR, etc.) in the URI string
  - Applied to every query function in `sparql.js` (14 functions)
  - Added `validateUriParam()` to `server.js` for web app endpoints

#### Bug #2: Export Query Missing Metadata Types
- **File:** `cleanup-service/src/utils/sparql.js` - `exportCubeQuery()`
- **Description:** The backup CONSTRUCT query used a broad `(<>|!<>)*` property path for shapes which is slow and may not capture all structures. It was missing:
  - Blank node properties attached directly to the cube
  - Individual SHACL PropertyShapes (`sh:property`)
  - RDF list items (`sh:in` lists with `rdf:first`/`rdf:rest` chains)
- **Impact:** Backups would be incomplete - restoring from backup would lose shape definitions and validation constraints.
- **Fix:** Rewrote `exportCubeQuery()` with 7 explicit UNION blocks matching the web app's more complete backup query:
  1. Cube direct properties
  2. Blank node properties
  3. SHACL NodeShapes
  4. SHACL PropertyShapes
  5. RDF Lists (sh:in)
  6. Observation sets
  7. Observations

#### Bug #3: Web App APIs Unprotected
- **File:** `web-app/server.js`
- **Description:** All deletion endpoints (`/api/cubes/delete-observations`, `/api/cubes/delete-observation-links`, `/api/cubes/delete-metadata`, `/api/query/execute` with UPDATE, `/api/fuseki/import`, `/api/triplestore/import`, `DELETE /api/backup/:backupId`) were exposed without any authentication or authorization.
- **Fix:** Added `requireDestructiveAccess` middleware:
  - Controlled by `ENABLE_DESTRUCTIVE_API=true` environment variable (disabled by default)
  - Optional `API_AUTH_TOKEN` for Bearer token authentication
  - Applied to all 7 destructive endpoints
  - `/api/query/execute` with `queryType: 'update'` also gated

### HIGH

#### Bug #4: Metadata Deletion Missing RDF Lists
- **File:** `cleanup-service/src/utils/sparql.js` - `deleteCubeMetadataQuery()`
- **Description:** The metadata deletion query had 5 UNION blocks but was missing the RDF list cleanup block (`sh:in` lists). After deletion, orphaned `rdf:first`/`rdf:rest` chain nodes would remain in the graph.
- **Fix:** Added 6th UNION block for RDF list items, matching the pattern in the web app's delete-metadata endpoint.

#### Bug #5: Stardog Transactions Never Used
- **File:** `cleanup-service/src/cleanup.js` - `processCube()`
- **Description:** The Stardog adapter implemented `beginTransaction()`, `commitTransaction()`, and `rollbackTransaction()` methods, but the cleanup service never called them. A failure partway through the 3-step deletion (e.g., after deleting observations but before deleting metadata) would leave the cube in an inconsistent state.
- **Fix:** Added transaction wrapping in `processCube()`:
  - Detects Stardog adapter via `getType() === 'stardog'`
  - Begins transaction before deletion
  - Commits on success
  - Rolls back on any error during deletion steps

#### Bug #6: `countObservationsQuery` Counts Triples, Not Observations
- **File:** `cleanup-service/src/utils/sparql.js` - `countObservationsQuery()`
- **Description:** Query used `COUNT(*)` on `?obs ?p ?o` which counts all triples of all observations, not the number of distinct observations. If each observation has 5 properties, the count would be 5x the actual observation count.
- **Fix:** Changed to `COUNT(DISTINCT ?obs)` and removed the `?p ?o` triple pattern.

#### Bug #7: `bulkDeleteOldVersions` Skips Backup
- **File:** `cleanup-service/src/cleanup.js` - `bulkDeleteOldVersions()`
- **Description:** This method deletes all old versions in a single SPARQL query without creating any backups. Data is permanently lost with no recovery option.
- **Fix:** Added a prominent warning log message when bulk delete mode is used. The CLI already had a `--bulk` flag description but the risk wasn't surfaced to the user.

### MEDIUM

#### Bug #8: `totalDeleted` Stat Incorrect
- **File:** `cleanup-service/src/cleanup.js` - `deleteCube()`
- **Description:** `totalDeleted` was initialized to `observationCount`, which (after Bug #6 fix) is the count of distinct observations, not triples. This stat was used for `stats.triplesDeleted`, making the reported "triples deleted" inaccurate.
- **Fix:** Changed `totalDeleted` to start at 0. The stat now reflects that we don't have an exact triple count (which would require an additional query before deletion).

#### Bug #9: `versionsToKeep` Not Validated
- **File:** `cleanup-service/src/utils/sparql.js` - `identifyDeletionsQuery()`, `deleteAllOldVersionsQuery()`
- **Description:** `versionsToKeep` parameter was directly interpolated into SPARQL queries without validation. While it's typically a number from config, a non-integer value would produce invalid SPARQL.
- **Fix:** Added `parseInt()` validation with error throw for invalid values.

#### Bug #10: Backup Not Mandatory Before Deletion
- **File:** `cleanup-service/src/cleanup.js` - `processCube()`
- **Description:** When `this.backup` is null/undefined (e.g., `--no-backup` flag or missing config), deletion proceeds silently without any backup.
- **Fix:** Added a warning log when no backup storage is configured but deletion proceeds.

---

## New Files Created

### `cleanup-service/test-stardog-deletion.js`
Comprehensive test script with 4 phases:
1. **Connection & API Tests** - Stardog connectivity, transaction API, URI validation
2. **Query Generation Tests** - Validates all SPARQL query functions produce correct output, checks export query captures all metadata types
3. **Destructive Tests** (opt-in via `ENABLE_DESTRUCTIVE_TEST=true`) - Full deletion lifecycle: insert data, backup, 3-step delete, verify, orphan check, cleanup
4. **API Security Tests** - Verifies web app blocks destructive operations by default

Usage:
```bash
# Dry run (safe, read-only)
node test-stardog-deletion.js

# Full destructive test
ENABLE_DESTRUCTIVE_TEST=true node test-stardog-deletion.js
```

Environment variables:
- `STARDOG_ENDPOINT` - Base URL (default: http://localhost:5820)
- `STARDOG_DATABASE` - Database name (default: testdb)
- `STARDOG_USERNAME` / `STARDOG_PASSWORD` - Credentials (default: admin/admin)
- `ENABLE_DESTRUCTIVE_TEST` - Enable actual deletion testing

---

## API Security Configuration

The web app now supports two environment variables to control destructive operations:

```bash
# Enable deletion endpoints (disabled by default)
ENABLE_DESTRUCTIVE_API=true

# Optional: Require Bearer token for destructive operations
API_AUTH_TOKEN=your-secret-token
```

### Protected Endpoints
| Endpoint | Method | Protection |
|----------|--------|------------|
| `/api/cubes/delete-observations` | POST | `requireDestructiveAccess` |
| `/api/cubes/delete-observation-links` | POST | `requireDestructiveAccess` |
| `/api/cubes/delete-metadata` | POST | `requireDestructiveAccess` |
| `/api/query/execute` (update type) | POST | `ENABLE_DESTRUCTIVE_API` check |
| `/api/triplestore/import` | POST | `requireDestructiveAccess` |
| `/api/fuseki/import` | POST | `requireDestructiveAccess` |
| `/api/backup/:backupId` | DELETE | `requireDestructiveAccess` |

### Behavior When Disabled
Returns HTTP 403 with JSON:
```json
{
  "error": "Destructive API endpoints are disabled",
  "detail": "Set ENABLE_DESTRUCTIVE_API=true environment variable to enable deletion operations",
  "endpoint": "/api/cubes/delete-observations"
}
```

---

## Metadata Backup Completeness

The export/backup CONSTRUCT query now captures **all 7 metadata types**:

| # | Metadata Type | Pattern | Before | After |
|---|--------------|---------|--------|-------|
| 1 | Cube direct properties | `<cube> ?p ?o` | Yes | Yes |
| 2 | Blank node properties | `<cube> ?p1 ?bn . ?bn ?p ?o` | No | Yes |
| 3 | SHACL NodeShapes | `cube:observationConstraint ?shape` | Yes (via path) | Yes (explicit) |
| 4 | SHACL PropertyShapes | `?shape sh:property ?propShape` | Yes (via path) | Yes (explicit) |
| 5 | RDF Lists (sh:in) | `?propShape sh:in ?list . ?list rdf:rest*/rdf:first` | No | Yes |
| 6 | Observation sets | `cube:observationSet ?set` | Yes | Yes |
| 7 | Observations | `cube:observationSet/cube:observation ?obs` | Yes | Yes |

The deletion query (`deleteCubeMetadataQuery`) now also includes RDF list cleanup (item #5), preventing orphaned list nodes.

---

## Stardog-Specific Considerations

1. **Transactions**: The cleanup service now automatically wraps Stardog deletions in transactions (begin/commit/rollback)
2. **Bulk Load**: Uses `POST /{database}?graph-uri={graphUri}` with `application/n-triples` content type
3. **Authentication**: Supports Basic auth (username:password) via config or environment variables
4. **Query Endpoint**: `POST /{database}/query` with `Content-Type: application/sparql-query`
5. **Update Endpoint**: `POST /{database}/update` with `Content-Type: application/sparql-update`
