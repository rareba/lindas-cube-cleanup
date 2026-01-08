/**
 * Ontotext GraphDB Adapter
 *
 * GraphDB-specific implementation:
 * - Query endpoint: /repositories/{repo}
 * - Update endpoint: /repositories/{repo}/statements
 * - Bulk load: POST to /repositories/{repo}/statements with context param
 * - Supports both Free and Enterprise editions
 */
const fetch = require('node-fetch');
const BaseTriplestoreAdapter = require('./base');

class GraphDBAdapter extends BaseTriplestoreAdapter {
    constructor(config) {
        super(config);

        // Extract repository name and base URL
        const match = this.queryEndpoint.match(/\/repositories\/([^\/]+)$/);
        this.repository = match ? match[1] : null;
        this.baseUrl = this.queryEndpoint.replace(/\/repositories\/[^\/]+$/, '');

        // GraphDB uses /statements endpoint for updates
        if (!this.updateEndpoint) {
            this.updateEndpoint = `${this.queryEndpoint}/statements`;
        }
    }

    /**
     * Execute a SELECT/ASK query
     * GraphDB accepts queries on the repository endpoint
     */
    async query(query) {
        this.logger.debug('Executing SPARQL query on GraphDB', { endpoint: this.queryEndpoint });

        // GraphDB accepts query as form parameter or in body
        const response = await fetch(this.queryEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sparql-query',
                'Accept': 'application/sparql-results+json',
                ...this.getAuthHeaders()
            },
            body: query
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`GraphDB query failed (${response.status}): ${error}`);
        }

        return response.json();
    }

    /**
     * Execute a SPARQL UPDATE query
     * GraphDB uses /statements endpoint
     */
    async update(query) {
        this.logger.debug('Executing SPARQL UPDATE on GraphDB', { endpoint: this.updateEndpoint });

        const response = await fetch(this.updateEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sparql-update',
                ...this.getAuthHeaders()
            },
            body: query
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`GraphDB UPDATE failed (${response.status}): ${error}`);
        }

        return true;
    }

    /**
     * Bulk load N-Triples via statements endpoint
     * GraphDB uses 'context' parameter for named graph
     */
    async bulkLoad(graphUri, ntriples) {
        const url = `${this.updateEndpoint}?context=${encodeURIComponent(`<${graphUri}>`)}`;

        this.logger.debug('Bulk loading to GraphDB', {
            repository: this.repository,
            graph: graphUri,
            size: ntriples.length
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/n-triples',
                ...this.getAuthHeaders()
            },
            body: ntriples
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`GraphDB bulk load failed (${response.status}): ${error}`);
        }

        return true;
    }

    /**
     * Clear a named graph
     */
    async clearGraph(graphUri) {
        const url = `${this.updateEndpoint}?context=${encodeURIComponent(`<${graphUri}>`)}`;

        this.logger.info('Clearing graph in GraphDB', { graph: graphUri });

        const response = await fetch(url, {
            method: 'DELETE',
            headers: this.getAuthHeaders()
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`GraphDB clear graph failed (${response.status}): ${error}`);
        }

        return true;
    }

    /**
     * Get repository size (number of statements)
     */
    async getRepositorySize() {
        const url = `${this.queryEndpoint}/size`;

        const response = await fetch(url, {
            method: 'GET',
            headers: this.getAuthHeaders()
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`GraphDB get size failed (${response.status}): ${error}`);
        }

        return parseInt(await response.text(), 10);
    }

    /**
     * List all named graphs
     */
    async listGraphs() {
        const url = `${this.queryEndpoint}/contexts`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/sparql-results+json',
                ...this.getAuthHeaders()
            }
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`GraphDB list graphs failed (${response.status}): ${error}`);
        }

        const result = await response.json();
        return result.results.bindings.map(b => b.contextID.value);
    }

    getType() {
        return 'graphdb';
    }
}

module.exports = GraphDBAdapter;
