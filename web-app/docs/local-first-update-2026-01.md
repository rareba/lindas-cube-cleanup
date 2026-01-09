# Web App Local-First Update - January 2026

## Overview

This document describes the changes made to transform the LINDAS Cube Cleanup web application into a local-first client optimized for local testing while still supporting cloud/production environments with appropriate warnings.

## Changes Summary

### 1. Enhanced Multi-Triplestore Support

The application now has improved support for three triplestore types with both local and cloud modes:

| Triplestore | Local Mode | Cloud Mode |
|-------------|------------|------------|
| **Apache Fuseki** | http://localhost:3030 | https://lindas.admin.ch |
| **Stardog Free** | http://localhost:5820 | Stardog Cloud |
| **GraphDB Free** | http://localhost:7200 | GraphDB Cloud |

Each triplestore configuration includes:
- Description and setup instructions
- Docker commands for quick deployment
- Free edition limitations (where applicable)
- Default credentials (for Stardog)

### 2. Local-First Experience

**Default Triplestore: Stardog Free**

The application defaults to Stardog Free as the primary local triplestore. Stardog requires a free license file which can be obtained by registering at https://www.stardog.com/get-started/. Users can switch to Apache Fuseki in the UI if they prefer a license-free option.

The application now defaults to local mode with:

- **Local Mode Banner**: A green confirmation banner shows when in local mode, reassuring users that changes only affect local data
- **Setup Guide**: An integrated setup guide with tabs for each triplestore provides:
  - Download instructions
  - Docker one-liner commands
  - Default configuration values
  - Free edition limitations

### 3. Cloud Mode Warnings

When switching to cloud mode, users see prominent warnings:

- **Warning Banner**: A pulsing red banner appears with:
  - Clear "PRODUCTION MODE - CAUTION!" header
  - List of risks (unrecoverable deletions, immediate changes, etc.)
  - "Switch to Local Mode" button
  - "I Understand the Risks" acknowledgment button
- **Mode Indicator**: Header badge shows current mode with visual distinction:
  - Green for local mode
  - Red/blinking for cloud mode

### 4. Enhanced Export Package Format (v2.0)

The backup export format has been upgraded to version 2.0 with comprehensive metadata:

```json
{
    "packageVersion": "2.0",
    "exportedAt": "ISO timestamp",
    "exportedBy": "lindas-cube-cleanup",
    "format": "n-triples",

    "source": {
        "endpoint": "original endpoint URL",
        "dataset": "dataset name",
        "triplestoreType": "fuseki|stardog|graphdb",
        "triplestoreMode": "local|cloud"
    },

    "cube": {
        "uri": "full cube URI",
        "baseCube": "base cube URI without version",
        "version": 123,
        "name": "human-readable name",
        "graphUri": "target graph"
    },

    "restore": {
        "targetGraph": "recommended restore target",
        "instructions": ["..."],
        "supportedTargets": ["fuseki", "stardog", "graphdb"]
    },

    "stats": {
        "tripleCount": 12345,
        "sizeBytes": 123456
    },

    "data": "N-Triples content..."
}
```

This format enables:
- Effortless restore to any supported triplestore
- Full audit trail of where data originated
- Automatic target graph detection during import

### 5. Improved Import Preview

When importing backup files, the UI now shows:
- Package version detection (v1.0 vs v2.0)
- Source triplestore type and mode
- Cube name and version
- Export timestamp
- File size
- Recommended restore target graph

### 6. API Enhancements

New endpoints added:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/environment/info` | GET | Get environment info with setup instructions |
| `/api/environment/check-mode` | POST | Check if mode requires warning acknowledgment |
| `/api/triplestore/setup/:type` | GET | Get detailed setup info for a triplestore |

## Local Triplestore Quick Setup

### Apache Fuseki (No License Required)

**Docker:**
```bash
docker run -d --name fuseki -p 3030:3030 \
  -e ADMIN_PASSWORD=admin \
  stain/jena-fuseki
```

**Manual:**
1. Download from https://jena.apache.org/download/
2. Extract and run: `fuseki-server --mem /lindas`
3. Access at http://localhost:3030

### Stardog Free (Default)

**Docker:**
```bash
docker run -d --name stardog -p 5820:5820 \
  -v stardog-data:/var/opt/stardog \
  stardog/stardog:latest
```

**Manual:**
1. Register at https://www.stardog.com/get-started/
2. Follow OS-specific installation
3. Create database: `stardog-admin db create -n mydb`

**Free Edition Limits:**
- Max 25 databases
- Max 10GB data
- Max 1 hour query time

### GraphDB Free

**Docker:**
```bash
docker run -d --name graphdb -p 7200:7200 \
  ontotext/graphdb:free
```

**Manual:**
1. Download from https://graphdb.ontotext.com/documentation/free/
2. Run installer and access at http://localhost:7200
3. Create repository via web interface

**Free Edition Limits:**
- Max 2 queries/second
- Max 1 concurrent query
- No cluster support

## Testing with FOEN Cubes

The application was tested with FOEN (Federal Office for the Environment) cubes from LINDAS:

1. Start the web app: `npm start`
2. Access http://localhost:3001
3. In "Import Data" tab, click "Load Graphs"
4. Select "foen/cube" graph
5. Import all cubes to local triplestore
6. Use "Cleanup" tab to identify old versions

Available FOEN graphs:
- `https://lindas.admin.ch/foen/cube` - Main FOEN cube data
- `https://lindas.admin.ch/foen/hydro` - Hydrology data
- `https://lindas.admin.ch/foen/nfi` - National Forest Inventory

## Files Modified

### server.js
- Enhanced `TRIPLESTORE_DEFAULTS` with descriptions, Docker commands, and limits
- Added `createExportPackage` v2.0 format
- Updated `parseImportPackage` for v1.0/v2.0 compatibility
- Added `/api/environment/info` endpoint
- Added `/api/environment/check-mode` endpoint
- Added `/api/triplestore/setup/:type` endpoint

### public/index.html
- Enhanced cloud warning banner with acknowledgment
- Added local mode info banner
- Added local setup guide section with tabs
- Setup instructions for Fuseki, Stardog, and GraphDB

### public/app.js
- Enhanced `TRIPLESTORE_DEFAULTS` with production flags
- Added `cloudModeAcknowledged` state
- Updated `updateTriplestoreUI` for local mode banner
- Added auto-fill for Stardog default credentials
- Added cloud acknowledgment handler
- Added setup guide tab switching
- Enhanced `showUploadPreview` for v2.0 format

### public/styles.css
- Added cloud mode warning styles with pulse animation
- Added local mode info banner styles
- Added setup guide styles (tabs, options, code blocks)
- Added mode indicator enhancements
- Added restore metadata display styles

## Rationale

### Why Local-First?

1. **Safety**: Local mode prevents accidental modifications to production data
2. **Testing**: Enables thorough testing of cleanup operations before running on LINDAS
3. **Learning**: New users can experiment safely without risk
4. **Development**: Developers can test changes without affecting shared resources

### Why Enhanced Exports?

1. **Portability**: v2.0 format works across all supported triplestores
2. **Traceability**: Full audit trail of data origin
3. **Effortless Restore**: All metadata needed for one-click restoration
4. **Future-Proofing**: Extensible format for additional metadata

### Why Prominent Cloud Warnings?

1. **Awareness**: Users must acknowledge they're working with production data
2. **Prevention**: Clear visual distinction reduces accidental operations
3. **Compliance**: Supports audit requirements for production system access
4. **Best Practice**: Follows principle of least surprise

## Related Documentation

- [Multi-Triplestore Support](./multi-triplestore-support.md) - Earlier documentation on triplestore types
- [Backup System](./backup-system.md) - Backup and restore functionality
- [API Reference](./api-reference.md) - Complete API documentation
