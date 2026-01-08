/**
 * LINDAS Cube Restore Service
 *
 * Restores cube backups to a triplestore
 */
const { getLogger } = require('./utils/logger');
const sparql = require('./utils/sparql');

class RestoreService {
    constructor(triplestore, backupStorage, config = {}) {
        this.triplestore = triplestore;
        this.backup = backupStorage;
        this.config = config;
        this.logger = getLogger();

        // Statistics
        this.stats = {
            startTime: null,
            endTime: null,
            backupsRestored: 0,
            triplesRestored: 0,
            errors: []
        };
    }

    /**
     * Restore a cube from backup
     * @param {string} backupPath - Path/key to backup file
     * @param {string} graphUri - Target named graph
     * @param {object} options - Restore options
     * @returns {Promise<object>} - Restore result
     */
    async restore(backupPath, graphUri, options = {}) {
        this.stats.startTime = new Date();

        const {
            overwrite = false,    // Overwrite if cube exists
            dryRun = false,       // Preview without restoring
            validate = true       // Validate after restore
        } = options;

        this.logger.info('Starting restore', {
            backup: backupPath,
            graph: graphUri,
            overwrite,
            dryRun
        });

        try {
            // Load backup data
            const ntriples = await this.backup.load(backupPath);
            const tripleCount = ntriples.split('\n').filter(l => l.trim()).length;

            this.logger.info('Backup loaded', {
                path: backupPath,
                triples: tripleCount
            });

            // Extract cube URI from backup
            const cubeUri = this.extractCubeUri(ntriples);
            if (!cubeUri) {
                throw new Error('Could not extract cube URI from backup');
            }

            this.logger.info('Detected cube URI', { cube: cubeUri });

            // Check if cube already exists
            const existsQuery = sparql.cubeExistsQuery(graphUri, cubeUri);
            const existsResult = await this.triplestore.query(existsQuery);

            if (existsResult.boolean) {
                if (!overwrite) {
                    throw new Error(`Cube already exists: ${cubeUri}. Use --overwrite to replace.`);
                }

                this.logger.warn('Cube exists, will be overwritten', { cube: cubeUri });

                if (!dryRun) {
                    // Delete existing cube first
                    await this.deleteExistingCube(graphUri, cubeUri);
                }
            }

            if (dryRun) {
                this.logger.info('[DRY RUN] Would restore cube', {
                    cube: cubeUri,
                    triples: tripleCount
                });
                return {
                    success: true,
                    dryRun: true,
                    cubeUri,
                    tripleCount
                };
            }

            // Restore via bulk load
            await this.triplestore.bulkLoad(graphUri, ntriples);

            this.stats.backupsRestored++;
            this.stats.triplesRestored += tripleCount;

            // Validate restore
            if (validate) {
                const isValid = await this.validateRestore(graphUri, cubeUri, tripleCount);
                if (!isValid) {
                    throw new Error('Restore validation failed');
                }
            }

            this.logger.info('Restore completed successfully', {
                cube: cubeUri,
                graph: graphUri,
                triples: tripleCount
            });

            return {
                success: true,
                cubeUri,
                graphUri,
                tripleCount
            };

        } catch (error) {
            this.logger.error('Restore failed', { error: error.message });
            this.stats.errors.push({ backup: backupPath, error: error.message });
            throw error;
        } finally {
            this.stats.endTime = new Date();
        }
    }

    /**
     * Restore multiple backups
     * @param {Array<object>} restores - Array of { backup, graph, options }
     * @returns {Promise<object>} - Batch result
     */
    async restoreBatch(restores) {
        const results = [];

        for (const { backup, graph, options } of restores) {
            try {
                const result = await this.restore(backup, graph, options);
                results.push({ backup, success: true, result });
            } catch (error) {
                results.push({ backup, success: false, error: error.message });
            }
        }

        return {
            total: restores.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        };
    }

    /**
     * Extract cube URI from N-Triples content
     * @param {string} ntriples - N-Triples content
     * @returns {string|null} - Cube URI or null
     */
    extractCubeUri(ntriples) {
        const lines = ntriples.split('\n');

        for (const line of lines) {
            // Look for cube:Cube type triple
            if (line.includes('<https://cube.link/Cube>')) {
                const match = line.match(/^<([^>]+)>\s+<[^>]+>\s+<https:\/\/cube\.link\/Cube>/);
                if (match) {
                    return match[1];
                }
            }
        }

        return null;
    }

    /**
     * Delete existing cube before restore
     * @param {string} graphUri - Named graph URI
     * @param {string} cubeUri - Cube URI
     */
    async deleteExistingCube(graphUri, cubeUri) {
        this.logger.info('Deleting existing cube', { cube: cubeUri });

        // Delete observations first
        let hasMore = true;
        while (hasMore) {
            const query = sparql.deleteObservationsQuery(graphUri, cubeUri, 50000);
            await this.triplestore.update(query);

            const countQuery = sparql.countObservationsQuery(graphUri, cubeUri);
            const countResult = await this.triplestore.query(countQuery);
            const remaining = parseInt(countResult.results.bindings[0]?.count?.value || '0', 10);
            hasMore = remaining > 0;
        }

        // Delete links and metadata
        const linksQuery = sparql.deleteObservationLinksQuery(graphUri, cubeUri);
        await this.triplestore.update(linksQuery);

        const metadataQuery = sparql.deleteCubeMetadataQuery(graphUri, cubeUri);
        await this.triplestore.update(metadataQuery);

        this.logger.info('Existing cube deleted', { cube: cubeUri });
    }

    /**
     * Validate that restore was successful
     * @param {string} graphUri - Named graph URI
     * @param {string} cubeUri - Cube URI
     * @param {number} expectedTriples - Expected triple count
     * @returns {Promise<boolean>} - Validation result
     */
    async validateRestore(graphUri, cubeUri, expectedTriples) {
        // Check cube exists
        const existsQuery = sparql.cubeExistsQuery(graphUri, cubeUri);
        const existsResult = await this.triplestore.query(existsQuery);

        if (!existsResult.boolean) {
            this.logger.error('Validation failed: cube does not exist');
            return false;
        }

        // Check approximate triple count
        const previewQuery = sparql.previewCubeQuery(graphUri, cubeUri);
        const previewResult = await this.triplestore.query(previewQuery);

        if (previewResult.results.bindings.length === 0) {
            this.logger.error('Validation failed: could not get cube preview');
            return false;
        }

        const observationCount = parseInt(
            previewResult.results.bindings[0]?.observationCount?.value || '0',
            10
        );

        this.logger.info('Restore validation', {
            cubeExists: true,
            observations: observationCount
        });

        return true;
    }

    /**
     * List available backups for restore
     * @param {string} filter - Optional cube name filter
     * @returns {Promise<Array>} - List of available backups
     */
    async listAvailableBackups(filter = null) {
        return this.backup.list(filter);
    }
}

module.exports = RestoreService;
