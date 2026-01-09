# Multi-Triplestore Support Implementation

## Overview

This document describes the implementation of multi-triplestore support in the LINDAS Cube Version Cleanup web application. The application now supports local and cloud deployments of:

- Apache Fuseki
- Stardog
- GraphDB

## Features Added

### 1. Triplestore Type Selection

The Setup tab now includes a dropdown to select the triplestore type:
- **Apache Fuseki** - Default option, supports local and cloud (LINDAS)
- **Stardog** - Supports Stardog Free (local) and Stardog Cloud
- **GraphDB** - Supports GraphDB Free (local) and GraphDB Cloud

### 2. Local/Cloud Mode

A mode selector allows switching between:
- **Local (Development)** - For testing with local triplestore instances
- **Cloud (Production)** - For connecting to production/cloud triplestores

When Cloud mode is active:
- A warning banner is displayed at the top of the page
- The header shows a pulsing "CLOUD" badge instead of "LOCAL"
- Users are warned that changes affect live data

### 3. Authentication Support

For triplestores that require authentication (Stardog, GraphDB, cloud deployments):
- Username and password fields are shown
- Basic authentication is sent with all requests

### 4. Backup Export/Import

New functionality for portable backups:

**Export:**
- Backups can be exported as `.lindas.json` files
- Export includes full metadata (source graph, cube URI, triplestore type, triple count)
- Files are self-describing and portable between systems

**Import:**
- Upload backup files via drag-and-drop or file picker
- Preview shows metadata before import
- Can override target graph if needed
- Supports both exported packages and raw N-Triples files

## Server-Side Changes

### New API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/triplestore/check` | POST | Check connection to any triplestore type |
| `/api/triplestore/defaults` | GET | Get default configurations for all triplestore types |
| `/api/triplestore/query` | POST | Execute SPARQL on any triplestore |
| `/api/triplestore/import` | POST | Import data to any triplestore |
| `/api/backup/:id/export` | GET | Export backup as downloadable file |
| `/api/backup/upload` | POST | Upload backup file for import |
| `/api/backup/import` | POST | Import uploaded file to triplestore |
| `/api/backup/restore-to` | POST | Restore backup to any triplestore |

### Triplestore Configuration

The server maintains defaults for each triplestore type:

```javascript
TRIPLESTORE_DEFAULTS = {
    fuseki: {
        local: { baseUrl: 'http://localhost:3030', queryPath: '/{dataset}/query', ... },
        cloud: { baseUrl: 'https://lindas.admin.ch', queryPath: '/query', ... }
    },
    stardog: {
        local: { baseUrl: 'http://localhost:5820', queryPath: '/{database}/query', ... },
        cloud: { baseUrl: 'https://sd-xxxxx.stardog.cloud:5820', ... }
    },
    graphdb: {
        local: { baseUrl: 'http://localhost:7200', queryPath: '/repositories/{repository}', ... },
        cloud: { baseUrl: 'https://your-instance.graphdb.cloud', ... }
    }
};
```

## Client-Side Changes

### State Management

Added new state properties:
- `triplestoreType` - Current triplestore type (fuseki/stardog/graphdb)
- `triplestoreMode` - Current mode (local/cloud)
- `stardogDatabase` - Stardog database name
- `graphdbRepository` - GraphDB repository name
- `authUsername/authPassword` - Authentication credentials
- `uploadedFileData` - Temporary storage for uploaded files

### UI Components

1. **Triplestore Type Selector** - Dropdown to choose triplestore
2. **Mode Selector** - Dropdown to choose local/cloud
3. **Cloud Warning Banner** - Yellow banner shown in cloud mode
4. **Mode Indicator** - Header badge showing LOCAL (green) or CLOUD (amber)
5. **Upload Area** - Drag-and-drop zone for backup files
6. **Upload Preview** - Shows metadata before importing

## CSS Additions

New CSS classes for:
- `.mode-indicator` - Header badge styling
- `.warning-banner` - Cloud mode warning
- `.upload-area` - Drag-and-drop file upload zone
- `.preview-row` - Metadata preview rows
- `.form-row` / `.form-group.half` - Form layout helpers

## Usage Examples

### Connecting to Local Stardog

1. Select "Stardog" from Triplestore Type
2. Keep "Local (Development)" mode
3. Enter database name (default: mydb)
4. Enter credentials (default: admin/admin)
5. Click "Check Connection"

### Exporting a Backup

1. Go to Backups tab
2. Click "Refresh Backup List"
3. Select a backup from the list
4. Click "Export for External Use"
5. Save the downloaded `.lindas.json` file

### Importing a Backup

1. Go to Backups tab
2. Drag a backup file to the upload area (or click "Select File")
3. Review the metadata preview
4. Optionally enter a different target graph
5. Click "Import to Current Triplestore"

## Files Modified

### Server
- `web-app/server.js` - Multi-triplestore endpoints and export/import logic

### Client
- `web-app/public/app.js` - State management, event handlers, UI logic
- `web-app/public/index.html` - New UI elements for triplestore config
- `web-app/public/styles.css` - Styles for new components

## Security Considerations

1. **XSS Prevention** - All dynamic content uses safe DOM methods (textContent, appendChild)
2. **Authentication** - Credentials are sent via Basic auth headers, not URL parameters
3. **Cloud Mode Warning** - Users are clearly warned when connected to production systems
4. **File Validation** - Uploaded files are validated before import
