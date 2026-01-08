# LINDAS Cube Version Cleanup - Web Application Guide

## Overview

This web application provides a graphical interface for the LINDAS cube version cleanup process. It allows users to:

1. **Import Data**: Download cube data from LINDAS and import it into a local Apache Fuseki instance
2. **Explore Cubes**: View all imported cubes and identify those with multiple versions
3. **Preview Deletions**: See exactly which versions will be deleted and count affected triples
4. **Execute Cleanup**: Delete old versions while preserving the newest 2

## Prerequisites

- **Node.js** (v16 or later)
- **Apache Fuseki** (v4.x or v5.x) running locally on port 3030
- Internet connection for accessing LINDAS endpoint

## Installation

```powershell
cd web-app
npm install
```

## Starting the Application

1. **Start Apache Fuseki** (if not already running):
   ```powershell
   cd fuseki
   .\fuseki-server.bat
   ```

2. **Start the Web Application**:
   ```powershell
   cd web-app
   npm start
   ```

3. **Open in Browser**: Navigate to http://localhost:3001

## Usage Guide

### Tab 1: Setup

1. **Configure Fuseki Endpoint**: Default is `http://localhost:3030`
2. **Set Dataset Name**: Default is `lindas`
3. **Check Connection**: Verify Fuseki is accessible
4. **Create Dataset**: Create the dataset if it does not exist

### Tab 2: Import Data

**Graph Selection:**
1. **Load Graphs**: Click "Load Graphs" to populate the dropdown with all available graphs from LINDAS
2. **Select from Dropdown**: Choose a graph from the dropdown menu, or enter a URI manually
3. **Default Graph**: The default is `https://lindas.admin.ch/sfoe/cube`

**Import Options:**
1. **Import All Cubes from Graph** (Recommended): Downloads and imports ALL cube versions from the selected graph
   - Shows detailed progress bar with current cube and count (e.g., "12 / 45")
   - Rate-limited to 1 request per second to avoid overloading LINDAS
   - Displays summary when complete (cubes imported, triples, errors)

2. **Import Sample Data**: Quick demo option that imports the co2wirkung cube (7 versions) for testing cleanup functionality

**Progress Bar Features:**
- Current step indicator (fetching list / importing)
- Current cube being downloaded (full URI)
- Counter showing progress (X / Y)
- Rate limiting notice when waiting between downloads
- Import summary with statistics and error list

### Tab 3: Explore Cubes

1. **Load Local Cubes**: Query your local Fuseki to see imported data
2. **View Multi-Version Cubes**: See which cubes have >2 versions (cleanup candidates)
3. **Count Triples**: Check total triple count in the graph

### Tab 4: Cleanup

1. **Identify Versions to Delete**: Analyze cubes and determine which versions to delete
2. **Preview Individual Cubes**: Click a cube to see triple breakdown (metadata, shapes, observations)
3. **Delete Selected**: Delete a specific cube version
4. **Delete All Old**: Batch delete all identified old versions

## Technical Details

### Architecture

- **Backend**: Node.js + Express server (`server.js`)
- **Frontend**: Vanilla HTML/CSS/JavaScript (no framework dependencies)
- **API Endpoints**: RESTful JSON API for all SPARQL operations

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/fuseki/check` | POST | Check Fuseki connection |
| `/api/fuseki/create-dataset` | POST | Create new dataset |
| `/api/fuseki/graphs` | POST | List graphs in dataset |
| `/api/fuseki/import` | POST | Import N-Triples data |
| `/api/lindas/graphs` | POST | Search graphs in LINDAS (with filter) |
| `/api/lindas/all-graphs` | POST | List all graphs from LINDAS |
| `/api/lindas/cubes` | POST | List all cubes in a LINDAS graph |
| `/api/lindas/download-cube` | POST | Download cube from LINDAS |
| `/api/cubes/list-versions` | POST | List all cube versions |
| `/api/cubes/count-versions` | POST | Count versions per cube |
| `/api/cubes/identify-deletions` | POST | Identify versions to delete |
| `/api/cubes/preview-deletion` | POST | Preview triples to delete |
| `/api/cubes/delete-observations` | POST | Delete observation triples (chunked) |
| `/api/cubes/delete-observation-links` | POST | Delete observation set links |
| `/api/cubes/delete-metadata` | POST | Delete cube metadata and shapes |

### Deletion Process

The deletion follows a three-step chunked approach:

1. **Delete Observations** (Query 07): Removes observation data in chunks of 50,000 triples
2. **Delete Observation Links** (Query 08): Removes `cube:observation` property links
3. **Delete Metadata** (Query 09): Removes cube metadata, SHACL shapes, and structure

This chunked approach prevents timeout issues with large cubes.

### Universal Queries

The application uses parameterized queries from `/queries/universal/`:

- `01-list-all-cube-versions.rq`: Lists cubes with version extraction
- `02-count-versions-per-cube.rq`: Counts versions, filters >2
- `03-identify-versions-to-delete.rq`: Ranks versions, marks for deletion

Queries use `<GRAPH_URI>` placeholder which is replaced at runtime.

## Demo Workflow

For customer demonstration:

1. **Setup**: Connect to local Fuseki, create `lindas` dataset
2. **Import Sample**: Click "Import Sample (co2wirkung)" - imports 7 versions
3. **Explore**: Show the 7 versions in the Explore tab
4. **Identify**: Click "Identify Versions to Delete" - shows versions 1-5 marked DELETE
5. **Preview**: Click individual cubes to show triple counts
6. **Delete**: Either delete one cube or use "Delete All Old Versions"
7. **Verify**: Reload cubes to show only versions 6 and 7 remain

## Troubleshooting

### Fuseki Connection Failed
- Ensure Fuseki is running: `./fuseki-server.bat`
- Check the endpoint URL (default: http://localhost:3030)
- Verify firewall settings

### Import Timeout
- Large cubes may timeout when downloading
- Use the chunked import for full graphs
- Import specific cubes instead of entire graphs

### Deletion Incomplete
- Large cubes with many observations require multiple chunked deletions
- The app handles this automatically by looping until all observations are deleted
- Check the deletion log for progress

## Security Notes

- This application is designed for local testing and demonstration
- No authentication is implemented
- Do not expose to public networks
- Always test on local Fuseki before production LINDAS

## Files

```
web-app/
  package.json       - Node.js dependencies
  server.js          - Express backend with API endpoints
  public/
    index.html       - Main HTML structure
    styles.css       - Application styling
    app.js           - Frontend JavaScript logic
```
