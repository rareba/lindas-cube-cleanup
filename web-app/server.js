const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const stardog = require('stardog');

const app = express();
const PORT = process.env.PORT || 3001;

// Backup directory
const BACKUP_DIR = path.join(__dirname, 'backups');
const BACKUP_RETENTION_DAYS = 7;
const EXPORT_DIR = path.join(__dirname, 'exports');

// Ensure directories exist
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

// Configure multer for file uploads
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// Middleware
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// =============================================================================
// TRIPLESTORE CONFIGURATION
// =============================================================================

// Default endpoints for different triplestore types
const TRIPLESTORE_DEFAULTS = {
    fuseki: {
        local: {
            baseUrl: 'http://localhost:3030',
            queryPath: '/{dataset}/query',
            updatePath: '/{dataset}/update',
            dataPath: '/{dataset}/data',
            datasetsPath: '/$/datasets',
            description: 'Apache Fuseki - Local Development',
            setupInstructions: 'Download from https://jena.apache.org/download/ and run fuseki-server'
        },
        cloud: {
            baseUrl: 'https://lindas.admin.ch',
            queryPath: '/query',
            updatePath: '/update',
            dataPath: '/data',
            description: 'LINDAS Production - Swiss Government Linked Data',
            isProduction: true,
            warning: 'CAUTION: This is the production LINDAS endpoint. All changes affect live data!'
        }
    },
    stardog: {
        local: {
            baseUrl: 'http://localhost:5820',
            queryPath: '/{database}/query',
            updatePath: '/{database}/update',
            dataPath: '/{database}',
            defaultCredentials: { username: 'admin', password: 'admin' },
            description: 'Stardog Free - Local Development (up to 25 databases, 10GB data)',
            setupInstructions: 'Download Stardog Free from https://www.stardog.com/get-started/',
            dockerCommand: 'docker run -d --name stardog -p 5820:5820 -v stardog-data:/var/opt/stardog stardog/stardog:latest',
            freeEditionLimits: {
                maxDatabases: 25,
                maxDataSize: '10GB',
                maxQueryTime: '1 hour'
            }
        },
        cloud: {
            baseUrl: 'https://sd-xxxxx.stardog.cloud:5820',
            queryPath: '/{database}/query',
            updatePath: '/{database}/update',
            dataPath: '/{database}',
            description: 'Stardog Cloud - Production Environment',
            isProduction: true,
            warning: 'CAUTION: This is a cloud/production endpoint. All changes affect live data!'
        }
    },
    graphdb: {
        local: {
            baseUrl: 'http://localhost:7200',
            queryPath: '/repositories/{repository}',
            updatePath: '/repositories/{repository}/statements',
            dataPath: '/repositories/{repository}/statements',
            repositoriesPath: '/rest/repositories',
            description: 'GraphDB Free - Local Development (unlimited data, 2 queries/second)',
            setupInstructions: 'Download from https://graphdb.ontotext.com/documentation/free/',
            dockerCommand: 'docker run -d --name graphdb -p 7200:7200 ontotext/graphdb:free',
            freeEditionLimits: {
                queriesPerSecond: 2,
                concurrentQueries: 1
            }
        },
        cloud: {
            baseUrl: 'https://your-instance.graphdb.cloud',
            queryPath: '/repositories/{repository}',
            updatePath: '/repositories/{repository}/statements',
            dataPath: '/repositories/{repository}/statements',
            description: 'GraphDB Cloud - Production Environment',
            isProduction: true,
            warning: 'CAUTION: This is a cloud/production endpoint. All changes affect live data!'
        }
    }
};

// Environment mode tracking
let currentEnvironmentMode = 'local';
let cloudModeWarningAcknowledged = false;

const LINDAS_ENDPOINT = 'https://lindas.admin.ch/query';
const DEFAULT_FUSEKI_ENDPOINT = 'http://localhost:3030';

// Load universal queries from files
function loadQuery(queryName) {
    const queryPath = path.join(__dirname, '..', 'queries', 'universal', queryName);
    if (fs.existsSync(queryPath)) {
        return fs.readFileSync(queryPath, 'utf8');
    }
    return null;
}

// =============================================================================
// TRIPLESTORE-AWARE SPARQL EXECUTION
// =============================================================================

/**
 * Build endpoint URLs based on triplestore type
 */
function buildEndpoints(config) {
    const { type, mode, baseUrl, dataset, database, repository, username, password } = config;
    const defaults = TRIPLESTORE_DEFAULTS[type]?.[mode] || TRIPLESTORE_DEFAULTS.fuseki.local;

    const base = baseUrl || defaults.baseUrl;
    let queryEndpoint, updateEndpoint, dataEndpoint;

    switch (type) {
        case 'stardog':
            const db = database || 'mydb';
            queryEndpoint = `${base}${defaults.queryPath.replace('{database}', db)}`;
            updateEndpoint = `${base}${defaults.updatePath.replace('{database}', db)}`;
            dataEndpoint = `${base}${defaults.dataPath.replace('{database}', db)}`;
            break;
        case 'graphdb':
            const repo = repository || 'test';
            queryEndpoint = `${base}${defaults.queryPath.replace('{repository}', repo)}`;
            updateEndpoint = `${base}${defaults.updatePath.replace('{repository}', repo)}`;
            dataEndpoint = `${base}${defaults.dataPath.replace('{repository}', repo)}`;
            break;
        case 'fuseki':
        default:
            const ds = dataset || 'lindas';
            if (defaults.queryPath.includes('{dataset}')) {
                queryEndpoint = `${base}${defaults.queryPath.replace('{dataset}', ds)}`;
                updateEndpoint = `${base}${defaults.updatePath.replace('{dataset}', ds)}`;
                dataEndpoint = `${base}${defaults.dataPath.replace('{dataset}', ds)}`;
            } else {
                queryEndpoint = `${base}${defaults.queryPath}`;
                updateEndpoint = `${base}${defaults.updatePath}`;
                dataEndpoint = `${base}${defaults.dataPath}`;
            }
            break;
    }

    return { queryEndpoint, updateEndpoint, dataEndpoint, username, password };
}

/**
 * Build auth headers based on credentials
 */
function buildAuthHeaders(username, password) {
    if (username && password) {
        const credentials = Buffer.from(`${username}:${password}`).toString('base64');
        return { 'Authorization': `Basic ${credentials}` };
    }
    return {};
}

// Execute SPARQL SELECT query
async function executeSparqlSelect(endpoint, query, auth = {}) {
    const headers = {
        'Accept': 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
        ...buildAuthHeaders(auth.username, auth.password)
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: `query=${encodeURIComponent(query)}`
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`SPARQL query failed: ${response.status} - ${text}`);
    }

    return await response.json();
}

// Execute SPARQL UPDATE query
async function executeSparqlUpdate(endpoint, query, auth = {}) {
    const headers = {
        'Content-Type': 'application/sparql-update',
        ...buildAuthHeaders(auth.username, auth.password)
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: query
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`SPARQL update failed: ${response.status} - ${text}`);
    }

    return { success: true };
}

// Execute SPARQL CONSTRUCT query to get triples
async function executeSparqlConstruct(endpoint, query, auth = {}) {
    const headers = {
        'Accept': 'application/n-triples',
        'Content-Type': 'application/x-www-form-urlencoded',
        ...buildAuthHeaders(auth.username, auth.password)
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: `query=${encodeURIComponent(query)}`
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`SPARQL construct failed: ${response.status} - ${text}`);
    }

    return await response.text();
}

// Import data to triplestore
async function importData(config, graphUri, triples) {
    const { dataEndpoint, username, password } = buildEndpoints(config);
    const type = config.type || 'fuseki';

    let url, contentType = 'application/n-triples';

    switch (type) {
        case 'stardog':
            url = `${dataEndpoint}?graph=${encodeURIComponent(graphUri)}`;
            break;
        case 'graphdb':
            url = `${dataEndpoint}?context=${encodeURIComponent('<' + graphUri + '>')}`;
            break;
        case 'fuseki':
        default:
            url = `${dataEndpoint}?graph=${encodeURIComponent(graphUri)}`;
            break;
    }

    const headers = {
        'Content-Type': contentType,
        ...buildAuthHeaders(username, password)
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: triples
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Import failed: ${response.status} - ${text}`);
    }

    return { success: true };
}

// =============================================================================
// TRIPLESTORE CONNECTION MANAGEMENT
// =============================================================================

/**
 * Check triplestore connection based on type
 */
async function checkTriplestoreConnection(config) {
    const { type, mode, baseUrl, dataset, database, repository, username, password } = config;
    const defaults = TRIPLESTORE_DEFAULTS[type]?.[mode] || TRIPLESTORE_DEFAULTS.fuseki.local;
    const base = baseUrl || defaults.baseUrl;
    const authHeaders = buildAuthHeaders(username, password);

    let checkUrl, checkPath, checkMethod = 'GET';
    let availableDatasets = [];

    switch (type) {
        case 'stardog':
            // Stardog: Use official stardog.js library
            const stardogDb = database || 'lindas';
            try {
                console.log(`Stardog: Connecting to ${base} with user ${username}`);
                const conn = new stardog.Connection({
                    username: username || 'admin',
                    password: password || 'admin',
                    endpoint: base
                });

                // Try to list databases first
                console.log(`Stardog: Listing databases...`);
                const dbListResult = await stardog.db.list(conn);
                console.log(`Stardog db.list result:`, dbListResult);

                if (dbListResult.ok) {
                    const databases = dbListResult.body.databases || [];
                    return {
                        connected: true,
                        type: 'stardog',
                        mode,
                        baseUrl: base,
                        databases: databases,
                        message: `Connected! Available databases: ${databases.join(', ') || 'none'}`
                    };
                } else {
                    // db.list failed, try a simple query on the specific database
                    console.log(`Stardog: db.list failed, trying query on ${stardogDb}...`);
                    const queryResult = await stardog.query.execute(
                        conn,
                        stardogDb,
                        'ASK { ?s ?p ?o }',
                        'application/sparql-results+json'
                    );
                    console.log(`Stardog query result:`, queryResult);

                    if (queryResult.ok) {
                        return {
                            connected: true,
                            type: 'stardog',
                            mode,
                            baseUrl: base,
                            database: stardogDb,
                            message: `Connected to database: ${stardogDb}`
                        };
                    } else {
                        const status = dbListResult.status || queryResult.status;
                        let errorMessage = `Connection failed: ${dbListResult.statusText || queryResult.statusText || 'Unknown error'}. Status: ${status}`;

                        // Provide helpful message for Stardog Cloud auth failures
                        if (status === 401 && base.includes('.stardog.cloud')) {
                            errorMessage = `Authentication failed (401). For Stardog Cloud: SSO credentials do not work for API access. You need to create a dedicated API user in Stardog Studio: 1) Log into cloud.stardog.com 2) Click your connection 3) Launch Stardog Studio 4) Go to Security > Users 5) Create a new user with username/password 6) Use those credentials here.`;
                        } else if (status === 401) {
                            errorMessage = `Authentication failed (401). Check your username and password.`;
                        }

                        return {
                            connected: false,
                            type: 'stardog',
                            mode,
                            baseUrl: base,
                            error: errorMessage
                        };
                    }
                }
            } catch (err) {
                console.error(`Stardog connection error:`, err);
                return {
                    connected: false,
                    type: 'stardog',
                    mode,
                    baseUrl: base,
                    error: `Connection error: ${err.message}`
                };
            }
            break;

        case 'graphdb':
            // GraphDB: GET /rest/repositories
            checkUrl = `${base}/rest/repositories`;
            try {
                const response = await fetch(checkUrl, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json', ...authHeaders }
                });
                if (response.ok) {
                    const data = await response.json();
                    availableDatasets = data.map(r => r.id);
                    return { connected: true, type: 'graphdb', mode, baseUrl: base, repositories: availableDatasets };
                }
            } catch (err) {
                // Continue to return not connected
            }
            break;

        case 'fuseki':
        default:
            // Fuseki: GET /$/datasets
            checkUrl = `${base}/$/datasets`;
            try {
                const response = await fetch(checkUrl, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json', ...authHeaders }
                });
                if (response.ok) {
                    const data = await response.json();
                    availableDatasets = data.datasets || [];
                    return { connected: true, type: 'fuseki', mode, baseUrl: base, datasets: availableDatasets };
                }
            } catch (err) {
                // Continue to return not connected
            }
            break;
    }

    return { connected: false, type, mode, baseUrl: base, error: 'Could not connect to triplestore' };
}

// =============================================================================
// EXPORT/IMPORT WITH METADATA
// =============================================================================

/**
 * Create a downloadable export package with complete metadata for effortless restore
 * Version 2.0 format includes all necessary information to restore data to any triplestore
 */
function createExportPackage(triples, metadata) {
    // Parse cube URI to extract structured information
    const cubeUri = metadata.cubeUri || '';
    const uriParts = cubeUri.split('/');
    const versionMatch = cubeUri.match(/\/(\d+)\/?$/);
    const version = versionMatch ? parseInt(versionMatch[1]) : null;
    const baseCube = version !== null ? cubeUri.replace(/\/\d+\/?$/, '') : cubeUri;

    // Create a comprehensive JSON wrapper with all restore metadata
    const exportPackage = {
        // Package metadata
        packageVersion: '2.0',
        exportedAt: new Date().toISOString(),
        exportedBy: 'lindas-cube-cleanup',
        format: 'n-triples',

        // Source information (where the data came from)
        source: {
            endpoint: metadata.endpoint,
            dataset: metadata.dataset,
            database: metadata.database,
            repository: metadata.repository,
            triplestoreType: metadata.triplestoreType || 'fuseki',
            triplestoreMode: metadata.triplestoreMode || 'local'
        },

        // Cube metadata for identification
        cube: {
            uri: cubeUri,
            baseCube: baseCube,
            version: version,
            name: metadata.cubeName || uriParts.slice(-2).join('/'),
            graphUri: metadata.graphUri
        },

        // Restore instructions
        restore: {
            targetGraph: metadata.graphUri,
            recommendedDataset: metadata.dataset,
            instructions: [
                'This backup can be restored to any SPARQL-compliant triplestore',
                'The data should be imported into the target graph specified above',
                'For Fuseki: POST to /{dataset}/data?graph=<graphUri>',
                'For Stardog: POST to /{database}?graph=<graphUri>',
                'For GraphDB: POST to /repositories/{repo}/statements?context=<graphUri>'
            ],
            supportedTargets: ['fuseki', 'stardog', 'graphdb']
        },

        // Statistics
        stats: {
            tripleCount: metadata.tripleCount,
            sizeBytes: triples ? Buffer.byteLength(triples, 'utf8') : 0,
            backupId: metadata.backupId
        },

        // Deletion context (if this was a pre-deletion backup)
        deletionContext: metadata.deletionContext || null,

        // The actual data
        data: triples
    };

    return exportPackage;
}

/**
 * Parse an import package to extract metadata and triples
 * Supports both v1.0 and v2.0 export formats
 */
function parseImportPackage(content) {
    try {
        // Try to parse as JSON export package
        const pkg = JSON.parse(content);

        // Check for v2.0 format (packageVersion field)
        if (pkg.packageVersion === '2.0' && pkg.cube && pkg.data) {
            return {
                isPackage: true,
                packageVersion: '2.0',
                metadata: {
                    cubeUri: pkg.cube.uri,
                    baseCube: pkg.cube.baseCube,
                    version: pkg.cube.version,
                    cubeName: pkg.cube.name,
                    graphUri: pkg.cube.graphUri,
                    // Source information
                    sourceEndpoint: pkg.source?.endpoint,
                    sourceDataset: pkg.source?.dataset,
                    sourceDatabase: pkg.source?.database,
                    sourceRepository: pkg.source?.repository,
                    sourceType: pkg.source?.triplestoreType,
                    sourceMode: pkg.source?.triplestoreMode,
                    // Stats
                    tripleCount: pkg.stats?.tripleCount,
                    sizeBytes: pkg.stats?.sizeBytes,
                    backupId: pkg.stats?.backupId,
                    // Export info
                    exportedAt: pkg.exportedAt,
                    exportedBy: pkg.exportedBy
                },
                restore: pkg.restore,
                triples: pkg.data,
                format: pkg.format || 'n-triples'
            };
        }

        // Check for v1.0 format (version field with metadata object)
        if (pkg.version && pkg.metadata && pkg.data) {
            return {
                isPackage: true,
                packageVersion: '1.0',
                metadata: {
                    cubeUri: pkg.metadata.cubeUri,
                    graphUri: pkg.metadata.graphUri,
                    sourceEndpoint: pkg.metadata.sourceEndpoint,
                    sourceDataset: pkg.metadata.sourceDataset,
                    sourceType: pkg.metadata.sourceType || 'fuseki',
                    tripleCount: pkg.metadata.tripleCount,
                    cubeName: pkg.metadata.cubeName,
                    description: pkg.metadata.description
                },
                triples: pkg.data,
                format: pkg.format || 'n-triples'
            };
        }
    } catch (e) {
        // Not JSON, treat as raw N-Triples
    }

    // Fallback: raw N-Triples content
    return {
        isPackage: false,
        packageVersion: null,
        metadata: null,
        triples: content,
        format: 'n-triples'
    };
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =============================================================================
// MULTI-TRIPLESTORE API ENDPOINTS
// =============================================================================

// Check any triplestore connection
app.post('/api/triplestore/check', async (req, res) => {
    try {
        const config = req.body;
        const result = await checkTriplestoreConnection(config);
        res.json(result);
    } catch (error) {
        res.json({ connected: false, error: error.message });
    }
});

// Get triplestore defaults
app.get('/api/triplestore/defaults', (req, res) => {
    res.json(TRIPLESTORE_DEFAULTS);
});

// Get environment information with setup instructions
app.get('/api/environment/info', (req, res) => {
    const { type, mode } = req.query;
    const triplestoreType = type || 'fuseki';
    const triplestoreMode = mode || 'local';

    const config = TRIPLESTORE_DEFAULTS[triplestoreType]?.[triplestoreMode];

    if (!config) {
        return res.status(400).json({ error: 'Invalid triplestore type or mode' });
    }

    res.json({
        type: triplestoreType,
        mode: triplestoreMode,
        isProduction: config.isProduction || false,
        isCloud: triplestoreMode === 'cloud',
        description: config.description || '',
        setupInstructions: config.setupInstructions || '',
        dockerCommand: config.dockerCommand || '',
        warning: config.warning || '',
        freeEditionLimits: config.freeEditionLimits || null,
        defaultEndpoint: config.baseUrl
    });
});

// Check if cloud mode requires warning acknowledgment
app.post('/api/environment/check-mode', (req, res) => {
    const { type, mode } = req.body;
    const config = TRIPLESTORE_DEFAULTS[type]?.[mode];

    if (!config) {
        return res.status(400).json({ error: 'Invalid triplestore type or mode' });
    }

    const isProduction = config.isProduction || false;
    const requiresAcknowledgment = mode === 'cloud' && isProduction;

    res.json({
        type,
        mode,
        isProduction,
        isCloud: mode === 'cloud',
        requiresAcknowledgment,
        warning: config.warning || null,
        description: config.description || ''
    });
});

// Get setup instructions for a specific triplestore
app.get('/api/triplestore/setup/:type', (req, res) => {
    const { type } = req.params;
    const config = TRIPLESTORE_DEFAULTS[type];

    if (!config) {
        return res.status(404).json({ error: 'Unknown triplestore type' });
    }

    const setupInfo = {
        type,
        name: type === 'fuseki' ? 'Apache Fuseki' : type === 'stardog' ? 'Stardog' : 'GraphDB',
        local: {
            description: config.local.description,
            setupInstructions: config.local.setupInstructions,
            dockerCommand: config.local.dockerCommand,
            defaultEndpoint: config.local.baseUrl,
            freeEditionLimits: config.local.freeEditionLimits,
            defaultCredentials: config.local.defaultCredentials
        },
        cloud: {
            description: config.cloud.description,
            warning: config.cloud.warning,
            isProduction: config.cloud.isProduction
        },
        paths: {
            query: config.local.queryPath,
            update: config.local.updatePath,
            data: config.local.dataPath
        }
    };

    res.json(setupInfo);
});

// Execute SPARQL query on any triplestore
app.post('/api/triplestore/query', async (req, res) => {
    try {
        const { type, mode, baseUrl, dataset, database, repository, username, password, query, queryType } = req.body;

        const config = { type, mode, baseUrl, dataset, database, repository, username, password };
        const endpoints = buildEndpoints(config);
        const auth = { username, password };

        const startTime = Date.now();

        if (queryType === 'update') {
            await executeSparqlUpdate(endpoints.updateEndpoint, query, auth);
            const duration = Date.now() - startTime;
            res.json({ success: true, queryType: 'update', message: 'Update executed successfully', duration });
        } else if (queryType === 'construct') {
            const triples = await executeSparqlConstruct(endpoints.queryEndpoint, query, auth);
            const tripleCount = triples.split('\n').filter(line => line.trim()).length;
            const duration = Date.now() - startTime;
            res.json({ success: true, queryType: 'construct', triples, tripleCount, duration });
        } else {
            const result = await executeSparqlSelect(endpoints.queryEndpoint, query, auth);
            const duration = Date.now() - startTime;
            res.json({
                success: true,
                queryType: 'select',
                results: result.results,
                head: result.head,
                duration,
                rowCount: result.results.bindings.length
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Import data to any triplestore
app.post('/api/triplestore/import', async (req, res) => {
    try {
        const { type, mode, baseUrl, dataset, database, repository, username, password, graphUri, triples } = req.body;

        const config = { type, mode, baseUrl, dataset, database, repository, username, password };
        await importData(config, graphUri, triples);

        const tripleCount = triples.split('\n').filter(line => line.trim()).length;
        res.json({ success: true, tripleCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Check Fuseki connection
app.post('/api/fuseki/check', async (req, res) => {
    try {
        const { endpoint } = req.body;
        const fusekiEndpoint = endpoint || DEFAULT_FUSEKI_ENDPOINT;

        // Try to get datasets
        const response = await fetch(`${fusekiEndpoint}/$/datasets`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
            const data = await response.json();
            res.json({
                connected: true,
                datasets: data.datasets || [],
                endpoint: fusekiEndpoint
            });
        } else {
            res.json({ connected: false, error: 'Fuseki not responding' });
        }
    } catch (error) {
        res.json({ connected: false, error: error.message });
    }
});

// List graphs in Fuseki dataset
app.post('/api/fuseki/graphs', async (req, res) => {
    try {
        const { endpoint, dataset } = req.body;
        const sparqlEndpoint = `${endpoint}/${dataset}/query`;

        const query = `
            SELECT DISTINCT ?graph (COUNT(*) as ?tripleCount)
            WHERE {
                GRAPH ?graph { ?s ?p ?o }
            }
            GROUP BY ?graph
            ORDER BY DESC(?tripleCount)
        `;

        const result = await executeSparqlSelect(sparqlEndpoint, query);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List available graphs in LINDAS
app.post('/api/lindas/graphs', async (req, res) => {
    try {
        const { searchTerm } = req.body;

        let query = `
            SELECT DISTINCT ?graph (COUNT(*) as ?tripleCount)
            WHERE {
                GRAPH ?graph { ?s ?p ?o }
                ${searchTerm ? `FILTER(CONTAINS(LCASE(STR(?graph)), LCASE("${searchTerm}")))` : ''}
            }
            GROUP BY ?graph
            ORDER BY DESC(?tripleCount)
            LIMIT 50
        `;

        const result = await executeSparqlSelect(LINDAS_ENDPOINT, query);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List all graphs from LINDAS that contain cubes (much faster than listing all graphs)
app.post('/api/lindas/all-graphs', async (req, res) => {
    try {
        // Only list graphs that contain cube:Cube - this is much faster
        const query = `
            PREFIX cube: <https://cube.link/>
            SELECT DISTINCT ?graph
            WHERE {
                GRAPH ?graph { ?s a cube:Cube }
            }
            ORDER BY ?graph
            LIMIT 200
        `;

        const result = await executeSparqlSelect(LINDAS_ENDPOINT, query);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List all cubes from a LINDAS graph
app.post('/api/lindas/cubes', async (req, res) => {
    try {
        const { graphUri } = req.body;

        if (!graphUri) {
            return res.status(400).json({ error: 'graphUri is required' });
        }

        const query = `
            PREFIX cube: <https://cube.link/>
            PREFIX schema: <http://schema.org/>
            PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

            SELECT DISTINCT ?cube ?title ?version ?baseCube ?dateCreated
            WHERE {
                GRAPH <${graphUri}> {
                    ?cube a cube:Cube .
                    OPTIONAL { ?cube schema:name ?title . FILTER(lang(?title) = "en" || lang(?title) = "de" || lang(?title) = "") }
                    OPTIONAL { ?cube schema:dateCreated ?dateCreated }

                    # Extract version number and base cube from URI
                    BIND(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1") AS ?versionStr)
                    BIND(IF(REGEX(STR(?cube), "^.*/[0-9]+/?$"), xsd:integer(?versionStr), 0) AS ?version)
                    BIND(REPLACE(STR(?cube), "^(.*/[^/]+)/[0-9]+/?$", "$1") AS ?baseCubeStr)
                    BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+/?$"), IRI(?baseCubeStr), ?cube) AS ?baseCube)
                }
            }
            ORDER BY ?baseCube DESC(?version)
            LIMIT 500
        `;

        const result = await executeSparqlSelect(LINDAS_ENDPOINT, query);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Download cube data from LINDAS
app.post('/api/lindas/download-cube', async (req, res) => {
    try {
        const { graphUri, cubeUri } = req.body;

        // Construct query to get all triples for a specific cube
        const query = `
            PREFIX cube: <https://cube.link/>
            PREFIX schema: <http://schema.org/>
            PREFIX sh: <http://www.w3.org/ns/shacl#>
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

            CONSTRUCT {
                ?s ?p ?o .
            }
            WHERE {
                GRAPH <${graphUri}> {
                    {
                        # Cube metadata
                        <${cubeUri}> ?p ?o .
                        BIND(<${cubeUri}> AS ?s)
                    }
                    UNION
                    {
                        # Blank node metadata (second level)
                        <${cubeUri}> ?p1 ?bn .
                        FILTER(isBlank(?bn))
                        ?bn ?p ?o .
                        BIND(?bn AS ?s)
                    }
                    UNION
                    {
                        # Observation constraint (shape)
                        <${cubeUri}> cube:observationConstraint ?shape .
                        ?shape ?p ?o .
                        BIND(?shape AS ?s)
                    }
                    UNION
                    {
                        # Property shapes
                        <${cubeUri}> cube:observationConstraint ?shape .
                        ?shape sh:property ?propShape .
                        ?propShape ?p ?o .
                        BIND(?propShape AS ?s)
                    }
                    UNION
                    {
                        # RDF list items in property shapes
                        <${cubeUri}> cube:observationConstraint ?shape .
                        ?shape sh:property ?propShape .
                        ?propShape sh:in ?list .
                        ?list rdf:rest*/rdf:first ?item .
                        ?list ?p ?o .
                        BIND(?list AS ?s)
                    }
                    UNION
                    {
                        # Observation set
                        <${cubeUri}> cube:observationSet ?obsSet .
                        ?obsSet ?p ?o .
                        BIND(?obsSet AS ?s)
                    }
                    UNION
                    {
                        # Observations
                        <${cubeUri}> cube:observationSet ?obsSet .
                        ?obsSet cube:observation ?obs .
                        ?obs ?p ?o .
                        BIND(?obs AS ?s)
                    }
                }
            }
        `;

        const triples = await executeSparqlConstruct(LINDAS_ENDPOINT, query);
        const tripleCount = triples.split('\n').filter(line => line.trim()).length;

        res.json({
            success: true,
            triples: triples,
            tripleCount: tripleCount,
            cubeUri: cubeUri
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Download entire graph from LINDAS (chunked approach for large graphs)
app.post('/api/lindas/download-graph', async (req, res) => {
    try {
        const { graphUri, offset = 0, limit = 100000 } = req.body;

        const query = `
            CONSTRUCT { ?s ?p ?o }
            WHERE {
                GRAPH <${graphUri}> { ?s ?p ?o }
            }
            OFFSET ${offset}
            LIMIT ${limit}
        `;

        const triples = await executeSparqlConstruct(LINDAS_ENDPOINT, query);
        const tripleCount = triples.split('\n').filter(line => line.trim()).length;

        res.json({
            success: true,
            triples: triples,
            tripleCount: tripleCount,
            offset: offset,
            hasMore: tripleCount >= limit
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Import triples into Fuseki
app.post('/api/fuseki/import', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, triples } = req.body;
        const dataEndpoint = `${endpoint}/${dataset}/data`;

        const response = await fetch(`${dataEndpoint}?graph=${encodeURIComponent(graphUri)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/n-triples'
            },
            body: triples
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Import failed: ${response.status} - ${text}`);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List cube versions in a graph (uses universal query 01)
app.post('/api/cubes/list-versions', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, username, password } = req.body;
        const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : endpoint;
        const auth = { username, password };

        let query = loadQuery('01-list-all-cube-versions.rq');
        if (!query) {
            // Fallback query
            query = `
                PREFIX cube: <https://cube.link/>
                PREFIX schema: <http://schema.org/>
                PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

                SELECT ?baseCube ?cube ?version ?dateCreated ?dateModified ?title
                WHERE {
                    GRAPH <GRAPH_URI> {
                        ?cube a cube:Cube .
                        OPTIONAL { ?cube schema:dateCreated ?dateCreated }
                        OPTIONAL { ?cube schema:dateModified ?dateModified }
                        OPTIONAL { ?cube schema:name ?title . FILTER(LANG(?title) = "de" || LANG(?title) = "") }

                        BIND(REPLACE(STR(?cube), "^(.*/[^/]+)/[0-9]+/?$", "$1") AS ?baseCube)
                        BIND(REPLACE(STR(?cube), "^.*/([^/]+)/([0-9]+)/?$", "$2") AS ?versionStr)
                        BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+/?$"), xsd:integer(?versionStr), 0) AS ?version)
                    }
                }
                ORDER BY ?baseCube DESC(?version)
            `;
        }

        query = query.replace(/<GRAPH_URI>/g, `<${graphUri}>`);

        const result = await executeSparqlSelect(sparqlEndpoint, query, auth);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Count versions per cube (uses universal query 02)
app.post('/api/cubes/count-versions', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, username, password } = req.body;
        const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : endpoint;
        const auth = { username, password };

        let query = loadQuery('02-count-versions-per-cube.rq');
        if (!query) {
            query = `
                PREFIX cube: <https://cube.link/>
                PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

                SELECT ?baseCube (COUNT(DISTINCT ?cube) AS ?versionCount)
                       (GROUP_CONCAT(DISTINCT ?versionStr; separator=", ") AS ?versions)
                WHERE {
                    GRAPH <GRAPH_URI> {
                        ?cube a cube:Cube .
                        BIND(REPLACE(STR(?cube), "^(.*/[^/]+)/[0-9]+/?$", "$1") AS ?baseCube)
                        BIND(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1") AS ?versionStr)
                        FILTER(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+/?$"))
                    }
                }
                GROUP BY ?baseCube
                HAVING (COUNT(DISTINCT ?cube) > 2)
                ORDER BY DESC(?versionCount)
            `;
        }

        query = query.replace(/<GRAPH_URI>/g, `<${graphUri}>`);

        const result = await executeSparqlSelect(sparqlEndpoint, query, auth);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Identify versions to delete (uses universal query 03)
app.post('/api/cubes/identify-deletions', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, username, password } = req.body;
        const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : endpoint;
        const auth = { username, password };

        let query = loadQuery('03-identify-versions-to-delete.rq');
        if (!query) {
            query = `
                PREFIX cube: <https://cube.link/>
                PREFIX schema: <http://schema.org/>
                PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

                SELECT ?baseCube ?cube ?version ?rank ?action ?title
                WHERE {
                    GRAPH <GRAPH_URI> {
                        ?cube a cube:Cube .
                        OPTIONAL { ?cube schema:name ?title . FILTER(LANG(?title) = "de" || LANG(?title) = "") }

                        BIND(REPLACE(STR(?cube), "^(.*/[^/]+)/[0-9]+/?$", "$1") AS ?baseCube)
                        BIND(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1") AS ?versionStr)
                        BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+/?$"), xsd:integer(?versionStr), 0) AS ?version)

                        OPTIONAL {
                            SELECT ?cube (COUNT(DISTINCT ?newerCube) AS ?newerCount)
                            WHERE {
                                GRAPH <GRAPH_URI> {
                                    ?cube a cube:Cube .
                                    ?newerCube a cube:Cube .

                                    BIND(REPLACE(STR(?cube), "^(.*/[^/]+)/[0-9]+/?$", "$1") AS ?baseCube1)
                                    BIND(REPLACE(STR(?newerCube), "^(.*/[^/]+)/[0-9]+/?$", "$1") AS ?baseCube2)
                                    FILTER(?baseCube1 = ?baseCube2)

                                    BIND(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1") AS ?v1Str)
                                    BIND(REPLACE(STR(?newerCube), "^.*/([0-9]+)/?$", "$1") AS ?v2Str)
                                    BIND(xsd:integer(?v1Str) AS ?v1)
                                    BIND(xsd:integer(?v2Str) AS ?v2)
                                    FILTER(?v2 > ?v1)
                                }
                            }
                            GROUP BY ?cube
                        }

                        BIND(COALESCE(?newerCount, 0) + 1 AS ?rank)
                        BIND(IF(?rank <= 2, "KEEP", "DELETE") AS ?action)
                    }
                    FILTER(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+/?$"))
                }
                ORDER BY ?baseCube DESC(?version)
            `;
        }

        query = query.replace(/<GRAPH_URI>/g, `<${graphUri}>`);

        const result = await executeSparqlSelect(sparqlEndpoint, query, auth);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Preview triples to delete for a specific cube
app.post('/api/cubes/preview-deletion', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, cubeUri, username, password } = req.body;
        const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : endpoint;
        const auth = { username, password };

        const query = `
            PREFIX cube: <https://cube.link/>
            PREFIX sh: <http://www.w3.org/ns/shacl#>
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

            SELECT
                (COUNT(DISTINCT ?metaTriple) AS ?metaTriples)
                (COUNT(DISTINCT ?shapeTriple) AS ?shapeTriples)
                (COUNT(DISTINCT ?obsTriple) AS ?observationTriples)
            WHERE {
                GRAPH <${graphUri}> {
                    {
                        <${cubeUri}> ?p1 ?o1 .
                        BIND(CONCAT(STR(<${cubeUri}>), STR(?p1), STR(?o1)) AS ?metaTriple)
                    }
                    UNION
                    {
                        <${cubeUri}> ?p2 ?bn2 .
                        FILTER(isBlank(?bn2))
                        ?bn2 ?p3 ?o3 .
                        BIND(CONCAT(STR(?bn2), STR(?p3), STR(?o3)) AS ?metaTriple)
                    }
                    UNION
                    {
                        <${cubeUri}> cube:observationConstraint ?shape .
                        ?shape ?p4 ?o4 .
                        BIND(CONCAT(STR(?shape), STR(?p4), STR(?o4)) AS ?shapeTriple)
                    }
                    UNION
                    {
                        <${cubeUri}> cube:observationConstraint ?shape .
                        ?shape sh:property ?propShape .
                        ?propShape ?p5 ?o5 .
                        BIND(CONCAT(STR(?propShape), STR(?p5), STR(?o5)) AS ?shapeTriple)
                    }
                    UNION
                    {
                        <${cubeUri}> cube:observationSet ?obsSet .
                        ?obsSet ?p6 ?o6 .
                        BIND(CONCAT(STR(?obsSet), STR(?p6), STR(?o6)) AS ?obsTriple)
                    }
                    UNION
                    {
                        <${cubeUri}> cube:observationSet ?obsSet .
                        ?obsSet cube:observation ?obs .
                        ?obs ?p7 ?o7 .
                        BIND(CONCAT(STR(?obs), STR(?p7), STR(?o7)) AS ?obsTriple)
                    }
                }
            }
        `;

        const result = await executeSparqlSelect(sparqlEndpoint, query, auth);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete observations - Query 07
app.post('/api/cubes/delete-observations', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, cubeUri, username, password } = req.body;
        const updateEndpoint = dataset ? `${endpoint}/${dataset}/update` : `${endpoint}/update`;
        const auth = { username, password };

        const query = `
            PREFIX cube: <https://cube.link/>

            DELETE {
                GRAPH <${graphUri}> {
                    ?obs ?p ?o .
                }
            }
            WHERE {
                GRAPH <${graphUri}> {
                    <${cubeUri}> cube:observationSet ?obsSet .
                    ?obsSet cube:observation ?obs .
                    ?obs ?p ?o .
                }
            }
        `;

        await executeSparqlUpdate(updateEndpoint, query, auth);
        res.json({ success: true, message: 'Deleted observation triples' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete observation links - Query 08
app.post('/api/cubes/delete-observation-links', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, cubeUri, username, password } = req.body;
        const updateEndpoint = dataset ? `${endpoint}/${dataset}/update` : `${endpoint}/update`;
        const auth = { username, password };

        const query = `
            PREFIX cube: <https://cube.link/>

            DELETE {
                GRAPH <${graphUri}> {
                    ?obsSet cube:observation ?obs .
                }
            }
            WHERE {
                GRAPH <${graphUri}> {
                    <${cubeUri}> cube:observationSet ?obsSet .
                    ?obsSet cube:observation ?obs .
                }
            }
        `;

        await executeSparqlUpdate(updateEndpoint, query, auth);
        res.json({ success: true, message: 'Deleted observation links' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete cube metadata - Query 09
app.post('/api/cubes/delete-metadata', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, cubeUri, username, password } = req.body;
        const updateEndpoint = dataset ? `${endpoint}/${dataset}/update` : `${endpoint}/update`;
        const auth = { username, password };

        const query = `
            PREFIX cube: <https://cube.link/>
            PREFIX sh: <http://www.w3.org/ns/shacl#>
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

            DELETE {
                GRAPH <${graphUri}> {
                    ?s ?p ?o .
                }
            }
            WHERE {
                GRAPH <${graphUri}> {
                    {
                        # Cube direct properties
                        <${cubeUri}> ?p ?o .
                        BIND(<${cubeUri}> AS ?s)
                    }
                    UNION
                    {
                        # Blank node properties
                        <${cubeUri}> ?p1 ?bn .
                        FILTER(isBlank(?bn))
                        ?bn ?p ?o .
                        BIND(?bn AS ?s)
                    }
                    UNION
                    {
                        # Observation constraint shape
                        <${cubeUri}> cube:observationConstraint ?shape .
                        ?shape ?p ?o .
                        BIND(?shape AS ?s)
                    }
                    UNION
                    {
                        # Property shapes
                        <${cubeUri}> cube:observationConstraint ?shape .
                        ?shape sh:property ?propShape .
                        ?propShape ?p ?o .
                        BIND(?propShape AS ?s)
                    }
                    UNION
                    {
                        # RDF list items
                        <${cubeUri}> cube:observationConstraint ?shape .
                        ?shape sh:property ?propShape .
                        ?propShape sh:in ?list .
                        ?list rdf:rest*/rdf:first ?item .
                        ?list ?p ?o .
                        BIND(?list AS ?s)
                    }
                    UNION
                    {
                        # Observation set
                        <${cubeUri}> cube:observationSet ?obsSet .
                        ?obsSet ?p ?o .
                        BIND(?obsSet AS ?s)
                    }
                }
            }
        `;

        await executeSparqlUpdate(updateEndpoint, query, auth);
        res.json({ success: true, message: 'Deleted cube metadata and shapes' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Count remaining observations for a cube
app.post('/api/cubes/count-observations', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, cubeUri, username, password } = req.body;
        const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : endpoint;
        const auth = { username, password };

        const query = `
            PREFIX cube: <https://cube.link/>

            SELECT (COUNT(*) AS ?count)
            WHERE {
                GRAPH <${graphUri}> {
                    <${cubeUri}> cube:observationSet ?obsSet .
                    ?obsSet cube:observation ?obs .
                    ?obs ?p ?o .
                }
            }
        `;

        const result = await executeSparqlSelect(sparqlEndpoint, query, auth);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Count total triples in a graph
app.post('/api/cubes/count-triples', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, username, password } = req.body;
        const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : endpoint;
        const auth = { username, password };

        const query = `
            SELECT (COUNT(*) AS ?count)
            WHERE {
                GRAPH <${graphUri}> { ?s ?p ?o }
            }
        `;

        const result = await executeSparqlSelect(sparqlEndpoint, query, auth);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create Fuseki dataset
app.post('/api/fuseki/create-dataset', async (req, res) => {
    try {
        const { endpoint, datasetName } = req.body;

        const response = await fetch(`${endpoint}/$/datasets`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `dbName=${datasetName}&dbType=tdb2`
        });

        if (!response.ok && response.status !== 409) { // 409 means already exists
            const text = await response.text();
            throw new Error(`Failed to create dataset: ${response.status} - ${text}`);
        }

        res.json({ success: true, dataset: datasetName });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== QUERY EDITOR API ==========

// List all graphs in triplestore (for Query Editor dropdown)
app.post('/api/query/graphs', async (req, res) => {
    try {
        const { endpoint, dataset, username, password } = req.body;
        const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : `${endpoint}/query`;

        const query = `
            SELECT DISTINCT ?graph (COUNT(*) as ?tripleCount)
            WHERE {
                GRAPH ?graph { ?s ?p ?o }
            }
            GROUP BY ?graph
            ORDER BY DESC(?tripleCount)
            LIMIT 100
        `;

        const result = await executeSparqlSelect(sparqlEndpoint, query, { username, password });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List all cubes in a graph (for Query Editor dropdown)
app.post('/api/query/cubes', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, username, password } = req.body;
        const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : `${endpoint}/query`;

        const query = `
            PREFIX cube: <https://cube.link/>
            PREFIX schema: <http://schema.org/>
            PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

            SELECT DISTINCT ?cube ?title ?version ?dateCreated
            WHERE {
                GRAPH <${graphUri}> {
                    ?cube a cube:Cube .
                    OPTIONAL { ?cube schema:name ?title . FILTER(lang(?title) = "en" || lang(?title) = "de" || lang(?title) = "") }
                    OPTIONAL { ?cube schema:dateCreated ?dateCreated }

                    # Extract version number from URI
                    BIND(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1") AS ?versionStr)
                    BIND(IF(REGEX(STR(?cube), "^.*/[0-9]+/?$"), xsd:integer(?versionStr), 0) AS ?version)
                }
            }
            ORDER BY ?cube DESC(?version)
            LIMIT 200
        `;

        const result = await executeSparqlSelect(sparqlEndpoint, query, { username, password });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Execute raw SPARQL query (SELECT or UPDATE)
app.post('/api/query/execute', async (req, res) => {
    try {
        const { endpoint, dataset, query, queryType, username, password } = req.body;
        const auth = { username, password };

        if (!query || !query.trim()) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const startTime = Date.now();

        if (queryType === 'update') {
            // Execute UPDATE query
            const updateEndpoint = dataset ? `${endpoint}/${dataset}/update` : `${endpoint}/update`;
            await executeSparqlUpdate(updateEndpoint, query, auth);
            const duration = Date.now() - startTime;

            res.json({
                success: true,
                queryType: 'update',
                message: 'Update query executed successfully',
                duration
            });
        } else {
            // Execute SELECT query
            const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : `${endpoint}/query`;
            const result = await executeSparqlSelect(sparqlEndpoint, query, auth);
            const duration = Date.now() - startTime;

            res.json({
                success: true,
                queryType: 'select',
                results: result.results,
                head: result.head,
                duration,
                rowCount: result.results.bindings.length
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== BACKUP AND RESTORE API ==========

// Clean up old backups (older than BACKUP_RETENTION_DAYS)
function cleanupOldBackups() {
    const now = Date.now();
    const maxAge = BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    try {
        const files = fs.readdirSync(BACKUP_DIR);
        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(BACKUP_DIR, file);
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > maxAge) {
                    // Delete the metadata file and its associated .nt file
                    fs.unlinkSync(filePath);
                    const ntFile = filePath.replace('.json', '.nt');
                    if (fs.existsSync(ntFile)) {
                        fs.unlinkSync(ntFile);
                    }
                    console.log(`Cleaned up old backup: ${file}`);
                }
            }
        }
    } catch (error) {
        console.error('Error cleaning up old backups:', error);
    }
}

// Run cleanup on startup and every hour
cleanupOldBackups();
setInterval(cleanupOldBackups, 60 * 60 * 1000);

// Create backup before deletion
app.post('/api/backup/create', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, cubeUri } = req.body;
        const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : endpoint;

        // CONSTRUCT query to get all triples for the cube
        const query = `
            PREFIX cube: <https://cube.link/>
            PREFIX sh: <http://www.w3.org/ns/shacl#>
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

            CONSTRUCT {
                ?s ?p ?o .
            }
            WHERE {
                GRAPH <${graphUri}> {
                    {
                        <${cubeUri}> ?p ?o .
                        BIND(<${cubeUri}> AS ?s)
                    }
                    UNION
                    {
                        <${cubeUri}> ?p1 ?bn .
                        FILTER(isBlank(?bn))
                        ?bn ?p ?o .
                        BIND(?bn AS ?s)
                    }
                    UNION
                    {
                        <${cubeUri}> cube:observationConstraint ?shape .
                        ?shape ?p ?o .
                        BIND(?shape AS ?s)
                    }
                    UNION
                    {
                        <${cubeUri}> cube:observationConstraint ?shape .
                        ?shape sh:property ?propShape .
                        ?propShape ?p ?o .
                        BIND(?propShape AS ?s)
                    }
                    UNION
                    {
                        <${cubeUri}> cube:observationConstraint ?shape .
                        ?shape sh:property ?propShape .
                        ?propShape sh:in ?list .
                        ?list rdf:rest*/rdf:first ?item .
                        ?list ?p ?o .
                        BIND(?list AS ?s)
                    }
                    UNION
                    {
                        <${cubeUri}> cube:observationSet ?obsSet .
                        ?obsSet ?p ?o .
                        BIND(?obsSet AS ?s)
                    }
                    UNION
                    {
                        <${cubeUri}> cube:observationSet ?obsSet .
                        ?obsSet cube:observation ?obs .
                        ?obs ?p ?o .
                        BIND(?obs AS ?s)
                    }
                }
            }
        `;

        const headers = {
            'Accept': 'application/n-triples',
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        const response = await fetch(sparqlEndpoint, {
            method: 'POST',
            headers: headers,
            body: `query=${encodeURIComponent(query)}`
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Backup query failed: ${response.status} - ${text}`);
        }

        const triples = await response.text();
        const tripleCount = triples.split('\n').filter(line => line.trim()).length;

        // Generate backup ID and filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const cubeName = cubeUri.split('/').slice(-2).join('_');
        const backupId = `${cubeName}_${timestamp}`;
        const ntFilePath = path.join(BACKUP_DIR, `${backupId}.nt`);
        const metaFilePath = path.join(BACKUP_DIR, `${backupId}.json`);

        // Save triples
        fs.writeFileSync(ntFilePath, triples);

        // Save metadata
        const metadata = {
            backupId: backupId,
            cubeUri: cubeUri,
            graphUri: graphUri,
            endpoint: endpoint,
            dataset: dataset,
            tripleCount: tripleCount,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
        };
        fs.writeFileSync(metaFilePath, JSON.stringify(metadata, null, 2));

        res.json({
            success: true,
            backupId: backupId,
            tripleCount: tripleCount,
            expiresAt: metadata.expiresAt
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List all backups
app.get('/api/backup/list', (req, res) => {
    try {
        cleanupOldBackups(); // Clean up before listing

        const files = fs.readdirSync(BACKUP_DIR);
        const backups = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(BACKUP_DIR, file);
                const metadata = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                // Check if the .nt file exists
                const ntFile = filePath.replace('.json', '.nt');
                if (fs.existsSync(ntFile)) {
                    const stats = fs.statSync(ntFile);
                    metadata.fileSize = stats.size;
                    backups.push(metadata);
                }
            }
        }

        // Sort by creation date (newest first)
        backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({ backups: backups });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get backup details
app.get('/api/backup/:backupId', (req, res) => {
    try {
        const { backupId } = req.params;
        const metaFilePath = path.join(BACKUP_DIR, `${backupId}.json`);

        if (!fs.existsSync(metaFilePath)) {
            return res.status(404).json({ error: 'Backup not found' });
        }

        const metadata = JSON.parse(fs.readFileSync(metaFilePath, 'utf8'));
        const ntFilePath = path.join(BACKUP_DIR, `${backupId}.nt`);

        if (fs.existsSync(ntFilePath)) {
            const stats = fs.statSync(ntFilePath);
            metadata.fileSize = stats.size;
        }

        res.json(metadata);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Restore from backup
app.post('/api/backup/restore', async (req, res) => {
    try {
        const { backupId, endpoint, dataset } = req.body;
        const metaFilePath = path.join(BACKUP_DIR, `${backupId}.json`);
        const ntFilePath = path.join(BACKUP_DIR, `${backupId}.nt`);

        if (!fs.existsSync(metaFilePath) || !fs.existsSync(ntFilePath)) {
            return res.status(404).json({ error: 'Backup not found' });
        }

        const metadata = JSON.parse(fs.readFileSync(metaFilePath, 'utf8'));
        const triples = fs.readFileSync(ntFilePath, 'utf8');

        // Import triples back to Fuseki
        const fusekiEndpoint = endpoint || metadata.endpoint;
        const fusekiDataset = dataset || metadata.dataset;
        const dataEndpoint = `${fusekiEndpoint}/${fusekiDataset}/data`;

        const response = await fetch(`${dataEndpoint}?graph=${encodeURIComponent(metadata.graphUri)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/n-triples'
            },
            body: triples
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Restore failed: ${response.status} - ${text}`);
        }

        res.json({
            success: true,
            restoredTriples: metadata.tripleCount,
            cubeUri: metadata.cubeUri,
            graphUri: metadata.graphUri
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export backup as downloadable file with full metadata
app.get('/api/backup/:backupId/export', (req, res) => {
    try {
        const { backupId } = req.params;
        const metaFilePath = path.join(BACKUP_DIR, `${backupId}.json`);
        const ntFilePath = path.join(BACKUP_DIR, `${backupId}.nt`);

        if (!fs.existsSync(metaFilePath) || !fs.existsSync(ntFilePath)) {
            return res.status(404).json({ error: 'Backup not found' });
        }

        const metadata = JSON.parse(fs.readFileSync(metaFilePath, 'utf8'));
        const triples = fs.readFileSync(ntFilePath, 'utf8');

        // Create export package with all metadata for effortless restore
        const exportPackage = createExportPackage(triples, metadata);

        // Set headers for file download
        const filename = `${backupId}_export.lindas.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.json(exportPackage);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Upload and import backup file
app.post('/api/backup/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const content = fs.readFileSync(req.file.path, 'utf8');
        const parsed = parseImportPackage(content);

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        // Return parsed content and metadata for user to review before import
        res.json({
            success: true,
            isPackage: parsed.isPackage,
            metadata: parsed.metadata,
            tripleCount: parsed.triples.split('\n').filter(line => line.trim()).length,
            format: parsed.format,
            // Store triples temporarily for the actual import step
            tempId: Date.now().toString()
        });

        // Store in temp storage for import step
        const tempPath = path.join(EXPORT_DIR, `temp_${Date.now()}.json`);
        fs.writeFileSync(tempPath, JSON.stringify(parsed));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Import uploaded file to triplestore
app.post('/api/backup/import', async (req, res) => {
    try {
        const {
            tempId,
            type, mode, baseUrl, dataset, database, repository, username, password,
            graphUri,
            overrideGraph
        } = req.body;

        // Find temp file
        const tempFiles = fs.readdirSync(EXPORT_DIR).filter(f => f.startsWith('temp_'));
        let parsed = null;
        let tempPath = null;

        for (const file of tempFiles) {
            const filePath = path.join(EXPORT_DIR, file);
            try {
                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                // Use the most recent temp file or match by tempId
                if (!parsed || file.includes(tempId)) {
                    parsed = content;
                    tempPath = filePath;
                }
            } catch (e) {
                // Skip invalid files
            }
        }

        if (!parsed) {
            return res.status(400).json({ error: 'No uploaded file found. Please upload a file first.' });
        }

        // Determine target graph
        const targetGraph = overrideGraph || graphUri || (parsed.metadata?.graphUri);
        if (!targetGraph) {
            return res.status(400).json({ error: 'No target graph specified' });
        }

        // Import to triplestore
        const config = { type: type || 'fuseki', mode: mode || 'local', baseUrl, dataset, database, repository, username, password };
        await importData(config, targetGraph, parsed.triples);

        // Clean up temp file
        if (tempPath && fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }

        // Also clean up old temp files (older than 1 hour)
        const maxAge = 60 * 60 * 1000;
        const now = Date.now();
        for (const file of tempFiles) {
            const filePath = path.join(EXPORT_DIR, file);
            try {
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > maxAge) {
                    fs.unlinkSync(filePath);
                }
            } catch (e) {
                // Skip errors
            }
        }

        res.json({
            success: true,
            importedTriples: parsed.triples.split('\n').filter(line => line.trim()).length,
            graphUri: targetGraph,
            metadata: parsed.metadata
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Restore backup to any triplestore (multi-triplestore aware)
app.post('/api/backup/restore-to', async (req, res) => {
    try {
        const {
            backupId,
            type, mode, baseUrl, dataset, database, repository, username, password,
            graphUri
        } = req.body;

        const metaFilePath = path.join(BACKUP_DIR, `${backupId}.json`);
        const ntFilePath = path.join(BACKUP_DIR, `${backupId}.nt`);

        if (!fs.existsSync(metaFilePath) || !fs.existsSync(ntFilePath)) {
            return res.status(404).json({ error: 'Backup not found' });
        }

        const metadata = JSON.parse(fs.readFileSync(metaFilePath, 'utf8'));
        const triples = fs.readFileSync(ntFilePath, 'utf8');

        // Use provided graph or original
        const targetGraph = graphUri || metadata.graphUri;

        // Import to specified triplestore
        const config = { type: type || 'fuseki', mode: mode || 'local', baseUrl, dataset, database, repository, username, password };
        await importData(config, targetGraph, triples);

        res.json({
            success: true,
            restoredTriples: metadata.tripleCount,
            cubeUri: metadata.cubeUri,
            graphUri: targetGraph
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a backup
app.delete('/api/backup/:backupId', (req, res) => {
    try {
        const { backupId } = req.params;
        const metaFilePath = path.join(BACKUP_DIR, `${backupId}.json`);
        const ntFilePath = path.join(BACKUP_DIR, `${backupId}.nt`);

        if (!fs.existsSync(metaFilePath)) {
            return res.status(404).json({ error: 'Backup not found' });
        }

        if (fs.existsSync(metaFilePath)) {
            fs.unlinkSync(metaFilePath);
        }
        if (fs.existsSync(ntFilePath)) {
            fs.unlinkSync(ntFilePath);
        }

        res.json({ success: true, message: 'Backup deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`LINDAS Cube Cleanup Demo Server running on http://localhost:${PORT}`);
    console.log(`Fuseki expected at: ${DEFAULT_FUSEKI_ENDPOINT}`);
    console.log(`LINDAS endpoint: ${LINDAS_ENDPOINT}`);
    console.log(`Backup directory: ${BACKUP_DIR}`);
    console.log(`Backup retention: ${BACKUP_RETENTION_DAYS} days`);
});
