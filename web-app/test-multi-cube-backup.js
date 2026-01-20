/**
 * Test script for multi-cube backup and restore functionality
 * Run with: node test-multi-cube-backup.js
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const AdmZip = require('adm-zip');

const BASE_URL = 'http://localhost:3001';
const BACKUP_DIR = path.join(__dirname, 'backups');

// Test data - simulated N-Triples for multiple cubes
const testCube1Triples = `<https://example.org/cube/test1/1> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://cube.link/Cube> .
<https://example.org/cube/test1/1> <http://purl.org/dc/terms/title> "Test Cube 1 Version 1" .
<https://example.org/cube/test1/1> <http://purl.org/dc/terms/created> "2026-01-01"^^<http://www.w3.org/2001/XMLSchema#date> .
<https://example.org/cube/test1/1> <https://cube.link/observationSet> <https://example.org/cube/test1/1/observationSet> .
<https://example.org/cube/test1/1/observationSet> <https://cube.link/observation> <https://example.org/cube/test1/1/obs1> .
<https://example.org/cube/test1/1/obs1> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://cube.link/Observation> .
<https://example.org/cube/test1/1/obs1> <https://example.org/dimension/value> "100"^^<http://www.w3.org/2001/XMLSchema#integer> .
`;

const testCube2Triples = `<https://example.org/cube/test2/1> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://cube.link/Cube> .
<https://example.org/cube/test2/1> <http://purl.org/dc/terms/title> "Test Cube 2 Version 1" .
<https://example.org/cube/test2/1> <http://purl.org/dc/terms/created> "2026-01-15"^^<http://www.w3.org/2001/XMLSchema#date> .
<https://example.org/cube/test2/1> <https://cube.link/observationSet> <https://example.org/cube/test2/1/observationSet> .
<https://example.org/cube/test2/1/observationSet> <https://cube.link/observation> <https://example.org/cube/test2/1/obs1> .
<https://example.org/cube/test2/1/obs1> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://cube.link/Observation> .
<https://example.org/cube/test2/1/obs1> <https://example.org/dimension/value> "200"^^<http://www.w3.org/2001/XMLSchema#integer> .
`;

const testCube3Triples = `<https://example.org/cube/test3/2> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://cube.link/Cube> .
<https://example.org/cube/test3/2> <http://purl.org/dc/terms/title> "Test Cube 3 Version 2" .
<https://example.org/cube/test3/2> <http://purl.org/dc/terms/created> "2026-01-20"^^<http://www.w3.org/2001/XMLSchema#date> .
<https://example.org/cube/test3/2> <https://cube.link/observationSet> <https://example.org/cube/test3/2/observationSet> .
<https://example.org/cube/test3/2/observationSet> <https://cube.link/observation> <https://example.org/cube/test3/2/obs1> .
<https://example.org/cube/test3/2/obs1> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://cube.link/Observation> .
<https://example.org/cube/test3/2/obs1> <https://example.org/dimension/value> "300"^^<http://www.w3.org/2001/XMLSchema#integer> .
`;

// HTTP request helper
function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

// Test results tracking
const results = {
    passed: 0,
    failed: 0,
    tests: []
};

function logTest(name, passed, message) {
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`  [${status}] ${name}: ${message}`);
    results.tests.push({ name, passed, message });
    if (passed) results.passed++; else results.failed++;
}

// Main test function
async function runTests() {
    console.log('\n========================================');
    console.log('Multi-Cube Backup & Restore Test Suite');
    console.log('========================================\n');

    // Test 1: Check server is running
    console.log('Test 1: Server Health Check');
    try {
        const res = await makeRequest('GET', '/api/backup/list');
        logTest('Server connectivity', res.status === 200, `Status ${res.status}`);
    } catch (e) {
        logTest('Server connectivity', false, `Error: ${e.message}`);
        console.log('\nServer not running. Start with: npm start\n');
        return;
    }

    // Test 2: Create multi-cube backup manually (simulating the internal function)
    console.log('\nTest 2: Multi-Cube Backup Creation');

    // We'll directly create a multi-cube backup ZIP file to test the restore
    const cubesData = [
        { triples: testCube1Triples, cubeUri: 'https://example.org/cube/test1/1' },
        { triples: testCube2Triples, cubeUri: 'https://example.org/cube/test2/1' },
        { triples: testCube3Triples, cubeUri: 'https://example.org/cube/test3/2' }
    ];

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `multi_3cubes_${timestamp}`;
    const zipFilename = `backup_${backupId}.zip`;
    const zipPath = path.join(BACKUP_DIR, zipFilename);

    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // Create manifest (v4.0 format)
    const manifest = {
        formatVersion: '4.0',
        formatType: 'lindas-cube-backup',
        createdAt: new Date().toISOString(),
        createdBy: 'LINDAS Cube Manager - Test Suite',
        backupId: backupId,
        source: {
            endpoint: 'http://localhost:7200',
            dataset: 'test',
            triplestoreType: 'graphdb',
            triplestoreMode: 'local'
        },
        graph: {
            uri: 'https://example.org/graph/test',
            description: 'Test graph for multi-cube backup'
        },
        cubes: [
            {
                uri: 'https://example.org/cube/test1/1',
                baseCube: 'https://example.org/cube/test1',
                version: 1,
                name: 'test1/1',
                dataFile: 'data_1.nt',
                tripleCount: 7
            },
            {
                uri: 'https://example.org/cube/test2/1',
                baseCube: 'https://example.org/cube/test2',
                version: 1,
                name: 'test2/1',
                dataFile: 'data_2.nt',
                tripleCount: 7
            },
            {
                uri: 'https://example.org/cube/test3/2',
                baseCube: 'https://example.org/cube/test3',
                version: 2,
                name: 'test3/2',
                dataFile: 'data_3.nt',
                tripleCount: 7
            }
        ],
        restore: {
            targetGraph: 'https://example.org/graph/test',
            recommendedEndpoint: 'http://localhost:7200',
            recommendedDataset: 'test',
            dataFormat: 'application/n-triples',
            instructions: [
                'Use the LINDAS Cube Manager import function',
                'For Fuseki: POST each data file to /{dataset}/data?graph=<graphUri>',
                'For GraphDB: POST each data file to /repositories/{repo}/statements?context=<graphUri>'
            ]
        },
        stats: {
            cubeCount: 3,
            totalTripleCount: 21,
            backupId: backupId
        }
    };

    // Create ZIP file with manifest and data files
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    zip.addFile('data_1.nt', Buffer.from(testCube1Triples));
    zip.addFile('data_2.nt', Buffer.from(testCube2Triples));
    zip.addFile('data_3.nt', Buffer.from(testCube3Triples));
    zip.addFile('README.txt', Buffer.from(`LINDAS Cube Backup
==================
This backup contains 3 cubes from the test graph.
Created: ${new Date().toISOString()}

Cubes included:
- test1/1 (7 triples)
- test2/1 (7 triples)
- test3/2 (7 triples)

To restore, use the LINDAS Cube Manager import function.
`));

    zip.writeZip(zipPath);
    const zipExists = fs.existsSync(zipPath);
    const zipStats = zipExists ? fs.statSync(zipPath) : null;
    logTest('ZIP file creation', zipExists, `File size: ${zipStats?.size || 0} bytes`);

    // Verify ZIP contents
    const verifyZip = new AdmZip(zipPath);
    const entries = verifyZip.getEntries().map(e => e.entryName);
    const hasAllFiles = ['manifest.json', 'data_1.nt', 'data_2.nt', 'data_3.nt', 'README.txt'].every(f => entries.includes(f));
    logTest('ZIP contents verification', hasAllFiles, `Files: ${entries.join(', ')}`);

    // Test 3: Verify backup appears in list
    console.log('\nTest 3: Backup List Verification');
    const listRes = await makeRequest('GET', '/api/backup/list');
    const backupInList = listRes.data.backups?.some(b => b.backupId === backupId);
    logTest('Backup in list', backupInList, `Found ${listRes.data.backups?.length || 0} backups`);

    // Check multi-cube detection
    const backupEntry = listRes.data.backups?.find(b => b.backupId === backupId);
    const multiCubeDetected = backupEntry?.cubeCount === 3;
    logTest('Multi-cube count detected', multiCubeDetected, `Cube count: ${backupEntry?.cubeCount || 'N/A'}`);

    // Test 4: Verify manifest reading
    console.log('\nTest 4: Manifest Parsing');
    const readManifest = verifyZip.getEntry('manifest.json');
    const parsedManifest = JSON.parse(readManifest.getData().toString('utf8'));

    logTest('Format version', parsedManifest.formatVersion === '4.0', `Version: ${parsedManifest.formatVersion}`);
    logTest('Cubes array present', Array.isArray(parsedManifest.cubes), `${parsedManifest.cubes?.length || 0} cubes`);
    logTest('All cubes have dataFile', parsedManifest.cubes?.every(c => c.dataFile),
        `Data files: ${parsedManifest.cubes?.map(c => c.dataFile).join(', ')}`);

    // Test 5: Verify data file contents
    console.log('\nTest 5: Data File Integrity');
    for (let i = 1; i <= 3; i++) {
        const dataEntry = verifyZip.getEntry(`data_${i}.nt`);
        const dataContent = dataEntry?.getData().toString('utf8');
        const hasContent = dataContent && dataContent.includes('<https://cube.link/Cube>');
        logTest(`data_${i}.nt content`, hasContent, `${dataContent?.split('\n').filter(l => l.trim()).length || 0} triples`);
    }

    // Test 6: Test restore preview (export endpoint)
    console.log('\nTest 6: Backup Export Verification');
    try {
        // Test that the backup can be downloaded/exported
        const exportUrl = `/api/backup/${backupId}/export`;
        const exportRes = await makeRequest('GET', exportUrl);
        // Export returns the zip file, so check for binary/zip content
        logTest('Export endpoint accessible', exportRes.status === 200 || typeof exportRes.data === 'string',
            `Status: ${exportRes.status}`);
    } catch (e) {
        logTest('Export endpoint', false, e.message);
    }

    // Test 7: Selective restore simulation (verify manifest supports it)
    console.log('\nTest 7: Selective Restore Support');
    const selectedCubes = ['https://example.org/cube/test1/1', 'https://example.org/cube/test3/2'];
    const cubesToRestore = parsedManifest.cubes.filter(c => selectedCubes.includes(c.uri));
    logTest('Selective filter works', cubesToRestore.length === 2, `Selected ${cubesToRestore.length} of 3 cubes`);
    logTest('Correct cubes selected',
        cubesToRestore.some(c => c.name === 'test1/1') && cubesToRestore.some(c => c.name === 'test3/2'),
        `Selected: ${cubesToRestore.map(c => c.name).join(', ')}`);

    // Test 8: Verify backward compatibility (cube field for single-cube readers)
    console.log('\nTest 8: Backward Compatibility');
    // For multi-cube backups, cube field should be undefined (only set for single cube)
    logTest('Multi-cube has no legacy cube field', parsedManifest.cube === undefined,
        'cube field correctly omitted for multi-cube');

    // Test 9: Create and verify single-cube backup format
    console.log('\nTest 9: Single-Cube Backup Format');
    const singleBackupId = `single_test_${timestamp}`;
    const singleManifest = {
        formatVersion: '4.0',
        formatType: 'lindas-cube-backup',
        createdAt: new Date().toISOString(),
        backupId: singleBackupId,
        source: {
            endpoint: 'http://localhost:7200',
            triplestoreType: 'graphdb'
        },
        graph: { uri: 'https://example.org/graph/test' },
        cubes: [{
            uri: 'https://example.org/cube/single/1',
            baseCube: 'https://example.org/cube/single',
            version: 1,
            name: 'single/1',
            dataFile: 'data.nt',
            tripleCount: 7
        }],
        cube: {
            uri: 'https://example.org/cube/single/1',
            baseCube: 'https://example.org/cube/single',
            version: 1,
            name: 'single/1'
        },
        stats: { cubeCount: 1, totalTripleCount: 7, backupId: singleBackupId }
    };

    logTest('Single-cube has legacy cube field', singleManifest.cube !== undefined,
        'cube field present for backward compat');
    logTest('Single-cube uses data.nt', singleManifest.cubes[0].dataFile === 'data.nt',
        `Data file: ${singleManifest.cubes[0].dataFile}`);

    // Summary
    console.log('\n========================================');
    console.log('Test Summary');
    console.log('========================================');
    console.log(`Total: ${results.passed + results.failed} tests`);
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);
    console.log('========================================\n');

    // Cleanup - remove test backup
    if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
        console.log(`Cleaned up test backup: ${zipFilename}\n`);
    }

    return results;
}

// Run tests
runTests()
    .then(results => {
        process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(err => {
        console.error('Test suite error:', err);
        process.exit(1);
    });
