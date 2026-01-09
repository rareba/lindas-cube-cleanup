// LINDAS Cube Cleanup Demo Application

// Triplestore defaults
const TRIPLESTORE_DEFAULTS = {
    fuseki: {
        local: { baseUrl: 'http://localhost:3030', hint: 'For local Fuseki, use http://localhost:3030' },
        cloud: { baseUrl: 'https://lindas.admin.ch', hint: 'For LINDAS, use https://lindas.admin.ch' }
    },
    stardog: {
        local: { baseUrl: 'http://localhost:5820', hint: 'For local Stardog, use http://localhost:5820' },
        cloud: { baseUrl: 'https://sd-xxxxx.stardog.cloud:5820', hint: 'Enter your Stardog Cloud instance URL' }
    },
    graphdb: {
        local: { baseUrl: 'http://localhost:7200', hint: 'For local GraphDB, use http://localhost:7200' },
        cloud: { baseUrl: 'https://your-instance.graphdb.cloud', hint: 'Enter your GraphDB Cloud instance URL' }
    }
};

// State management
const state = {
    // Triplestore configuration
    triplestoreType: 'fuseki',
    triplestoreMode: 'local',
    fusekiEndpoint: 'http://localhost:3030',
    fusekiDataset: 'lindas',
    stardogDatabase: 'mydb',
    graphdbRepository: 'test',
    authUsername: '',
    authPassword: '',
    connected: false,
    // Graph configuration
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
    backups: [],
    // Import state
    uploadedFileData: null
};

// DOM Elements
const elements = {
    // Triplestore config
    triplestoreType: document.getElementById('triplestore-type'),
    triplestoreMode: document.getElementById('triplestore-mode'),
    fusekiEndpoint: document.getElementById('fuseki-endpoint'),
    fusekiDataset: document.getElementById('fuseki-dataset'),
    stardogDatabase: document.getElementById('stardog-database'),
    graphdbRepository: document.getElementById('graphdb-repository'),
    authUsername: document.getElementById('auth-username'),
    authPassword: document.getElementById('auth-password'),
    endpointHint: document.getElementById('endpoint-hint'),
    // UI elements
    fusekiStatus: document.getElementById('fuseki-status'),
    fusekiInfo: document.getElementById('fuseki-info'),
    modeIndicator: document.getElementById('mode-indicator'),
    cloudWarningBanner: document.getElementById('cloud-warning-banner'),
    // Graph inputs
    lindasGraph: document.getElementById('lindas-graph'),
    localGraph: document.getElementById('local-graph'),
    cleanupGraph: document.getElementById('cleanup-graph'),
    // Dataset rows
    fusekiDatasetRow: document.getElementById('fuseki-dataset-row'),
    stardogDatabaseRow: document.getElementById('stardog-database-row'),
    graphdbRepositoryRow: document.getElementById('graphdb-repository-row'),
    authRow: document.getElementById('auth-row')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initEventListeners();
    initTriplestoreConfig();
    checkFusekiConnection();
});

// Initialize triplestore configuration UI
function initTriplestoreConfig() {
    updateTriplestoreUI();
}

// Update UI based on triplestore type and mode
function updateTriplestoreUI() {
    const type = elements.triplestoreType?.value || 'fuseki';
    const mode = elements.triplestoreMode?.value || 'local';

    state.triplestoreType = type;
    state.triplestoreMode = mode;

    // Update endpoint hint and default value
    const defaults = TRIPLESTORE_DEFAULTS[type]?.[mode];
    if (defaults) {
        if (elements.endpointHint) {
            elements.endpointHint.textContent = defaults.hint;
        }
        // Only update if currently empty or using a default
        const currentEndpoint = elements.fusekiEndpoint?.value || '';
        const isDefaultUrl = Object.values(TRIPLESTORE_DEFAULTS).some(ts =>
            Object.values(ts).some(m => m.baseUrl === currentEndpoint)
        );
        if (!currentEndpoint || isDefaultUrl) {
            if (elements.fusekiEndpoint) {
                elements.fusekiEndpoint.value = defaults.baseUrl;
            }
        }
    }

    // Show/hide dataset/database/repository inputs
    if (elements.fusekiDatasetRow) {
        elements.fusekiDatasetRow.classList.toggle('hidden', type !== 'fuseki');
    }
    if (elements.stardogDatabaseRow) {
        elements.stardogDatabaseRow.classList.toggle('hidden', type !== 'stardog');
    }
    if (elements.graphdbRepositoryRow) {
        elements.graphdbRepositoryRow.classList.toggle('hidden', type !== 'graphdb');
    }

    // Show/hide auth row for non-fuseki local or any cloud
    const needsAuth = (type !== 'fuseki' && mode === 'local') || mode === 'cloud';
    if (elements.authRow) {
        elements.authRow.classList.toggle('hidden', !needsAuth);
    }

    // Update mode indicator in header
    if (elements.modeIndicator) {
        elements.modeIndicator.className = 'mode-indicator ' + mode;
        const badge = elements.modeIndicator.querySelector('.mode-badge');
        if (badge) {
            badge.textContent = mode.toUpperCase();
        }
    }

    // Show/hide cloud warning banner
    if (elements.cloudWarningBanner) {
        elements.cloudWarningBanner.classList.toggle('hidden', mode !== 'cloud');
    }

    // Update status indicator text
    if (elements.fusekiStatus) {
        const typeNames = { fuseki: 'Fuseki', stardog: 'Stardog', graphdb: 'GraphDB' };
        const statusText = elements.fusekiStatus.querySelector('.status-text');
        if (statusText) {
            statusText.textContent = `${typeNames[type]}: ${state.connected ? 'Connected' : 'Disconnected'}`;
        }
    }
}

// Get current triplestore config
function getTriplestoreConfig() {
    return {
        type: state.triplestoreType,
        mode: state.triplestoreMode,
        baseUrl: elements.fusekiEndpoint?.value || 'http://localhost:3030',
        dataset: elements.fusekiDataset?.value || 'lindas',
        database: elements.stardogDatabase?.value || 'mydb',
        repository: elements.graphdbRepository?.value || 'test',
        username: elements.authUsername?.value || '',
        password: elements.authPassword?.value || ''
    };
}

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
    // Triplestore configuration
    if (elements.triplestoreType) {
        elements.triplestoreType.addEventListener('change', () => {
            updateTriplestoreUI();
            state.connected = false;
            updateConnectionStatus(false);
        });
    }
    if (elements.triplestoreMode) {
        elements.triplestoreMode.addEventListener('change', () => {
            updateTriplestoreUI();
            state.connected = false;
            updateConnectionStatus(false);
        });
    }

    // Cloud warning banner - switch to local button
    const switchToLocalBtn = document.getElementById('btn-switch-to-local');
    if (switchToLocalBtn) {
        switchToLocalBtn.addEventListener('click', () => {
            if (elements.triplestoreMode) {
                elements.triplestoreMode.value = 'local';
                updateTriplestoreUI();
            }
        });
    }

    // Setup tab
    document.getElementById('btn-check-fuseki').addEventListener('click', checkFusekiConnection);
    document.getElementById('btn-create-dataset').addEventListener('click', createDataset);

    // Import tab - simplified
    document.getElementById('btn-load-lindas-graphs').addEventListener('click', loadLindasGraphs);
    document.getElementById('lindas-graph-select').addEventListener('change', onLindasGraphSelected);
    document.getElementById('btn-import-all-cubes').addEventListener('click', importAllCubesFromGraph);
    document.getElementById('btn-import-sample').addEventListener('click', importSampleData);
    document.getElementById('btn-go-to-explore').addEventListener('click', () => {
        document.querySelector('[data-tab="explore"]').click();
    });

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

    // Export backup button
    const exportBackupBtn = document.getElementById('btn-export-backup');
    if (exportBackupBtn) {
        exportBackupBtn.addEventListener('click', exportBackup);
    }

    // File upload functionality
    const fileInput = document.getElementById('backup-file-input');
    const selectFileBtn = document.getElementById('btn-select-file');
    const uploadArea = document.getElementById('upload-area');
    const importFileBtn = document.getElementById('btn-import-file');
    const cancelImportBtn = document.getElementById('btn-cancel-import');

    if (selectFileBtn && fileInput) {
        selectFileBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileSelect);
    }

    if (uploadArea) {
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileUpload(files[0]);
            }
        });
    }

    if (importFileBtn) {
        importFileBtn.addEventListener('click', importUploadedFile);
    }

    if (cancelImportBtn) {
        cancelImportBtn.addEventListener('click', cancelFileImport);
    }

    // Query Editor tab
    document.getElementById('btn-load-template').addEventListener('click', loadQueryTemplate);
    document.getElementById('btn-execute-query').addEventListener('click', executeQuery);
    document.getElementById('btn-clear-query').addEventListener('click', clearQuery);
    document.getElementById('query-template').addEventListener('change', onTemplateChange);
    document.getElementById('btn-load-graphs').addEventListener('click', loadAvailableGraphs);
    document.getElementById('btn-load-cubes').addEventListener('click', loadAvailableCubes);
    document.getElementById('query-graph-select').addEventListener('change', onGraphSelected);
    document.getElementById('query-cube-select').addEventListener('change', onCubeSelected);

    // Sync inputs
    elements.lindasGraph.addEventListener('change', syncGraphInputs);
    elements.fusekiEndpoint.addEventListener('change', () => {
        state.fusekiEndpoint = elements.fusekiEndpoint.value;
    });
    elements.fusekiDataset.addEventListener('change', () => {
        state.fusekiDataset = elements.fusekiDataset.value;
    });
}

// Update connection status indicator
function updateConnectionStatus(connected) {
    state.connected = connected;
    const statusEl = elements.fusekiStatus;
    if (statusEl) {
        statusEl.classList.toggle('connected', connected);
        statusEl.classList.toggle('disconnected', !connected);
        const typeNames = { fuseki: 'Fuseki', stardog: 'Stardog', graphdb: 'GraphDB' };
        const statusText = statusEl.querySelector('.status-text');
        if (statusText) {
            statusText.textContent = typeNames[state.triplestoreType] + ': ' + (connected ? 'Connected' : 'Disconnected');
        }
    }
}

// Export backup as downloadable file
async function exportBackup() {
    if (!state.selectedBackupId) {
        alert('Please select a backup first');
        return;
    }

    try {
        // Trigger download by opening the export URL
        window.location.href = '/api/backup/' + state.selectedBackupId + '/export';
    } catch (error) {
        alert('Export failed: ' + error.message);
    }
}

// Handle file selection from input
function handleFileSelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
        handleFileUpload(files[0]);
    }
}

// Handle file upload
async function handleFileUpload(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/backup/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Upload failed');
        }

        // Store the uploaded data for import
        state.uploadedFileData = result;

        // Show preview
        showUploadPreview(result, file.name);

    } catch (error) {
        alert('File upload failed: ' + error.message);
    }
}

// Create a preview row element safely (no innerHTML)
function createPreviewRow(label, value) {
    const row = document.createElement('div');
    row.className = 'preview-row';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'preview-label';
    labelSpan.textContent = label;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'preview-value';
    valueSpan.textContent = value;

    row.appendChild(labelSpan);
    row.appendChild(valueSpan);
    return row;
}

// Show upload preview (using safe DOM methods)
function showUploadPreview(data, filename) {
    const previewEl = document.getElementById('upload-preview');
    const previewInfo = document.getElementById('upload-preview-info');

    if (!previewEl || !previewInfo) return;

    // Clear existing content
    previewInfo.textContent = '';

    // Create preview rows safely
    previewInfo.appendChild(createPreviewRow('File:', filename));
    previewInfo.appendChild(createPreviewRow('Triple Count:', data.tripleCount.toLocaleString()));
    previewInfo.appendChild(createPreviewRow('Format:', data.format));

    if (data.isPackage && data.metadata) {
        previewInfo.appendChild(createPreviewRow('Source Graph:', data.metadata.graphUri || 'Not specified'));
        previewInfo.appendChild(createPreviewRow('Source Cube:', data.metadata.cubeUri || 'Not specified'));
        previewInfo.appendChild(createPreviewRow('Source Type:', data.metadata.sourceType || 'Unknown'));

        // Pre-fill target graph
        const targetGraphInput = document.getElementById('import-target-graph');
        if (targetGraphInput && data.metadata.graphUri) {
            targetGraphInput.placeholder = 'Use: ' + data.metadata.graphUri;
        }
    } else {
        previewInfo.appendChild(createPreviewRow('Package Type:', 'Raw N-Triples (no metadata)'));
    }

    previewEl.classList.remove('hidden');
}

// Import the uploaded file to triplestore
async function importUploadedFile() {
    if (!state.uploadedFileData) {
        alert('No file uploaded');
        return;
    }

    const config = getTriplestoreConfig();
    const targetGraphInput = document.getElementById('import-target-graph');
    const targetGraph = targetGraphInput ? targetGraphInput.value : '';

    try {
        const result = await api('/backup/import', {
            tempId: state.uploadedFileData.tempId,
            type: config.type,
            mode: config.mode,
            baseUrl: config.baseUrl,
            dataset: config.dataset,
            database: config.database,
            repository: config.repository,
            username: config.username,
            password: config.password,
            graphUri: state.uploadedFileData.metadata ? state.uploadedFileData.metadata.graphUri : null,
            overrideGraph: targetGraph || null
        });

        alert('Import successful! Imported ' + result.importedTriples.toLocaleString() + ' triples to ' + result.graphUri);

        // Clear upload state
        cancelFileImport();

    } catch (error) {
        alert('Import failed: ' + error.message);
    }
}

// Cancel file import
function cancelFileImport() {
    state.uploadedFileData = null;
    const previewEl = document.getElementById('upload-preview');
    if (previewEl) {
        previewEl.classList.add('hidden');
    }
    const fileInput = document.getElementById('backup-file-input');
    if (fileInput) {
        fileInput.value = '';
    }
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

// Check Fuseki connection (multi-triplestore aware)
async function checkFusekiConnection() {
    const infoEl = elements.fusekiInfo;
    const config = getTriplestoreConfig();
    const typeNames = { fuseki: 'Fuseki', stardog: 'Stardog', graphdb: 'GraphDB' };
    const typeName = typeNames[config.type] || 'Triplestore';

    try {
        // Use the multi-triplestore check endpoint
        const result = await api('/triplestore/check', config);

        if (result.connected) {
            updateConnectionStatus(true);

            infoEl.classList.remove('hidden', 'error');
            infoEl.classList.add('success');

            // Build datasets list based on triplestore type
            let datasetsList = 'None';
            if (result.datasets) {
                datasetsList = result.datasets.map(d => d['ds.name'] || d).join(', ') || 'None';
            } else if (result.databases) {
                datasetsList = result.databases.join(', ') || 'None';
            } else if (result.repositories) {
                datasetsList = result.repositories.join(', ') || 'None';
            }

            // Use safe DOM methods
            infoEl.textContent = '';
            const strongEl = document.createElement('strong');
            strongEl.textContent = 'Connected to ' + typeName + '!';
            infoEl.appendChild(strongEl);
            infoEl.appendChild(document.createElement('br'));
            const typeLabel = config.type === 'stardog' ? 'Databases' : (config.type === 'graphdb' ? 'Repositories' : 'Datasets');
            infoEl.appendChild(document.createTextNode(typeLabel + ': ' + datasetsList));
        } else {
            throw new Error(result.error || 'Connection failed');
        }
    } catch (error) {
        updateConnectionStatus(false);

        infoEl.classList.remove('hidden', 'success');
        infoEl.classList.add('error');

        // Use safe DOM methods
        infoEl.textContent = '';
        const strongEl = document.createElement('strong');
        strongEl.textContent = 'Connection failed:';
        infoEl.appendChild(strongEl);
        infoEl.appendChild(document.createTextNode(' ' + error.message));
        infoEl.appendChild(document.createElement('br'));
        infoEl.appendChild(document.createElement('br'));
        infoEl.appendChild(document.createTextNode('Make sure ' + typeName + ' is running on the specified endpoint.'));
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
        elements.fusekiInfo.textContent = '';
        const strongEl = document.createElement('strong');
        strongEl.textContent = 'Dataset created:';
        elements.fusekiInfo.appendChild(strongEl);
        elements.fusekiInfo.appendChild(document.createTextNode(' ' + result.dataset));

        await checkFusekiConnection();
    } catch (error) {
        elements.fusekiInfo.classList.remove('hidden', 'success');
        elements.fusekiInfo.classList.add('error');
        elements.fusekiInfo.textContent = '';
        const strongEl = document.createElement('strong');
        strongEl.textContent = 'Error:';
        elements.fusekiInfo.appendChild(strongEl);
        elements.fusekiInfo.appendChild(document.createTextNode(' ' + error.message));
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
    // Also update the dropdown if it exists
    const graphSelect = document.getElementById('lindas-graph-select');
    if (graphSelect) {
        graphSelect.value = graphUri;
    }
}

// ========== LINDAS DROPDOWN FUNCTIONS ==========

// Load all graphs from LINDAS into dropdown
async function loadLindasGraphs() {
    const graphSelect = document.getElementById('lindas-graph-select');
    const loadBtn = document.getElementById('btn-load-lindas-graphs');
    const statusEl = document.getElementById('lindas-graphs-status');

    try {
        loadBtn.disabled = true;
        loadBtn.textContent = 'Loading...';
        statusEl.classList.remove('hidden', 'error', 'success');
        statusEl.classList.add('info');
        statusEl.textContent = 'Loading graphs from LINDAS...';

        const result = await api('/lindas/all-graphs', {});

        // Clear and populate the select
        graphSelect.innerHTML = '<option value="">-- Select a graph --</option>';

        if (result.results && result.results.bindings) {
            result.results.bindings.forEach(binding => {
                const graphUri = binding.graph.value;
                const option = document.createElement('option');
                option.value = graphUri;
                // Shorten display for readability
                const shortUri = graphUri.replace('https://lindas.admin.ch/', '');
                option.textContent = shortUri;
                option.title = graphUri; // Full URI on hover
                graphSelect.appendChild(option);
            });
        }

        statusEl.classList.remove('info');
        statusEl.classList.add('success');
        statusEl.textContent = `Loaded ${result.results?.bindings?.length || 0} graphs from LINDAS`;

        // Pre-select current graph if it exists in the list
        if (elements.lindasGraph.value) {
            graphSelect.value = elements.lindasGraph.value;
        }

    } catch (error) {
        statusEl.classList.remove('info', 'success');
        statusEl.classList.add('error');
        statusEl.textContent = `Error loading graphs: ${error.message}`;
    } finally {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Load Graphs';
    }
}

// Handle graph selection from LINDAS dropdown
function onLindasGraphSelected() {
    const graphSelect = document.getElementById('lindas-graph-select');

    if (graphSelect.value) {
        elements.lindasGraph.value = graphSelect.value;
        syncGraphInputs();
    }
}

// ========== IMPORT ALL CUBES WITH RATE LIMITING ==========

// Import all cubes from selected graph with rate limiting
async function importAllCubesFromGraph() {
    if (!state.connected) {
        alert('Please connect to Fuseki first (Setup tab)');
        return;
    }

    const graphUri = elements.lindasGraph.value;
    if (!graphUri) {
        alert('Please select or enter a graph URI first');
        return;
    }

    // Show progress UI
    const progressContainer = document.getElementById('import-progress');
    const progressFill = document.getElementById('import-progress-fill');
    const importStep = document.getElementById('import-step');
    const importCounter = document.getElementById('import-counter');
    const importStatus = document.getElementById('import-status');
    const currentCubeEl = document.getElementById('import-current-cube');
    const rateLimitNotice = document.getElementById('import-rate-limit');
    const importSummary = document.getElementById('import-summary');
    const importBtn = document.getElementById('btn-import-all-cubes');

    // Reset UI
    progressContainer.classList.remove('hidden');
    importSummary.classList.add('hidden');
    progressFill.style.width = '0%';
    importBtn.disabled = true;

    // Step 1: Fetch list of cubes from LINDAS
    importStep.textContent = 'Step 1: Fetching cube list from LINDAS...';
    importCounter.textContent = '';
    importStatus.textContent = 'Querying LINDAS for available cubes...';
    currentCubeEl.textContent = '';

    let cubes = [];
    try {
        const result = await api('/lindas/cubes', { graphUri });
        if (result.results && result.results.bindings) {
            cubes = result.results.bindings.map(b => ({
                uri: b.cube.value,
                title: b.title?.value || '',
                version: b.version?.value || ''
            }));
        }
    } catch (error) {
        importStatus.textContent = `Error fetching cubes: ${error.message}`;
        importBtn.disabled = false;
        return;
    }

    if (cubes.length === 0) {
        importStatus.textContent = 'No cubes found in this graph';
        importBtn.disabled = false;
        return;
    }

    importStatus.textContent = `Found ${cubes.length} cubes to import`;
    progressFill.style.width = '5%';

    // Step 2: Import cubes with rate limiting
    importStep.textContent = 'Step 2: Downloading and importing cubes...';

    const RATE_LIMIT_DELAY = 1000; // 1 second between requests to avoid overloading LINDAS
    let imported = 0;
    let errors = 0;
    let totalTriples = 0;
    const errorList = [];

    for (let i = 0; i < cubes.length; i++) {
        const cube = cubes[i];
        const cubeName = cube.uri.split('/').slice(-2).join('/');

        importCounter.textContent = `${i + 1} / ${cubes.length}`;
        currentCubeEl.textContent = cube.uri;
        importStatus.textContent = `Downloading: ${cubeName}`;

        // Calculate progress (5% for fetching list, 95% for importing)
        const progress = 5 + ((i / cubes.length) * 95);
        progressFill.style.width = `${progress}%`;

        try {
            // Download from LINDAS
            const downloadResult = await api('/lindas/download-cube', {
                graphUri: graphUri,
                cubeUri: cube.uri
            });

            importStatus.textContent = `Importing: ${cubeName} (${downloadResult.tripleCount} triples)`;

            // Import to Fuseki
            await api('/fuseki/import', {
                endpoint: state.fusekiEndpoint,
                dataset: state.fusekiDataset,
                graphUri: graphUri,
                triples: downloadResult.triples
            });

            imported++;
            totalTriples += downloadResult.tripleCount || 0;

        } catch (error) {
            errors++;
            errorList.push({ cube: cubeName, error: error.message });
            console.error(`Error importing ${cube.uri}:`, error);
        }

        // Rate limiting - wait before next request (except for last one)
        if (i < cubes.length - 1) {
            rateLimitNotice.classList.remove('hidden');
            await sleep(RATE_LIMIT_DELAY);
            rateLimitNotice.classList.add('hidden');
        }
    }

    // Complete
    progressFill.style.width = '100%';
    importStep.textContent = 'Import Complete';
    importCounter.textContent = `${imported} / ${cubes.length}`;
    importStatus.textContent = `Successfully imported ${imported} cubes`;
    currentCubeEl.textContent = '';
    rateLimitNotice.classList.add('hidden');

    // Show summary
    importSummary.classList.remove('hidden');
    document.getElementById('summary-cubes-imported').textContent = imported;
    document.getElementById('summary-triples-imported').textContent = totalTriples.toLocaleString();
    document.getElementById('summary-errors').textContent = errors;

    // Show errors if any
    const errorListEl = document.getElementById('import-error-list');
    if (errors > 0) {
        errorListEl.classList.remove('hidden');
        errorListEl.innerHTML = '<strong>Errors:</strong><br>' +
            errorList.map(e => `- ${e.cube}: ${e.error}`).join('<br>');
    } else {
        errorListEl.classList.add('hidden');
    }

    importBtn.disabled = false;
}

// Helper: sleep for rate limiting
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Load all cubes from selected LINDAS graph into dropdown (legacy - kept for compatibility)
async function loadLindasCubes() {
    const graphUri = elements.lindasGraph.value;
    const cubeSelect = document.getElementById('lindas-cube-select');
    const loadBtn = document.getElementById('btn-load-lindas-cubes');
    const statusEl = document.getElementById('lindas-cubes-status');

    if (!graphUri) {
        statusEl.classList.remove('hidden', 'success', 'info');
        statusEl.classList.add('error');
        statusEl.textContent = 'Please select or enter a graph URI first';
        return;
    }

    try {
        loadBtn.disabled = true;
        loadBtn.textContent = 'Loading...';
        statusEl.classList.remove('hidden', 'error', 'success');
        statusEl.classList.add('info');
        statusEl.textContent = 'Loading cubes from LINDAS...';

        const result = await api('/lindas/cubes', { graphUri });

        // Clear and populate the select
        cubeSelect.innerHTML = '<option value="">-- Select a cube --</option>';

        // Group by base cube for better organization
        const cubesByBase = {};
        if (result.results && result.results.bindings) {
            result.results.bindings.forEach(binding => {
                const cubeUri = binding.cube.value;
                const title = binding.title?.value || '';
                const version = binding.version?.value || '';
                const baseCube = binding.baseCube?.value || cubeUri;

                if (!cubesByBase[baseCube]) {
                    cubesByBase[baseCube] = [];
                }
                cubesByBase[baseCube].push({ cubeUri, title, version });
            });
        }

        // Add options grouped by base cube
        let totalCubes = 0;
        Object.keys(cubesByBase).sort().forEach(baseCube => {
            const versions = cubesByBase[baseCube];
            const baseName = baseCube.split('/').pop();

            // If multiple versions, create optgroup
            if (versions.length > 1) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = baseName;

                versions.forEach(v => {
                    const option = document.createElement('option');
                    option.value = v.cubeUri;
                    option.textContent = `v${v.version}${v.title ? ': ' + v.title.substring(0, 40) : ''}`;
                    option.title = v.cubeUri;
                    optgroup.appendChild(option);
                    totalCubes++;
                });

                cubeSelect.appendChild(optgroup);
            } else {
                // Single version, add directly
                const v = versions[0];
                const option = document.createElement('option');
                option.value = v.cubeUri;
                option.textContent = `${baseName}${v.version ? ' v' + v.version : ''}${v.title ? ' - ' + v.title.substring(0, 30) : ''}`;
                option.title = v.cubeUri;
                cubeSelect.appendChild(option);
                totalCubes++;
            }
        });

        statusEl.classList.remove('info');
        statusEl.classList.add('success');
        statusEl.textContent = `Loaded ${totalCubes} cubes from ${Object.keys(cubesByBase).length} base cubes`;

    } catch (error) {
        statusEl.classList.remove('info', 'success');
        statusEl.classList.add('error');
        statusEl.textContent = `Error loading cubes: ${error.message}`;
    } finally {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Load Cubes';
    }
}

// Handle cube selection from LINDAS dropdown
function onLindasCubeSelected() {
    const cubeSelect = document.getElementById('lindas-cube-select');
    const selectedCube = cubeSelect.value;

    if (selectedCube) {
        // Add to selection set and update UI
        state.selectedCubes.add(selectedCube);

        // Find cube data if already loaded
        const existingCube = state.availableCubes.find(c => c.cube?.value === selectedCube);

        if (existingCube) {
            // Cube already in list, just update checkbox
            renderCubeList();
        } else {
            // Add cube to available list with minimal info
            state.availableCubes.push({
                cube: { value: selectedCube },
                version: { value: selectedCube.match(/\/(\d+)\/?$/)?.[1] || '?' },
                title: { value: '' },
                baseCube: { value: selectedCube.replace(/\/\d+\/?$/, '') }
            });
            renderCubeList();
        }

        updateImportButton();
    }
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
        alert('Please connect to Fuseki first (Setup tab)');
        return;
    }

    // Show progress UI
    const progressContainer = document.getElementById('import-progress');
    const progressFill = document.getElementById('import-progress-fill');
    const importStep = document.getElementById('import-step');
    const importCounter = document.getElementById('import-counter');
    const importStatus = document.getElementById('import-status');
    const currentCubeEl = document.getElementById('import-current-cube');
    const rateLimitNotice = document.getElementById('import-rate-limit');
    const importSummary = document.getElementById('import-summary');
    const sampleBtn = document.getElementById('btn-import-sample');

    // Reset UI
    progressContainer.classList.remove('hidden');
    importSummary.classList.add('hidden');
    progressFill.style.width = '0%';
    sampleBtn.disabled = true;

    importStep.textContent = 'Importing Sample Data (co2wirkung)';
    importStatus.textContent = 'Loading 7 versions for cleanup demo...';

    // The co2wirkung cube has 7 versions - good for testing
    const baseCube = 'https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung';
    const versions = [1, 2, 3, 4, 5, 6, 7];

    const RATE_LIMIT_DELAY = 500; // 500ms between requests
    let imported = 0;
    let totalTriples = 0;
    const errorList = [];

    for (let i = 0; i < versions.length; i++) {
        const version = versions[i];
        const cubeUri = `${baseCube}/${version}`;

        importCounter.textContent = `${i + 1} / ${versions.length}`;
        currentCubeEl.textContent = cubeUri;
        importStatus.textContent = `Downloading version ${version}...`;
        progressFill.style.width = `${((i / versions.length) * 100)}%`;

        try {
            const downloadResult = await api('/lindas/download-cube', {
                graphUri: elements.lindasGraph.value,
                cubeUri: cubeUri
            });

            importStatus.textContent = `Importing version ${version} (${downloadResult.tripleCount} triples)...`;

            await api('/fuseki/import', {
                endpoint: state.fusekiEndpoint,
                dataset: state.fusekiDataset,
                graphUri: elements.lindasGraph.value,
                triples: downloadResult.triples
            });

            imported++;
            totalTriples += downloadResult.tripleCount || 0;
        } catch (error) {
            errorList.push({ cube: `v${version}`, error: error.message });
            console.error(`Error importing version ${version}:`, error);
        }

        // Rate limiting
        if (i < versions.length - 1) {
            rateLimitNotice.classList.remove('hidden');
            await sleep(RATE_LIMIT_DELAY);
            rateLimitNotice.classList.add('hidden');
        }
    }

    // Complete
    progressFill.style.width = '100%';
    importStep.textContent = 'Sample Import Complete';
    importCounter.textContent = `${imported} / ${versions.length}`;
    importStatus.textContent = `Imported ${imported} versions of co2wirkung cube`;
    currentCubeEl.textContent = '';
    rateLimitNotice.classList.add('hidden');

    // Show summary
    importSummary.classList.remove('hidden');
    document.getElementById('summary-cubes-imported').textContent = imported;
    document.getElementById('summary-triples-imported').textContent = totalTriples.toLocaleString();
    document.getElementById('summary-errors').textContent = errorList.length;

    const errorListEl = document.getElementById('import-error-list');
    if (errorList.length > 0) {
        errorListEl.classList.remove('hidden');
        errorListEl.innerHTML = '<strong>Errors:</strong><br>' +
            errorList.map(e => `- ${e.cube}: ${e.error}`).join('<br>');
    } else {
        errorListEl.classList.add('hidden');
    }

    sampleBtn.disabled = false;
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
                            <th>Title</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${listResult.results.bindings.map(row => `
                            <tr>
                                <td class="mono">${row.baseCube?.value.split('/').pop() || ''}</td>
                                <td>${row.version?.value || ''}</td>
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
                <input type="checkbox" class="deletion-checkbox" data-cube="${cubeUri}" checked onchange="updateDeletionButtons()">
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
    const hasSelection = checkboxes.length > 0;
    // Enable both buttons when any checkbox is checked
    document.getElementById('btn-delete-selected').disabled = !hasSelection;
    document.getElementById('btn-delete-all-old').disabled = !hasSelection;
    // Update state with first selected cube
    state.selectedCubeForDeletion = hasSelection ? checkboxes[0].dataset.cube : null;
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
    // Show the preview container
    document.getElementById('selected-cube-name').textContent = cubeUri.split('/').slice(-2).join('/');
    document.getElementById('selected-cube-preview').classList.remove('hidden');

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
    },

    'preview-deletions': {
        name: 'Preview Versions to Delete (Keep Newest 2)',
        type: 'select',
        query: `PREFIX cube: <https://cube.link/>
PREFIX schema: <http://schema.org/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

# Preview which cube versions will be deleted (keeping newest 2 per base cube)
# Versions with rank > 2 will be marked for deletion

SELECT ?baseCube ?cube ?version ?rank
       (IF(?rank <= 2, "KEEP", "DELETE") AS ?action)
WHERE {
  GRAPH <GRAPH_URI> {
    ?cube a cube:Cube .

    # Extract version number from URI pattern /baseCube/version
    BIND(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1") AS ?versionStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[0-9]+/?$"), xsd:integer(?versionStr), 0) AS ?version)

    # Extract base cube URI (without version)
    BIND(REPLACE(STR(?cube), "^(.*)/[0-9]+/?$", "$1") AS ?baseCubeStr)
    BIND(IF(REGEX(STR(?cube), "^.*/[0-9]+/?$"), IRI(?baseCubeStr), ?cube) AS ?baseCube)
  }

  # Calculate rank within each base cube (1 = newest)
  {
    SELECT ?cube (COUNT(?newerCube) + 1 AS ?rank)
    WHERE {
      GRAPH <GRAPH_URI> {
        ?cube a cube:Cube .
        BIND(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1") AS ?vStr)
        BIND(IF(REGEX(STR(?cube), "^.*/[0-9]+/?$"), xsd:integer(?vStr), 0) AS ?v)
        BIND(REPLACE(STR(?cube), "^(.*)/[0-9]+/?$", "$1") AS ?baseStr)

        OPTIONAL {
          ?newerCube a cube:Cube .
          BIND(REPLACE(STR(?newerCube), "^.*/([0-9]+)/?$", "$1") AS ?nvStr)
          BIND(IF(REGEX(STR(?newerCube), "^.*/[0-9]+/?$"), xsd:integer(?nvStr), 0) AS ?nv)
          BIND(REPLACE(STR(?newerCube), "^(.*)/[0-9]+/?$", "$1") AS ?nbaseStr)
          FILTER(?baseStr = ?nbaseStr && ?nv > ?v)
        }
      }
    }
    GROUP BY ?cube
  }
}
ORDER BY ?baseCube ?rank`
    },

    'delete-old-versions': {
        name: 'Delete All Old Versions (Keep Newest 2) - DESTRUCTIVE!',
        type: 'update',
        query: `PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

# WARNING: This query deletes ALL cube versions except the newest 2 per base cube
# Make sure to backup data before running!
# Use "Preview Versions to Delete" first to see which cubes will be affected

# This query automatically finds cubes with rank > 2 (at least 2 newer versions)
# and deletes them along with all their related triples

WITH <GRAPH_URI>
DELETE {
  ?cube ?p1 ?o1 .
  ?shape ?shapeP ?shapeO .
  ?prop ?propP ?propO .
  ?set ?setP ?setO .
  ?obs ?obsP ?obsO .
}
WHERE {
  # Find cubes to delete: those with rank > 2 (at least 2 newer versions exist)
  ?cube a cube:Cube .

  # Only process cubes that follow the /baseCube/version URI pattern
  FILTER(REGEX(STR(?cube), "^.*/[0-9]+/?$"))

  # Extract version number and base cube from URI
  BIND(xsd:integer(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1")) AS ?v)
  BIND(REPLACE(STR(?cube), "^(.*)/[0-9]+/?$", "$1") AS ?baseStr)

  # Filter: only delete cubes where at least 2 newer versions exist (rank > 2)
  # A cube has rank > 2 if there exist two different cubes from same base with higher version
  FILTER EXISTS {
    ?newer1 a cube:Cube .
    FILTER(REGEX(STR(?newer1), "^.*/[0-9]+/?$"))
    FILTER(REPLACE(STR(?newer1), "^(.*)/[0-9]+/?$", "$1") = ?baseStr)
    FILTER(xsd:integer(REPLACE(STR(?newer1), "^.*/([0-9]+)/?$", "$1")) > ?v)

    ?newer2 a cube:Cube .
    FILTER(?newer2 != ?newer1)
    FILTER(REGEX(STR(?newer2), "^.*/[0-9]+/?$"))
    FILTER(REPLACE(STR(?newer2), "^(.*)/[0-9]+/?$", "$1") = ?baseStr)
    FILTER(xsd:integer(REPLACE(STR(?newer2), "^.*/([0-9]+)/?$", "$1")) > ?v)
  }

  # Delete all related triples for selected cubes
  {
    # Cube metadata
    { ?cube ?p1 ?o1 }
    UNION
    # Shape constraints
    { ?cube cube:observationConstraint ?shape .
      ?shape ?shapeP ?shapeO }
    UNION
    # Shape properties (recursive)
    { ?cube cube:observationConstraint/sh:property ?directProp .
      ?directProp (<>|!<>)* ?prop .
      ?prop ?propP ?propO }
    UNION
    # Observation sets
    { ?cube cube:observationSet ?set .
      ?set ?setP ?setO }
    UNION
    # Observations
    { ?cube cube:observationSet/cube:observation ?obs .
      ?obs ?obsP ?obsO }
  }
}`
    },

    // ========== ORPHAN DETECTION AND CLEANUP ==========

    'find-orphan-observations': {
        name: 'Find Orphan Observations',
        type: 'select',
        query: `PREFIX cube: <https://cube.link/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

# Find observations that are not linked from any observation set
# These are "orphan" observations that may have been left behind after incomplete deletions

SELECT ?orphanObs (COUNT(?p) AS ?tripleCount)
WHERE {
  GRAPH <GRAPH_URI> {
    # Find subjects that have observation-like predicates
    # Observations typically have many data properties
    ?orphanObs ?p ?o .

    # Exclude known entity types (cubes, shapes, sets)
    FILTER NOT EXISTS { ?orphanObs a cube:Cube }
    FILTER NOT EXISTS { ?orphanObs a <http://www.w3.org/ns/shacl#NodeShape> }
    FILTER NOT EXISTS { ?orphanObs a <http://www.w3.org/ns/shacl#PropertyShape> }

    # Must NOT be linked from any observation set
    FILTER NOT EXISTS { ?anySet cube:observation ?orphanObs }

    # Must NOT be linked from any cube directly
    FILTER NOT EXISTS { ?anyCube ?anyPred ?orphanObs . ?anyCube a cube:Cube }

    # Filter to likely observations: URIs containing common observation patterns
    # or blank nodes with multiple properties
    FILTER(
      REGEX(STR(?orphanObs), "/observation") ||
      REGEX(STR(?orphanObs), "/obs/") ||
      isBlank(?orphanObs)
    )
  }
}
GROUP BY ?orphanObs
HAVING (COUNT(?p) > 1)
ORDER BY DESC(?tripleCount)
LIMIT 1000`
    },

    'find-orphan-observation-sets': {
        name: 'Find Orphan Observation Sets',
        type: 'select',
        query: `PREFIX cube: <https://cube.link/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

# Find observation sets that are not linked from any cube
# These may have been left behind after cube deletion

SELECT ?orphanSet (COUNT(DISTINCT ?obs) AS ?observationCount) (COUNT(?p) AS ?totalTriples)
WHERE {
  GRAPH <GRAPH_URI> {
    # Find observation sets (either by type or by having cube:observation links)
    {
      ?orphanSet a cube:ObservationSet .
    }
    UNION
    {
      ?orphanSet cube:observation ?someObs .
    }

    # Get properties for counting
    ?orphanSet ?p ?o .

    # Count observations
    OPTIONAL { ?orphanSet cube:observation ?obs }

    # Must NOT be linked from any cube
    FILTER NOT EXISTS { ?anyCube cube:observationSet ?orphanSet }
  }
}
GROUP BY ?orphanSet
ORDER BY DESC(?observationCount)
LIMIT 100`
    },

    'find-orphan-shapes': {
        name: 'Find Orphan SHACL Shapes',
        type: 'select',
        query: `PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

# Find SHACL shapes (NodeShape, PropertyShape) not linked from any cube
# These may have been left behind after cube deletion

SELECT ?orphanShape ?shapeType (COUNT(?p) AS ?tripleCount)
WHERE {
  GRAPH <GRAPH_URI> {
    # Find shapes
    {
      ?orphanShape a sh:NodeShape .
      BIND("NodeShape" AS ?shapeType)

      # NodeShapes must not be linked via cube:observationConstraint
      FILTER NOT EXISTS { ?anyCube cube:observationConstraint ?orphanShape }
    }
    UNION
    {
      ?orphanShape a sh:PropertyShape .
      BIND("PropertyShape" AS ?shapeType)

      # PropertyShapes must not be linked via sh:property from any NodeShape that is linked to a cube
      FILTER NOT EXISTS {
        ?nodeShape sh:property ?orphanShape .
        ?someCube cube:observationConstraint ?nodeShape .
      }
      # Also check for orphan PropertyShapes not linked from ANY shape
      FILTER NOT EXISTS { ?anyShape sh:property ?orphanShape }
    }

    ?orphanShape ?p ?o .
  }
}
GROUP BY ?orphanShape ?shapeType
ORDER BY ?shapeType DESC(?tripleCount)
LIMIT 100`
    },

    'find-all-orphans-summary': {
        name: 'Find All Orphans - Summary',
        type: 'select',
        query: `PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

# Comprehensive orphan detection - returns counts by type
# Use this to get an overview before running specific orphan queries

SELECT
  ?orphanType
  (COUNT(DISTINCT ?orphan) AS ?orphanCount)
  (SUM(?tripleCount) AS ?totalTriples)
WHERE {
  GRAPH <GRAPH_URI> {
    {
      # Orphan Observation Sets
      SELECT ("ObservationSet" AS ?orphanType) ?orphan (COUNT(?p) AS ?tripleCount)
      WHERE {
        {
          ?orphan a cube:ObservationSet .
        }
        UNION
        {
          ?orphan cube:observation ?someObs .
        }
        ?orphan ?p ?o .
        FILTER NOT EXISTS { ?anyCube cube:observationSet ?orphan }
      }
      GROUP BY ?orphan
    }
    UNION
    {
      # Orphan NodeShapes
      SELECT ("NodeShape" AS ?orphanType) ?orphan (COUNT(?p) AS ?tripleCount)
      WHERE {
        ?orphan a sh:NodeShape .
        ?orphan ?p ?o .
        FILTER NOT EXISTS { ?anyCube cube:observationConstraint ?orphan }
      }
      GROUP BY ?orphan
    }
    UNION
    {
      # Orphan PropertyShapes
      SELECT ("PropertyShape" AS ?orphanType) ?orphan (COUNT(?p) AS ?tripleCount)
      WHERE {
        ?orphan a sh:PropertyShape .
        ?orphan ?p ?o .
        FILTER NOT EXISTS { ?anyShape sh:property ?orphan }
      }
      GROUP BY ?orphan
    }
  }
}
GROUP BY ?orphanType
ORDER BY ?orphanType`
    },

    'delete-orphan-observation-sets': {
        name: 'Delete Orphan Observation Sets - DESTRUCTIVE!',
        type: 'update',
        query: `PREFIX cube: <https://cube.link/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

# WARNING: This deletes all observation sets not linked to any cube
# along with all their observations
# Run "Find Orphan Observation Sets" first to preview what will be deleted!

WITH <GRAPH_URI>
DELETE {
  ?orphanSet ?setP ?setO .
  ?obs ?obsP ?obsO .
}
WHERE {
  # Find orphan observation sets
  {
    ?orphanSet a cube:ObservationSet .
  }
  UNION
  {
    ?orphanSet cube:observation ?someObs .
  }

  # Must NOT be linked from any cube
  FILTER NOT EXISTS { ?anyCube cube:observationSet ?orphanSet }

  # Get all triples for the set
  ?orphanSet ?setP ?setO .

  # Get all observations and their triples
  OPTIONAL {
    ?orphanSet cube:observation ?obs .
    ?obs ?obsP ?obsO .
  }
}`
    },

    'delete-orphan-shapes': {
        name: 'Delete Orphan SHACL Shapes - DESTRUCTIVE!',
        type: 'update',
        query: `PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

# WARNING: This deletes all SHACL shapes not linked to any cube
# Run "Find Orphan SHACL Shapes" first to preview what will be deleted!

WITH <GRAPH_URI>
DELETE {
  ?orphanShape ?p ?o .
  ?propShape ?propP ?propO .
}
WHERE {
  {
    # Delete orphan NodeShapes and their property shapes
    ?orphanShape a sh:NodeShape .
    FILTER NOT EXISTS { ?anyCube cube:observationConstraint ?orphanShape }

    ?orphanShape ?p ?o .

    # Also delete any property shapes attached to this orphan node shape
    OPTIONAL {
      ?orphanShape sh:property ?propShape .
      ?propShape ?propP ?propO .
    }
  }
  UNION
  {
    # Delete standalone orphan PropertyShapes
    ?orphanShape a sh:PropertyShape .
    FILTER NOT EXISTS { ?anyShape sh:property ?orphanShape }

    ?orphanShape ?p ?o .
    BIND(?orphanShape AS ?propShape)
    BIND(?p AS ?propP)
    BIND(?o AS ?propO)
  }
}`
    },

    'delete-all-orphans': {
        name: 'Delete ALL Orphans (Sets + Shapes) - DESTRUCTIVE!',
        type: 'update',
        query: `PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

# WARNING: This is a comprehensive orphan cleanup query
# It deletes ALL orphaned objects: observation sets, observations, and SHACL shapes
# ALWAYS run "Find All Orphans - Summary" first to preview!
# Consider backing up your data before running this query

WITH <GRAPH_URI>
DELETE {
  ?orphan ?p ?o .
  ?child ?childP ?childO .
}
WHERE {
  {
    # Orphan Observation Sets and their observations
    {
      ?orphan a cube:ObservationSet .
    }
    UNION
    {
      ?orphan cube:observation ?someObs .
    }
    FILTER NOT EXISTS { ?anyCube cube:observationSet ?orphan }

    ?orphan ?p ?o .

    OPTIONAL {
      ?orphan cube:observation ?child .
      ?child ?childP ?childO .
    }
  }
  UNION
  {
    # Orphan NodeShapes and their property shapes
    ?orphan a sh:NodeShape .
    FILTER NOT EXISTS { ?anyCube cube:observationConstraint ?orphan }

    ?orphan ?p ?o .

    OPTIONAL {
      ?orphan sh:property ?child .
      ?child ?childP ?childO .
    }
  }
  UNION
  {
    # Standalone Orphan PropertyShapes
    ?orphan a sh:PropertyShape .
    FILTER NOT EXISTS { ?anyShape sh:property ?orphan }

    ?orphan ?p ?o .
    # No children for property shapes
  }
}`
    }
};

// Load available graphs from Fuseki
async function loadAvailableGraphs() {
    const graphSelect = document.getElementById('query-graph-select');
    const loadBtn = document.getElementById('btn-load-graphs');

    try {
        loadBtn.disabled = true;
        loadBtn.textContent = 'Loading...';

        const response = await fetch('/api/query/graphs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                endpoint: state.fusekiEndpoint,
                dataset: state.fusekiDataset
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        // Clear and populate the select
        graphSelect.innerHTML = '<option value="">-- Select a graph --</option>';

        if (data.results && data.results.bindings) {
            data.results.bindings.forEach(binding => {
                const graphUri = binding.graph.value;
                const tripleCount = binding.tripleCount ? binding.tripleCount.value : '?';
                const option = document.createElement('option');
                option.value = graphUri;
                option.textContent = `${graphUri} (${tripleCount} triples)`;
                graphSelect.appendChild(option);
            });
        }

        // Show the select
        graphSelect.classList.remove('hidden');
        showQueryStatus(`Found ${data.results?.bindings?.length || 0} graphs`, 'info');

    } catch (error) {
        showQueryStatus(`Error loading graphs: ${error.message}`, 'error');
    } finally {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Browse';
    }
}

// Handle graph selection from dropdown
function onGraphSelected() {
    const graphSelect = document.getElementById('query-graph-select');
    const graphInput = document.getElementById('query-graph');

    if (graphSelect.value) {
        graphInput.value = graphSelect.value;
        // Clear cube selection when graph changes
        const cubeSelect = document.getElementById('query-cube-select');
        cubeSelect.innerHTML = '<option value="">-- Select a cube --</option>';
        cubeSelect.classList.add('hidden');
    }
}

// Load available cubes from selected graph
async function loadAvailableCubes() {
    const graphInput = document.getElementById('query-graph');
    const cubeSelect = document.getElementById('query-cube-select');
    const loadBtn = document.getElementById('btn-load-cubes');

    const graphUri = graphInput.value.trim();
    if (!graphUri) {
        showQueryStatus('Please enter or select a graph URI first', 'warning');
        return;
    }

    try {
        loadBtn.disabled = true;
        loadBtn.textContent = 'Loading...';

        const response = await fetch('/api/query/cubes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                endpoint: state.fusekiEndpoint,
                dataset: state.fusekiDataset,
                graphUri: graphUri
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        // Clear and populate the select
        cubeSelect.innerHTML = '<option value="">-- Select a cube --</option>';

        if (data.results && data.results.bindings) {
            data.results.bindings.forEach(binding => {
                const cubeUri = binding.cube.value;
                const title = binding.title ? binding.title.value : '';
                const version = binding.version ? binding.version.value : '';
                const option = document.createElement('option');
                option.value = cubeUri;

                // Create a readable label
                let label = cubeUri.split('/').slice(-2).join('/');
                if (title) {
                    label = `${title.substring(0, 40)}${title.length > 40 ? '...' : ''} (v${version || '?'})`;
                } else if (version) {
                    label = `${label} (v${version})`;
                }
                option.textContent = label;
                option.title = cubeUri; // Full URI on hover
                cubeSelect.appendChild(option);
            });
        }

        // Show the select
        cubeSelect.classList.remove('hidden');
        showQueryStatus(`Found ${data.results?.bindings?.length || 0} cubes in graph`, 'info');

    } catch (error) {
        showQueryStatus(`Error loading cubes: ${error.message}`, 'error');
    } finally {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Browse';
    }
}

// Handle cube selection from dropdown
function onCubeSelected() {
    const cubeSelect = document.getElementById('query-cube-select');
    const cubeInput = document.getElementById('query-cube-uri');

    if (cubeSelect.value) {
        cubeInput.value = cubeSelect.value;
    }
}

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
    const cubeUri = cubeInput.value;

    // Always replace GRAPH_URI
    query = query.replace(/<GRAPH_URI>/g, '<' + graphUri + '>');
    query = query.replace(/GRAPH_URI/g, graphUri);

    // Only replace CUBE_URI if we have a value, otherwise leave placeholder for executeQuery to handle
    if (cubeUri) {
        query = query.replace(/<CUBE_URI>/g, '<' + cubeUri + '>');
        query = query.replace(/CUBE_URI/g, cubeUri);
    }

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
    let query = queryTextarea.value.trim();

    if (!query) {
        showQueryStatus('Please enter a query', 'error');
        return;
    }

    // Replace any remaining placeholders with current input values
    const graphInput = document.getElementById('query-graph');
    const cubeInput = document.getElementById('query-cube-uri');
    const graphUri = graphInput.value || 'https://lindas.admin.ch/sfoe/cube';
    const cubeUri = cubeInput.value;

    // Check if query still has CUBE_URI placeholder and no cube URI is provided
    if (query.includes('<CUBE_URI>') || query.includes('CUBE_URI')) {
        if (!cubeUri) {
            showQueryStatus('Please enter a Cube URI. This query requires a specific cube to be selected.', 'error');
            return;
        }
        query = query.replace(/<CUBE_URI>/g, '<' + cubeUri + '>');
        query = query.replace(/CUBE_URI/g, cubeUri);
    }

    // Replace GRAPH_URI placeholder
    query = query.replace(/<GRAPH_URI>/g, '<' + graphUri + '>');
    query = query.replace(/GRAPH_URI/g, graphUri);

    const queryType = document.querySelector('input[name="query-type"]:checked').value;

    // No confirmation needed - proceed directly with execution
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
