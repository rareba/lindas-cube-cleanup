/**
 * LINDAS Cube Cleanup Service
 *
 * Main cleanup logic that orchestrates:
 * 1. Identifying old cube versions
 * 2. Backing up cubes before deletion
 * 3. Deleting cubes in chunks
 * 4. Logging and reporting
 */
const { getLogger } = require('./utils/logger');
const sparql = require('./utils/sparql');

class CleanupService {
    constructor(triplestore, backupStorage, config) {
        this.triplestore = triplestore;
        this.backup = backupStorage;
        this.config = config;
        this.logger = getLogger();

        this.versionsToKeep = config.versionsToKeep || 2;
        this.chunkSize = config.chunkSize || 50000;
        this.dryRun = config.dryRun || false;

        // Statistics
        this.stats = {
            startTime: null,
            endTime: null,
            graphsProcessed: 0,
            cubesIdentified: 0,
            cubesDeleted: 0,
            cubesSkipped: 0,
            backupsCreated: 0,
            triplesDeleted: 0,
            errors: []
        };
    }

    /**
     * Run the full cleanup process
     * @param {Array<string>} graphs - Named graphs to process
     * @returns {Promise<object>} - Cleanup statistics
     */
    async run(graphs) {
        this.stats.startTime = new Date();
        this.logger.info('Starting cube cleanup', {
            graphs: graphs.length,
            versionsToKeep: this.versionsToKeep,
            dryRun: this.dryRun
        });

        try {
            // Initialize backup storage
            if (this.backup) {
                await this.backup.initialize();
            }

            // Process each graph
            for (const graphUri of graphs) {
                await this.processGraph(graphUri);
            }

            // Cleanup old backups
            if (this.backup && !this.dryRun) {
                const deletedBackups = await this.backup.cleanupOldBackups();
                this.logger.info('Cleaned up old backups', { deleted: deletedBackups });
            }

        } catch (error) {
            this.logger.error('Cleanup failed', { error: error.message });
            this.stats.errors.push({ phase: 'main', error: error.message });
            throw error;
        } finally {
            this.stats.endTime = new Date();
            this.logSummary();
        }

        return this.stats;
    }

    /**
     * Process a single named graph
     * @param {string} graphUri - Named graph URI
     */
    async processGraph(graphUri) {
        this.logger.info('Processing graph', { graph: graphUri });
        this.stats.graphsProcessed++;

        try {
            // Identify cubes to delete
            const cubesToDelete = await this.identifyDeletions(graphUri);

            if (cubesToDelete.length === 0) {
                this.logger.info('No cubes to delete in graph', { graph: graphUri });
                return;
            }

            this.logger.info('Found cubes to delete', {
                graph: graphUri,
                count: cubesToDelete.length
            });

            // Process each cube
            for (const cube of cubesToDelete) {
                await this.processCube(graphUri, cube);
            }

        } catch (error) {
            this.logger.error('Error processing graph', {
                graph: graphUri,
                error: error.message
            });
            this.stats.errors.push({ graph: graphUri, error: error.message });
        }
    }

    /**
     * Identify cube versions to delete
     * @param {string} graphUri - Named graph URI
     * @returns {Promise<Array>} - List of cubes to delete
     */
    async identifyDeletions(graphUri) {
        const query = sparql.identifyDeletionsQuery(graphUri, this.versionsToKeep);
        const result = await this.triplestore.query(query);

        const deletions = result.results.bindings
            .filter(b => b.action?.value === 'DELETE')
            .map(b => ({
                uri: b.cube?.value,
                version: b.version?.value,
                baseCube: b.baseCube?.value,
                rank: parseInt(b.rank?.value, 10)
            }));

        this.stats.cubesIdentified += deletions.length;
        return deletions;
    }

    /**
     * Process (backup and delete) a single cube
     * @param {string} graphUri - Named graph URI
     * @param {object} cube - Cube info { uri, version, baseCube, rank }
     */
    async processCube(graphUri, cube) {
        this.logger.info('Processing cube', {
            cube: cube.uri,
            version: cube.version,
            rank: cube.rank
        });

        try {
            // Preview cube (get triple counts)
            const preview = await this.previewCube(graphUri, cube.uri);

            if (this.dryRun) {
                this.logger.info('[DRY RUN] Would delete cube', {
                    cube: cube.uri,
                    observations: preview.observationCount
                });
                return;
            }

            // Backup cube before deletion
            if (this.backup) {
                await this.backupCube(graphUri, cube.uri);
            }

            // Delete cube
            await this.deleteCube(graphUri, cube.uri, preview.observationCount);

            this.stats.cubesDeleted++;

        } catch (error) {
            this.logger.error('Error processing cube', {
                cube: cube.uri,
                error: error.message
            });
            this.stats.errors.push({ cube: cube.uri, error: error.message });
            this.stats.cubesSkipped++;
        }
    }

    /**
     * Preview a cube (get component counts)
     * @param {string} graphUri - Named graph URI
     * @param {string} cubeUri - Cube URI
     * @returns {Promise<object>} - Preview info
     */
    async previewCube(graphUri, cubeUri) {
        const query = sparql.previewCubeQuery(graphUri, cubeUri);
        const result = await this.triplestore.query(query);

        if (result.results.bindings.length === 0) {
            return { observationCount: 0 };
        }

        const binding = result.results.bindings[0];
        return {
            title: binding.title?.value,
            dateCreated: binding.dateCreated?.value,
            shapeCount: parseInt(binding.shapeCount?.value || '0', 10),
            propertyCount: parseInt(binding.propertyCount?.value || '0', 10),
            observationSetCount: parseInt(binding.observationSetCount?.value || '0', 10),
            observationCount: parseInt(binding.observationCount?.value || '0', 10)
        };
    }

    /**
     * Backup a cube to storage
     * @param {string} graphUri - Named graph URI
     * @param {string} cubeUri - Cube URI
     * @returns {Promise<object>} - Backup info
     */
    async backupCube(graphUri, cubeUri) {
        this.logger.info('Backing up cube', { cube: cubeUri });

        const query = sparql.exportCubeQuery(graphUri, cubeUri);
        const ntriples = await this.triplestore.construct(query);

        if (!ntriples || ntriples.trim().length === 0) {
            this.logger.warn('Empty backup for cube', { cube: cubeUri });
            return null;
        }

        const backupInfo = await this.backup.save(cubeUri, ntriples);
        this.stats.backupsCreated++;

        this.logger.info('Backup created', {
            cube: cubeUri,
            path: backupInfo.path,
            triples: backupInfo.tripleCount
        });

        return backupInfo;
    }

    /**
     * Delete a cube
     * @param {string} graphUri - Named graph URI
     * @param {string} cubeUri - Cube URI
     * @param {number} observationCount - Expected observation count
     */
    async deleteCube(graphUri, cubeUri, observationCount) {
        this.logger.info('Deleting cube', {
            cube: cubeUri,
            observations: observationCount
        });

        let totalDeleted = observationCount;

        // Step 1: Delete observations
        if (observationCount > 0) {
            const query = sparql.deleteObservationsQuery(graphUri, cubeUri);

            this.logger.debug('Deleting observations', {
                cube: cubeUri,
                count: observationCount
            });

            await this.triplestore.update(query);

            // Verify deletion
            const countQuery = sparql.countObservationsQuery(graphUri, cubeUri);
            const countResult = await this.triplestore.query(countQuery);
            const remaining = parseInt(countResult.results.bindings[0]?.count?.value || '0', 10);

            if (remaining > 0) {
                this.logger.warn('Some observations remain after deletion', { remaining });
            }

            this.logger.debug('Observations deleted', {
                deleted: observationCount - remaining,
                remaining
            });
        }

        // Step 2: Delete observation links
        const linksQuery = sparql.deleteObservationLinksQuery(graphUri, cubeUri);
        await this.triplestore.update(linksQuery);

        // Step 3: Delete cube metadata
        const metadataQuery = sparql.deleteCubeMetadataQuery(graphUri, cubeUri);
        await this.triplestore.update(metadataQuery);

        // Verify deletion
        const existsQuery = sparql.cubeExistsQuery(graphUri, cubeUri);
        const existsResult = await this.triplestore.query(existsQuery);

        if (existsResult.boolean) {
            throw new Error(`Cube still exists after deletion: ${cubeUri}`);
        }

        this.stats.triplesDeleted += totalDeleted;
        this.logger.info('Cube deleted successfully', {
            cube: cubeUri,
            triplesDeleted: totalDeleted
        });
    }

    /**
     * Log cleanup summary
     */
    logSummary() {
        const duration = this.stats.endTime - this.stats.startTime;

        this.logger.info('='.repeat(50));
        this.logger.info('CLEANUP SUMMARY');
        this.logger.info('='.repeat(50));
        this.logger.info(`Duration: ${Math.round(duration / 1000)}s`);
        this.logger.info(`Graphs processed: ${this.stats.graphsProcessed}`);
        this.logger.info(`Cubes identified: ${this.stats.cubesIdentified}`);
        this.logger.info(`Cubes deleted: ${this.stats.cubesDeleted}`);
        this.logger.info(`Cubes skipped: ${this.stats.cubesSkipped}`);
        this.logger.info(`Backups created: ${this.stats.backupsCreated}`);
        this.logger.info(`Triples deleted: ${this.stats.triplesDeleted}`);
        this.logger.info(`Errors: ${this.stats.errors.length}`);

        if (this.stats.errors.length > 0) {
            this.logger.warn('Errors encountered:', this.stats.errors);
        }

        this.logger.info('='.repeat(50));
    }
}

module.exports = CleanupService;
