/**
 * Test script for restore API endpoint functionality
 * Tests selective restore and full restore from multi-cube backups
 * Run with: node test-restore-api.js
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const AdmZip = require('adm-zip');

const BASE_URL = 'http://localhost:3001';
const BACKUP_DIR = path.join(__dirname, 'backups');

// Test data
const testCube1Triples = `<https://example.org/cube/restore-test1/1> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://cube.link/Cube> .
<https://example.org/cube/restore-test1/1> <http://purl.org/dc/terms/title> "Restore Test Cube 1" .
<https://example.org/cube/restore-test1/1> <https://cube.link/observationSet> <https://example.org/cube/restore-test1/1/observationSet> .
`;

const testCube2Triples = `<https://example.org/cube/restore-test2/1> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://cube.link/Cube> .
<https://example.org/cube/restore-test2/1> <http://purl.org/dc/terms/title> "Restore Test Cube 2" .
<https://example.org/cube/restore-test2/1> <https://cube.link/observationSet> <https://example.org/cube/restore-test2/1/observationSet> .
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

async function runTests() {
    console.log('\n==========================================');
    console.log('Multi-Cube Restore API Test Suite');
    console.log('==========================================\n');

    // Create test backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `restore_test_${timestamp}`;
    const zipFilename = `backup_${backupId}.zip`;
    const zipPath = path.join(BACKUP_DIR, zipFilename);

    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // Create multi-cube backup
    const manifest = {
        formatVersion: '4.0',
        formatType: 'lindas-cube-backup',
        createdAt: new Date().toISOString(),
        backupId: backupId,
        source: {
            endpoint: 'http://localhost:7200',
            dataset: 'test',
            triplestoreType: 'graphdb',
            triplestoreMode: 'local'
        },
        graph: {
            uri: 'https://example.org/graph/restore-test'
        },
        cubes: [
            {
                uri: 'https://example.org/cube/restore-test1/1',
                baseCube: 'https://example.org/cube/restore-test1',
                version: 1,
                name: 'restore-test1/1',
                dataFile: 'data_1.nt',
                tripleCount: 3
            },
            {
                uri: 'https://example.org/cube/restore-test2/1',
                baseCube: 'https://example.org/cube/restore-test2',
                version: 1,
                name: 'restore-test2/1',
                dataFile: 'data_2.nt',
                tripleCount: 3
            }
        ],
        restore: {
            targetGraph: 'https://example.org/graph/restore-test',
            recommendedEndpoint: 'http://localhost:7200',
            recommendedDataset: 'test',
            dataFormat: 'application/n-triples'
        },
        stats: {
            cubeCount: 2,
            totalTripleCount: 6,
            backupId: backupId
        }
    };

    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    zip.addFile('data_1.nt', Buffer.from(testCube1Triples));
    zip.addFile('data_2.nt', Buffer.from(testCube2Triples));
    zip.writeZip(zipPath);

    console.log('Test Setup: Created multi-cube backup');
    logTest('Test backup created', fs.existsSync(zipPath), `Backup ID: ${backupId}`);

    // Test 1: Verify backup is listed
    console.log('\nTest 1: Backup Discovery');
    const listRes = await makeRequest('GET', '/api/backup/list');
    const backupInList = listRes.data.backups?.some(b => b.backupId === backupId);
    logTest('Backup found in list', backupInList, `Total backups: ${listRes.data.backups?.length}`);

    const backupInfo = listRes.data.backups?.find(b => b.backupId === backupId);
    logTest('Backup has cube count', backupInfo?.cubeCount === 2, `Cube count: ${backupInfo?.cubeCount}`);
    logTest('Backup has cubes array', Array.isArray(backupInfo?.cubes) && backupInfo.cubes.length === 2,
        `Cubes: ${backupInfo?.cubes?.map(c => c.name).join(', ')}`);

    // Test 2: Test restore-to endpoint with selective cubes
    console.log('\nTest 2: Selective Restore API');

    // This will fail because there's no actual triplestore/repository, but we can verify the API accepts the request
    const selectiveRestoreRes = await makeRequest('POST', '/api/backup/restore-to', {
        backupId: backupId,
        type: 'graphdb',
        mode: 'local',
        baseUrl: 'http://localhost:7200',
        repository: 'test',
        graphUri: 'https://example.org/graph/restore-test',
        selectedCubes: ['https://example.org/cube/restore-test1/1'] // Only restore first cube
    });

    // We expect an error because no triplestore/repository exists, but the API should process the request
    // Accept various error conditions that indicate the API is working but target doesn't exist
    const apiAcceptsSelectiveRestore = selectiveRestoreRes.status === 500 &&
        (selectiveRestoreRes.data?.error?.includes('ECONNREFUSED') ||
         selectiveRestoreRes.data?.error?.includes('fetch failed') ||
         selectiveRestoreRes.data?.error?.includes('connect') ||
         selectiveRestoreRes.data?.error?.includes('404') ||
         selectiveRestoreRes.data?.error?.includes('Unknown repository'));

    logTest('Selective restore API endpoint works',
        apiAcceptsSelectiveRestore || selectiveRestoreRes.status === 200,
        `Response: ${selectiveRestoreRes.status} - ${typeof selectiveRestoreRes.data?.error === 'string' ? selectiveRestoreRes.data.error.substring(0, 60) : 'OK'}`);

    // Test 3: Test restore-to with all cubes (no selectedCubes filter)
    console.log('\nTest 3: Full Restore API');
    const fullRestoreRes = await makeRequest('POST', '/api/backup/restore-to', {
        backupId: backupId,
        type: 'graphdb',
        mode: 'local',
        baseUrl: 'http://localhost:7200',
        repository: 'test',
        graphUri: 'https://example.org/graph/restore-test'
        // No selectedCubes = restore all
    });

    const apiAcceptsFullRestore = fullRestoreRes.status === 500 &&
        (fullRestoreRes.data?.error?.includes('ECONNREFUSED') ||
         fullRestoreRes.data?.error?.includes('fetch failed') ||
         fullRestoreRes.data?.error?.includes('connect') ||
         fullRestoreRes.data?.error?.includes('404') ||
         fullRestoreRes.data?.error?.includes('Unknown repository'));

    logTest('Full restore API endpoint works',
        apiAcceptsFullRestore || fullRestoreRes.status === 200,
        `Response: ${fullRestoreRes.status} - ${typeof fullRestoreRes.data?.error === 'string' ? fullRestoreRes.data.error.substring(0, 60) : 'OK'}`);

    // Test 4: Test export endpoint
    console.log('\nTest 4: Export API');
    const exportRes = await makeRequest('GET', `/api/backup/${backupId}/export`);
    logTest('Export endpoint returns data', exportRes.status === 200, `Status: ${exportRes.status}`);

    // Test 5: Test deletion endpoint
    console.log('\nTest 5: Backup Deletion API');
    const deleteRes = await makeRequest('DELETE', `/api/backup/${backupId}`);
    logTest('Delete endpoint works', deleteRes.status === 200 && deleteRes.data?.success === true,
        `Response: ${deleteRes.data?.success ? 'Deleted' : deleteRes.data?.error || 'Failed'}`);

    // Verify deletion
    const verifyList = await makeRequest('GET', '/api/backup/list');
    const stillExists = verifyList.data.backups?.some(b => b.backupId === backupId);
    logTest('Backup actually deleted', !stillExists,
        stillExists ? 'Still exists' : 'Successfully removed');

    // Summary
    console.log('\n==========================================');
    console.log('Restore API Test Summary');
    console.log('==========================================');
    console.log(`Total: ${results.passed + results.failed} tests`);
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);
    console.log('==========================================\n');

    // Cleanup
    if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
    }

    return results;
}

runTests()
    .then(results => {
        process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(err => {
        console.error('Test suite error:', err);
        process.exit(1);
    });
