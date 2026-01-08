/**
 * Stardog Adapter
 *
 * Stardog-specific implementation:
 * - Query endpoint: /{database}/query
 * - Update endpoint: /{database}/update
 * - Bulk load: POST to /{database} with Content-Type and graph param
 * - Authentication: Usually Basic auth required
 */
const fetch = require('node-fetch');
const BaseTriplestoreAdapter = require('./base');

class StardogAdapter extends BaseTriplestoreAdapter {
    constructor(config) {
        super(config);

        // Extract database name from endpoint for bulk operations
        const match = this.queryEndpoint.match(/\/([^\/]+)\/query$/);
        this.database = match ? match[1] : null;
        this.baseUrl = this.queryEndpoint.replace(/\/[^\/]+\/query$/, '');
    }

    /**
     * Execute a SELECT/ASK query
     * Stardog uses different content type handling
     */
    async query(query) {
        this.logger.debug('Executing SPARQL query on Stardog', { endpoint: this.queryEndpoint });

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
            throw new Error(`Stardog query failed (${response.status}): ${error}`);
        }

        return response.json();
    }

    /**
     * Bulk load N-Triples via Stardog's data endpoint
     * POST to /{database} with graph-uri parameter
     */
    async bulkLoad(graphUri, ntriples) {
        if (!this.database) {
            throw new Error('Could not determine Stardog database name from endpoint');
        }

        const url = `${this.baseUrl}/${this.database}?graph-uri=${encodeURIComponent(graphUri)}`;

        this.logger.debug('Bulk loading to Stardog', {
            database: this.database,
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
            throw new Error(`Stardog bulk load failed (${response.status}): ${error}`);
        }

        return true;
    }

    /**
     * Clear a named graph in Stardog
     */
    async clearGraph(graphUri) {
        const query = `CLEAR GRAPH <${graphUri}>`;
        return this.update(query);
    }

    /**
     * Begin a transaction
     * Stardog supports explicit transactions
     */
    async beginTransaction() {
        const url = `${this.baseUrl}/${this.database}/transaction/begin`;

        const response = await fetch(url, {
            method: 'POST',
            headers: this.getAuthHeaders()
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Stardog begin transaction failed (${response.status}): ${error}`);
        }

        return response.text(); // Returns transaction ID
    }

    /**
     * Commit a transaction
     */
    async commitTransaction(txId) {
        const url = `${this.baseUrl}/${this.database}/transaction/commit/${txId}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: this.getAuthHeaders()
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Stardog commit failed (${response.status}): ${error}`);
        }

        return true;
    }

    /**
     * Rollback a transaction
     */
    async rollbackTransaction(txId) {
        const url = `${this.baseUrl}/${this.database}/transaction/rollback/${txId}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: this.getAuthHeaders()
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Stardog rollback failed (${response.status}): ${error}`);
        }

        return true;
    }

    getType() {
        return 'stardog';
    }
}

module.exports = StardogAdapter;
