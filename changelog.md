# Changelog

All notable changes to the LINDAS Cube Version Cleanup Tool are documented in this file.

## [2026-02-18] - Bug Fixes: API Contracts, Security, and Reliability

### Fixed

- **`/api/lindas/all-graphs` response contract**: Endpoint now returns `{ graphs: [{ uri }] }`
  instead of raw SPARQL JSON, matching what the frontend expects. Load Graphs feature
  now works correctly.

- **`/api/lindas/cubes` response contract**: Endpoint now returns `{ cubes: [{ cube, title, version, baseCube, dateCreated }] }`
  instead of raw SPARQL JSON. Download All Cubes feature now works correctly.

- **Download-import field name mismatch**: Frontend now correctly reads `downloadResult.triples`
  (was `downloadResult.ntriples`), fixing the cube download-and-import pipeline.

- **Configurable `versionsToKeep` now respected server-side**: Both `/api/cubes/count-versions`
  and `/api/cubes/identify-deletions` now accept and use the `versionsToKeep` parameter
  from the frontend instead of hardcoding `2`.

- **Backup cleanup pattern**: `cleanupOldBackups()` now correctly matches files starting
  with `backup_` (was looking for `_backup_` which never matched). Old backups are now
  properly cleaned up after the retention period.

- **SPARQL injection via `searchTerm`**: The `/api/lindas/graphs` endpoint now escapes
  backslash and double-quote characters in the search term before interpolating into SPARQL.

- **SPARQL injection via `offset`/`limit`**: The `/api/lindas/download-graph` endpoint
  now validates `offset` and `limit` as non-negative integers before use in SPARQL.

- **Missing auth guards on restore/import endpoints**: Added `requireDestructiveAccess`
  middleware to `/api/backup/restore`, `/api/backup/import`, and `/api/backup/restore-to`.
  These endpoints now correctly respect `ENABLE_DESTRUCTIVE_API` and `API_AUTH_TOKEN`.

- **Orphan cleanup wizard hang**: `waitForOrphanCleanupDecision()` now resolves
  immediately with `skip` if no buttons exist in the DOM, and includes a 5-minute
  safety timeout to prevent permanent promise hang.

- **Dataset creation parameter injection**: `datasetName` is now URL-encoded with
  `encodeURIComponent()` in both legacy and current Fuseki dataset creation endpoints.
  Legacy endpoint also validates that `endpoint` is a localhost URL to prevent SSRF.

## [2026-02-15] - Orphan Shape Wizard Integration

### Added

- **Backend API endpoints for orphan shapes**:
  - `POST /api/orphans/shapes/count` - Returns precise orphan shape count and total
    triple count using the comprehensive query 14 pattern.
  - `POST /api/orphans/shapes/list` - Returns individual orphan shapes with details
    (shape URI, type, property shape count, estimated triples) using query 11 pattern.
  - `POST /api/orphans/shapes/preview` - Returns CONSTRUCT triples showing exactly
    what would be deleted, using the comprehensive query 12 pattern.

- **Wizard "Preview Orphan Triples" button**: Users can now preview the exact triples
  that will be deleted before confirming orphan shape cleanup. Shows a sample of the
  first 10 triples in the deletion log.

- **Shape-specific verification after cleanup**: The cleanup endpoint now runs query 14
  after deletion to verify that remaining orphan shape count is 0, reporting detailed
  verification results (shapes removed, triples cleaned, remaining count).

- **Orphan shape cleanup results in wizard summary**: Step 5 summary now shows
  "Orphan Shapes Cleaned" and "Orphan Triples Removed" stats alongside cube deletion
  metrics.

- **Query editor templates**: Added "Count Orphan Shapes (Query 14)", "Find Orphan
  Shapes - Details (Query 11)", and "Delete Orphan Shapes (Query 13)" to the query
  editor template dropdown for manual execution.

- **Deletion report export**: The JSON export now includes an `orphanCleanup` section
  with `performed`, `shapesCleaned`, and `shapeTriplesCleaned` fields.

### Changed

- **`constructOrphanShapesQuery()`**: Replaced with comprehensive version matching
  query 12 - now captures property shape triples, RDF list nodes, and incoming
  references (previously only captured direct shape triples).

- **`deleteOrphanShapesQuery()`**: Replaced with comprehensive version matching
  query 13 - now deletes the full nested structure including property shapes, RDF
  list nodes (sh:in value lists), and incoming references. Uses `GRAPH` clause with
  BIND pattern for Stardog compatibility.

- **`/api/orphans/detect` endpoint**: Now also returns shape-specific counts
  (`shapes.orphanShapeCount` and `shapes.orphanShapeTriples`) from query 14,
  in addition to the existing general summary.

- **`/api/orphans/cleanup` endpoint**: Now runs shape count verification (query 14)
  before and after cleanup. Returns a `verification` object with `remainingOrphanShapes`,
  `remainingOrphanShapeTriples`, `shapesRemoved`, and `shapeTriplesCleaned`.

- **Wizard Step 4 orphan flow**: Enhanced from simple detect-and-delete to a full
  workflow: detect -> show shape-specific details -> preview (optional) -> cleanup ->
  verify. Three buttons are now shown: "Preview Orphan Triples", "Clean Up Orphans",
  and "Skip Cleanup".

- **`waitForOrphanCleanupDecision()`**: Now handles three choices (preview, cleanup,
  skip) instead of two (cleanup, skip).

## [2026-02-15] - Orphan Shape Queries

### Added

- **Query 11 - find-orphan-shapes.rq**: SELECT query that discovers SHACL NodeShapes
  in a graph that are not referenced by any remaining cube via `cube:observationConstraint`.
  Reports each orphan shape with its property shape count and estimated triple count.

- **Query 12 - preview-orphan-shape-triples.rq**: CONSTRUCT query that returns the
  complete set of triples belonging to orphan shapes. Produces exactly the triples
  that query 13 would delete. Can be saved as a backup before deletion.

- **Query 13 - delete-orphan-shapes.rq**: DELETE query that removes all orphan shapes
  and their full nested structure: shape direct triples, property shapes, RDF list
  nodes (sh:in value lists), and incoming references. Uses BIND pattern for Stardog
  compatibility, matching the style of existing queries 06 and 09.

- **Query 14 - count-orphan-shapes.rq**: Summary SELECT query that returns the total
  count of orphan shapes and total orphan triples. Useful for quick impact assessment
  before and after cleanup (post-cleanup should return 0).

- **Query 15 - preview-single-orphan-shape.rq**: Parameterized SELECT query that shows
  all triples for a specific orphan shape, categorized by type (shape-direct,
  shape-incoming, property-shape, rdf-list-node). For detailed inspection of
  individual orphan shapes.

- **Universal versions**: All five new queries (11-15) also added to `queries/universal/`
  with `GRAPH_URI` placeholder for use with any LINDAS graph.

- **docs/architecture/orphan-shapes-solution.md**: Technical documentation explaining
  the orphan shapes problem, the data model, the solution approach, and execution steps.

### Changed

- **docs/architecture/query-reference.md**: Added documentation for queries 11-15 and
  a new "Full Cleanup" execution order section that includes orphan shape cleanup
  as a post-deletion step.

- **docs/architecture/solution-overview.md**: Added orphan shape cleanup description,
  updated cube structure documentation to detail SHACL shape relationships, and updated
  the file structure listing to include new queries.

## [2026-02-03] - Initial Tool

### Added

- Queries 01-10 for cube version discovery, preview, and deletion
- Universal parameterized query versions
- Web application for interactive usage
- Docker configuration
- Documentation (solution overview, query reference, execution log, data analysis)
- Test data setup and execution reports
