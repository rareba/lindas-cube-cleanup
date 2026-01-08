// LINDAS Cube Cleanup Demo Application

// State management
const state = {
    fusekiEndpoint: 'http://localhost:3030',
    fusekiDataset: 'lindas',
    connected: false,
    lindasGraph: 'https://lindas.admin.ch/sfoe/cube',
    localGraph: 'https://lindas.admin.ch/sfoe/cube',
    availableCubes: [],
    selectedCubes: new Set(),
    cubesToDelete: [],
    selectedCubeForDeletion: null,
    // Deletion tracking
    deletionResults: {
        deletedCubes: [],
        keptCubes: [],
        totalTriplesDeleted: 0,
        backupIds: []
    },
    // Backup management
    selectedBackupId: null,
    backups: []
};

// DOM Elements
const elements = {
    fusekiEndpoint: document.getElementById('fuseki-endpoint'),
    fusekiDataset: document.getElementById('fuseki-dataset'),
    fusekiStatus: document.getElementById('fuseki-status'),
    fusekiInfo: document.getElementById('fuseki-info'),
    lindasGraph: document.getElementById('lindas-graph'),
    localGraph: document.getElementById('local-graph'),
    cleanupGraph: document.getElementById('cleanup-graph')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initEventListeners();
    checkFusekiConnection();
});

// Tab navigation
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');

            // Sync graph inputs when switching tabs
            syncGraphInputs();
        });
    });
}

function syncGraphInputs() {
    const graph = elements.lindasGraph.value;
    elements.localGraph.value = graph;
    elements.cleanupGraph.value = graph;
    state.lindasGraph = graph;
    state.localGraph = graph;
}

// Event listeners
function initEventListeners() {
    // Setup tab
    document.getElementById('btn-check-fuseki').addEventListener('click', checkFusekiConnection);
    document.getElementById('btn-create-dataset').addEventListener('click', createDataset);

    // Import tab
    document.getElementById('btn-search-graphs').addEventListener('click', searchGraphs);
    document.getElementById('btn-list-cubes').addEventListener('click', listAvailableCubes);
    document.getElementById('btn-import-selected').addEventListener('click', importSelectedCubes);
    document.getElementById('btn-import-sample').addEventListener('click', importSampleData);

    // Explore tab
    document.getElementById('btn-load-local-cubes').addEventListener('click', loadLocalCubes);
    document.getElementById('btn-count-triples').addEventListener('click', countTriples);

    // Cleanup tab
    document.getElementById('btn-identify-deletions').addEventListener('click', identifyDeletions);
    document.getElementById('btn-delete-selected').addEventListener('click', deleteSelectedCube);
    document.getElementById('btn-delete-all-old').addEventListener('click', deleteAllOldVersions);
    document.getElementById('btn-view-backup').addEventListener('click', viewLatestBackup);

    // Backup tab
    document.getElementById('btn-refresh-backups').addEventListener('click', loadBackupList);
    document.getElementById('btn-restore-backup').addEventListener('click', restoreBackup);
    document.getElementById('btn-delete-backup').addEventListener('click', deleteBackup);

    // Query Editor tab
    document.getElementById('btn-load-template').addEventListener('click', loadQueryTemplate);
    document.getElementById('btn-execute-query').addEventListener('click', executeQuery);
    document.getElementById('btn-clear-query').addEventListener('click', clearQuery);
    document.getElementById('query-template').addEventListener('change', onTemplateChange);

    // Sync inputs
    elements.lindasGraph.addEventListener('change', syncGraphInputs);
    elements.fusekiEndpoint.addEventListener('change', () => {
        state.fusekiEndpoint = elements.fusekiEndpoint.value;
    });
    elements.fusekiDataset.addEventListener('change', () => {
        state.fusekiDataset = elements.fusekiDataset.value;
    });
}

// API helper
async function api(endpoint, data = {}) {
    try {
        const response = await fetch(`/api${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'API request failed');
        }
        return result;
    } catch (error) {
        console.error(`API error for ${endpoint}:`, error);
        throw error;
    }
}

// Check Fuseki connection
async function checkFusekiConnection() {
    const statusEl = elements.fusekiStatus;
    const infoEl = elements.fusekiInfo;

    try {
        const result = await api('/fuseki/check', {
            endpoint: elements.fusekiEndpoint.value
        });

        if (result.connected) {
            state.connected = true;
            statusEl.classList.remove('disconnected');
            statusEl.classList.add('connected');
            statusEl.querySelector('.status-text').textContent = 'Fuseki: Connected';

            infoEl.classList.remove('hidden', 'error');
            infoEl.classList.add('success');

            const datasets = result.datasets.map(d => d['ds.name']).join(', ') || 'None';
            infoEl.innerHTML = `<strong>Connected!</strong><br>Datasets: ${datasets}`;
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        state.connected = false;
        statusEl.classList.remove('connected');
        statusEl.classList.add('disconnected');
        statusEl.querySelector('.status-text').textContent = 'Fuseki: Disconnected';

        infoEl.classList.remove('hidden', 'success');
        infoEl.classList.add('error');
        infoEl.innerHTML = `<strong>Connection failed:</strong> ${error.message}<br><br>Make sure Fuseki is running on the specified endpoint.`;
    }
}

// Create Fuseki dataset
async function createDataset() {
    try {
        const result = await api('/fuseki/create-dataset', {
            endpoint: elements.fusekiEndpoint.value,
            datasetName: elements.fusekiDataset.value
        });

        elements.fusekiInfo.classList.remove('hidden', 'error');
        elements.fusekiInfo.classList.add('success');
        elements.fusekiInfo.innerHTML = `<strong>Dataset created:</strong> ${result.dataset}`;

        await checkFusekiConnection();
    } catch (error) {
        elements.fusekiInfo.classList.remove('hidden', 'success');
        elements.fusekiInfo.classList.add('error');
        elements.fusekiInfo.innerHTML = `<strong>Error:</strong> ${error.message}`;
    }
}

// Search graphs in LINDAS
async function searchGraphs() {
    const container = document.getElementById('graph-search-results');
    const listEl = document.getElementById('graph-list');

    container.classList.remove('hidden');
    listEl.innerHTML = '<p class="placeholder-text">Searching...</p>';

    try {
        const result = await api('/lindas/graphs', {
            searchTerm: elements.lindasGraph.value.split('/').pop() || ''
        });

        if (result.results.bindings.length === 0) {
            listEl.innerHTML = '<p class="placeholder-text">No graphs found</p>';
            return;
        }

        listEl.innerHTML = result.results.bindings.map(row => `
            <div class="list-item" onclick="selectGraph('${row.graph.value}')">
                <div class="list-item-content">
                    <div class="list-item-title mono">${row.graph.value}</div>
                    <div class="list-item-subtitle">${parseInt(row.tripleCount.value).toLocaleString()} triples</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        listEl.innerHTML = `<p class="placeholder-text" style="color: var(--danger-color)">Error: ${error.message}</p>`;
    }
}

function selectGraph(graphUri) {
    elements.lindasGraph.value = graphUri;
    syncGraphInputs();
}

// List available cubes in LINDAS
async function listAvailableCubes() {
    const container = document.getElementById('cube-list-container');
    container.innerHTML = '<p class="placeholder-text">Loading cubes from LINDAS...</p>';

    try {
        const result = await api('/cubes/list-versions', {
            endpoint: 'https://lindas.admin.ch/query',
            graphUri: elements.lindasGraph.value
        });

        state.availableCubes = result.results.bindings;
        state.selectedCubes.clear();

        if (state.availableCubes.length === 0) {
            container.innerHTML = '<p class="placeholder-text">No cubes found in this graph</p>';
            return;
        }

        renderCubeList();
    } catch (error) {
        container.innerHTML = `<p class="placeholder-text" style="color: var(--danger-color)">Error: ${error.message}</p>`;
    }
}

function renderCubeList() {
    const container = document.getElementById('cube-list-container');

    container.innerHTML = state.availableCubes.map((cube, idx) => {
        const cubeUri = cube.cube.value;
        const version = cube.version?.value || '?';
        const title = cube.title?.value || cubeUri.split('/').slice(-2).join('/');
        const baseCube = cube.baseCube?.value || '';

        return `
            <div class="list-item" data-cube="${cubeUri}">
                <input type="checkbox"
                       id="cube-${idx}"
                       onchange="toggleCubeSelection('${cubeUri}')"
                       ${state.selectedCubes.has(cubeUri) ? 'checked' : ''}>
                <div class="list-item-content">
                    <div class="list-item-title">${title}</div>
                    <div class="list-item-subtitle mono">Version ${version} - ${cubeUri}</div>
                </div>
            </div>
        `;
    }).join('');

    updateImportButton();
}

function toggleCubeSelection(cubeUri) {
    if (state.selectedCubes.has(cubeUri)) {
        state.selectedCubes.delete(cubeUri);
    } else {
        state.selectedCubes.add(cubeUri);
    }
    updateImportButton();
}

function updateImportButton() {
    const btn = document.getElementById('btn-import-selected');
    btn.disabled = state.selectedCubes.size === 0;
    btn.textContent = state.selectedCubes.size > 0
        ? `Import Selected (${state.selectedCubes.size})`
        : 'Import Selected Cubes';
}

// Import selected cubes
async function importSelectedCubes() {
    if (!state.connected) {
        alert('Please connect to Fuseki first');
        return;
    }

    const progressContainer = document.getElementById('import-progress');
    const progressFill = document.getElementById('import-progress-fill');
    const statusText = document.getElementById('import-status');

    progressContainer.classList.remove('hidden');

    const cubes = Array.from(state.selectedCubes);
    let imported = 0;

    for (const cubeUri of cubes) {
        statusText.textContent = `Downloading ${cubeUri.split('/').slice(-2).join('/')}...`;
        progressFill.style.width = `${(imported / cubes.length) * 100}%`;

        try {
            // Download from LINDAS
            const downloadResult = await api('/lindas/download-cube', {
                graphUri: elements.lindasGraph.value,
                cubeUri: cubeUri
            });

            statusText.textContent = `Importing ${downloadResult.tripleCount} triples...`;

            // Import to Fuseki
            await api('/fuseki/import', {
                endpoint: state.fusekiEndpoint,
                dataset: state.fusekiDataset,
                graphUri: elements.lindasGraph.value,
                triples: downloadResult.triples
            });

            imported++;
        } catch (error) {
            statusText.textContent = `Error importing ${cubeUri}: ${error.message}`;
            console.error(error);
        }
    }

    progressFill.style.width = '100%';
    statusText.textContent = `Imported ${imported} of ${cubes.length} cubes successfully!`;
}

// Import sample data (co2wirkung cube with multiple versions)
async function importSampleData() {
    if (!state.connected) {
        alert('Please connect to Fuseki first');
        return;
    }

    const progressContainer = document.getElementById('import-progress');
    const progressFill = document.getElementById('import-progress-fill');
    const statusText = document.getElementById('import-status');

    progressContainer.classList.remove('hidden');
    statusText.textContent = 'Loading sample cube versions (co2wirkung)...';
    progressFill.style.width = '10%';

    // The co2wirkung cube has 7 versions - good for testing
    const baseCube = 'https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung';
    const versions = [1, 2, 3, 4, 5, 6, 7];

    let imported = 0;
    for (const version of versions) {
        const cubeUri = `${baseCube}/${version}`;
        statusText.textContent = `Downloading version ${version} of 7...`;
        progressFill.style.width = `${10 + (imported / versions.length) * 80}%`;

        try {
            const downloadResult = await api('/lindas/download-cube', {
                graphUri: elements.lindasGraph.value,
                cubeUri: cubeUri
            });

            statusText.textContent = `Importing version ${version} (${downloadResult.tripleCount} triples)...`;

            await api('/fuseki/import', {
                endpoint: state.fusekiEndpoint,
                dataset: state.fusekiDataset,
                graphUri: elements.lindasGraph.value,
                triples: downloadResult.triples
            });

            imported++;
        } catch (error) {
            console.error(`Error importing version ${version}:`, error);
        }
    }

    progressFill.style.width = '100%';
    statusText.textContent = `Imported ${imported} versions of co2wirkung cube. Ready for cleanup demo!`;
}

// Load local cubes from Fuseki
async function loadLocalCubes() {
    if (!state.connected) {
        alert('Please connect to Fuseki first');
        return;
    }

    const multiVersionContainer = document.getElementById('multi-version-cubes');
    const allVersionsContainer = document.getElementById('all-cube-versions');

    multiVersionContainer.innerHTML = '<p class="placeholder-text">Loading...</p>';
    allVersionsContainer.innerHTML = '<p class="placeholder-text">Loading...</p>';

    try {
        // Get cubes with version counts
        const countResult = await api('/cubes/count-versions', {
            endpoint: state.fusekiEndpoint,
            dataset: state.fusekiDataset,
            graphUri: elements.localGraph.value
        });

        // Get all versions
        const listResult = await api('/cubes/list-versions', {
            endpoint: state.fusekiEndpoint,
            dataset: state.fusekiDataset,
            graphUri: elements.localGraph.value
        });

        // Render multi-version table
        if (countResult.results.bindings.length === 0) {
            multiVersionContainer.innerHTML = '<p class="placeholder-text">No cubes with more than 2 versions found</p>';
        } else {
            multiVersionContainer.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Base Cube</th>
                            <th>Version Count</th>
                            <th>Versions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${countResult.results.bindings.map(row => `
                            <tr>
                                <td class="mono">${row.baseCube.value.split('/').pop()}</td>
                                <td><span class="badge badge-delete">${row.versionCount.value}</span></td>
                                <td>${row.versions?.value || ''}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }

        // Render all versions table
        if (listResult.results.bindings.length === 0) {
            allVersionsContainer.innerHTML = '<p class="placeholder-text">No cubes found in local Fuseki</p>';
        } else {
            allVersionsContainer.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Cube</th>
                            <th>Version</th>
                            <th>Created</th>
                            <th>Title</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${listResult.results.bindings.map(row => `
                            <tr>
                                <td class="mono">${row.baseCube?.value.split('/').pop() || ''}</td>
                                <td>${row.version?.value || ''}</td>
                                <td>${row.dateCreated?.value?.split('T')[0] || ''}</td>
                                <td>${row.title?.value || ''}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    } catch (error) {
        multiVersionContainer.innerHTML = `<p class="placeholder-text" style="color: var(--danger-color)">Error: ${error.message}</p>`;
        allVersionsContainer.innerHTML = '';
    }
}

// Count triples in graph
async function countTriples() {
    const infoBox = document.getElementById('triple-count-info');
    infoBox.classList.remove('hidden');
    infoBox.innerHTML = 'Counting triples...';

    try {
        const result = await api('/cubes/count-triples', {
            endpoint: state.fusekiEndpoint,
            dataset: state.fusekiDataset,
            graphUri: elements.localGraph.value
        });

        const count = result.results.bindings[0]?.count?.value || 0;
        infoBox.classList.add('success');
        infoBox.innerHTML = `<strong>Total triples:</strong> ${parseInt(count).toLocaleString()}`;
    } catch (error) {
        infoBox.classList.add('error');
        infoBox.innerHTML = `<strong>Error:</strong> ${error.message}`;
    }
}

// Identify versions to delete
async function identifyDeletions() {
    const previewContainer = document.getElementById('deletion-preview');
    previewContainer.innerHTML = '<p class="placeholder-text">Analyzing versions...</p>';

    try {
        const result = await api('/cubes/identify-deletions', {
            endpoint: state.fusekiEndpoint,
            dataset: state.fusekiDataset,
            graphUri: elements.cleanupGraph.value
        });

        if (result.results.bindings.length === 0) {
            previewContainer.innerHTML = '<p class="placeholder-text">No cubes found with more than 2 versions</p>';
            return;
        }

        // All returned rows are DELETE candidates (rank > 2)
        // Derive action from rank: rank <= 2 = KEEP, rank > 2 = DELETE
        const processedResults = result.results.bindings.map(row => ({
            ...row,
            action: { value: parseInt(row.rank?.value || 0) > 2 ? 'DELETE' : 'KEEP' }
        }));

        const keepCubes = processedResults.filter(r => r.action.value === 'KEEP');
        const deleteCubes = processedResults.filter(r => r.action.value === 'DELETE');

        state.cubesToDelete = deleteCubes;

        previewContainer.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Base Cube</th>
                        <th>Version</th>
                        <th>Rank</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${processedResults.map(row => `
                        <tr>
                            <td class="mono">${row.baseCube?.value.split('/').pop() || ''}</td>
                            <td>${row.version?.value || ''}</td>
                            <td>${row.rank?.value || ''}</td>
                            <td>
                                <span class="badge ${row.action.value === 'KEEP' ? 'badge-keep' : 'badge-delete'}">
                                    ${row.action.value}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="info-box" style="margin-top: 1rem;">
                <strong>Summary:</strong> ${deleteCubes.length} versions to delete (keeping newest 2 per cube)
            </div>
        `;

        // Show deletion cards
        document.getElementById('deletion-detail-card').style.display = 'block';
        document.getElementById('deletion-execution-card').style.display = 'block';

        renderCubesToDelete();
    } catch (error) {
        previewContainer.innerHTML = `<p class="placeholder-text" style="color: var(--danger-color)">Error: ${error.message}</p>`;
    }
}

// Render cubes to delete
function renderCubesToDelete() {
    const container = document.getElementById('cubes-to-delete');
    const queueContainer = document.getElementById('deletion-queue');

    container.innerHTML = state.cubesToDelete.map((cube, idx) => {
        const cubeUri = cube.cube?.value || '';
        const version = cube.version?.value || '';
        const baseCube = cube.baseCube?.value.split('/').pop() || '';

        return `
            <div class="list-item" onclick="selectCubeForDeletion('${cubeUri}')">
                <div class="list-item-content">
                    <div class="list-item-title">${baseCube} v${version}</div>
                    <div class="list-item-subtitle mono">${cubeUri}</div>
                </div>
                <button class="btn btn-small btn-secondary" onclick="event.stopPropagation(); previewCubeDeletion('${cubeUri}')">Preview</button>
            </div>
        `;
    }).join('');

    queueContainer.innerHTML = state.cubesToDelete.map(cube => {
        const cubeUri = cube.cube?.value || '';
        const version = cube.version?.value || '';
        const baseCube = cube.baseCube?.value.split('/').pop() || '';

        return `
            <div class="list-item">
                <input type="checkbox" class="deletion-checkbox" data-cube="${cubeUri}" checked>
                <div class="list-item-content">
                    <div class="list-item-title">${baseCube} v${version}</div>
                </div>
            </div>
        `;
    }).join('');

    updateDeletionButtons();
}

function updateDeletionButtons() {
    const checkboxes = document.querySelectorAll('.deletion-checkbox:checked');
    document.getElementById('btn-delete-selected').disabled = !state.selectedCubeForDeletion;
    document.getElementById('btn-delete-all-old').disabled = checkboxes.length === 0;
}

async function selectCubeForDeletion(cubeUri) {
    state.selectedCubeForDeletion = cubeUri;
    document.querySelectorAll('#cubes-to-delete .list-item').forEach(el => {
        el.classList.toggle('selected', el.querySelector('.list-item-subtitle').textContent === cubeUri);
    });

    document.getElementById('selected-cube-name').textContent = cubeUri.split('/').slice(-2).join('/');
    document.getElementById('selected-cube-preview').classList.remove('hidden');

    await previewCubeDeletion(cubeUri);
    updateDeletionButtons();
}

async function previewCubeDeletion(cubeUri) {
    const container = document.getElementById('triple-breakdown');
    container.innerHTML = '<p>Loading...</p>';

    try {
        const result = await api('/cubes/preview-deletion', {
            endpoint: state.fusekiEndpoint,
            dataset: state.fusekiDataset,
            graphUri: elements.cleanupGraph.value,
            cubeUri: cubeUri
        });

        const data = result.results.bindings[0] || {};
        const meta = parseInt(data.metaTriples?.value || 0);
        const shapes = parseInt(data.shapeTriples?.value || 0);
        const obs = parseInt(data.observationTriples?.value || 0);
        const total = meta + shapes + obs;

        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${meta.toLocaleString()}</div>
                <div class="stat-label">Metadata Triples</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${shapes.toLocaleString()}</div>
                <div class="stat-label">Shape Triples</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${obs.toLocaleString()}</div>
                <div class="stat-label">Observation Triples</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--danger-color)">${total.toLocaleString()}</div>
                <div class="stat-label">Total to Delete</div>
            </div>
        `;
    } catch (error) {
        container.innerHTML = `<p style="color: var(--danger-color)">Error: ${error.message}</p>`;
    }
}

// Delete selected cube
async function deleteSelectedCube() {
    if (!state.selectedCubeForDeletion) {
        alert('Please select a cube to delete');
        return;
    }

    if (!confirm(`Are you sure you want to delete this cube version?\n\n${state.selectedCubeForDeletion}`)) {
        return;
    }

    await deleteCube(state.selectedCubeForDeletion);
}

// Delete all old versions
async function deleteAllOldVersions() {
    const checkboxes = document.querySelectorAll('.deletion-checkbox:checked');
    const cubes = Array.from(checkboxes).map(cb => cb.dataset.cube);

    if (cubes.length === 0) {
        alert('No cubes selected for deletion');
        return;
    }

    if (!confirm(`Are you sure you want to delete ${cubes.length} old cube versions?\n\nBackups will be created automatically.`)) {
        return;
    }

    const progressContainer = document.getElementById('deletion-progress');
    const progressFill = document.getElementById('deletion-progress-fill');
    const statusText = document.getElementById('deletion-status');
    const logContainer = document.getElementById('deletion-log');
    const logContent = document.getElementById('log-content');

    progressContainer.classList.remove('hidden');
    logContainer.classList.remove('hidden');
    logContent.textContent = '';

    // Reset deletion results
    state.deletionResults = {
        deletedCubes: [],
        keptCubes: [],
        totalTriplesDeleted: 0,
        backupIds: [],
        timestamp: new Date().toISOString()
    };

    let deleted = 0;
    const totalSteps = cubes.length * 2; // backup + delete for each

    for (const cubeUri of cubes) {
        const cubeName = cubeUri.split('/').slice(-2).join('/');

        // Step 1: Create backup
        statusText.textContent = `Creating backup for ${cubeName}...`;
        progressFill.style.width = `${((deleted * 2) / totalSteps) * 100}%`;
        logContent.textContent += `[INFO] Creating backup for ${cubeUri}...\n`;

        try {
            const backupResult = await createBackup(cubeUri);
            state.deletionResults.backupIds.push(backupResult.backupId);
            logContent.textContent += `[OK] Backup created: ${backupResult.backupId} (${backupResult.tripleCount} triples)\n`;
        } catch (error) {
            logContent.textContent += `[WARN] Backup failed: ${error.message} - proceeding with deletion\n`;
        }

        // Step 2: Delete
        statusText.textContent = `Deleting ${cubeName}...`;
        progressFill.style.width = `${((deleted * 2 + 1) / totalSteps) * 100}%`;

        try {
            const triplesBefore = await getTripleCount(cubeUri);
            await deleteCubeInternal(cubeUri, logContent);
            deleted++;

            state.deletionResults.deletedCubes.push({
                uri: cubeUri,
                name: cubeName,
                triples: triplesBefore
            });
            state.deletionResults.totalTriplesDeleted += triplesBefore;

            logContent.textContent += `[OK] Deleted: ${cubeUri}\n`;
        } catch (error) {
            logContent.textContent += `[ERROR] Failed to delete ${cubeUri}: ${error.message}\n`;
        }
    }

    progressFill.style.width = '100%';
    statusText.textContent = `Deleted ${deleted} of ${cubes.length} cube versions`;

    // Get remaining (kept) versions
    try {
        const listResult = await api('/cubes/list-versions', {
            endpoint: state.fusekiEndpoint,
            dataset: state.fusekiDataset,
            graphUri: elements.cleanupGraph.value
        });
        state.deletionResults.keptCubes = listResult.results.bindings.map(row => ({
            uri: row.cube?.value || '',
            name: row.cube?.value.split('/').slice(-2).join('/') || '',
            version: row.version?.value || ''
        }));
    } catch (error) {
        console.error('Failed to get kept versions:', error);
    }

    // Show deletion summary
    showDeletionSummary();

    // Refresh the deletion preview
    await identifyDeletions();
}

// Get triple count for a cube (for summary)
async function getTripleCount(cubeUri) {
    try {
        const result = await api('/cubes/preview-deletion', {
            endpoint: state.fusekiEndpoint,
            dataset: state.fusekiDataset,
            graphUri: elements.cleanupGraph.value,
            cubeUri: cubeUri
        });
        const data = result.results.bindings[0] || {};
        const meta = parseInt(data.metaTriples?.value || 0);
        const shapes = parseInt(data.shapeTriples?.value || 0);
        const obs = parseInt(data.observationTriples?.value || 0);
        return meta + shapes + obs;
    } catch (error) {
        return 0;
    }
}

// Create backup for a cube
async function createBackup(cubeUri) {
    const response = await fetch('/api/backup/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            endpoint: state.fusekiEndpoint,
            dataset: state.fusekiDataset,
            graphUri: elements.cleanupGraph.value,
            cubeUri: cubeUri
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Backup failed');
    }

    return await response.json();
}

// Show deletion summary
function showDeletionSummary() {
    const summaryCard = document.getElementById('deletion-summary-card');
    summaryCard.style.display = 'block';

    // Update timestamp
    document.getElementById('summary-timestamp').textContent =
        `Completed at ${new Date(state.deletionResults.timestamp).toLocaleString()}`;

    // Update stats
    document.getElementById('summary-versions-deleted').textContent =
        state.deletionResults.deletedCubes.length;
    document.getElementById('summary-triples-deleted').textContent =
        state.deletionResults.totalTriplesDeleted.toLocaleString();
    document.getElementById('summary-versions-kept').textContent =
        state.deletionResults.keptCubes.length;

    // Update deleted list
    const deletedList = document.getElementById('summary-deleted-list');
    if (state.deletionResults.deletedCubes.length === 0) {
        deletedList.innerHTML = '<p class="placeholder-text">No versions deleted</p>';
    } else {
        deletedList.innerHTML = state.deletionResults.deletedCubes.map(cube => `
            <div class="summary-item deleted">
                <span class="summary-item-icon">&#10005;</span>
                <div class="summary-item-content">
                    <div class="summary-item-name">${cube.name}</div>
                    <div class="summary-item-detail">${cube.triples.toLocaleString()} triples removed</div>
                </div>
            </div>
        `).join('');
    }

    // Update kept list
    const keptList = document.getElementById('summary-kept-list');
    if (state.deletionResults.keptCubes.length === 0) {
        keptList.innerHTML = '<p class="placeholder-text">No versions remaining</p>';
    } else {
        keptList.innerHTML = state.deletionResults.keptCubes.map(cube => `
            <div class="summary-item kept">
                <span class="summary-item-icon">&#10003;</span>
                <div class="summary-item-content">
                    <div class="summary-item-name">${cube.name}</div>
                    <div class="summary-item-detail">Version ${cube.version} preserved</div>
                </div>
            </div>
        `).join('');
    }

    // Scroll to summary
    summaryCard.scrollIntoView({ behavior: 'smooth' });
}

// View latest backup (from summary)
function viewLatestBackup() {
    // Switch to backups tab
    document.querySelector('[data-tab="backups"]').click();
    loadBackupList();
}

async function deleteCube(cubeUri) {
    const progressContainer = document.getElementById('deletion-progress');
    const progressFill = document.getElementById('deletion-progress-fill');
    const statusText = document.getElementById('deletion-status');
    const logContainer = document.getElementById('deletion-log');
    const logContent = document.getElementById('log-content');

    progressContainer.classList.remove('hidden');
    logContainer.classList.remove('hidden');
    logContent.textContent = '';

    try {
        await deleteCubeInternal(cubeUri, logContent);
        progressFill.style.width = '100%';
        statusText.textContent = 'Deletion complete!';
        logContent.textContent += `[OK] Successfully deleted: ${cubeUri}\n`;

        // Refresh the deletion preview
        await identifyDeletions();
    } catch (error) {
        statusText.textContent = `Error: ${error.message}`;
        logContent.textContent += `[ERROR] ${error.message}\n`;
    }
}

async function deleteCubeInternal(cubeUri, logEl) {
    const graphUri = elements.cleanupGraph.value;

    // Step 1: Delete observations (chunked)
    logEl.textContent += `[INFO] Deleting observations for ${cubeUri}...\n`;

    let observationCount = 1;
    while (observationCount > 0) {
        await api('/cubes/delete-observations', {
            endpoint: state.fusekiEndpoint,
            dataset: state.fusekiDataset,
            graphUri: graphUri,
            cubeUri: cubeUri,
            chunkSize: 50000
        });

        // Check remaining
        const countResult = await api('/cubes/count-observations', {
            endpoint: state.fusekiEndpoint,
            dataset: state.fusekiDataset,
            graphUri: graphUri,
            cubeUri: cubeUri
        });

        observationCount = parseInt(countResult.results.bindings[0]?.count?.value || 0);
        if (observationCount > 0) {
            logEl.textContent += `[INFO] ${observationCount} observations remaining...\n`;
        }
    }
    logEl.textContent += `[INFO] Observations deleted\n`;

    // Step 2: Delete observation links
    logEl.textContent += `[INFO] Deleting observation links...\n`;
    await api('/cubes/delete-observation-links', {
        endpoint: state.fusekiEndpoint,
        dataset: state.fusekiDataset,
        graphUri: graphUri,
        cubeUri: cubeUri
    });

    // Step 3: Delete metadata
    logEl.textContent += `[INFO] Deleting metadata and shapes...\n`;
    await api('/cubes/delete-metadata', {
        endpoint: state.fusekiEndpoint,
        dataset: state.fusekiDataset,
        graphUri: graphUri,
        cubeUri: cubeUri
    });

    logEl.textContent += `[INFO] Cube deletion complete\n`;
}

// ========== BACKUP MANAGEMENT ==========

// Load backup list
async function loadBackupList() {
    const container = document.getElementById('backup-list-container');
    container.innerHTML = '<p class="placeholder-text">Loading backups...</p>';

    try {
        const response = await fetch('/api/backup/list');
        const data = await response.json();

        state.backups = data.backups || [];

        if (state.backups.length === 0) {
            container.innerHTML = '<p class="placeholder-text">No backups available</p>';
            document.getElementById('restore-preview-card').style.display = 'none';
            return;
        }

        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Cube</th>
                        <th>Created</th>
                        <th>Expires</th>
                        <th>Triples</th>
                        <th>Size</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.backups.map(backup => `
                        <tr class="${isBackupExpiringSoon(backup.expiresAt) ? 'expiring-soon' : ''}">
                            <td class="mono">${backup.cubeUri.split('/').slice(-2).join('/')}</td>
                            <td>${formatDate(backup.createdAt)}</td>
                            <td>${formatDate(backup.expiresAt)}</td>
                            <td>${backup.tripleCount.toLocaleString()}</td>
                            <td>${formatFileSize(backup.fileSize)}</td>
                            <td>
                                <button class="btn btn-small btn-primary" onclick="selectBackup('${backup.backupId}')">
                                    Select
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<p class="placeholder-text" style="color: var(--danger-color)">Error: ${error.message}</p>`;
    }
}

// Check if backup is expiring within 2 days
function isBackupExpiringSoon(expiresAt) {
    const expiry = new Date(expiresAt);
    const now = new Date();
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    return (expiry - now) < twoDays;
}

// Format date for display
function formatDate(isoDate) {
    const date = new Date(isoDate);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Format file size
function formatFileSize(bytes) {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Select a backup for preview/restore
function selectBackup(backupId) {
    state.selectedBackupId = backupId;
    const backup = state.backups.find(b => b.backupId === backupId);

    if (!backup) {
        alert('Backup not found');
        return;
    }

    const previewCard = document.getElementById('restore-preview-card');
    const previewInfo = document.getElementById('restore-preview-info');

    previewCard.style.display = 'block';
    previewInfo.classList.remove('hidden');
    previewInfo.classList.add('info');

    previewInfo.innerHTML = `
        <h3>Backup Details</h3>
        <table class="detail-table">
            <tr><th>Backup ID:</th><td class="mono">${backup.backupId}</td></tr>
            <tr><th>Cube URI:</th><td class="mono">${backup.cubeUri}</td></tr>
            <tr><th>Graph:</th><td class="mono">${backup.graphUri}</td></tr>
            <tr><th>Triple Count:</th><td>${backup.tripleCount.toLocaleString()}</td></tr>
            <tr><th>File Size:</th><td>${formatFileSize(backup.fileSize)}</td></tr>
            <tr><th>Created:</th><td>${formatDate(backup.createdAt)}</td></tr>
            <tr><th>Expires:</th><td>${formatDate(backup.expiresAt)}</td></tr>
        </table>
        <p class="warning-text">Restoring this backup will re-import ${backup.tripleCount.toLocaleString()} triples into the graph.</p>
    `;

    previewCard.scrollIntoView({ behavior: 'smooth' });
}

// Restore from backup
async function restoreBackup() {
    if (!state.selectedBackupId) {
        alert('Please select a backup first');
        return;
    }

    if (!confirm('Are you sure you want to restore this backup? This will re-import the deleted cube data.')) {
        return;
    }

    const progressContainer = document.getElementById('restore-progress');
    const progressFill = document.getElementById('restore-progress-fill');
    const statusText = document.getElementById('restore-status');

    progressContainer.classList.remove('hidden');
    progressFill.style.width = '0%';
    statusText.textContent = 'Restoring backup...';

    try {
        progressFill.style.width = '30%';

        const response = await fetch('/api/backup/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                backupId: state.selectedBackupId,
                endpoint: state.fusekiEndpoint,
                dataset: state.fusekiDataset
            })
        });

        progressFill.style.width = '80%';

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Restore failed');
        }

        const result = await response.json();
        progressFill.style.width = '100%';
        statusText.textContent = `Restored ${result.restoredTriples.toLocaleString()} triples successfully!`;

        // Show success message
        const previewInfo = document.getElementById('restore-preview-info');
        previewInfo.classList.remove('info');
        previewInfo.classList.add('success');
        previewInfo.innerHTML = `
            <h3>Restore Complete</h3>
            <p>Successfully restored <strong>${result.restoredTriples.toLocaleString()}</strong> triples for cube:</p>
            <p class="mono">${result.cubeUri}</p>
            <p>The cube version is now available in the graph again.</p>
        `;

    } catch (error) {
        progressFill.style.width = '100%';
        progressFill.style.backgroundColor = 'var(--danger-color)';
        statusText.textContent = `Error: ${error.message}`;
    }
}

// Delete a backup
async function deleteBackup() {
    if (!state.selectedBackupId) {
        alert('Please select a backup first');
        return;
    }

    if (!confirm('Are you sure you want to delete this backup? This cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`/api/backup/${state.selectedBackupId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Delete failed');
        }

        // Reset selection and reload list
        state.selectedBackupId = null;
        document.getElementById('restore-preview-card').style.display = 'none';
        await loadBackupList();

        alert('Backup deleted successfully');

    } catch (error) {
        alert(`Error deleting backup: ${error.message}`);
    }
}

// ========== QUERY EDITOR ==========

// Query templates
const queryTemplates = {
    'preview-single': {
        name: 'Preview Single Cube',
        type: 'select',
        query: `PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX schema: <http://schema.org/>

# Simplified preview query - counts cube components
SELECT
    ?cube
    ?title
    ?dateCreated
    (COUNT(DISTINCT ?shape) AS ?shapeCount)
    (COUNT(DISTINCT ?property) AS ?propertyCount)
    (COUNT(DISTINCT ?obsSet) AS ?observationSetCount)
    (COUNT(DISTINCT ?obs) AS ?observationCount)
WHERE {
    GRAPH <GRAPH_URI> {
        BIND(<CUBE_URI> AS ?cube)
        ?cube rdf:type cube:Cube .

        OPTIONAL { ?cube schema:name ?title . FILTER(lang(?title) = "en" || lang(?title) = "") }
        OPTIONAL { ?cube schema:dateCreated ?dateCreated }

        OPTIONAL { ?cube cube:observationConstraint ?shape }
        OPTIONAL { ?cube cube:observationConstraint/sh:property ?property }
        OPTIONAL { ?cube cube:observationSet ?obsSet }
        OPTIONAL { ?cube cube:observationSet/cube:observation ?obs }
    }
}
GROUP BY ?cube ?title ?dateCreated`
    },

    'delete-single': {
        name: 'Delete Single Cube',
        type: 'update',
        query: `PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

WITH <GRAPH_URI>
DELETE {
  ?cube a cube:Cube ;
        cube:observationConstraint ?shape ;
        cube:observationSet ?set ;
        ?p1 ?metaLevel1 .

  ?metaLevel1 ?p2 ?metaLevel2 .

  ?shape ?shapeP ?shapeO .
  ?propertyS ?propertyP ?propertyO .

  ?set cube:observation ?observationS .
  ?set ?setP ?setO .
  ?observationS ?observationP ?observationO .
}
WHERE {
  BIND(<CUBE_URI> AS ?cube)
  ?cube rdf:type cube:Cube

  { ?cube ?p1 ?metaLevel1
    OPTIONAL {
      ?metaLevel1 ?p2 ?metaLevel2
      FILTER(isBlank(?metaLevel1))
    }
  }
  UNION
  { ?cube cube:observationConstraint ?shape .
    ?shape ?shapeP ?shapeO }
  UNION
  { ?cube cube:observationConstraint/sh:property ?property .
    ?property (<>|!<>)* ?propertyS .
    ?propertyS ?propertyP ?propertyO }
  UNION
  { ?cube cube:observationSet ?set .
    ?set ?setP ?setO . }
  UNION
  { ?cube cube:observationSet ?set .
    ?set cube:observation ?observationS .
    ?observationS ?observationP ?observationO }
}`
    },

    'list-cubes': {
        name: 'List All Cubes',
        type: 'select',
        query: `PREFIX cube: <https://cube.link/>
PREFIX schema: <http://schema.org/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT DISTINCT ?baseCube ?cube ?version ?dateCreated ?title
WHERE {
  GRAPH <GRAPH_URI> {
    ?cube a cube:Cube .

    OPTIONAL { ?cube schema:dateCreated ?dateCreated }
    OPTIONAL { ?cube schema:name ?title . FILTER(lang(?title) = "en" || lang(?title) = "") }

    BIND(REPLACE(STR(?cube), "^.*/([^/]+)/([0-9]+)$", "$2") AS ?versionStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+$"), xsd:integer(?versionStr), 0) AS ?version)

    BIND(REPLACE(STR(?cube), "^(.*/[^/]+)/[0-9]+$", "$1") AS ?baseCubeStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+$"), IRI(?baseCubeStr), ?cube) AS ?baseCube)
  }
}
ORDER BY ?baseCube DESC(?version)
LIMIT 100`
    },

    'count-triples': {
        name: 'Count Total Triples',
        type: 'select',
        query: `SELECT (COUNT(*) AS ?tripleCount)
WHERE {
  GRAPH <GRAPH_URI> {
    ?s ?p ?o .
  }
}`
    }
};

// Load selected template into editor
function loadQueryTemplate() {
    const templateSelect = document.getElementById('query-template');
    const template = templateSelect.value;
    const queryTextarea = document.getElementById('query-text');
    const graphInput = document.getElementById('query-graph');
    const cubeInput = document.getElementById('query-cube-uri');

    if (template === 'custom') {
        return;
    }

    const tmpl = queryTemplates[template];
    if (!tmpl) {
        alert('Template not found');
        return;
    }

    // Replace placeholders with actual values
    let query = tmpl.query;
    const graphUri = graphInput.value || 'https://lindas.admin.ch/sfoe/cube';
    const cubeUri = cubeInput.value || '<CUBE_URI>';

    query = query.replace(/GRAPH_URI/g, graphUri);
    query = query.replace(/CUBE_URI/g, cubeUri);

    queryTextarea.value = query;

    // Set query type
    const queryTypeRadios = document.querySelectorAll('input[name="query-type"]');
    queryTypeRadios.forEach(radio => {
        radio.checked = radio.value === tmpl.type;
    });

    // Show status
    showQueryStatus(`Template "${tmpl.name}" loaded. ${tmpl.type === 'update' ? 'WARNING: This is a destructive UPDATE query!' : ''}`, tmpl.type === 'update' ? 'warning' : 'info');
}

// Handle template dropdown change
function onTemplateChange() {
    const templateSelect = document.getElementById('query-template');
    const template = templateSelect.value;

    if (template !== 'custom') {
        loadQueryTemplate();
    }
}

// Execute query
async function executeQuery() {
    const queryTextarea = document.getElementById('query-text');
    const query = queryTextarea.value.trim();

    if (!query) {
        alert('Please enter a query');
        return;
    }

    const queryType = document.querySelector('input[name="query-type"]:checked').value;

    // Confirm for UPDATE queries
    if (queryType === 'update') {
        if (!confirm('WARNING: This is an UPDATE query that will modify data. Are you sure you want to execute it?')) {
            return;
        }
    }

    showQueryStatus('Executing query...', 'info');

    try {
        const response = await fetch('/api/query/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                endpoint: state.fusekiEndpoint,
                dataset: state.fusekiDataset,
                query: query,
                queryType: queryType
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Query execution failed');
        }

        if (result.queryType === 'update') {
            showQueryStatus(`Update executed successfully in ${result.duration}ms`, 'success');
            document.getElementById('query-results-card').style.display = 'none';
        } else {
            showQueryStatus(`Query returned ${result.rowCount} rows in ${result.duration}ms`, 'success');
            displayQueryResults(result);
        }

    } catch (error) {
        showQueryStatus(`Error: ${error.message}`, 'error');
        document.getElementById('query-results-card').style.display = 'none';
    }
}

// Display SELECT query results
function displayQueryResults(result) {
    const resultsCard = document.getElementById('query-results-card');
    const resultsContainer = document.getElementById('query-results');
    const resultsCount = document.getElementById('results-count');
    const resultsTime = document.getElementById('results-time');

    resultsCard.style.display = 'block';
    resultsCount.textContent = `${result.rowCount} rows`;
    resultsTime.textContent = `${result.duration}ms`;

    if (result.rowCount === 0) {
        resultsContainer.innerHTML = '<p class="no-results">No results found</p>';
        return;
    }

    // Build table
    const headers = result.head.vars;
    const rows = result.results.bindings;

    let html = '<div class="results-table-wrapper"><table class="results-table"><thead><tr>';

    // Headers
    headers.forEach(h => {
        html += `<th>${h}</th>`;
    });
    html += '</tr></thead><tbody>';

    // Rows
    rows.forEach(row => {
        html += '<tr>';
        headers.forEach(h => {
            const cell = row[h];
            let value = '';
            if (cell) {
                value = cell.value;
                // Shorten long URIs for display
                if (cell.type === 'uri' && value.length > 60) {
                    const shortValue = '...' + value.slice(-50);
                    value = `<span title="${value}">${shortValue}</span>`;
                }
            }
            html += `<td>${value}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody></table></div>';

    resultsContainer.innerHTML = html;
}

// Clear query editor
function clearQuery() {
    document.getElementById('query-text').value = '';
    document.getElementById('query-template').value = 'custom';
    document.getElementById('query-results-card').style.display = 'none';
    hideQueryStatus();
}

// Show query status message
function showQueryStatus(message, type) {
    const statusEl = document.getElementById('query-status');
    statusEl.textContent = message;
    statusEl.className = `query-status ${type}`;
    statusEl.classList.remove('hidden');
}

// Hide query status
function hideQueryStatus() {
    const statusEl = document.getElementById('query-status');
    statusEl.classList.add('hidden');
}
