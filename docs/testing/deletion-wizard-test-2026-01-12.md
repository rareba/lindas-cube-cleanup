# Deletion Wizard Test - 2026-01-12

## Test Summary

Successfully tested the LINDAS Cube Manager Deletion Wizard with Stardog Cloud in Offline mode.

## Test Environment

- **Mode**: Offline Mode with Remote Server / Cloud connection
- **Triplestore**: Stardog Cloud
- **Endpoint**: `https://sd-85766d45.stardog.cloud:5820`
- **Database**: `lindas`
- **Graph URI**: `https://lindas.admin.ch/sfoe`

## Test Data

5 cube versions were inserted for testing:
- `https://example.org/cube/version/5` (v5, 2025-01-01) - Newest
- `https://example.org/cube/version/4` (v4, 2024-06-01)
- `https://example.org/cube/version/3` (v3, 2024-01-01)
- `https://example.org/cube/version/2` (v2, 2023-06-01)
- `https://example.org/cube/version/1` (v1, 2023-01-01) - Oldest

## Deletion Wizard Steps

### Step 1: Select Graph
- Entered graph URI: `https://lindas.admin.ch/sfoe`
- Clicked "Load Graph"
- Successfully loaded 5 cube versions

### Step 2: Explore Cube Versions
- Statistics shown:
  - 1 Base Cube
  - 5 Total Versions
  - 1 Need Cleanup
  - 3 Versions to Delete

### Step 3: Preview Deletions
- Preview showed correct ranking:
  - v5 (Rank 1) - KEEP
  - v4 (Rank 2) - KEEP
  - v3 (Rank 3) - DELETE
  - v2 (Rank 4) - DELETE
  - v1 (Rank 5) - DELETE

### Step 4: Execute Cleanup
- Confirmed deletion by checking the confirmation checkbox
- Clicked "Execute Deletion"

### Step 5: Cleanup Summary
- **Cleanup Complete** at 1/12/2026, 8:32:48 PM
- 3 Versions Deleted (v3, v2, v1)
- 2 Versions Preserved (v5, v4)
- Backups created

## Verification

After cleanup, querying the database confirmed only 2 versions remain:
- `https://example.org/cube/version/5` (v5)
- `https://example.org/cube/version/4` (v4)

The 3 older versions (v3, v2, v1) were successfully deleted.

## Bug Fixes During Testing

### 1. Server Restart Issue
- **Problem**: "Only absolute URLs are supported" error after server restart
- **Solution**: Server needed to be restarted after code changes

### 2. identify-deletions API Response Format
- **Problem**: The `/api/cubes/identify-deletions` endpoint was returning raw SPARQL results instead of processed `toDelete` and `toKeep` arrays
- **Solution**: Updated the endpoint to process SPARQL results and return properly formatted arrays

### 3. Query File Loading Issue
- **Problem**: The loaded query file only returned versions to delete (rank > 2), not all versions
- **Solution**: Rewrote the endpoint to use the list-versions query and calculate ranks server-side

## Code Changes

### server.js
1. Updated `/api/cubes/identify-deletions` endpoint to:
   - Get ALL versions using the list-versions query
   - Group versions by base cube
   - Calculate ranks (1-based, sorted by version descending)
   - Split into `toDelete` (rank >= 3) and `toKeep` (rank <= 2) arrays

## Query Editor Test

### Test Setup
After the Deletion Wizard test, reloaded the 5 cube versions via API to test the Query Editor functionality.

### Bug Fix: Query Editor Field Names
- **Problem**: Query Editor failed with "Only absolute URLs are supported" error
- **Cause**: Frontend sends `baseUrl`/`database` but `/api/query/execute` expected `endpoint`/`dataset`
- **Solution**: Updated server to accept both field naming conventions

### SELECT Query Test
- Query: `PREFIX cube: <https://cube.link/> SELECT ?cube WHERE { GRAPH <https://lindas.admin.ch/sfoe> { ?cube a cube:Cube } }`
- Result: Successfully returned 5 cube versions (702ms)

### DELETE with REGEX Test
- Query:
```sparql
DELETE {
  GRAPH <https://lindas.admin.ch/sfoe> {
    ?cube ?p ?o .
  }
}
WHERE {
  GRAPH <https://lindas.admin.ch/sfoe> {
    ?cube a <https://cube.link/Cube> .
    FILTER(REGEX(STR(?cube), "/version/[123]$"))
    ?cube ?p ?o .
  }
}
```
- Result: Successfully deleted versions 1, 2, and 3
- Verification: SELECT query confirmed only version/4 and version/5 remain (2 results)

### Stardog SPARQL Syntax Note
Stardog requires separate DELETE and WHERE clauses. The shorthand `DELETE WHERE { ... }` syntax with FILTER does not work.

## Second Test Run (9:45 PM)

### Test Setup
Reloaded 5 cube versions via API after the previous Query Editor DELETE test.

### Deletion Wizard Execution
- Step 1: Loaded graph `https://lindas.admin.ch/sfoe` - found 5 cube versions
- Step 2: Statistics showed 1 base cube, 5 versions, 3 to delete
- Step 3: Preview confirmed correct ranking (KEEP v5, v4; DELETE v3, v2, v1)
- Step 4: Confirmed and executed deletion
- Step 5: **Cleanup Complete** at 1/12/2026, 9:45:36 PM

### Results
- **3 Versions Deleted**: v3, v2, v1
- **2 Versions Preserved**: v5, v4
- Backups created and available for 7 days

### Verification Query
```sparql
PREFIX cube: <https://cube.link/>
SELECT ?cube WHERE {
  GRAPH <https://lindas.admin.ch/sfoe> {
    ?cube a cube:Cube
  }
}
```
- Result: **2 results** (991ms)
  - `.../cube/version/4`
  - `.../cube/version/5`

## Conclusion

The Deletion Wizard workflow works correctly:
1. Connects to Stardog Cloud in Offline mode
2. Loads graph data from the remote triplestore
3. Correctly identifies versions to keep (newest 2) and delete (older ones)
4. Successfully deletes the older versions
5. Preserves the newest 2 versions
6. Creates backups before deletion

The Query Editor also works correctly:
1. SELECT queries execute and return results
2. DELETE queries with REGEX patterns work with Stardog (using proper syntax)
3. Both query types properly connect to the configured Stardog Cloud endpoint

Both test runs (8:32 PM and 9:45 PM) confirmed the full workflow operates as expected.

## Query Editor Bug Fixes (10:00 PM)

### Issues Found
1. **Graph/Cube Browse buttons not loading data**: API endpoints `/api/query/graphs` and `/api/query/cubes` returned 500 errors
2. **SPARQL query not fully displayed**: "Delete Old Versions" template only showed placeholder comments

### Root Cause Analysis
- Frontend sends `baseUrl` and `database` fields
- Server endpoints expected `endpoint` and `dataset` fields
- Field name mismatch caused URL construction failures

### Fixes Applied

**server.js:**
- `/api/query/graphs`: Accept both `endpoint`/`baseUrl` and `dataset`/`database`
- `/api/query/graphs`: Return proper `{ graphs: [...] }` response format
- `/api/query/cubes`: Accept both field naming conventions
- `/api/query/cubes`: Return proper `{ cubes: [...] }` response format

**app.js:**
- `delete-old-versions` template: Replaced placeholder with full SPARQL query including:
  - Warning comments
  - PREFIX declarations
  - Stardog-specific syntax notes
  - Complete DELETE/WHERE clause structure
  - UNION patterns for cube and related data

### Verification
- Graph dropdown loads: `https://lindas.admin.ch/sfoe`, `https://test.lindas.admin.ch/test/cubes`
- Cube dropdown loads: `.../cube/version/4`, `.../cube/version/5`
- Full query logic displayed in SPARQL Query textarea
