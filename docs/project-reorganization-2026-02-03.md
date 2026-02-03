# Project Reorganization -- 2026-02-03

## Summary

Major project reorganization to streamline the codebase around the web application and its APIs. Deprecated components were archived, documentation was consolidated into a structured hierarchy, Docker support was added, and the Installation Guide was removed from the web UI.

## Changes Made

### 1. Deprecated Components Archived to Removed/

The following components were moved to `Removed/` (excluded from git via `.gitignore`):

- **cleanup-service/** -- Standalone CLI cleanup service (superseded by web-app APIs)
- **scripts/** -- Shell/PowerShell utility scripts (functionality now in web-app)
- **task/** -- Task tracking file
- **test-export/** -- Test export data
- **start-demo.bat, start-demo.sh** -- Demo startup scripts
- **docker-compose.graphdb.yml** -- Old multi-triplestore Docker Compose
- **data/*.csv** -- CSV data files and test results
- **web-app/test-*.js, web-app/*.png** -- Test scripts and screenshots
- **web-app/backups_old/** -- Old backup directory
- **nul, null** -- Windows artifact files
- **create-zip.ps1, screenshot.png** -- Misc utility files

### 2. Documentation Consolidated

All 50 markdown files from `docs/` (37 files) and `web-app/docs/` (13 files) were reorganized into a topic-based structure:

```
docs/
  architecture/     -- 6 files (solution overview, query reference, multi-triplestore, SPARQL docs)
  guides/           -- 4 files (web-app guide, deployment, configuration, docker setup)
  testing/          -- 21 files (all test reports and verification docs)
  changelog/        -- 14 files (bug fixes, improvements, reviews, feature additions)
  reference/        -- 7 files (data analysis, execution logs, gitlab comments)
```

Two new merged guides were created:
- `docs/guides/deployment.md` -- Consolidated deployment instructions (Docker + native Node.js)
- `docs/guides/configuration.md` -- Consolidated configuration reference and known issues

The `web-app/docs/` directory was removed after all files were relocated.

### 3. Query Files Verified

The `.rq` files in `queries/` and `queries/universal/` were reviewed and confirmed to be current. They already use the Stardog-compatible BIND pattern (instead of FILTER) and match the server.js inline fallback queries.

### 4. Installation Guide Removed from Web UI

The Installation Guide section was removed from the web application:
- Removed sidebar navigation item (`data-section="installation"`)
- Removed entire `<section id="section-installation">` from index.html
- Removed `'installation': 'Installation Guide'` from section titles in app.js
- Removed `initInstallation()` function and its call from app.js
- Added a note in the Documentation section intro referencing the `docs/` folder

### 5. Docker Support Added

New files created at project root:
- **Dockerfile** -- Node.js 18 Alpine image, copies web-app source and queries, exposes port 3001, includes health check, destructive API disabled by default
- **docker-compose.yml** -- Single web-app service, mounts backups volume, env vars for API security
- **.dockerignore** -- Excludes unnecessary files from Docker build context

Updated `server.js`:
- `loadQuery()` now checks both the standard path (`__dirname/../queries/universal/`) and Docker path (`__dirname/queries/universal/`) as fallback

### 6. .gitignore Updated

- Added `Removed/` to exclude archived components
- Added `**/exports/` and `**/uploads/` for runtime data
- Added `null` alongside existing `nul` for Windows artifacts
- Removed stale `cleanup-service/` specific entries

## Rationale

- The project had grown to include multiple standalone tools (cleanup-service, scripts) that were superseded by the web application's API endpoints
- Documentation was scattered across two directories with no topic organization
- The Installation Guide in the web UI duplicated information better served by project documentation
- Docker support simplifies deployment for users who do not want to install Node.js locally
