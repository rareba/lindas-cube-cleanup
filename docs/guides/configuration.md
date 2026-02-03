# Configuration Guide

This guide covers the configuration options for the LINDAS Cube Cleanup web application.

## Environment Variables

All configuration is done through environment variables (or the web UI for connection settings).

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP port for the web server |
| `ENABLE_DESTRUCTIVE_API` | `false` | Set to `true` to enable deletion endpoints |
| `API_AUTH_TOKEN` | (none) | Bearer token required for destructive operations when set |

## Connection Modes

The web app supports two connection modes, configured in the UI:

### Online Mode (LINDAS)

Connects directly to the LINDAS SPARQL endpoint at `https://lindas.admin.ch/query`. No authentication needed for read operations. Destructive operations require a local or cloud triplestore.

### Offline Mode (Local/Cloud Triplestore)

Connects to a self-hosted or cloud triplestore. Supported types:

- **Apache Fuseki** -- Endpoint: `http://localhost:3030`, query path: `/{dataset}/query`
- **GraphDB** -- Endpoint: `http://localhost:7200`, query path: `/repositories/{repository}`
- **Stardog** -- Endpoint: `http://localhost:5820`, query path: `/{database}/query`

Each triplestore type uses its own connection field (dataset, repository, or database) which is automatically resolved by the backend.

## Known Issues and Fixes

### URL Preservation on Mode Switch

When switching between Online and Offline modes, the app preserves user-entered endpoint URLs. Custom URLs are only overwritten if the current URL is empty or matches a known placeholder/default value.

This was fixed in `app.js` in the `updateConnectionUI()` function (2026-01-13). See the changelog entries for details:
- `docs/changelog/online-mode-fix-2026-01-13.md`
- `docs/changelog/online-mode-fix-2026-01-14.md`

### Stardog Cloud Credentials

SSO credentials do NOT work for API access to Stardog Cloud. You must create a dedicated API user through Stardog Studio's Security settings.
