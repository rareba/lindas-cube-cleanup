# Web Application Test Session - 2026-01-08

## Test Summary

**Date**: 2026-01-08
**Environment**: Local Apache Fuseki (localhost:3030)
**Dataset**: lindas
**Graph**: https://lindas.admin.ch/sfoe/cube
**Test Cube**: bfe_ogd18_gebaeudeprogramm_co2wirkung

### Deletion Results

| Metric | Before Deletion | After Deletion | Change |
|--------|-----------------|----------------|--------|
| Total Cube Versions | 7 | 2 | -5 versions |
| Versions Kept | - | v7, v6 | Newest 2 |
| Versions Deleted | - | v5, v4, v3, v2, v1 | Oldest 5 |

### Deleted Cube Versions

The following cube versions were successfully deleted from the local Fuseki instance:

1. **Version 5** - `https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/5`
   - Rank: 3 (third newest)
   - Action: DELETE

2. **Version 4** - `https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/4`
   - Rank: 4
   - Action: DELETE

3. **Version 3** - `https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/3`
   - Rank: 5
   - Action: DELETE

4. **Version 2** - `https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/2`
   - Rank: 6
   - Action: DELETE

5. **Version 1** - `https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/1`
   - Rank: 7 (oldest)
   - Action: DELETE

### Preserved Cube Versions

The following versions were preserved (newest 2):

1. **Version 7** - `https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/7`
   - Rank: 1 (newest)
   - Created: 2023-09-12
   - Title: Gebaeudeprogramm - CO2-Wirkungen je Massnahmenbereich

2. **Version 6** - `https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/6`
   - Rank: 2 (second newest)
   - Created: 2023-09-12
   - Title: Gebaeudeprogramm - CO2-Wirkungen je Massnahmenbereich

## Deletion Process Log

The web application executed the deletion in the following sequence for each cube version:

```
[INFO] Deleting observations for .../co2wirkung/5...
[INFO] Observations deleted
[INFO] Deleting observation links...
[INFO] Deleting metadata and shapes...
[INFO] Cube deletion complete
[OK] Deleted: https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/5

[INFO] Deleting observations for .../co2wirkung/4...
[INFO] Observations deleted
[INFO] Deleting observation links...
[INFO] Deleting metadata and shapes...
[INFO] Cube deletion complete
[OK] Deleted: https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/4

... (repeated for versions 3, 2, 1)

[OK] Deleted: https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/1
```

## Test Verification

After deletion, the "Explore Cubes" tab was used to verify:

1. **Cubes with Multiple Versions**: Shows "No cubes with more than 2 versions found"
2. **All Cube Versions**: Shows only 2 entries (v7 and v6)
3. **Cleanup Tab**: Shows "No cubes found with more than 2 versions" after re-identification

## Key Observations

1. **Offline Operation**: All deletions were performed against the local Fuseki instance only - no online LINDAS data was modified
2. **Three-Step Deletion**: Each cube version deletion follows a chunked approach:
   - Step 1: Delete observation triples
   - Step 2: Delete observation links (cube:observation properties)
   - Step 3: Delete metadata and SHACL shapes
3. **Complete Cleanup**: No orphaned triples were left after deletion
4. **Version Ranking**: The ranking algorithm correctly identified versions by their numeric value, keeping the 2 highest version numbers

## Conclusion

The web application successfully demonstrated the complete cube version cleanup workflow:
- Connected to local Fuseki
- Explored existing cube versions (7 versions found)
- Identified versions to delete based on ranking (5 versions with rank > 2)
- Executed batch deletion of all old versions
- Verified only newest 2 versions remain

This confirms the solution is working correctly for the LINDAS-255 requirement.

---

## Feature Enhancements (Session 2)

### New Features Added

The following enhancements were added to the web application:

#### 1. Deletion Summary
After executing deletions, the application now displays a summary showing:
- Number of cube versions deleted
- Number of cube versions kept
- Total triples deleted
- Timestamp of the operation

#### 2. Backup and Restore System
A complete backup/restore system was implemented with:
- **Automatic Backup**: Before any deletion, cube data is exported using CONSTRUCT queries
- **N-Triples Format**: Backups stored as .nt files with JSON metadata
- **7-Day Retention**: Backups automatically cleaned up after 7 days
- **Restore Capability**: Selected backups can be restored to the graph

#### 3. Backups Tab (Tab 5)
New "5. Backups" tab provides:
- List of all available backups with metadata
- Backup details (cube URI, graph, creation date, file size)
- Restore and delete buttons for each backup
- Refresh functionality to update backup list

#### 4. Documentation Tab (Tab 6)
New "6. Documentation" tab with in-app documentation explaining:
- **Step 1**: Version Detection - URI patterns and regex extraction
- **Step 2**: Version Counting - Grouping and HAVING clause logic
- **Step 3**: Ranking Algorithm - How versions are ranked for deletion
- **Step 4**: Deletion Process - Three-step chunked deletion
- **Step 5**: Backup and Rollback - Automatic backup and restore
- **Query Flow Diagram**: Visual representation of the cleanup process

### Files Modified

| File | Changes |
|------|---------|
| `web-app/public/index.html` | Added deletion summary card, backups tab, documentation tab |
| `web-app/server.js` | Added backup/restore API endpoints with 7-day retention |
| `web-app/public/app.js` | Added deletion summary display, backup management functions |
| `web-app/public/styles.css` | Added styles for summary, backup, and documentation components |

### API Endpoints Added

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/backup/create` | POST | Create backup before deletion |
| `/api/backup/list` | GET | List all available backups |
| `/api/backup/:backupId` | GET | Get backup details |
| `/api/backup/restore` | POST | Restore a backup to graph |
| `/api/backup/:backupId` | DELETE | Delete a specific backup |

### Testing Results

- Documentation tab renders correctly with all sections
- Backups tab loads and shows "No backups available" (correct state)
- Server restart required to load new backup API endpoints
- All navigation between tabs works correctly
