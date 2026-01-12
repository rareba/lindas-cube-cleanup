# LINDAS Cube Manager v2.0 - UI Redesign Documentation

## Overview

This document describes the major UI redesign of the LINDAS Cube Manager application, transforming it from a tab-based interface into a modern sidebar navigation system with dedicated offline and online operation modes.

## Changes Summary

### 1. New Sidebar Navigation

The application now features a persistent sidebar navigation replacing the previous tab-based interface:

**Sidebar Sections:**
- **Mode Toggle**: Switch between Offline and Online modes
- **Main**: Connection, Download Data (Offline only)
- **Tools**: Deletion Wizard, Query Editor, Backups
- **Help**: Documentation, Installation Guide

**Benefits:**
- Always-visible navigation for quick access
- Clear mode indicator showing current operation mode
- Collapsible sections for better organization
- Visual indicators for active sections

### 2. Offline/Online Operation Modes

The application supports two distinct operation modes. **The connection type is automatically set by the mode** - users cannot choose local/remote independently:

#### Offline Mode (Default)
- **Connection**: Automatically set to "Local Instance" (cannot be changed)
- Download data from LINDAS environments to a local triplestore
- Work safely without affecting production data
- Ideal for testing and development
- Full access to Download Data section

**LINDAS Environments Available:**
| Environment | URL | Badge |
|-------------|-----|-------|
| Production | https://lindas.admin.ch | PROD |
| Integration | https://int.lindas.admin.ch | INT |
| Test | https://test.lindas.admin.ch | TEST |
| Custom URL | User-specified | CUSTOM |

#### Online Mode
- **Connection**: Automatically set to "Remote Server" (cannot be changed)
- Connect directly to remote triplestore instances
- Perform operations on production data (use with caution)
- Download Data section is hidden (not needed)

### 3. Deletion Wizard (5-Step Process)

The deletion workflow is now presented as a dedicated 5-step wizard:

**Step 1: Select Graph**
- Enter or browse for the graph URI to analyze
- Load graph data from the connected triplestore

**Step 2: Explore Cubes**
- View all cube versions in the selected graph
- Automatic version ranking (newest 2 kept, older marked for deletion)
- Visual indicators for versions to keep vs delete

**Step 3: Preview Deletions**
- Review all cubes and versions marked for deletion
- View triple counts and impact statistics
- Option to exclude specific versions from deletion

**Step 4: Execute Cleanup**
- Confirmation step before deletion
- Progress indicators during deletion
- Automatic backup creation before deletion

**Step 5: Summary**
- Results of the cleanup operation
- Links to exported backup files
- Options to restore or continue

### 4. Query Editor

Direct SPARQL query execution with:
- Graph URI and Cube URI configuration
- Query templates dropdown:
  - Custom Query (blank)
  - List All Cubes
  - Find Cube Versions
  - Count Triples
  - Get Cube Metadata
- Query type selection (SELECT/UPDATE)
- Results display with pagination
- Export results functionality

### 5. Backup Management

Enhanced backup system with:
- **Available Backups**: List of all backup files with metadata
- **Export Options**: Download backups as compressed files (.lindas.json or .nt)
- **Import Backups**: Drag-and-drop or file selector for restore
- Automatic backup retention (7 days default)

### 6. Documentation Section

In-app documentation with tabbed content:
- **Overview**: How the application works
- **Version Detection**: Algorithm for detecting cube versions
- **Ranking Algorithm**: How versions are ranked and selected
- **Deletion Process**: Step-by-step deletion workflow
- **Backup & Restore**: How to backup and restore data

### 7. Installation Guide

Comprehensive setup instructions for all three supported triplestores:

#### Apache Fuseki
- Docker installation (recommended)
- Manual installation steps
- Dataset creation
- No license required

#### Stardog
- **License Required**: Stardog will NOT start without a valid license file
- **Free License Available**: Register at stardog.com/get-started to get a free license
- Docker installation (requires license file in data directory)
- Manual installation
- Database creation commands
- Note: If you want a license-free option, use Apache Fuseki instead

##### Stardog Cloud Authentication

**Important:** SSO credentials (email/password used for web login) do NOT work for API access.

To create API credentials:
1. Go to [cloud.stardog.com](https://cloud.stardog.com) and log in with SSO
2. Click your connection endpoint
3. Open **Stardog Studio**
4. Navigate to the **Security** section (cog icon)
5. Click **+** in the "USERS" pane
6. Create a new user with username/password (e.g., `api_user` / `yourpassword`)
7. Click "Add"
8. Assign appropriate roles/permissions

Use these API user credentials (not SSO) when connecting to Stardog Cloud from this application.

#### GraphDB
- Docker installation
- Manual installation
- Repository configuration
- Free edition limitations

#### Docker Compose
- Combined setup for all triplestores
- Volume configuration
- Network setup

## Technical Implementation

### Files Modified

#### public/index.html
- Complete rewrite with sidebar structure
- New sections for all navigation items
- Mode toggle implementation
- Wizard step indicators

#### public/styles.css
- New sidebar styling (~2400 lines)
- CSS variables for theming
- Wizard step indicators
- Card-based layouts
- Responsive design breakpoints

#### public/app.js
- Safe DOM manipulation (no unsafe string-to-HTML methods)
- State management for:
  - Current mode (offline/online)
  - Connection status
  - Wizard step progress
  - Downloaded data
- Event handlers for all interactions

### Security Improvements

All dynamic content rendering uses safe DOM methods:

```javascript
// Safe pattern used throughout the application
const p = document.createElement('p');
p.textContent = untrustedContent;
container.appendChild(p);
```

This approach:
- Uses createElement() to create new elements
- Uses textContent to set text safely (auto-escapes HTML)
- Uses appendChild() to add elements to the DOM
- Prevents XSS vulnerabilities from user input or API responses

### API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/triplestore/check` | POST | Check triplestore connection |
| `/api/triplestore/create-dataset` | POST | Create new dataset |
| `/api/triplestore/import` | POST | Import data to triplestore |
| `/api/lindas/all-graphs` | GET | Get all available graphs |
| `/api/lindas/cubes` | GET | Get cubes in a graph |
| `/api/lindas/download-cube` | GET | Download cube data |
| `/api/backup/list` | GET | List available backups |
| `/api/backup/create` | POST | Create a backup |
| `/api/backup/:id/export` | GET | Export backup file |
| `/api/backup/upload` | POST | Upload backup file |
| `/api/backup/import` | POST | Import backup to triplestore |

## User Workflow Examples

### Workflow 1: Safe Local Testing

1. Start the application in **Offline Mode** (default)
2. Go to **Connection** and verify local triplestore is running
3. Go to **Download Data** and select LINDAS Test environment
4. Load available graphs and select one to download
5. Click "Download All Cubes" to import data locally
6. Go to **Deletion Wizard** and follow the 5-step process
7. Review results and export backups as needed

### Workflow 2: Production Cleanup (Caution!)

1. Switch to **Online Mode**
2. Go to **Connection** and configure remote triplestore
3. Test connection to verify access
4. Go to **Deletion Wizard** and select the target graph
5. Review all versions carefully before deletion
6. Execute cleanup (backups created automatically)
7. Export backups for archive

### Workflow 3: Restore Deleted Data

1. Go to **Backups** section
2. Either:
   - Select from "Available Backups" list
   - Upload a backup file via drag-and-drop
3. Preview the backup contents
4. Select target graph for restoration
5. Click "Import to Triplestore"
6. Verify restoration in Query Editor

## Configuration

### Environment Variables (server.js)

```javascript
const PORT = process.env.PORT || 3001;
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';
const BACKUP_RETENTION_DAYS = process.env.BACKUP_RETENTION_DAYS || 7;
```

### Triplestore Defaults

| Triplestore | Local URL | Default Dataset |
|-------------|-----------|-----------------|
| Apache Fuseki | http://localhost:3030 | lindas |
| Stardog | http://localhost:5820 | lindas |
| GraphDB | http://localhost:7200 | lindas |

## Rationale

### Why Sidebar Navigation?

1. **Persistent Access**: Users can navigate without losing context
2. **Mode Visibility**: Always shows current operation mode
3. **Scalability**: Easy to add new sections
4. **Modern UX**: Follows contemporary design patterns

### Why Separate Offline/Online Modes?

1. **Safety First**: Prevents accidental production changes
2. **Clear Intent**: Users must explicitly choose to work with production
3. **Different Workflows**: Offline needs download; online doesn't
4. **Visual Distinction**: Header badge clearly shows current mode

### Why Wizard for Deletion?

1. **Guided Process**: Prevents skipping important steps
2. **Review Points**: Multiple opportunities to verify selections
3. **Reversibility**: Backups created before any deletion
4. **Clarity**: Step indicators show progress

## Testing Results

All features tested successfully:
- Navigation between all sections
- Mode toggle showing/hiding Download Data
- Wizard step progression
- Query Editor templates
- Backup list and import
- Documentation tabs
- Installation Guide tabs
- No JavaScript console errors

## Related Documentation

- [Local-First Update](./local-first-update-2026-01.md) - Previous local-first changes
- [Multi-Triplestore Setup](./multi-triplestore-docker-setup.md) - Docker configurations
- [Triplestore Status](./triplestore-status-2026-01-09.md) - Current triplestore state
