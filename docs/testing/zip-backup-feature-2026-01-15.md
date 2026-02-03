# ZIP Backup Feature - 2026-01-15

## Overview

Implemented a ZIP-based backup format for cube version backups. When a cube version is deleted, a compressed ZIP backup is automatically created containing all necessary data for effortless restoration.

## ZIP Archive Structure

Each backup ZIP file contains:

```
backup_v1_2026-01-15T13-43-28.zip
  - manifest.json    # Complete metadata for identification and restore
  - data.nt          # RDF triples in N-Triples format
  - README.txt       # Human-readable instructions
```

### manifest.json Format (v3.0)

```json
{
  "formatVersion": "3.0",
  "formatType": "lindas-cube-backup",
  "createdAt": "2026-01-15T13:43:28.055Z",
  "createdBy": "LINDAS Cube Manager",
  "source": {
    "endpoint": "http://localhost:7200",
    "dataset": "lindas",
    "triplestoreType": "graphdb"
  },
  "cube": {
    "uri": "https://energy.ld.admin.ch/sfoe/cube/1",
    "baseCube": "https://energy.ld.admin.ch/sfoe/cube",
    "version": 1,
    "name": "cube/1"
  },
  "graph": {
    "uri": "https://energy.ld.admin.ch/sfoe/cube"
  },
  "restore": {
    "targetGraph": "https://energy.ld.admin.ch/sfoe/cube",
    "recommendedEndpoint": "http://localhost:7200",
    "recommendedDataset": "lindas",
    "dataFile": "data.nt",
    "dataFormat": "application/n-triples",
    "instructions": [...]
  },
  "stats": {
    "tripleCount": 1046,
    "dataFileSize": 237527,
    "backupId": "cube_1_2026-01-15T13-43-28-051Z"
  }
}
```

## Compression Results

| Original Size | Compressed Size | Compression Ratio |
|---------------|-----------------|-------------------|
| 237,527 bytes | 8,462 bytes     | 96.4%             |

N-Triples data compresses extremely well due to repetitive URI patterns.

## API Changes

### Backup Creation (`POST /api/backup/create`)

Response now includes ZIP info:
```json
{
  "success": true,
  "backupId": "cube_1_2026-01-15T13-43-28-051Z",
  "tripleCount": 1046,
  "expiresAt": "2026-01-22T13:43:28.053Z",
  "zipFilename": "cube_1_backup_2026-01-15T13-43-28-055Z.zip",
  "compressedSize": 8462
}
```

### Backup Export (`GET /api/backup/:backupId/export`)

- Default: Returns ZIP file (Content-Type: application/zip)
- Optional: Add `?format=json` for legacy JSON format

### Backup List (`GET /api/backup/list`)

Response includes ZIP info:
```json
{
  "backups": [{
    "backupId": "...",
    "hasZip": true,
    "zipFilename": "...",
    "zipFileSize": 8462,
    "fileSize": 237527,  // Original .nt file size
    ...
  }]
}
```

### Backup Upload (`POST /api/backup/upload`)

- Automatically detects ZIP files by extension or mimetype
- Parses manifest.json and data.nt from ZIP
- Returns metadata for user review before import

## Dependencies Added

```json
{
  "adm-zip": "^0.5.10",    // ZIP reading
  "archiver": "^6.0.1"     // ZIP creation
}
```

## Restore Workflow

1. **From Web UI**:
   - Go to Backup Management
   - Upload the ZIP file
   - Review metadata shown in preview
   - Click Import to restore to selected triplestore

2. **Manual Restore**:
   - Extract the ZIP file
   - Read manifest.json for graph and endpoint info
   - POST data.nt to the appropriate triplestore endpoint:
     - Fuseki: `/{dataset}/data?graph=<graphUri>`
     - Stardog: `/{database}?graph=<graphUri>`
     - GraphDB: `/repositories/{repo}/statements?context=<graphUri>`

## Backward Compatibility

- Old JSON exports (v1.0, v2.0) are still supported for import
- Raw N-Triples files can still be imported
- Backups created before this update remain valid (hasZip: false)

## Files Modified

- `web-app/package.json` - Added archiver and adm-zip dependencies
- `web-app/server.js` - Added ZIP backup functions and updated endpoints
