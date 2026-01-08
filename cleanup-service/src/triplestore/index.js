/**
 * Triplestore Adapter Factory
 *
 * Creates the appropriate adapter based on configuration
 */
const FusekiAdapter = require('./fuseki');
const StardogAdapter = require('./stardog');
const GraphDBAdapter = require('./graphdb');

const adapters = {
    fuseki: FusekiAdapter,
    stardog: StardogAdapter,
    graphdb: GraphDBAdapter
};

/**
 * Create a triplestore adapter based on config
 * @param {object} config - Triplestore configuration
 * @returns {BaseTriplestoreAdapter}
 */
function createAdapter(config) {
    const type = config.type?.toLowerCase();

    if (!type) {
        throw new Error('Triplestore type not specified in configuration');
    }

    const AdapterClass = adapters[type];

    if (!AdapterClass) {
        throw new Error(`Unknown triplestore type: ${type}. Supported: ${Object.keys(adapters).join(', ')}`);
    }

    return new AdapterClass(config);
}

/**
 * Auto-detect triplestore type from endpoint URL
 * @param {string} endpoint - Query endpoint URL
 * @returns {string|null} - Detected type or null
 */
function detectType(endpoint) {
    if (!endpoint) return null;

    const url = endpoint.toLowerCase();

    if (url.includes('fuseki') || url.includes(':3030')) {
        return 'fuseki';
    }

    if (url.includes('stardog') || url.includes(':5820')) {
        return 'stardog';
    }

    if (url.includes('graphdb') || url.includes('/repositories/')) {
        return 'graphdb';
    }

    return null;
}

module.exports = {
    createAdapter,
    detectType,
    FusekiAdapter,
    StardogAdapter,
    GraphDBAdapter
};
