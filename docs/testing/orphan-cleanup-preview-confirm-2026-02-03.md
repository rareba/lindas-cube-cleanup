# Orphan Cleanup: Preview + Confirm Flow

**Date:** 2026-02-03

## Problem

The orphan cleanup ran blindly after deletion - it detected and deleted orphans in one shot without showing the user what would be removed or how many triples were affected. There was no opportunity to review before cleanup, and no counts were returned after cleanup.

## Changes Made

### 1. Server: `/api/orphans/cleanup` now returns removal statistics

**File:** `web-app/server.js`

Before this change, the cleanup endpoint ran the two DELETE queries (observation sets, shapes) and returned `{ success: true }`.

Now it:
- Counts orphans before deletion using `findOrphansSummaryQuery()`
- Runs the two DELETE queries (observation sets, shapes)
- Counts orphans again after deletion
- Calculates the difference per orphan type
- Returns: `{ success, message, removed: { ObservationSet: N, NodeShape: N, ... }, totalRemoved: N }`

### 2. Frontend: Detect -> Preview -> Confirm flow

**File:** `web-app/public/app.js`

Replaced the auto-cleanup block with an interactive flow:

1. After deletion completes, calls `/api/orphans/detect` to count orphans
2. Displays results in the wizard log:
   - "Found N orphan observation sets, N orphan node shapes, N orphan property shapes"
   - Or "No orphan triples found - graph is clean"
3. If orphans exist, shows "Clean Up Orphans" and "Skip Cleanup" buttons
4. On "Clean Up Orphans" click: calls `/api/orphans/cleanup`, logs returned removal counts
5. On "Skip Cleanup" click: proceeds to summary without cleanup

Added `waitForOrphanCleanupDecision()` helper that returns a Promise resolved by the user clicking one of the two buttons.

### 3. HTML: Orphan cleanup action buttons

**File:** `web-app/public/index.html`

Added a hidden button group in the Step 4 (Execute Cleanup) area, below the deletion log:
- "Clean Up Orphans" button (styled as danger/red, same as Execute Deletion)
- "Skip Cleanup" button (styled as secondary, same as Back)

These buttons are shown only when orphans are detected after deletion, and hidden again after the user makes a choice.

### 4. Fix orphan SPARQL queries for Stardog compatibility

**File:** `web-app/server.js`

All four orphan query functions were restructured to fix `IllegalArgumentException` / `SkipLookupMinusOp` errors on Stardog. The issue was that `FILTER NOT EXISTS` combined with `BIND` inside `UNION` blocks causes Stardog's query optimizer to fail.

**Fix:** Moved the `FILTER NOT EXISTS` patterns into subqueries (`SELECT` subqueries) so that Stardog's MINUS operator does not interact with `BIND` or `UNION` at the same scope level.

Functions fixed:
- `findOrphansSummaryQuery()` - Each orphan type uses a separate `SELECT` subquery combined with `UNION`
- `deleteOrphanObservationSetsQuery()` - Orphan set identification wrapped in a subquery
- `deleteOrphanShapesQuery()` - NodeShape/PropertyShape identification wrapped in a subquery
- `constructOrphanObservationSetsQuery()` - Backup CONSTRUCT uses subquery for orphan set identification
- `constructOrphanShapesQuery()` - Backup CONSTRUCT uses subquery for orphan shape identification

Tested against Stardog TEST (`stardog-test.cluster.ldbar.ch`) - all queries now execute without errors.

## Rationale

- Users should always know what orphan data exists before it gets deleted
- Provides transparency: exact counts of each orphan type are shown
- Gives the user explicit control: they can choose to skip cleanup if they want to investigate manually first
- Cleanup endpoint now returns useful statistics for logging and reporting
- Orphan queries must work across all supported triplestores (Fuseki, Stardog, GraphDB)
