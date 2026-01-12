// ============================================================================
// LINDAS Cube Manager - Application
// Version: 2.0
// ============================================================================

// Triplestore configuration defaults
const TRIPLESTORE_DEFAULTS = {
    fuseki: {
        local: { baseUrl: 'http://localhost:3030', port: 3030 },
        remote: { baseUrl: 'https://lindas.admin.ch' }
    },
    stardog: {
        local: { baseUrl: 'http://localhost:5820', port: 5820, username: 'admin', password: 'admin' },
        remote: { baseUrl: 'https://sd-xxxxx.stardog.cloud:5820' }
    },
    graphdb: {
        local: { baseUrl: 'http://localhost:7200', port: 7200 },
        remote: { baseUrl: 'https://your-instance.graphdb.cloud' }
    }
};

// LINDAS environment URLs
const LINDAS_ENVIRONMENTS = {
    'https://lindas.admin.ch': { name: 'Production', env: 'PROD' },
    'https://int.lindas.admin.ch': { name: 'Integration', env: 'INT' },
    'https://test.lindas.admin.ch': { name: 'Test', env: 'TEST' }
};

// Application State
const state = {
    mode: 'offline', // 'offline' or 'online'
    triplestoreType: 'fuseki',
    connectionMode: 'local', // 'local' or 'remote'
    connected: false,

    // Connection config
    endpointUrl: 'http://localhost:3030',
    fusekiDataset: 'lindas',
    stardogDatabase: 'lindas',
    graphdbRepository: 'test',
    authUsername: '',
    authPassword: '',

    // LINDAS download config
    lindasEnv: 'https://lindas.admin.ch',
    downloadGraph: 'https://lindas.admin.ch/sfoe/cube',

    // Wizard state
    wizardStep: 1,
    wizardGraph: 'https://lindas.admin.ch/sfoe/cube',
    allVersions: [],
    multiVersionCubes: [],
    cubesToDelete: [],
    cubesToKeep: [],

    // Deletion results
    deletionResults: {
        deletedCubes: [],
        keptCubes: [],
        totalTriplesDeleted: 0,
        backupIds: []
    },

    // Query editor
    queryGraph: 'https://lindas.admin.ch/sfoe/cube',
    queryCube: '',

    // Backups
    backups: [],
    selectedBackupId: null,
    uploadedFileData: null
};

// ============================================================================
// Safe DOM Manipulation Helpers
// ============================================================================

function createTextElement(tag, text, className) {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    return el;
}

function createElementWithChildren(tag, children, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    children.forEach(child => {
        if (typeof child === 'string') {
            el.appendChild(document.createTextNode(child));
        } else {
            el.appendChild(child);
        }
    });
    return el;
}

function clearElement(el) {
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
}

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initModeToggle();
    initConnectionSection();
    initDownloadSection();
    initWizard();
    initQueryEditor();
    initBackupsSection();
    initDocumentation();
    initInstallation();

    // Load initial state
    updateModeUI();
    updateConnectionUI();
});

// ============================================================================
// Navigation
// ============================================================================

function initNavigation() {
    // Sidebar navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            navigateToSection(section);
        });
    });

    // Sidebar toggle for mobile
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    // Close sidebar on section click (mobile)
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 1024) {
                sidebar.classList.remove('open');
            }
        });
    });
}

function navigateToSection(sectionId) {
    // Update nav items
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.section === sectionId);
    });

    // Update sections
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(section => {
        section.classList.toggle('active', section.id === 'section-' + sectionId);
    });

    // Update page title
    const titles = {
        'connection': 'Connection Setup',
        'download': 'Download Data',
        'wizard': 'Deletion Wizard',
        'query-editor': 'Query Editor',
        'backups': 'Backup Management',
        'documentation': 'Documentation',
        'installation': 'Installation Guide'
    };
    const pageTitle = document.getElementById('page-title');
    if (pageTitle && titles[sectionId]) {
        pageTitle.textContent = titles[sectionId];
    }
}

// ============================================================================
// Mode Toggle (Offline/Online)
// ============================================================================

function initModeToggle() {
    const modeButtons = document.querySelectorAll('.mode-btn');
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            setMode(mode);
        });
    });
}

function setMode(mode) {
    state.mode = mode;

    // Update buttons
    const modeButtons = document.querySelectorAll('.mode-btn');
    modeButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
        if (btn.dataset.mode === 'online' && mode === 'online') {
            btn.classList.add('online');
        } else {
            btn.classList.remove('online');
        }
    });

    // In Online mode, force remote connection
    // In Offline mode, allow user to choose local or remote (e.g., Stardog Cloud as working copy)
    const connectionMode = document.getElementById('connection-mode');
    if (connectionMode) {
        if (mode === 'online') {
            connectionMode.value = 'remote';
            state.connectionMode = 'remote';
        }
        // In offline mode, keep the current selection (user's choice)
    }

    updateModeUI();
    updateConnectionUI();
}

function updateModeUI() {
    const mode = state.mode;

    // Update header mode badge
    const modeBadge = document.querySelector('.mode-badge');
    if (modeBadge) {
        modeBadge.textContent = mode.toUpperCase() + ' MODE';
        modeBadge.classList.toggle('offline', mode === 'offline');
        modeBadge.classList.toggle('online', mode === 'online');
    }

    // Update mode info banner
    const modeBanner = document.getElementById('mode-info-banner');
    if (modeBanner) {
        clearElement(modeBanner);

        const iconDiv = document.createElement('div');
        iconDiv.className = 'info-icon';
        iconDiv.textContent = mode === 'offline' ? '\u{1F4BE}' : '\u26A0';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'info-content';

        const strong = document.createElement('strong');
        strong.textContent = mode === 'offline' ? 'Offline Mode' : 'Online Mode - CAUTION';
        contentDiv.appendChild(strong);

        const p = document.createElement('p');
        p.textContent = mode === 'offline'
            ? 'Connect to your own triplestore (local or cloud). Download data from LINDAS and work safely without affecting production data.'
            : 'You are connecting to a remote triplestore. Changes may affect production data. Use with care!';
        contentDiv.appendChild(p);

        modeBanner.appendChild(iconDiv);
        modeBanner.appendChild(contentDiv);

        modeBanner.classList.toggle('online', mode === 'online');
    }

    // Show/hide offline-only elements
    const downloadNavItem = document.querySelector('[data-section="download"]');
    if (downloadNavItem) {
        downloadNavItem.style.display = mode === 'offline' ? 'flex' : 'none';
    }

    // In Online mode, disable dropdown (always remote)
    // In Offline mode, enable dropdown (user can choose local or remote/cloud)
    const connectionModeSelect = document.getElementById('connection-mode');
    if (connectionModeSelect) {
        connectionModeSelect.disabled = mode === 'online';
        connectionModeSelect.title = mode === 'offline'
            ? 'Choose local instance or remote/cloud triplestore as your working copy'
            : 'Online mode always uses remote connections';
    }
}

// ============================================================================
// Connection Section
// ============================================================================

function initConnectionSection() {
    // Triplestore type selector
    const typeSelect = document.getElementById('triplestore-type');
    if (typeSelect) {
        typeSelect.addEventListener('change', updateConnectionUI);
    }

    // Connection mode selector
    const connectionMode = document.getElementById('connection-mode');
    if (connectionMode) {
        connectionMode.addEventListener('change', updateConnectionUI);
    }

    // Test connection button
    const testBtn = document.getElementById('btn-test-connection');
    if (testBtn) {
        testBtn.addEventListener('click', testConnection);
    }

    // Create dataset button
    const createBtn = document.getElementById('btn-create-dataset');
    if (createBtn) {
        createBtn.addEventListener('click', createDataset);
    }

    // Quick setup preset buttons
    const presetButtons = document.querySelectorAll('[data-preset]');
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            applyPreset(preset);
        });
    });
}

function updateConnectionUI() {
    const typeSelect = document.getElementById('triplestore-type');
    const connectionMode = document.getElementById('connection-mode');
    const endpointUrl = document.getElementById('endpoint-url');
    const endpointHint = document.getElementById('endpoint-hint');

    if (!typeSelect || !connectionMode) return;

    const type = typeSelect.value;
    const mode = connectionMode.value;

    state.triplestoreType = type;
    state.connectionMode = mode;

    // Update endpoint URL and hint
    const defaults = TRIPLESTORE_DEFAULTS[type][mode];
    if (defaults && endpointUrl) {
        endpointUrl.value = defaults.baseUrl;
        state.endpointUrl = defaults.baseUrl;
    }

    if (endpointHint) {
        const hints = {
            'fuseki-local': 'Default endpoint for Apache Fuseki local instance',
            'fuseki-remote': 'Enter the remote Fuseki server URL',
            'stardog-local': 'Default endpoint for local Stardog (requires license)',
            'stardog-remote': 'Enter your Stardog Cloud instance URL',
            'graphdb-local': 'Default endpoint for local GraphDB Free',
            'graphdb-remote': 'Enter your GraphDB Cloud instance URL'
        };
        endpointHint.textContent = hints[type + '-' + mode] || '';
    }

    // Show/hide dataset/database/repository rows
    const datasetRow = document.getElementById('dataset-row');
    const stardogRow = document.getElementById('stardog-row');
    const graphdbRow = document.getElementById('graphdb-row');
    const authRow = document.getElementById('auth-row');

    if (datasetRow) datasetRow.classList.toggle('hidden', type !== 'fuseki');
    if (stardogRow) stardogRow.classList.toggle('hidden', type !== 'stardog');
    if (graphdbRow) graphdbRow.classList.toggle('hidden', type !== 'graphdb');

    // Show auth for Stardog and GraphDB, or remote connections
    const needsAuth = type === 'stardog' || (type === 'graphdb' && mode === 'remote');
    if (authRow) authRow.classList.toggle('hidden', !needsAuth);

    // Auto-fill Stardog credentials for local
    if (type === 'stardog' && mode === 'local') {
        const usernameInput = document.getElementById('auth-username');
        const passwordInput = document.getElementById('auth-password');
        if (usernameInput && !usernameInput.value) usernameInput.value = 'admin';
        if (passwordInput && !passwordInput.value) passwordInput.value = 'admin';
    }
}

function applyPreset(preset) {
    const typeSelect = document.getElementById('triplestore-type');
    const connectionMode = document.getElementById('connection-mode');

    if (typeSelect) typeSelect.value = preset;
    if (connectionMode) connectionMode.value = 'local';

    updateConnectionUI();
}

async function testConnection() {
    const resultBox = document.getElementById('connection-result');
    const btn = document.getElementById('btn-test-connection');

    if (!resultBox) return;

    resultBox.classList.remove('hidden', 'success', 'error');
    resultBox.textContent = 'Testing connection...';
    btn.disabled = true;

    try {
        const config = getConnectionConfig();
        const response = await fetch('/api/triplestore/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        const result = await response.json();

        if (result.connected) {
            resultBox.classList.add('success');
            resultBox.textContent = 'Connected successfully! ' + (result.message || '');
            state.connected = true;
            updateSidebarConnectionStatus(true);
            updateHeaderTriplestoreInfo(config.type);
        } else {
            throw new Error(result.error || 'Connection failed');
        }
    } catch (error) {
        resultBox.classList.add('error');
        resultBox.textContent = 'Connection failed: ' + error.message;
        state.connected = false;
        updateSidebarConnectionStatus(false);
    } finally {
        btn.disabled = false;
    }
}

async function createDataset() {
    const resultBox = document.getElementById('connection-result');
    const btn = document.getElementById('btn-create-dataset');

    if (!resultBox) return;

    resultBox.classList.remove('hidden', 'success', 'error');
    resultBox.textContent = 'Creating dataset...';
    btn.disabled = true;

    try {
        const config = getConnectionConfig();
        const response = await fetch('/api/triplestore/create-dataset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        const result = await response.json();

        if (result.success) {
            resultBox.classList.add('success');
            resultBox.textContent = 'Dataset created successfully!';
        } else {
            throw new Error(result.error || 'Failed to create dataset');
        }
    } catch (error) {
        resultBox.classList.add('error');
        resultBox.textContent = 'Failed to create dataset: ' + error.message;
    } finally {
        btn.disabled = false;
    }
}

function getConnectionConfig() {
    return {
        type: state.triplestoreType,
        mode: state.connectionMode,
        baseUrl: document.getElementById('endpoint-url')?.value || state.endpointUrl,
        dataset: document.getElementById('fuseki-dataset')?.value || state.fusekiDataset,
        database: document.getElementById('stardog-database')?.value || state.stardogDatabase,
        repository: document.getElementById('graphdb-repository')?.value || state.graphdbRepository,
        username: document.getElementById('auth-username')?.value || '',
        password: document.getElementById('auth-password')?.value || ''
    };
}

function updateSidebarConnectionStatus(connected) {
    const statusDot = document.querySelector('.status-dot');
    const statusLabel = document.querySelector('.status-label');

    if (statusDot) {
        statusDot.classList.toggle('connected', connected);
        statusDot.classList.toggle('disconnected', !connected);
    }

    if (statusLabel) {
        statusLabel.textContent = connected ? 'Connected' : 'Disconnected';
    }
}

function updateHeaderTriplestoreInfo(type) {
    const info = document.querySelector('.triplestore-type');
    if (info) {
        const names = { fuseki: 'Apache Fuseki', stardog: 'Stardog', graphdb: 'GraphDB' };
        info.textContent = names[type] || type;
    }
}

// ============================================================================
// Download Section (Offline Mode)
// ============================================================================

function initDownloadSection() {
    // LINDAS environment selection
    const envOptions = document.querySelectorAll('input[name="lindas-env"]');
    envOptions.forEach(opt => {
        opt.addEventListener('change', onLindasEnvChange);
    });

    // Custom URL input
    const customUrlInput = document.getElementById('custom-lindas-url');
    if (customUrlInput) {
        customUrlInput.addEventListener('input', () => {
            state.lindasEnv = customUrlInput.value;
        });
    }

    // Load graphs button
    const loadGraphsBtn = document.getElementById('btn-load-graphs');
    if (loadGraphsBtn) {
        loadGraphsBtn.addEventListener('click', loadLindasGraphs);
    }

    // Graph select
    const graphSelect = document.getElementById('download-graph-select');
    if (graphSelect) {
        graphSelect.addEventListener('change', () => {
            if (graphSelect.value) {
                document.getElementById('download-graph-manual').value = graphSelect.value;
                state.downloadGraph = graphSelect.value;
            }
        });
    }

    // Manual graph input
    const manualGraphInput = document.getElementById('download-graph-manual');
    if (manualGraphInput) {
        manualGraphInput.addEventListener('input', () => {
            state.downloadGraph = manualGraphInput.value;
        });
    }

    // Download buttons
    const downloadAllBtn = document.getElementById('btn-download-all');
    if (downloadAllBtn) {
        downloadAllBtn.addEventListener('click', downloadAllCubes);
    }

    const downloadSampleBtn = document.getElementById('btn-download-sample');
    if (downloadSampleBtn) {
        downloadSampleBtn.addEventListener('click', downloadSampleData);
    }

    // Go to wizard button
    const goToWizardBtn = document.getElementById('btn-go-to-wizard');
    if (goToWizardBtn) {
        goToWizardBtn.addEventListener('click', () => {
            navigateToSection('wizard');
        });
    }
}

function onLindasEnvChange(e) {
    const value = e.target.value;
    const customInput = document.getElementById('custom-lindas-url');

    if (value === 'custom') {
        if (customInput) {
            customInput.disabled = false;
            customInput.focus();
        }
    } else {
        if (customInput) {
            customInput.disabled = true;
        }
        state.lindasEnv = value;
    }
}

async function loadLindasGraphs() {
    const graphSelect = document.getElementById('download-graph-select');
    const btn = document.getElementById('btn-load-graphs');

    if (!graphSelect) return;

    btn.disabled = true;
    clearElement(graphSelect);
    const loadingOpt = document.createElement('option');
    loadingOpt.value = '';
    loadingOpt.textContent = 'Loading graphs...';
    graphSelect.appendChild(loadingOpt);

    try {
        const response = await fetch('/api/lindas/all-graphs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lindasEndpoint: state.lindasEnv })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to load graphs');
        }

        clearElement(graphSelect);
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '-- Select a graph --';
        graphSelect.appendChild(defaultOpt);

        if (result.graphs && result.graphs.length > 0) {
            result.graphs.forEach(graph => {
                const opt = document.createElement('option');
                opt.value = graph.uri;
                opt.textContent = graph.uri;
                graphSelect.appendChild(opt);
            });
        } else {
            const noGraphOpt = document.createElement('option');
            noGraphOpt.value = '';
            noGraphOpt.textContent = 'No graphs found';
            graphSelect.appendChild(noGraphOpt);
        }
    } catch (error) {
        clearElement(graphSelect);
        const errorOpt = document.createElement('option');
        errorOpt.value = '';
        errorOpt.textContent = 'Error loading graphs';
        graphSelect.appendChild(errorOpt);
        console.error('Error loading graphs:', error);
    } finally {
        btn.disabled = false;
    }
}

async function downloadAllCubes() {
    const progressContainer = document.getElementById('download-progress');
    const summaryBox = document.getElementById('download-summary');
    const btn = document.getElementById('btn-download-all');

    if (!progressContainer) return;

    progressContainer.classList.remove('hidden');
    summaryBox.classList.add('hidden');
    btn.disabled = true;

    try {
        // First, get list of cubes
        updateDownloadProgress('Fetching cube list...', 0, 0, 0);

        const cubesResponse = await fetch('/api/lindas/cubes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lindasEndpoint: state.lindasEnv,
                graphUri: state.downloadGraph
            })
        });

        const cubesResult = await cubesResponse.json();

        if (!cubesResult.cubes || cubesResult.cubes.length === 0) {
            throw new Error('No cubes found in the selected graph');
        }

        const cubes = cubesResult.cubes;
        const total = cubes.length;
        let downloaded = 0;
        let errors = 0;
        let totalTriples = 0;

        const config = getConnectionConfig();

        // Download each cube with rate limiting
        for (let i = 0; i < cubes.length; i++) {
            const cube = cubes[i];
            updateDownloadProgress('Downloading cubes...', i + 1, total, downloaded);
            updateDownloadCurrent(cube.cube);

            try {
                // Show rate limit notice
                if (i > 0) {
                    showRateLimitNotice(true);
                    await sleep(500); // Rate limiting
                    showRateLimitNotice(false);
                }

                // Download cube data from LINDAS
                const downloadResponse = await fetch('/api/lindas/download-cube', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        lindasEndpoint: state.lindasEnv,
                        graphUri: state.downloadGraph,
                        cubeUri: cube.cube
                    })
                });

                const downloadResult = await downloadResponse.json();

                if (!downloadResponse.ok || !downloadResult.ntriples) {
                    throw new Error('Failed to download cube data');
                }

                // Import to local triplestore
                const importResponse = await fetch('/api/triplestore/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...config,
                        ntriples: downloadResult.ntriples,
                        graphUri: state.downloadGraph
                    })
                });

                const importResult = await importResponse.json();

                if (importResponse.ok) {
                    downloaded++;
                    totalTriples += downloadResult.tripleCount || 0;
                } else {
                    errors++;
                }

            } catch (err) {
                console.error('Error downloading cube:', cube.cube, err);
                errors++;
            }
        }

        // Show summary
        progressContainer.classList.add('hidden');
        summaryBox.classList.remove('hidden');

        document.getElementById('summary-downloaded').textContent = downloaded;
        document.getElementById('summary-triples').textContent = totalTriples.toLocaleString();
        document.getElementById('summary-errors').textContent = errors;

    } catch (error) {
        updateDownloadProgress('Error: ' + error.message, 0, 0, 0);
        console.error('Download error:', error);
    } finally {
        btn.disabled = false;
    }
}

async function downloadSampleData() {
    const progressContainer = document.getElementById('download-progress');
    const summaryBox = document.getElementById('download-summary');
    const btn = document.getElementById('btn-download-sample');

    if (!progressContainer) return;

    progressContainer.classList.remove('hidden');
    summaryBox.classList.add('hidden');
    btn.disabled = true;

    try {
        updateDownloadProgress('Downloading sample data (co2wirkung)...', 0, 1, 0);

        const config = getConnectionConfig();
        const graphUri = 'https://lindas.admin.ch/sfoe/cube';
        const sampleCube = 'https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung';

        // Download all versions of the sample cube
        const response = await fetch('/api/lindas/download-graph', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lindasEndpoint: state.lindasEnv,
                graphUri: graphUri,
                cubeBaseUri: sampleCube
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to download sample data');
        }

        // Import to local triplestore
        const importResponse = await fetch('/api/triplestore/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...config,
                ntriples: result.ntriples,
                graphUri: graphUri
            })
        });

        if (!importResponse.ok) {
            const importError = await importResponse.json();
            throw new Error(importError.error || 'Failed to import data');
        }

        progressContainer.classList.add('hidden');
        summaryBox.classList.remove('hidden');

        document.getElementById('summary-downloaded').textContent = result.cubeCount || 7;
        document.getElementById('summary-triples').textContent = (result.tripleCount || 0).toLocaleString();
        document.getElementById('summary-errors').textContent = '0';

    } catch (error) {
        updateDownloadProgress('Error: ' + error.message, 0, 0, 0);
        console.error('Sample download error:', error);
    } finally {
        btn.disabled = false;
    }
}

function updateDownloadProgress(step, current, total, downloaded) {
    const stepEl = document.getElementById('download-step');
    const counterEl = document.getElementById('download-counter');
    const progressFill = document.getElementById('download-progress-fill');
    const statusEl = document.getElementById('download-status');

    if (stepEl) stepEl.textContent = step;
    if (counterEl && total > 0) counterEl.textContent = current + ' / ' + total;
    if (progressFill && total > 0) progressFill.style.width = (current / total * 100) + '%';
    if (statusEl) statusEl.textContent = 'Downloaded: ' + downloaded + ' cubes';
}

function updateDownloadCurrent(cubeUri) {
    const currentEl = document.getElementById('download-current');
    if (currentEl) currentEl.textContent = cubeUri;
}

function showRateLimitNotice(show) {
    const notice = document.getElementById('download-rate-limit');
    if (notice) notice.classList.toggle('hidden', !show);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Deletion Wizard
// ============================================================================

function initWizard() {
    // Step navigation
    const backBtns = document.querySelectorAll('[id^="btn-wizard-back"]');
    backBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const currentStep = state.wizardStep;
            if (currentStep > 1) {
                goToWizardStep(currentStep - 1);
            }
        });
    });

    // Step 1: Load graph
    const loadGraphBtn = document.getElementById('btn-wizard-load-graph');
    if (loadGraphBtn) {
        loadGraphBtn.addEventListener('click', wizardLoadGraph);
    }

    // Step 2: Continue to preview
    const nextBtn2 = document.getElementById('btn-wizard-next-2');
    if (nextBtn2) {
        nextBtn2.addEventListener('click', () => {
            wizardPreviewDeletions();
        });
    }

    // Step 3: Proceed to deletion
    const nextBtn3 = document.getElementById('btn-wizard-next-3');
    if (nextBtn3) {
        nextBtn3.addEventListener('click', () => {
            goToWizardStep(4);
        });
    }

    // Step 4: Confirm checkbox
    const confirmCheckbox = document.getElementById('confirm-deletion');
    const executeBtn = document.getElementById('btn-execute-deletion');
    if (confirmCheckbox && executeBtn) {
        confirmCheckbox.addEventListener('change', () => {
            executeBtn.disabled = !confirmCheckbox.checked;
        });
    }

    // Step 4: Execute deletion
    if (executeBtn) {
        executeBtn.addEventListener('click', wizardExecuteDeletion);
    }

    // Step 5: Restart
    const restartBtn = document.getElementById('btn-wizard-restart');
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            resetWizard();
        });
    }

    // Step 5: Export report
    const exportReportBtn = document.getElementById('btn-wizard-export-report');
    if (exportReportBtn) {
        exportReportBtn.addEventListener('click', exportDeletionReport);
    }

    // Step 5: View backups link
    const viewBackupsLink = document.getElementById('view-backups-link');
    if (viewBackupsLink) {
        viewBackupsLink.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToSection('backups');
            loadBackupList();
        });
    }

    // Toggle all versions table
    const toggleBtn = document.querySelector('.toggle-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const container = document.getElementById('wizard-all-versions');
            if (container) {
                container.classList.toggle('collapsed');
                toggleBtn.textContent = container.classList.contains('collapsed') ? 'Show All' : 'Hide';
            }
        });
    }
}

function goToWizardStep(step) {
    state.wizardStep = step;

    // Update step indicators
    const steps = document.querySelectorAll('.wizard-step');
    steps.forEach((stepEl, index) => {
        const stepNum = index + 1;
        stepEl.classList.remove('active', 'completed');
        if (stepNum === step) {
            stepEl.classList.add('active');
        } else if (stepNum < step) {
            stepEl.classList.add('completed');
        }
    });

    // Update panels
    const panels = document.querySelectorAll('.wizard-panel');
    panels.forEach((panel, index) => {
        panel.classList.toggle('active', index + 1 === step);
    });
}

function resetWizard() {
    state.wizardStep = 1;
    state.allVersions = [];
    state.multiVersionCubes = [];
    state.cubesToDelete = [];
    state.cubesToKeep = [];
    state.deletionResults = {
        deletedCubes: [],
        keptCubes: [],
        totalTriplesDeleted: 0,
        backupIds: []
    };

    // Reset confirm checkbox
    const confirmCheckbox = document.getElementById('confirm-deletion');
    if (confirmCheckbox) confirmCheckbox.checked = false;

    const executeBtn = document.getElementById('btn-execute-deletion');
    if (executeBtn) executeBtn.disabled = true;

    goToWizardStep(1);
}

async function wizardLoadGraph() {
    const graphInput = document.getElementById('wizard-graph');
    const infoBox = document.getElementById('wizard-graph-info');
    const btn = document.getElementById('btn-wizard-load-graph');

    if (!graphInput || !infoBox) return;

    state.wizardGraph = graphInput.value;
    btn.disabled = true;
    infoBox.classList.remove('hidden');
    infoBox.textContent = 'Loading graph data...';

    try {
        const config = getConnectionConfig();

        // Query for all cube versions
        const response = await fetch('/api/cubes/list-versions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...config,
                graphUri: state.wizardGraph
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to load cubes');
        }

        state.allVersions = result.versions || [];

        if (state.allVersions.length === 0) {
            clearElement(infoBox);
            const warningSpan = document.createElement('span');
            warningSpan.className = 'text-warning';
            warningSpan.textContent = 'No cubes found in this graph. Make sure you have downloaded data first.';
            infoBox.appendChild(warningSpan);
            return;
        }

        // Count unique base cubes and versions
        const baseCubes = new Set(state.allVersions.map(v => v.baseCube));
        clearElement(infoBox);
        const successSpan = document.createElement('span');
        successSpan.className = 'text-success';
        successSpan.textContent = 'Found ' + state.allVersions.length + ' cube versions across ' + baseCubes.size + ' base cubes.';
        infoBox.appendChild(successSpan);

        // Move to step 2
        setTimeout(() => {
            goToWizardStep(2);
            renderWizardStep2();
        }, 500);

    } catch (error) {
        clearElement(infoBox);
        const errorSpan = document.createElement('span');
        errorSpan.className = 'text-danger';
        errorSpan.textContent = 'Error: ' + error.message;
        infoBox.appendChild(errorSpan);
        console.error('Wizard load error:', error);
    } finally {
        btn.disabled = false;
    }
}

function renderWizardStep2() {
    // Calculate statistics
    const baseCubes = {};
    state.allVersions.forEach(v => {
        if (!baseCubes[v.baseCube]) {
            baseCubes[v.baseCube] = [];
        }
        baseCubes[v.baseCube].push(v);
    });

    const totalCubes = Object.keys(baseCubes).length;
    const multiVersion = Object.entries(baseCubes).filter(([_, versions]) => versions.length > 2);
    state.multiVersionCubes = multiVersion.map(([base, versions]) => ({
        baseCube: base,
        versions: versions.sort((a, b) => b.version - a.version)
    }));

    const toDelete = multiVersion.reduce((count, [_, versions]) => count + versions.length - 2, 0);

    // Render summary stats safely
    const summaryEl = document.getElementById('wizard-cubes-summary');
    if (summaryEl) {
        clearElement(summaryEl);

        const stats = [
            { value: totalCubes, label: 'Base Cubes' },
            { value: state.allVersions.length, label: 'Total Versions' },
            { value: multiVersion.length, label: 'Need Cleanup' },
            { value: toDelete, label: 'Versions to Delete' }
        ];

        stats.forEach(stat => {
            const div = document.createElement('div');
            div.className = 'stat';

            const valueSpan = document.createElement('span');
            valueSpan.className = 'stat-value';
            valueSpan.textContent = stat.value;
            div.appendChild(valueSpan);

            const labelSpan = document.createElement('span');
            labelSpan.className = 'stat-label';
            labelSpan.textContent = stat.label;
            div.appendChild(labelSpan);

            summaryEl.appendChild(div);
        });
    }

    // Render multi-version table safely
    const multiVersionTable = document.getElementById('multi-version-table');
    if (multiVersionTable) {
        clearElement(multiVersionTable);

        if (state.multiVersionCubes.length === 0) {
            const p = document.createElement('p');
            p.className = 'text-muted';
            p.textContent = 'No cubes need cleanup (all have 2 or fewer versions).';
            multiVersionTable.appendChild(p);
        } else {
            const table = document.createElement('table');
            table.className = 'data-table';

            // Header
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            ['Base Cube', 'Versions', 'To Delete'].forEach(text => {
                const th = document.createElement('th');
                th.textContent = text;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            // Body
            const tbody = document.createElement('tbody');
            state.multiVersionCubes.forEach(cube => {
                const tr = document.createElement('tr');

                const tdCube = document.createElement('td');
                tdCube.className = 'mono';
                tdCube.textContent = getShortUri(cube.baseCube);
                tr.appendChild(tdCube);

                const tdVersions = document.createElement('td');
                tdVersions.textContent = cube.versions.map(v => v.version).join(', ');
                tr.appendChild(tdVersions);

                const tdDelete = document.createElement('td');
                tdDelete.className = 'text-danger';
                tdDelete.textContent = cube.versions.length - 2;
                tr.appendChild(tdDelete);

                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            multiVersionTable.appendChild(table);
        }
    }

    // Render all versions table safely
    const allVersionsTable = document.getElementById('all-versions-table');
    if (allVersionsTable) {
        clearElement(allVersionsTable);

        const table = document.createElement('table');
        table.className = 'data-table';

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['Cube URI', 'Version'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        state.allVersions.slice(0, 50).forEach(v => {
            const tr = document.createElement('tr');

            const tdUri = document.createElement('td');
            tdUri.className = 'mono';
            tdUri.textContent = getShortUri(v.cube);
            tr.appendChild(tdUri);

            const tdVersion = document.createElement('td');
            tdVersion.textContent = v.version;
            tr.appendChild(tdVersion);

            tbody.appendChild(tr);
        });

        if (state.allVersions.length > 50) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 2;
            td.className = 'text-muted';
            td.textContent = '... and ' + (state.allVersions.length - 50) + ' more';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        allVersionsTable.appendChild(table);
    }
}

async function wizardPreviewDeletions() {
    const previewTable = document.getElementById('deletion-preview-table');
    const statsGrid = document.getElementById('wizard-deletion-stats');

    if (!previewTable) return;

    previewTable.textContent = 'Calculating deletions...';

    try {
        const config = getConnectionConfig();

        // Get deletion preview from server
        const response = await fetch('/api/cubes/identify-deletions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...config,
                graphUri: state.wizardGraph
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to identify deletions');
        }

        state.cubesToDelete = result.toDelete || [];
        state.cubesToKeep = result.toKeep || [];

        // Render preview table safely
        clearElement(previewTable);

        const table = document.createElement('table');
        table.className = 'data-table';

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['Cube URI', 'Version', 'Rank', 'Action'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');

        // Show cubes to keep first
        state.cubesToKeep.forEach(v => {
            const tr = document.createElement('tr');
            tr.className = 'keep-row';

            const tdUri = document.createElement('td');
            tdUri.className = 'mono';
            tdUri.textContent = getShortUri(v.cube);
            tr.appendChild(tdUri);

            const tdVersion = document.createElement('td');
            tdVersion.textContent = v.version;
            tr.appendChild(tdVersion);

            const tdRank = document.createElement('td');
            tdRank.textContent = v.rank;
            tr.appendChild(tdRank);

            const tdAction = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = 'badge badge-keep';
            badge.textContent = 'KEEP';
            tdAction.appendChild(badge);
            tr.appendChild(tdAction);

            tbody.appendChild(tr);
        });

        // Then cubes to delete
        state.cubesToDelete.forEach(v => {
            const tr = document.createElement('tr');
            tr.className = 'delete-row';

            const tdUri = document.createElement('td');
            tdUri.className = 'mono';
            tdUri.textContent = getShortUri(v.cube);
            tr.appendChild(tdUri);

            const tdVersion = document.createElement('td');
            tdVersion.textContent = v.version;
            tr.appendChild(tdVersion);

            const tdRank = document.createElement('td');
            tdRank.textContent = v.rank;
            tr.appendChild(tdRank);

            const tdAction = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = 'badge badge-delete';
            badge.textContent = 'DELETE';
            tdAction.appendChild(badge);
            tr.appendChild(tdAction);

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        previewTable.appendChild(table);

        // Update stats safely
        if (statsGrid) {
            clearElement(statsGrid);

            const keepStat = document.createElement('div');
            keepStat.className = 'stat';
            const keepValue = document.createElement('span');
            keepValue.className = 'stat-value text-success';
            keepValue.textContent = state.cubesToKeep.length;
            keepStat.appendChild(keepValue);
            const keepLabel = document.createElement('span');
            keepLabel.className = 'stat-label';
            keepLabel.textContent = 'Versions to Keep';
            keepStat.appendChild(keepLabel);
            statsGrid.appendChild(keepStat);

            const deleteStat = document.createElement('div');
            deleteStat.className = 'stat';
            const deleteValue = document.createElement('span');
            deleteValue.className = 'stat-value text-danger';
            deleteValue.textContent = state.cubesToDelete.length;
            deleteStat.appendChild(deleteValue);
            const deleteLabel = document.createElement('span');
            deleteLabel.className = 'stat-label';
            deleteLabel.textContent = 'Versions to Delete';
            deleteStat.appendChild(deleteLabel);
            statsGrid.appendChild(deleteStat);
        }

        goToWizardStep(3);

    } catch (error) {
        clearElement(previewTable);
        const errorP = document.createElement('p');
        errorP.className = 'text-danger';
        errorP.textContent = 'Error: ' + error.message;
        previewTable.appendChild(errorP);
        console.error('Preview error:', error);
    }
}

async function wizardExecuteDeletion() {
    const progressContainer = document.getElementById('deletion-progress');
    const logContainer = document.getElementById('deletion-log');
    const logContent = document.getElementById('log-content');
    const queueList = document.getElementById('deletion-queue-list');
    const btn = document.getElementById('btn-execute-deletion');

    if (!progressContainer || !logContainer) return;

    progressContainer.classList.remove('hidden');
    logContainer.classList.remove('hidden');
    btn.disabled = true;

    // Render deletion queue safely
    if (queueList) {
        clearElement(queueList);
        state.cubesToDelete.forEach(cube => {
            const div = document.createElement('div');
            div.className = 'queue-item';
            div.id = 'queue-' + cube.cube.replace(/[/:]/g, '_');

            const infoDiv = document.createElement('div');
            infoDiv.className = 'queue-item-info';

            const title = document.createElement('div');
            title.className = 'queue-item-title';
            title.textContent = getShortUri(cube.cube);
            infoDiv.appendChild(title);

            const meta = document.createElement('div');
            meta.className = 'queue-item-meta';
            meta.textContent = 'Version ' + cube.version;
            infoDiv.appendChild(meta);

            div.appendChild(infoDiv);

            const status = document.createElement('div');
            status.className = 'queue-item-status';
            status.textContent = 'Pending';
            div.appendChild(status);

            queueList.appendChild(div);
        });
    }

    const logs = [];
    const addLog = (msg) => {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        logs.push('[' + timestamp + '] ' + msg);
        if (logContent) logContent.textContent = logs.join('\n');
    };

    addLog('Starting deletion process...');

    const total = state.cubesToDelete.length;
    let deleted = 0;
    let errors = 0;
    let totalTriples = 0;

    const config = getConnectionConfig();

    for (let i = 0; i < state.cubesToDelete.length; i++) {
        const cube = state.cubesToDelete[i];
        const queueItem = document.getElementById('queue-' + cube.cube.replace(/[/:]/g, '_'));

        // Update queue item
        if (queueItem) {
            queueItem.classList.add('processing');
            const statusEl = queueItem.querySelector('.queue-item-status');
            if (statusEl) statusEl.textContent = 'Processing...';
        }

        updateDeletionProgress('Deleting cubes...', i + 1, total);
        addLog('Processing: ' + cube.cube);

        try {
            // Step 1: Create backup
            addLog('  Creating backup...');
            const backupResponse = await fetch('/api/backup/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...config,
                    cubeUri: cube.cube,
                    graphUri: state.wizardGraph
                })
            });

            const backupResult = await backupResponse.json();
            if (backupResult.backupId) {
                state.deletionResults.backupIds.push(backupResult.backupId);
                addLog('  Backup created: ' + backupResult.backupId);
            }

            // Step 2: Delete observations
            addLog('  Deleting observations...');
            const obsResponse = await fetch('/api/cubes/delete-observations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...config,
                    cubeUri: cube.cube,
                    graphUri: state.wizardGraph
                })
            });

            const obsResult = await obsResponse.json();
            totalTriples += obsResult.triplesDeleted || 0;

            // Step 3: Delete observation links
            addLog('  Deleting observation links...');
            const linksResponse = await fetch('/api/cubes/delete-observation-links', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...config,
                    cubeUri: cube.cube,
                    graphUri: state.wizardGraph
                })
            });

            const linksResult = await linksResponse.json();
            totalTriples += linksResult.triplesDeleted || 0;

            // Step 4: Delete metadata
            addLog('  Deleting metadata...');
            const metaResponse = await fetch('/api/cubes/delete-metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...config,
                    cubeUri: cube.cube,
                    graphUri: state.wizardGraph
                })
            });

            const metaResult = await metaResponse.json();
            totalTriples += metaResult.triplesDeleted || 0;

            deleted++;
            state.deletionResults.deletedCubes.push(cube);
            addLog('  Deleted successfully');

            if (queueItem) {
                queueItem.classList.remove('processing');
                queueItem.classList.add('completed');
                const statusEl = queueItem.querySelector('.queue-item-status');
                if (statusEl) statusEl.textContent = 'Deleted';
            }

        } catch (error) {
            errors++;
            addLog('  ERROR: ' + error.message);

            if (queueItem) {
                queueItem.classList.remove('processing');
                const statusEl = queueItem.querySelector('.queue-item-status');
                if (statusEl) statusEl.textContent = 'Failed';
            }
        }

        // Small delay between deletions
        await sleep(100);
    }

    state.deletionResults.keptCubes = state.cubesToKeep;
    state.deletionResults.totalTriplesDeleted = totalTriples;

    addLog('');
    addLog('=== DELETION COMPLETE ===');
    addLog('Deleted: ' + deleted + ' cubes');
    addLog('Errors: ' + errors);
    addLog('Total triples removed: ' + totalTriples);

    // Move to summary step
    setTimeout(() => {
        goToWizardStep(5);
        renderWizardSummary();
    }, 1000);
}

function updateDeletionProgress(step, current, total) {
    const stepEl = document.getElementById('deletion-step');
    const counterEl = document.getElementById('deletion-counter');
    const progressFill = document.getElementById('deletion-progress-fill');

    if (stepEl) stepEl.textContent = step;
    if (counterEl) counterEl.textContent = current + ' / ' + total;
    if (progressFill) progressFill.style.width = (current / total * 100) + '%';
}

function renderWizardSummary() {
    const timestampEl = document.getElementById('summary-timestamp');
    const statsGrid = document.getElementById('wizard-summary-stats');
    const deletedList = document.getElementById('summary-deleted-list');
    const keptList = document.getElementById('summary-kept-list');

    if (timestampEl) {
        timestampEl.textContent = 'Completed at ' + new Date().toLocaleString();
    }

    if (statsGrid) {
        clearElement(statsGrid);

        const stats = [
            { value: state.deletionResults.deletedCubes.length, label: 'Versions Deleted', className: 'text-danger' },
            { value: state.deletionResults.keptCubes.length, label: 'Versions Preserved', className: 'text-success' },
            { value: state.deletionResults.totalTriplesDeleted.toLocaleString(), label: 'Triples Removed', className: '' },
            { value: state.deletionResults.backupIds.length, label: 'Backups Created', className: '' }
        ];

        stats.forEach(stat => {
            const div = document.createElement('div');
            div.className = 'stat';

            const valueSpan = document.createElement('span');
            valueSpan.className = 'stat-value ' + stat.className;
            valueSpan.textContent = stat.value;
            div.appendChild(valueSpan);

            const labelSpan = document.createElement('span');
            labelSpan.className = 'stat-label';
            labelSpan.textContent = stat.label;
            div.appendChild(labelSpan);

            statsGrid.appendChild(div);
        });
    }

    if (deletedList) {
        clearElement(deletedList);
        const ul = document.createElement('ul');
        ul.className = 'detail-list';
        state.deletionResults.deletedCubes.forEach(c => {
            const li = document.createElement('li');
            li.textContent = getShortUri(c.cube) + ' (v' + c.version + ')';
            ul.appendChild(li);
        });
        deletedList.appendChild(ul);
    }

    if (keptList) {
        clearElement(keptList);
        const ul = document.createElement('ul');
        ul.className = 'detail-list';
        state.deletionResults.keptCubes.forEach(c => {
            const li = document.createElement('li');
            li.textContent = getShortUri(c.cube) + ' (v' + c.version + ')';
            ul.appendChild(li);
        });
        keptList.appendChild(ul);
    }
}

function exportDeletionReport() {
    const report = {
        exportedAt: new Date().toISOString(),
        graph: state.wizardGraph,
        deletedCubes: state.deletionResults.deletedCubes,
        keptCubes: state.deletionResults.keptCubes,
        totalTriplesDeleted: state.deletionResults.totalTriplesDeleted,
        backupIds: state.deletionResults.backupIds
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'deletion-report-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================================================
// Query Editor
// ============================================================================

function initQueryEditor() {
    // Template selector
    const templateSelect = document.getElementById('query-template');
    if (templateSelect) {
        templateSelect.addEventListener('change', loadQueryTemplate);
    }

    // Load template button
    const loadTemplateBtn = document.getElementById('btn-load-template');
    if (loadTemplateBtn) {
        loadTemplateBtn.addEventListener('click', loadQueryTemplate);
    }

    // Execute button
    const executeBtn = document.getElementById('btn-execute-query');
    if (executeBtn) {
        executeBtn.addEventListener('click', executeQuery);
    }

    // Clear button
    const clearBtn = document.getElementById('btn-clear-query');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearQuery);
    }

    // Graph browse button
    const browseGraphsBtn = document.getElementById('btn-browse-graphs');
    if (browseGraphsBtn) {
        browseGraphsBtn.addEventListener('click', browseGraphs);
    }

    // Cube browse button
    const browseCubesBtn = document.getElementById('btn-browse-cubes');
    if (browseCubesBtn) {
        browseCubesBtn.addEventListener('click', browseCubes);
    }

    // Graph dropdown
    const graphDropdown = document.getElementById('query-graph-dropdown');
    if (graphDropdown) {
        graphDropdown.addEventListener('change', () => {
            const graphInput = document.getElementById('query-graph-uri');
            if (graphInput && graphDropdown.value) {
                graphInput.value = graphDropdown.value;
                state.queryGraph = graphDropdown.value;
            }
            graphDropdown.classList.add('hidden');
        });
    }

    // Cube dropdown
    const cubeDropdown = document.getElementById('query-cube-dropdown');
    if (cubeDropdown) {
        cubeDropdown.addEventListener('change', () => {
            const cubeInput = document.getElementById('query-cube-uri');
            if (cubeInput && cubeDropdown.value) {
                cubeInput.value = cubeDropdown.value;
                state.queryCube = cubeDropdown.value;
            }
            cubeDropdown.classList.add('hidden');
        });
    }
}

function loadQueryTemplate() {
    const templateSelect = document.getElementById('query-template');
    const queryText = document.getElementById('query-text');
    const graphUri = document.getElementById('query-graph-uri')?.value || state.queryGraph;
    const cubeUri = document.getElementById('query-cube-uri')?.value || state.queryCube;

    if (!templateSelect || !queryText) return;

    const template = templateSelect.value;
    const templates = getQueryTemplates(graphUri, cubeUri);

    if (templates[template]) {
        queryText.value = templates[template].query;

        // Set query type radio
        const queryTypeRadios = document.querySelectorAll('input[name="query-type"]');
        queryTypeRadios.forEach(radio => {
            radio.checked = radio.value === templates[template].type;
        });
    }
}

function getQueryTemplates(graphUri, cubeUri) {
    return {
        'list-cubes': {
            type: 'select',
            query: 'PREFIX cube: <https://cube.link/>\n\nSELECT ?cube ?version\nWHERE {\n  GRAPH <' + graphUri + '> {\n    ?cube a cube:Cube .\n    BIND(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1") AS ?version)\n  }\n}\nORDER BY ?cube'
        },
        'count-triples': {
            type: 'select',
            query: 'SELECT (COUNT(*) as ?count)\nWHERE {\n  GRAPH <' + graphUri + '> {\n    ?s ?p ?o\n  }\n}'
        },
        'preview-single': {
            type: 'select',
            query: 'PREFIX cube: <https://cube.link/>\n\nSELECT ?p ?o\nWHERE {\n  GRAPH <' + graphUri + '> {\n    <' + (cubeUri || 'ENTER_CUBE_URI') + '> ?p ?o\n  }\n}\nLIMIT 100'
        },
        'preview-deletions': {
            type: 'select',
            query: 'PREFIX cube: <https://cube.link/>\nPREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\n\nSELECT ?baseCube ?cube ?version ?rank\n       (IF(?rank <= 2, "KEEP", "DELETE") AS ?action)\nWHERE {\n  {\n    SELECT ?baseCube ?cube ?version\n           (COUNT(?higherVersion) + 1 AS ?rank)\n    WHERE {\n      GRAPH <' + graphUri + '> {\n        ?cube a cube:Cube .\n        BIND(REPLACE(STR(?cube), "^(.*/[^/]+)/[0-9]+/?$", "$1") AS ?baseCube)\n        BIND(xsd:integer(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1")) AS ?version)\n\n        OPTIONAL {\n          ?otherCube a cube:Cube .\n          BIND(REPLACE(STR(?otherCube), "^(.*/[^/]+)/[0-9]+/?$", "$1") AS ?otherBase)\n          BIND(xsd:integer(REPLACE(STR(?otherCube), "^.*/([0-9]+)/?$", "$1")) AS ?higherVersion)\n          FILTER(?otherBase = ?baseCube && ?higherVersion > ?version)\n        }\n      }\n    }\n    GROUP BY ?baseCube ?cube ?version\n  }\n}\nORDER BY ?baseCube DESC(?version)'
        },
        'find-orphans-summary': {
            type: 'select',
            query: 'PREFIX cube: <https://cube.link/>\n\nSELECT ?type (COUNT(*) AS ?count)\nWHERE {\n  GRAPH <' + graphUri + '> {\n    {\n      ?obs a cube:Observation .\n      FILTER NOT EXISTS { ?set cube:observation ?obs }\n      BIND("Orphan Observation" AS ?type)\n    }\n    UNION\n    {\n      ?set a cube:ObservationSet .\n      FILTER NOT EXISTS { ?cube cube:observationSet ?set }\n      BIND("Orphan ObservationSet" AS ?type)\n    }\n  }\n}\nGROUP BY ?type'
        },
        'find-orphan-observations': {
            type: 'select',
            query: 'PREFIX cube: <https://cube.link/>\n\nSELECT ?obs\nWHERE {\n  GRAPH <' + graphUri + '> {\n    ?obs a cube:Observation .\n    FILTER NOT EXISTS { ?set cube:observation ?obs }\n  }\n}\nLIMIT 100'
        },
        'find-orphan-sets': {
            type: 'select',
            query: 'PREFIX cube: <https://cube.link/>\n\nSELECT ?set\nWHERE {\n  GRAPH <' + graphUri + '> {\n    ?set a cube:ObservationSet .\n    FILTER NOT EXISTS { ?cube cube:observationSet ?set }\n  }\n}\nLIMIT 100'
        },
        'delete-single': {
            type: 'update',
            query: '# WARNING: This will delete a single cube version\n# Replace CUBE_URI with the actual cube URI\n\nPREFIX cube: <https://cube.link/>\n\nDELETE {\n  GRAPH <' + graphUri + '> {\n    ?s ?p ?o\n  }\n}\nWHERE {\n  GRAPH <' + graphUri + '> {\n    <' + (cubeUri || 'ENTER_CUBE_URI') + '> (cube:observationSet/cube:observation)* ?related .\n    ?s ?p ?o .\n    FILTER(?s = <' + (cubeUri || 'ENTER_CUBE_URI') + '> || ?s = ?related)\n  }\n}'
        },
        'delete-old-versions': {
            type: 'update',
            query: '# WARNING: This will delete all versions ranked > 2\n\n# Use the Deletion Wizard for safe deletion with backups'
        },
        'delete-orphans': {
            type: 'update',
            query: 'PREFIX cube: <https://cube.link/>\n\n# Delete orphan observations\nDELETE {\n  GRAPH <' + graphUri + '> {\n    ?obs ?p ?o\n  }\n}\nWHERE {\n  GRAPH <' + graphUri + '> {\n    ?obs a cube:Observation .\n    ?obs ?p ?o .\n    FILTER NOT EXISTS { ?set cube:observation ?obs }\n  }\n}'
        }
    };
}

async function executeQuery() {
    const queryText = document.getElementById('query-text');
    const statusBox = document.getElementById('query-status');
    const resultsCard = document.getElementById('query-results-card');
    const resultsCount = document.getElementById('results-count');
    const resultsTime = document.getElementById('results-time');
    const resultsContainer = document.getElementById('query-results');
    const executeBtn = document.getElementById('btn-execute-query');

    if (!queryText || !statusBox) return;

    const query = queryText.value.trim();
    if (!query) {
        statusBox.classList.remove('hidden', 'success');
        statusBox.classList.add('error');
        statusBox.textContent = 'Please enter a query';
        return;
    }

    const queryType = document.querySelector('input[name="query-type"]:checked')?.value || 'select';

    statusBox.classList.remove('hidden', 'success', 'error');
    statusBox.classList.add('loading');
    statusBox.textContent = 'Executing query...';
    executeBtn.disabled = true;

    const startTime = Date.now();

    try {
        const config = getConnectionConfig();
        const response = await fetch('/api/query/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...config,
                query: query,
                queryType: queryType
            })
        });

        const result = await response.json();
        const elapsed = Date.now() - startTime;

        if (!response.ok) {
            throw new Error(result.error || 'Query failed');
        }

        statusBox.classList.remove('loading');
        statusBox.classList.add('success');
        statusBox.textContent = 'Query executed successfully';

        if (queryType === 'select' && result.results) {
            resultsCard.style.display = 'block';
            const bindings = result.results.bindings || [];
            resultsCount.textContent = bindings.length + ' results';
            resultsTime.textContent = elapsed + 'ms';

            clearElement(resultsContainer);

            if (bindings.length > 0) {
                const vars = result.results.head?.vars || Object.keys(bindings[0]);
                const table = document.createElement('table');

                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');
                vars.forEach(v => {
                    const th = document.createElement('th');
                    th.textContent = v;
                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);
                table.appendChild(thead);

                const tbody = document.createElement('tbody');
                bindings.forEach(row => {
                    const tr = document.createElement('tr');
                    vars.forEach(v => {
                        const td = document.createElement('td');
                        if (row[v]) {
                            if (row[v].type === 'uri') {
                                const span = document.createElement('span');
                                span.className = 'mono';
                                span.title = row[v].value;
                                span.textContent = getShortUri(row[v].value);
                                td.appendChild(span);
                            } else {
                                td.textContent = row[v].value;
                            }
                        }
                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                });
                table.appendChild(tbody);
                resultsContainer.appendChild(table);
            } else {
                const p = document.createElement('p');
                p.className = 'text-muted';
                p.textContent = 'No results found';
                resultsContainer.appendChild(p);
            }
        } else if (queryType === 'update') {
            resultsCard.style.display = 'block';
            resultsCount.textContent = 'Update complete';
            resultsTime.textContent = elapsed + 'ms';

            clearElement(resultsContainer);
            const p = document.createElement('p');
            p.textContent = 'Update query executed successfully.';
            resultsContainer.appendChild(p);

            if (result.message) {
                const msg = document.createElement('p');
                msg.textContent = result.message;
                resultsContainer.appendChild(msg);
            }
        }

    } catch (error) {
        statusBox.classList.remove('loading');
        statusBox.classList.add('error');
        statusBox.textContent = 'Query failed: ' + error.message;
        resultsCard.style.display = 'none';
    } finally {
        executeBtn.disabled = false;
    }
}

function clearQuery() {
    const queryText = document.getElementById('query-text');
    const statusBox = document.getElementById('query-status');
    const resultsCard = document.getElementById('query-results-card');
    const templateSelect = document.getElementById('query-template');

    if (queryText) queryText.value = '';
    if (statusBox) statusBox.classList.add('hidden');
    if (resultsCard) resultsCard.style.display = 'none';
    if (templateSelect) templateSelect.value = 'custom';
}

async function browseGraphs() {
    const dropdown = document.getElementById('query-graph-dropdown');
    const btn = document.getElementById('btn-browse-graphs');

    if (!dropdown) return;

    btn.disabled = true;
    dropdown.classList.remove('hidden');

    clearElement(dropdown);
    const loadingOpt = document.createElement('option');
    loadingOpt.value = '';
    loadingOpt.textContent = 'Loading...';
    dropdown.appendChild(loadingOpt);

    try {
        const config = getConnectionConfig();
        const response = await fetch('/api/query/graphs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        const result = await response.json();

        clearElement(dropdown);
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '-- Select a graph --';
        dropdown.appendChild(defaultOpt);

        if (result.graphs && result.graphs.length > 0) {
            result.graphs.forEach(graph => {
                const opt = document.createElement('option');
                opt.value = graph;
                opt.textContent = graph;
                dropdown.appendChild(opt);
            });
        }
    } catch (error) {
        clearElement(dropdown);
        const errorOpt = document.createElement('option');
        errorOpt.value = '';
        errorOpt.textContent = 'Error loading graphs';
        dropdown.appendChild(errorOpt);
    } finally {
        btn.disabled = false;
    }
}

async function browseCubes() {
    const dropdown = document.getElementById('query-cube-dropdown');
    const btn = document.getElementById('btn-browse-cubes');
    const graphUri = document.getElementById('query-graph-uri')?.value || state.queryGraph;

    if (!dropdown) return;

    btn.disabled = true;
    dropdown.classList.remove('hidden');

    clearElement(dropdown);
    const loadingOpt = document.createElement('option');
    loadingOpt.value = '';
    loadingOpt.textContent = 'Loading...';
    dropdown.appendChild(loadingOpt);

    try {
        const config = getConnectionConfig();
        const response = await fetch('/api/query/cubes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...config,
                graphUri: graphUri
            })
        });

        const result = await response.json();

        clearElement(dropdown);
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '-- Select a cube --';
        dropdown.appendChild(defaultOpt);

        if (result.cubes && result.cubes.length > 0) {
            result.cubes.forEach(cube => {
                const opt = document.createElement('option');
                opt.value = cube;
                opt.textContent = getShortUri(cube);
                dropdown.appendChild(opt);
            });
        }
    } catch (error) {
        clearElement(dropdown);
        const errorOpt = document.createElement('option');
        errorOpt.value = '';
        errorOpt.textContent = 'Error loading cubes';
        dropdown.appendChild(errorOpt);
    } finally {
        btn.disabled = false;
    }
}

// ============================================================================
// Backups Section
// ============================================================================

function initBackupsSection() {
    // Refresh backups button
    const refreshBtn = document.getElementById('btn-refresh-backups');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadBackupList);
    }

    // Restore backup button
    const restoreBtn = document.getElementById('btn-restore-backup');
    if (restoreBtn) {
        restoreBtn.addEventListener('click', restoreBackup);
    }

    // Export backup button
    const exportBtn = document.getElementById('btn-export-backup');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportBackup);
    }

    // Delete backup button
    const deleteBtn = document.getElementById('btn-delete-backup');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteBackup);
    }

    // File upload
    const selectFileBtn = document.getElementById('btn-select-backup-file');
    const fileInput = document.getElementById('backup-file-input');
    const uploadArea = document.getElementById('backup-upload-area');

    if (selectFileBtn && fileInput) {
        selectFileBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleBackupFileSelect);
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
            if (e.dataTransfer.files.length > 0) {
                handleBackupFileUpload(e.dataTransfer.files[0]);
            }
        });
    }

    // Import backup button
    const importBtn = document.getElementById('btn-import-backup');
    if (importBtn) {
        importBtn.addEventListener('click', importBackupFile);
    }

    // Cancel import button
    const cancelBtn = document.getElementById('btn-cancel-import');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelBackupImport);
    }
}

async function loadBackupList() {
    const listContainer = document.getElementById('backup-list');
    const previewCard = document.getElementById('backup-preview-card');

    if (!listContainer) return;

    clearElement(listContainer);
    const loadingP = document.createElement('p');
    loadingP.className = 'placeholder-text';
    loadingP.textContent = 'Loading backups...';
    listContainer.appendChild(loadingP);

    if (previewCard) previewCard.style.display = 'none';

    try {
        const response = await fetch('/api/backup/list');
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to load backups');
        }

        state.backups = result.backups || [];

        clearElement(listContainer);

        if (state.backups.length === 0) {
            const p = document.createElement('p');
            p.className = 'placeholder-text';
            p.textContent = 'No backups found';
            listContainer.appendChild(p);
            return;
        }

        state.backups.forEach(backup => {
            const div = document.createElement('div');
            div.className = 'backup-item';
            div.dataset.backupId = backup.id;

            const infoDiv = document.createElement('div');
            infoDiv.className = 'backup-info';

            const title = document.createElement('div');
            title.className = 'backup-title';
            title.textContent = getShortUri(backup.cubeUri);
            infoDiv.appendChild(title);

            const meta = document.createElement('div');
            meta.className = 'backup-meta';
            meta.textContent = new Date(backup.createdAt).toLocaleString();
            infoDiv.appendChild(meta);

            div.appendChild(infoDiv);

            const sizeSpan = document.createElement('div');
            sizeSpan.className = 'backup-size';
            sizeSpan.textContent = formatBytes(backup.size);
            div.appendChild(sizeSpan);

            div.addEventListener('click', () => selectBackup(backup.id));
            listContainer.appendChild(div);
        });

    } catch (error) {
        clearElement(listContainer);
        const p = document.createElement('p');
        p.className = 'placeholder-text text-danger';
        p.textContent = 'Error: ' + error.message;
        listContainer.appendChild(p);
    }
}

function selectBackup(backupId) {
    state.selectedBackupId = backupId;

    // Update selection UI
    const items = document.querySelectorAll('.backup-item');
    items.forEach(item => {
        item.classList.toggle('selected', item.dataset.backupId === backupId);
    });

    // Show preview card
    const previewCard = document.getElementById('backup-preview-card');
    const previewInfo = document.getElementById('backup-preview-info');

    if (previewCard) previewCard.style.display = 'block';

    const backup = state.backups.find(b => b.id === backupId);
    if (previewInfo && backup) {
        clearElement(previewInfo);

        const fields = [
            { label: 'Cube', value: backup.cubeUri },
            { label: 'Graph', value: backup.graphUri },
            { label: 'Created', value: new Date(backup.createdAt).toLocaleString() },
            { label: 'Size', value: formatBytes(backup.size) }
        ];

        fields.forEach(field => {
            const p = document.createElement('p');
            const strong = document.createElement('strong');
            strong.textContent = field.label + ': ';
            p.appendChild(strong);
            p.appendChild(document.createTextNode(field.value));
            previewInfo.appendChild(p);
        });
    }
}

async function restoreBackup() {
    if (!state.selectedBackupId) {
        alert('Please select a backup first');
        return;
    }

    const targetGraph = document.getElementById('restore-target-graph')?.value || '';
    const progressContainer = document.getElementById('restore-progress');
    const progressFill = document.getElementById('restore-progress-fill');
    const statusEl = document.getElementById('restore-status');

    if (progressContainer) progressContainer.classList.remove('hidden');
    if (progressFill) progressFill.style.width = '0%';
    if (statusEl) statusEl.textContent = 'Restoring backup...';

    try {
        const config = getConnectionConfig();
        const response = await fetch('/api/backup/restore-to', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...config,
                backupId: state.selectedBackupId,
                targetGraph: targetGraph
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Restore failed');
        }

        if (progressFill) progressFill.style.width = '100%';
        if (statusEl) statusEl.textContent = 'Backup restored successfully!';

    } catch (error) {
        if (statusEl) statusEl.textContent = 'Restore failed: ' + error.message;
    }
}

async function exportBackup() {
    if (!state.selectedBackupId) {
        alert('Please select a backup first');
        return;
    }

    window.location.href = '/api/backup/' + state.selectedBackupId + '/export';
}

async function deleteBackup() {
    if (!state.selectedBackupId) {
        alert('Please select a backup first');
        return;
    }

    if (!confirm('Are you sure you want to delete this backup? This cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch('/api/backup/' + state.selectedBackupId, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Delete failed');
        }

        state.selectedBackupId = null;
        loadBackupList();

    } catch (error) {
        alert('Failed to delete backup: ' + error.message);
    }
}

function handleBackupFileSelect(e) {
    if (e.target.files.length > 0) {
        handleBackupFileUpload(e.target.files[0]);
    }
}

async function handleBackupFileUpload(file) {
    const uploadPreview = document.getElementById('upload-preview');
    const previewInfo = document.getElementById('upload-preview-info');

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/backup/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Upload failed');
        }

        state.uploadedFileData = result;

        if (uploadPreview) uploadPreview.classList.remove('hidden');
        if (previewInfo) {
            clearElement(previewInfo);

            const fields = [
                { label: 'File', value: file.name },
                { label: 'Format', value: result.format || 'Unknown' }
            ];

            if (result.metadata) {
                fields.push({ label: 'Cube', value: result.metadata.cubeUri || 'Unknown' });
                fields.push({ label: 'Graph', value: result.metadata.graphUri || 'Unknown' });
            }
            fields.push({ label: 'Triples', value: String(result.tripleCount || 0) });

            fields.forEach(field => {
                const p = document.createElement('p');
                const strong = document.createElement('strong');
                strong.textContent = field.label + ': ';
                p.appendChild(strong);
                p.appendChild(document.createTextNode(field.value));
                previewInfo.appendChild(p);
            });
        }

    } catch (error) {
        alert('Failed to upload file: ' + error.message);
    }
}

async function importBackupFile() {
    if (!state.uploadedFileData) {
        alert('No file uploaded');
        return;
    }

    const targetGraph = document.getElementById('import-target-graph')?.value || '';

    try {
        const config = getConnectionConfig();
        const response = await fetch('/api/backup/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...config,
                uploadId: state.uploadedFileData.uploadId,
                targetGraph: targetGraph
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Import failed');
        }

        alert('Backup imported successfully!');
        cancelBackupImport();

    } catch (error) {
        alert('Import failed: ' + error.message);
    }
}

function cancelBackupImport() {
    state.uploadedFileData = null;
    const uploadPreview = document.getElementById('upload-preview');
    const fileInput = document.getElementById('backup-file-input');

    if (uploadPreview) uploadPreview.classList.add('hidden');
    if (fileInput) fileInput.value = '';
}

// ============================================================================
// Documentation Section
// ============================================================================

function initDocumentation() {
    const docNavBtns = document.querySelectorAll('.doc-nav-btn');
    docNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const docId = btn.dataset.doc;

            // Update nav buttons
            docNavBtns.forEach(b => b.classList.toggle('active', b === btn));

            // Update panels
            const panels = document.querySelectorAll('.doc-panel');
            panels.forEach(panel => {
                panel.classList.toggle('active', panel.id === 'doc-' + docId);
            });
        });
    });
}

// ============================================================================
// Installation Section
// ============================================================================

function initInstallation() {
    const installTabBtns = document.querySelectorAll('.install-tab-btn');
    installTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const installId = btn.dataset.install;

            // Update tab buttons
            installTabBtns.forEach(b => b.classList.toggle('active', b === btn));

            // Update panels
            const panels = document.querySelectorAll('.install-panel');
            panels.forEach(panel => {
                panel.classList.toggle('active', panel.id === 'install-' + installId);
            });
        });
    });
}

// ============================================================================
// Utility Functions
// ============================================================================

function getShortUri(uri) {
    if (!uri) return '';
    // Get last 2-3 path segments
    const parts = uri.split('/');
    if (parts.length > 3) {
        return '.../' + parts.slice(-3).join('/');
    }
    return uri;
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
