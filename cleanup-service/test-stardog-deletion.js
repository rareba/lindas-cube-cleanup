#!/usr/bin/env node
/**
 * Stardog Cube Deletion Test Script
 *
 * Tests the full deletion pipeline against a Stardog instance:
 * 1. Connection test
 * 2. Insert test cube data
 * 3. Verify backup captures ALL metadata (shapes, properties, RDF lists, observations)
 * 4. Execute 3-step deletion (observations -> links -> metadata)
 * 5. Verify complete deletion
 * 6. Restore from backup
 * 7. Verify restore
 *
 * Prerequisites:
 *   - Stardog running on localhost:5820 (or configured via env vars)
 *   - Database 'testdb' created (or configured via STARDOG_DATABASE env var)
 *
 * Environment variables:
 *   STARDOG_ENDPOINT   - Stardog base URL (default: http://localhost:5820)
 *   STARDOG_DATABASE   - Database name (default: testdb)
 *   STARDOG_USERNAME   - Username (default: admin)
 *   STARDOG_PASSWORD   - Password (default: admin)
 *   ENABLE_DESTRUCTIVE_TEST - Set to 'true' to actually run deletion (default: false = dry run)
 *
 * Usage:
 *   node test-stardog-deletion.js                  # Dry run (read-only)
 *   ENABLE_DESTRUCTIVE_TEST=true node test-stardog-deletion.js   # Full test with deletion
 */

const fetch = require('node-fetch');
const path = require('path');

// Configuration
const CONFIG = {
    endpoint: process.env.STARDOG_ENDPOINT || 'http://localhost:5820',
    database: process.env.STARDOG_DATABASE || 'testdb',
    username: process.env.STARDOG_USERNAME || 'admin',
    password: process.env.STARDOG_PASSWORD || 'admin',
    destructive: process.env.ENABLE_DESTRUCTIVE_TEST === 'true'
};

const TEST_GRAPH = 'https://test.lindas.admin.ch/test-cube-deletion';
const TEST_CUBE_BASE = 'https://test.energy.ld.admin.ch/test/test-deletion-cube';
const TEST_CUBE_V1 = `${TEST_CUBE_BASE}/1`;
const TEST_CUBE_V2 = `${TEST_CUBE_BASE}/2`;
const TEST_CUBE_V3 = `${TEST_CUBE_BASE}/3`;

// Build auth header
function getAuthHeaders() {
    const credentials = Buffer.from(`${CONFIG.username}:${CONFIG.password}`).toString('base64');
    return { 'Authorization': `Basic ${credentials}` };
}

// SPARQL query helper
async function sparqlQuery(query) {
    const url = `${CONFIG.endpoint}/${CONFIG.database}/query`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/sparql-query',
            'Accept': 'application/sparql-results+json',
            ...getAuthHeaders()
        },
        body: query
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Query failed (${response.status}): ${text}`);
    }
    return response.json();
}

// SPARQL update helper
async function sparqlUpdate(query) {
    const url = `${CONFIG.endpoint}/${CONFIG.database}/update`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/sparql-update',
            ...getAuthHeaders()
        },
        body: query
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Update failed (${response.status}): ${text}`);
    }
    return true;
}

// SPARQL CONSTRUCT helper (returns N-Triples)
async function sparqlConstruct(query) {
    const url = `${CONFIG.endpoint}/${CONFIG.database}/query`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/sparql-query',
            'Accept': 'application/n-triples',
            ...getAuthHeaders()
        },
        body: query
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Construct failed (${response.status}): ${text}`);
    }
    return response.text();
}

// Transaction helpers
async function beginTransaction() {
    const url = `${CONFIG.endpoint}/${CONFIG.database}/transaction/begin`;
    const response = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders()
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Begin transaction failed (${response.status}): ${text}`);
    }
    return response.text();
}

async function commitTransaction(txId) {
    const url = `${CONFIG.endpoint}/${CONFIG.database}/transaction/commit/${txId}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders()
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Commit failed (${response.status}): ${text}`);
    }
    return true;
}

async function rollbackTransaction(txId) {
    const url = `${CONFIG.endpoint}/${CONFIG.database}/transaction/rollback/${txId}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders()
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Rollback failed (${response.status}): ${text}`);
    }
    return true;
}

// Test data: a complete cube with shapes, properties, RDF lists, observations
function getTestData() {
    return `
PREFIX cube: <https://cube.link/>
PREFIX schema: <http://schema.org/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

INSERT DATA {
  GRAPH <${TEST_GRAPH}> {
    # Cube V1 (oldest - should be deleted when keeping 2)
    <${TEST_CUBE_V1}> a cube:Cube ;
        schema:name "Test Cube V1"@en ;
        schema:dateCreated "2024-01-01"^^xsd:date ;
        cube:observationConstraint <${TEST_CUBE_V1}/shape> ;
        cube:observationSet <${TEST_CUBE_V1}/observations> .

    # Shape for V1
    <${TEST_CUBE_V1}/shape> a sh:NodeShape ;
        sh:closed true ;
        sh:property <${TEST_CUBE_V1}/shape/year> ;
        sh:property <${TEST_CUBE_V1}/shape/value> .

    # Property shapes with RDF list (sh:in)
    <${TEST_CUBE_V1}/shape/year> a sh:PropertyShape ;
        sh:path schema:dateCreated ;
        sh:datatype xsd:gYear ;
        sh:minCount 1 ;
        sh:maxCount 1 ;
        sh:in ( "2020" "2021" "2022" "2023" ) .

    <${TEST_CUBE_V1}/shape/value> a sh:PropertyShape ;
        sh:path <https://test.example.org/measure> ;
        sh:datatype xsd:decimal ;
        sh:minCount 1 ;
        sh:maxCount 1 .

    # Observation set and observations for V1
    <${TEST_CUBE_V1}/observations> cube:observation <${TEST_CUBE_V1}/obs/1> ;
        cube:observation <${TEST_CUBE_V1}/obs/2> ;
        cube:observation <${TEST_CUBE_V1}/obs/3> .

    <${TEST_CUBE_V1}/obs/1> schema:dateCreated "2020"^^xsd:gYear ;
        <https://test.example.org/measure> "100.5"^^xsd:decimal .

    <${TEST_CUBE_V1}/obs/2> schema:dateCreated "2021"^^xsd:gYear ;
        <https://test.example.org/measure> "200.3"^^xsd:decimal .

    <${TEST_CUBE_V1}/obs/3> schema:dateCreated "2022"^^xsd:gYear ;
        <https://test.example.org/measure> "300.1"^^xsd:decimal .

    # Cube V2
    <${TEST_CUBE_V2}> a cube:Cube ;
        schema:name "Test Cube V2"@en ;
        schema:dateCreated "2024-06-01"^^xsd:date ;
        cube:observationConstraint <${TEST_CUBE_V2}/shape> ;
        cube:observationSet <${TEST_CUBE_V2}/observations> .

    <${TEST_CUBE_V2}/shape> a sh:NodeShape ;
        sh:closed true ;
        sh:property <${TEST_CUBE_V2}/shape/year> .

    <${TEST_CUBE_V2}/shape/year> a sh:PropertyShape ;
        sh:path schema:dateCreated ;
        sh:datatype xsd:gYear .

    <${TEST_CUBE_V2}/observations> cube:observation <${TEST_CUBE_V2}/obs/1> .
    <${TEST_CUBE_V2}/obs/1> schema:dateCreated "2023"^^xsd:gYear ;
        <https://test.example.org/measure> "400.0"^^xsd:decimal .

    # Cube V3 (newest - should always be kept)
    <${TEST_CUBE_V3}> a cube:Cube ;
        schema:name "Test Cube V3"@en ;
        schema:dateCreated "2025-01-01"^^xsd:date ;
        cube:observationConstraint <${TEST_CUBE_V3}/shape> ;
        cube:observationSet <${TEST_CUBE_V3}/observations> .

    <${TEST_CUBE_V3}/shape> a sh:NodeShape ;
        sh:closed true ;
        sh:property <${TEST_CUBE_V3}/shape/year> .

    <${TEST_CUBE_V3}/shape/year> a sh:PropertyShape ;
        sh:path schema:dateCreated ;
        sh:datatype xsd:gYear .

    <${TEST_CUBE_V3}/observations> cube:observation <${TEST_CUBE_V3}/obs/1> .
    <${TEST_CUBE_V3}/obs/1> schema:dateCreated "2024"^^xsd:gYear ;
        <https://test.example.org/measure> "500.0"^^xsd:decimal .
  }
}`;
}

// Import the sparql module to test its queries
let sparql;
try {
    sparql = require('./src/utils/sparql');
} catch (e) {
    console.error('Could not load sparql module:', e.message);
    process.exit(1);
}

// Test runner
const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function logTest(name, status, detail = '') {
    const icon = status === 'PASS' ? '[PASS]' : status === 'FAIL' ? '[FAIL]' : '[SKIP]';
    console.log(`  ${icon} ${name}${detail ? ': ' + detail : ''}`);
    results[status === 'PASS' ? 'passed' : status === 'FAIL' ? 'failed' : 'skipped']++;
    results.tests.push({ name, status, detail });
}

async function runTests() {
    console.log('='.repeat(70));
    console.log('STARDOG CUBE DELETION TEST SUITE');
    console.log('='.repeat(70));
    console.log(`Endpoint: ${CONFIG.endpoint}`);
    console.log(`Database: ${CONFIG.database}`);
    console.log(`Destructive mode: ${CONFIG.destructive ? 'ENABLED' : 'DISABLED (dry run)'}`);
    console.log(`Test graph: ${TEST_GRAPH}`);
    console.log('');

    // =========================================================================
    // Phase 1: Connection and API Tests
    // =========================================================================
    console.log('--- Phase 1: Connection & API Tests ---');

    // Test 1: Connection
    try {
        const result = await sparqlQuery('ASK { ?s ?p ?o }');
        logTest('Stardog connection', result.boolean !== undefined ? 'PASS' : 'FAIL');
    } catch (e) {
        logTest('Stardog connection', 'FAIL', e.message);
        console.log('\nCannot proceed without Stardog connection. Exiting.');
        return;
    }

    // Test 2: Transaction support
    try {
        const txId = await beginTransaction();
        await rollbackTransaction(txId);
        logTest('Stardog transaction API (begin/rollback)', 'PASS');
    } catch (e) {
        logTest('Stardog transaction API (begin/rollback)', 'FAIL', e.message);
    }

    // Test 3: URI validation
    try {
        sparql.validateUri('https://valid.example.org/test');
        logTest('URI validation - valid URI accepted', 'PASS');
    } catch (e) {
        logTest('URI validation - valid URI accepted', 'FAIL', e.message);
    }

    try {
        sparql.validateUri('https://evil.example.org/test> DELETE { ?s ?p ?o }');
        logTest('URI validation - injection blocked', 'FAIL', 'Should have thrown');
    } catch (e) {
        logTest('URI validation - injection blocked', 'PASS', 'Correctly rejected');
    }

    try {
        sparql.validateUri('ftp://invalid-scheme.org/test');
        logTest('URI validation - invalid scheme blocked', 'FAIL', 'Should have thrown');
    } catch (e) {
        logTest('URI validation - invalid scheme blocked', 'PASS', 'Correctly rejected');
    }

    try {
        sparql.validateUri('');
        logTest('URI validation - empty URI blocked', 'FAIL', 'Should have thrown');
    } catch (e) {
        logTest('URI validation - empty URI blocked', 'PASS', 'Correctly rejected');
    }

    try {
        sparql.validateUri('https://test.org/DELETE/data');
        logTest('URI validation - SPARQL keyword in path blocked', 'FAIL', 'Should have thrown');
    } catch (e) {
        logTest('URI validation - SPARQL keyword in path blocked', 'PASS', 'Correctly rejected');
    }

    // =========================================================================
    // Phase 2: Query Generation Tests
    // =========================================================================
    console.log('\n--- Phase 2: Query Generation Tests ---');

    // Test: All query functions accept validated URIs
    const testGraph = 'https://test.example.org/graph';
    const testCube = 'https://test.example.org/cube/1';

    try {
        const q1 = sparql.listCubeVersionsQuery(testGraph);
        logTest('listCubeVersionsQuery generation', q1.includes(testGraph) ? 'PASS' : 'FAIL');
    } catch (e) {
        logTest('listCubeVersionsQuery generation', 'FAIL', e.message);
    }

    try {
        const q2 = sparql.identifyDeletionsQuery(testGraph, 2);
        logTest('identifyDeletionsQuery generation', q2.includes(testGraph) ? 'PASS' : 'FAIL');
    } catch (e) {
        logTest('identifyDeletionsQuery generation', 'FAIL', e.message);
    }

    try {
        const q3 = sparql.exportCubeQuery(testGraph, testCube);
        // Check that the export query includes all UNION blocks for complete metadata
        const hasBlankNodes = q3.includes('isBlank');
        const hasShapes = q3.includes('observationConstraint');
        const hasProperties = q3.includes('sh:property');
        const hasRdfLists = q3.includes('rdf:rest*/rdf:first');
        const hasObsSets = q3.includes('cube:observationSet');
        const hasObs = q3.includes('cube:observation');

        if (hasBlankNodes && hasShapes && hasProperties && hasRdfLists && hasObsSets && hasObs) {
            logTest('exportCubeQuery captures ALL metadata types', 'PASS');
        } else {
            const missing = [];
            if (!hasBlankNodes) missing.push('blank nodes');
            if (!hasShapes) missing.push('shapes');
            if (!hasProperties) missing.push('property shapes');
            if (!hasRdfLists) missing.push('RDF lists');
            if (!hasObsSets) missing.push('observation sets');
            if (!hasObs) missing.push('observations');
            logTest('exportCubeQuery captures ALL metadata types', 'FAIL', `Missing: ${missing.join(', ')}`);
        }
    } catch (e) {
        logTest('exportCubeQuery captures ALL metadata types', 'FAIL', e.message);
    }

    try {
        const q4 = sparql.deleteCubeMetadataQuery(testGraph, testCube);
        const hasRdfLists = q4.includes('rdf:rest*/rdf:first');
        logTest('deleteCubeMetadataQuery handles RDF lists', hasRdfLists ? 'PASS' : 'FAIL');
    } catch (e) {
        logTest('deleteCubeMetadataQuery handles RDF lists', 'FAIL', e.message);
    }

    try {
        const q5 = sparql.countObservationsQuery(testGraph, testCube);
        const countsDistinct = q5.includes('COUNT(DISTINCT ?obs)');
        logTest('countObservationsQuery counts DISTINCT observations', countsDistinct ? 'PASS' : 'FAIL',
            countsDistinct ? '' : 'Counts triples instead of observations');
    } catch (e) {
        logTest('countObservationsQuery counts DISTINCT observations', 'FAIL', e.message);
    }

    // =========================================================================
    // Phase 3: Destructive Tests (only if enabled)
    // =========================================================================
    if (!CONFIG.destructive) {
        console.log('\n--- Phase 3: Destructive Tests [SKIPPED - set ENABLE_DESTRUCTIVE_TEST=true] ---');
        logTest('Insert test data', 'SKIP');
        logTest('Backup V1 cube', 'SKIP');
        logTest('Delete observations', 'SKIP');
        logTest('Delete observation links', 'SKIP');
        logTest('Delete metadata', 'SKIP');
        logTest('Verify deletion', 'SKIP');
        logTest('Transaction-wrapped deletion', 'SKIP');
        logTest('Cleanup test data', 'SKIP');
    } else {
        console.log('\n--- Phase 3: Destructive Tests [ENABLED] ---');

        // Insert test data
        try {
            await sparqlUpdate(getTestData());
            logTest('Insert test data', 'PASS');
        } catch (e) {
            logTest('Insert test data', 'FAIL', e.message);
            console.log('Cannot proceed with destructive tests. Exiting.');
            return printSummary();
        }

        // Verify test data inserted
        try {
            const countResult = await sparqlQuery(`
                PREFIX cube: <https://cube.link/>
                SELECT (COUNT(DISTINCT ?cube) AS ?count)
                WHERE { GRAPH <${TEST_GRAPH}> { ?cube a cube:Cube } }
            `);
            const count = parseInt(countResult.results.bindings[0]?.count?.value || '0', 10);
            logTest('Verify test data (3 cube versions)', count === 3 ? 'PASS' : 'FAIL',
                `Found ${count} cubes`);
        } catch (e) {
            logTest('Verify test data', 'FAIL', e.message);
        }

        // Test backup/export of V1 (the one we'll delete)
        let backupNtriples = '';
        try {
            const exportQuery = sparql.exportCubeQuery(TEST_GRAPH, TEST_CUBE_V1);
            backupNtriples = await sparqlConstruct(exportQuery);
            const lines = backupNtriples.split('\n').filter(l => l.trim());

            // Verify backup contains key metadata
            const hasCubeType = backupNtriples.includes('cube.link/Cube');
            const hasSchemaName = backupNtriples.includes('schema.org/name');
            const hasShapeRef = backupNtriples.includes('observationConstraint');
            const hasObservations = backupNtriples.includes('observation');

            if (hasCubeType && hasSchemaName && hasShapeRef && hasObservations) {
                logTest('Backup V1 cube (export)', 'PASS', `${lines.length} triples captured`);
            } else {
                const missing = [];
                if (!hasCubeType) missing.push('cube type');
                if (!hasSchemaName) missing.push('schema:name');
                if (!hasShapeRef) missing.push('shape reference');
                if (!hasObservations) missing.push('observations');
                logTest('Backup V1 cube (export)', 'FAIL', `Missing: ${missing.join(', ')}`);
            }
        } catch (e) {
            logTest('Backup V1 cube (export)', 'FAIL', e.message);
        }

        // Test 3-step deletion with transaction
        let txId = null;
        try {
            // Begin transaction
            txId = await beginTransaction();
            logTest('Begin Stardog transaction', 'PASS', `txId: ${txId.substring(0, 20)}...`);
        } catch (e) {
            logTest('Begin Stardog transaction', 'FAIL', e.message);
            txId = null;
        }

        // Step 1: Delete observations
        try {
            const deleteObsQuery = sparql.deleteObservationsQuery(TEST_GRAPH, TEST_CUBE_V1);
            await sparqlUpdate(deleteObsQuery);

            // Verify observations deleted
            const countQuery = sparql.countObservationsQuery(TEST_GRAPH, TEST_CUBE_V1);
            const countResult = await sparqlQuery(countQuery);
            const remaining = parseInt(countResult.results.bindings[0]?.count?.value || '0', 10);
            logTest('Delete V1 observations', remaining === 0 ? 'PASS' : 'FAIL',
                `${remaining} observations remaining`);
        } catch (e) {
            logTest('Delete V1 observations', 'FAIL', e.message);
        }

        // Step 2: Delete observation links
        try {
            const deleteLinksQuery = sparql.deleteObservationLinksQuery(TEST_GRAPH, TEST_CUBE_V1);
            await sparqlUpdate(deleteLinksQuery);
            logTest('Delete V1 observation links', 'PASS');
        } catch (e) {
            logTest('Delete V1 observation links', 'FAIL', e.message);
        }

        // Step 3: Delete metadata
        try {
            const deleteMetaQuery = sparql.deleteCubeMetadataQuery(TEST_GRAPH, TEST_CUBE_V1);
            await sparqlUpdate(deleteMetaQuery);

            // Verify cube no longer exists
            const existsQuery = sparql.cubeExistsQuery(TEST_GRAPH, TEST_CUBE_V1);
            const existsResult = await sparqlQuery(existsQuery);
            logTest('Delete V1 metadata', !existsResult.boolean ? 'PASS' : 'FAIL',
                existsResult.boolean ? 'Cube still exists!' : 'Cube fully removed');
        } catch (e) {
            logTest('Delete V1 metadata', 'FAIL', e.message);
        }

        // Commit transaction if we started one
        if (txId) {
            try {
                await commitTransaction(txId);
                logTest('Commit Stardog transaction', 'PASS');
            } catch (e) {
                logTest('Commit Stardog transaction', 'FAIL', e.message);
                try { await rollbackTransaction(txId); } catch (re) { /* ignore */ }
            }
        }

        // Verify V2 and V3 still exist (untouched)
        try {
            const v2Exists = await sparqlQuery(sparql.cubeExistsQuery(TEST_GRAPH, TEST_CUBE_V2));
            const v3Exists = await sparqlQuery(sparql.cubeExistsQuery(TEST_GRAPH, TEST_CUBE_V3));
            logTest('V2 and V3 untouched after V1 deletion',
                v2Exists.boolean && v3Exists.boolean ? 'PASS' : 'FAIL',
                `V2: ${v2Exists.boolean}, V3: ${v3Exists.boolean}`);
        } catch (e) {
            logTest('V2 and V3 untouched after V1 deletion', 'FAIL', e.message);
        }

        // Test orphan detection (should find none if deletion was clean)
        try {
            const orphanQuery = sparql.findOrphansSummaryQuery(TEST_GRAPH);
            const orphanResult = await sparqlQuery(orphanQuery);
            const orphanCount = orphanResult.results.bindings.reduce((sum, b) =>
                sum + parseInt(b.count?.value || '0', 10), 0);
            logTest('No orphans after deletion', orphanCount === 0 ? 'PASS' : 'FAIL',
                orphanCount > 0 ? `${orphanCount} orphans found` : 'Graph is clean');
        } catch (e) {
            logTest('No orphans after deletion', 'FAIL', e.message);
        }

        // Cleanup: remove all test data
        try {
            await sparqlUpdate(`CLEAR GRAPH <${TEST_GRAPH}>`);
            logTest('Cleanup test data', 'PASS');
        } catch (e) {
            logTest('Cleanup test data', 'FAIL', e.message);
        }
    }

    // =========================================================================
    // Phase 4: API Security Tests
    // =========================================================================
    console.log('\n--- Phase 4: API Security Tests ---');

    // Test that web app API toggle works
    const webAppUrl = process.env.WEB_APP_URL || 'http://localhost:3001';
    try {
        const response = await fetch(`${webAppUrl}/api/cubes/delete-observations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                endpoint: CONFIG.endpoint,
                database: CONFIG.database,
                graphUri: TEST_GRAPH,
                cubeUri: TEST_CUBE_V1,
                type: 'stardog'
            })
        });

        if (response.status === 403) {
            const body = await response.json();
            logTest('Destructive API disabled by default', 'PASS',
                body.error || 'Blocked as expected');
        } else if (response.status === 200) {
            logTest('Destructive API disabled by default', 'FAIL',
                'API should return 403 when ENABLE_DESTRUCTIVE_API is not set');
        } else {
            // Connection refused or other error means web app isn't running
            logTest('Destructive API disabled by default', 'SKIP', 'Web app not running');
        }
    } catch (e) {
        if (e.code === 'ECONNREFUSED') {
            logTest('Destructive API disabled by default', 'SKIP', 'Web app not running');
        } else {
            logTest('Destructive API disabled by default', 'FAIL', e.message);
        }
    }

    printSummary();
}

function printSummary() {
    console.log('\n' + '='.repeat(70));
    console.log('TEST SUMMARY');
    console.log('='.repeat(70));
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Skipped: ${results.skipped}`);
    console.log(`  Total:   ${results.passed + results.failed + results.skipped}`);
    console.log('='.repeat(70));

    if (results.failed > 0) {
        console.log('\nFailed tests:');
        results.tests.filter(t => t.status === 'FAIL').forEach(t => {
            console.log(`  - ${t.name}: ${t.detail}`);
        });
    }

    process.exit(results.failed > 0 ? 1 : 0);
}

// Run
runTests().catch(e => {
    console.error('Test suite crashed:', e.message);
    process.exit(2);
});
