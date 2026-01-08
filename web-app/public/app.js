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
    selectedCubeForDeletion: null
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
            previewContainer.innerHTML = '<p class="placeholder-text">No cubes found</p>';
            return;
        }

        // Separate keep and delete
        const keepCubes = result.results.bindings.filter(r => r.action?.value === 'KEEP');
        const deleteCubes = result.results.bindings.filter(r => r.action?.value === 'DELETE');

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
                    ${result.results.bindings.map(row => `
                        <tr>
                            <td class="mono">${row.baseCube?.value.split('/').pop() || ''}</td>
                            <td>${row.version?.value || ''}</td>
                            <td>${row.rank?.value || ''}</td>
                            <td>
                                <span class="badge ${row.action?.value === 'KEEP' ? 'badge-keep' : 'badge-delete'}">
                                    ${row.action?.value || ''}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="info-box" style="margin-top: 1rem;">
                <strong>Summary:</strong> ${keepCubes.length} versions to keep, ${deleteCubes.length} versions to delete
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

    if (!confirm(`Are you sure you want to delete ${cubes.length} old cube versions?\n\nThis action cannot be undone.`)) {
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

    let deleted = 0;
    for (const cubeUri of cubes) {
        statusText.textContent = `Deleting ${cubeUri.split('/').slice(-2).join('/')}...`;
        progressFill.style.width = `${(deleted / cubes.length) * 100}%`;

        try {
            await deleteCubeInternal(cubeUri, logContent);
            deleted++;
            logContent.textContent += `[OK] Deleted: ${cubeUri}\n`;
        } catch (error) {
            logContent.textContent += `[ERROR] Failed to delete ${cubeUri}: ${error.message}\n`;
        }
    }

    progressFill.style.width = '100%';
    statusText.textContent = `Deleted ${deleted} of ${cubes.length} cube versions`;

    // Refresh the deletion preview
    await identifyDeletions();
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
