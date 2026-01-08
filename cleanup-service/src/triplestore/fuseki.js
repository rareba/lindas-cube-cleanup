/**
 * Apache Jena Fuseki Adapter
 *
 * Fuseki-specific implementation:
 * - Query endpoint: /dataset/query or /dataset/sparql
 * - Update endpoint: /dataset/update
 * - Graph Store: /dataset/data?graph=<uri>
 */
const fetch = require('node-fetch');
const BaseTriplestoreAdapter = require('./base');

class FusekiAdapter extends BaseTriplestoreAdapter {
    constructor(config) {
        super(config);

        // Auto-detect endpoints if not specified
        if (!this.graphStoreEndpoint && this.queryEndpoint) {
            const baseUrl = this.queryEndpoint.replace(/\/query$|\/sparql$/, '');
            this.graphStoreEndpoint = `${baseUrl}/data`;
        }
    }

    /**
     * Bulk load N-Triples via Graph Store Protocol
     * Fuseki accepts POST to /data?graph=<uri>
     */
    async bulkLoad(graphUri, ntriples) {
        const url = `${this.graphStoreEndpoint}?graph=${encodeURIComponent(graphUri)}`;

        this.logger.debug('Bulk loading to Fuseki', {
            endpoint: this.graphStoreEndpoint,
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
            throw new Error(`Fuseki bulk load failed (${response.status}): ${error}`);
        }

        return true;
    }

    /**
     * Delete all triples in a named graph
     * Uses Graph Store Protocol DELETE
     */
    async clearGraph(graphUri) {
        const url = `${this.graphStoreEndpoint}?graph=${encodeURIComponent(graphUri)}`;

        this.logger.info('Clearing graph via Graph Store Protocol', { graph: graphUri });

        const response = await fetch(url, {
            method: 'DELETE',
            headers: this.getAuthHeaders()
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Fuseki clear graph failed (${response.status}): ${error}`);
        }

        return true;
    }

    /**
     * Get graph contents via Graph Store Protocol
     */
    async getGraph(graphUri) {
        const url = `${this.graphStoreEndpoint}?graph=${encodeURIComponent(graphUri)}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/n-triples',
                ...this.getAuthHeaders()
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                return null; // Graph doesn't exist
            }
            const error = await response.text();
            throw new Error(`Fuseki get graph failed (${response.status}): ${error}`);
        }

        return response.text();
    }

    getType() {
        return 'fuseki';
    }
}

module.exports = FusekiAdapter;
