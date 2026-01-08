/**
 * Base Triplestore Adapter
 * Abstract class defining the interface for triplestore operations
 */
const fetch = require('node-fetch');
const { getLogger } = require('../utils/logger');

class BaseTriplestoreAdapter {
    constructor(config) {
        this.config = config;
        this.queryEndpoint = config.queryEndpoint;
        this.updateEndpoint = config.updateEndpoint;
        this.graphStoreEndpoint = config.graphStoreEndpoint;
        this.auth = config.authentication || { type: 'none' };
        this.logger = getLogger();
    }

    /**
     * Get authorization headers based on auth config
     */
    getAuthHeaders() {
        const headers = {};

        switch (this.auth.type) {
            case 'basic':
                const credentials = Buffer.from(`${this.auth.username}:${this.auth.password}`).toString('base64');
                headers['Authorization'] = `Basic ${credentials}`;
                break;
            case 'bearer':
                headers['Authorization'] = `Bearer ${this.auth.token}`;
                break;
            case 'none':
            default:
                break;
        }

        return headers;
    }

    /**
     * Execute a SELECT/ASK query
     * @param {string} query - SPARQL query
     * @returns {Promise<object>} - Query results
     */
    async query(query) {
        this.logger.debug('Executing SPARQL query', { endpoint: this.queryEndpoint });

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
            throw new Error(`Query failed (${response.status}): ${error}`);
        }

        return response.json();
    }

    /**
     * Execute a CONSTRUCT query (returns N-Triples)
     * @param {string} query - SPARQL CONSTRUCT query
     * @returns {Promise<string>} - N-Triples string
     */
    async construct(query) {
        this.logger.debug('Executing SPARQL CONSTRUCT query', { endpoint: this.queryEndpoint });

        const response = await fetch(this.queryEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sparql-query',
                'Accept': 'application/n-triples',
                ...this.getAuthHeaders()
            },
            body: query
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`CONSTRUCT query failed (${response.status}): ${error}`);
        }

        return response.text();
    }

    /**
     * Execute a SPARQL UPDATE query
     * @param {string} query - SPARQL UPDATE query
     * @returns {Promise<boolean>} - Success status
     */
    async update(query) {
        this.logger.debug('Executing SPARQL UPDATE', { endpoint: this.updateEndpoint });

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
            throw new Error(`UPDATE failed (${response.status}): ${error}`);
        }

        return true;
    }

    /**
     * Bulk load N-Triples into a named graph
     * @param {string} graphUri - Target graph URI
     * @param {string} ntriples - N-Triples data
     * @returns {Promise<boolean>} - Success status
     */
    async bulkLoad(graphUri, ntriples) {
        throw new Error('bulkLoad must be implemented by subclass');
    }

    /**
     * Test connection to the triplestore
     * @returns {Promise<boolean>} - Connection status
     */
    async testConnection() {
        try {
            await this.query('SELECT * WHERE { ?s ?p ?o } LIMIT 1');
            return true;
        } catch (error) {
            this.logger.error('Connection test failed', { error: error.message });
            return false;
        }
    }

    /**
     * Get triplestore type name
     * @returns {string}
     */
    getType() {
        return 'base';
    }
}

module.exports = BaseTriplestoreAdapter;
