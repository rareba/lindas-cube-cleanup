const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Backup directory
const BACKUP_DIR = path.join(__dirname, 'backups');
const BACKUP_RETENTION_DAYS = 7;

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Default endpoints
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

// Execute SPARQL SELECT query
async function executeSparqlSelect(endpoint, query, graphUri = null) {
    const headers = {
        'Accept': 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded'
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
async function executeSparqlUpdate(endpoint, query) {
    const updateEndpoint = endpoint.endsWith('/update') ? endpoint : `${endpoint}/update`;

    const headers = {
        'Content-Type': 'application/sparql-update'
    };

    const response = await fetch(updateEndpoint, {
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
async function executeSparqlConstruct(endpoint, query) {
    const headers = {
        'Accept': 'application/n-triples',
        'Content-Type': 'application/x-www-form-urlencoded'
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

// API Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
        const { endpoint, dataset, graphUri } = req.body;
        const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : endpoint;

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

        const result = await executeSparqlSelect(sparqlEndpoint, query);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Count versions per cube (uses universal query 02)
app.post('/api/cubes/count-versions', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri } = req.body;
        const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : endpoint;

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

        const result = await executeSparqlSelect(sparqlEndpoint, query);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Identify versions to delete (uses universal query 03)
app.post('/api/cubes/identify-deletions', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri } = req.body;
        const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : endpoint;

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

        const result = await executeSparqlSelect(sparqlEndpoint, query);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Preview triples to delete for a specific cube
app.post('/api/cubes/preview-deletion', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, cubeUri } = req.body;
        const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : endpoint;

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

        const result = await executeSparqlSelect(sparqlEndpoint, query);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete observations - Query 07
app.post('/api/cubes/delete-observations', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, cubeUri } = req.body;
        const updateEndpoint = dataset ? `${endpoint}/${dataset}/update` : `${endpoint}/update`;

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

        await executeSparqlUpdate(updateEndpoint, query);
        res.json({ success: true, message: 'Deleted observation triples' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete observation links - Query 08
app.post('/api/cubes/delete-observation-links', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, cubeUri } = req.body;
        const updateEndpoint = dataset ? `${endpoint}/${dataset}/update` : `${endpoint}/update`;

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

        await executeSparqlUpdate(updateEndpoint, query);
        res.json({ success: true, message: 'Deleted observation links' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete cube metadata - Query 09
app.post('/api/cubes/delete-metadata', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, cubeUri } = req.body;
        const updateEndpoint = dataset ? `${endpoint}/${dataset}/update` : `${endpoint}/update`;

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

        await executeSparqlUpdate(updateEndpoint, query);
        res.json({ success: true, message: 'Deleted cube metadata and shapes' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Count remaining observations for a cube
app.post('/api/cubes/count-observations', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri, cubeUri } = req.body;
        const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : endpoint;

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

        const result = await executeSparqlSelect(sparqlEndpoint, query);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Count total triples in a graph
app.post('/api/cubes/count-triples', async (req, res) => {
    try {
        const { endpoint, dataset, graphUri } = req.body;
        const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/query` : endpoint;

        const query = `
            SELECT (COUNT(*) AS ?count)
            WHERE {
                GRAPH <${graphUri}> { ?s ?p ?o }
            }
        `;

        const result = await executeSparqlSelect(sparqlEndpoint, query);
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

// Execute raw SPARQL query (SELECT or UPDATE)
app.post('/api/query/execute', async (req, res) => {
    try {
        const { endpoint, dataset, query, queryType } = req.body;

        if (!query || !query.trim()) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const startTime = Date.now();

        if (queryType === 'update') {
            // Execute UPDATE query
            const updateEndpoint = dataset ? `${endpoint}/${dataset}/update` : `${endpoint}/update`;
            await executeSparqlUpdate(updateEndpoint, query);
            const duration = Date.now() - startTime;

            res.json({
                success: true,
                queryType: 'update',
                message: 'Update query executed successfully',
                duration
            });
        } else {
            // Execute SELECT query
            const sparqlEndpoint = dataset ? `${endpoint}/${dataset}/sparql` : `${endpoint}/sparql`;
            const result = await executeSparqlSelect(sparqlEndpoint, query);
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
