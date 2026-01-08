/**
 * Local Filesystem Backup Storage
 *
 * Stores backups in local filesystem with directory structure:
 * {basePath}/{graph-name}/{cube-name}/v{version}_{timestamp}.nt
 */
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { getLogger } = require('../utils/logger');

class LocalBackupStorage {
    constructor(config) {
        this.basePath = config.path || './backups';
        this.retentionDays = config.retentionDays || 90;
        this.logger = getLogger();
    }

    /**
     * Initialize storage (create directories)
     */
    async initialize() {
        if (!fsSync.existsSync(this.basePath)) {
            await fs.mkdir(this.basePath, { recursive: true });
            this.logger.info('Created backup directory', { path: this.basePath });
        }
    }

    /**
     * Generate backup filename from cube URI
     * @param {string} cubeUri - Full cube URI
     * @returns {object} - { directory, filename }
     */
    generatePath(cubeUri) {
        // Extract graph and cube info from URI
        // Example: https://lindas.admin.ch/sfoe/cube -> sfoe
        // Example cube: https://energy.ld.admin.ch/sfoe/bfe_ogd18_gebaeudeprogramm_co2wirkung/7

        const uriParts = cubeUri.split('/');
        const version = uriParts.pop(); // "7"
        const cubeName = uriParts.pop(); // "bfe_ogd18_gebaeudeprogramm_co2wirkung"

        // Get domain as graph identifier
        const domain = uriParts[2] || 'default'; // "energy.ld.admin.ch"

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `v${version}_${timestamp}.nt`;
        const directory = path.join(this.basePath, domain, cubeName);

        return { directory, filename, fullPath: path.join(directory, filename) };
    }

    /**
     * Save backup to filesystem
     * @param {string} cubeUri - Cube URI
     * @param {string} ntriples - N-Triples content
     * @returns {Promise<object>} - Backup info
     */
    async save(cubeUri, ntriples) {
        const { directory, filename, fullPath } = this.generatePath(cubeUri);

        // Ensure directory exists
        await fs.mkdir(directory, { recursive: true });

        // Write backup file
        await fs.writeFile(fullPath, ntriples, 'utf8');

        const stats = await fs.stat(fullPath);

        this.logger.info('Backup saved', {
            cube: cubeUri,
            path: fullPath,
            size: stats.size,
            lines: ntriples.split('\n').filter(l => l.trim()).length
        });

        return {
            cubeUri,
            path: fullPath,
            filename,
            size: stats.size,
            timestamp: new Date().toISOString(),
            tripleCount: ntriples.split('\n').filter(l => l.trim()).length
        };
    }

    /**
     * Load backup from filesystem
     * @param {string} backupPath - Full path to backup file
     * @returns {Promise<string>} - N-Triples content
     */
    async load(backupPath) {
        const absolutePath = path.isAbsolute(backupPath)
            ? backupPath
            : path.join(this.basePath, backupPath);

        if (!fsSync.existsSync(absolutePath)) {
            throw new Error(`Backup file not found: ${absolutePath}`);
        }

        return fs.readFile(absolutePath, 'utf8');
    }

    /**
     * List all backups
     * @param {string} filter - Optional filter (cube name pattern)
     * @returns {Promise<Array>} - List of backup info
     */
    async list(filter = null) {
        const backups = [];

        if (!fsSync.existsSync(this.basePath)) {
            return backups;
        }

        const domains = await fs.readdir(this.basePath);

        for (const domain of domains) {
            const domainPath = path.join(this.basePath, domain);
            const domainStat = await fs.stat(domainPath);

            if (!domainStat.isDirectory()) continue;

            const cubes = await fs.readdir(domainPath);

            for (const cube of cubes) {
                if (filter && !cube.includes(filter)) continue;

                const cubePath = path.join(domainPath, cube);
                const cubeStat = await fs.stat(cubePath);

                if (!cubeStat.isDirectory()) continue;

                const files = await fs.readdir(cubePath);

                for (const file of files) {
                    if (!file.endsWith('.nt')) continue;

                    const filePath = path.join(cubePath, file);
                    const fileStat = await fs.stat(filePath);

                    // Parse version and timestamp from filename
                    const match = file.match(/^v(\d+)_(.+)\.nt$/);
                    const version = match ? match[1] : null;
                    const timestamp = match ? match[2].replace(/-/g, ':').replace(/T/, ' ').slice(0, 19) : null;

                    backups.push({
                        domain,
                        cube,
                        version,
                        filename: file,
                        path: filePath,
                        relativePath: path.relative(this.basePath, filePath),
                        size: fileStat.size,
                        created: fileStat.birthtime,
                        timestamp
                    });
                }
            }
        }

        // Sort by creation date (newest first)
        backups.sort((a, b) => b.created - a.created);

        return backups;
    }

    /**
     * Delete old backups based on retention policy
     * @returns {Promise<number>} - Number of deleted backups
     */
    async cleanupOldBackups() {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

        const backups = await this.list();
        let deletedCount = 0;

        for (const backup of backups) {
            if (backup.created < cutoffDate) {
                await fs.unlink(backup.path);
                this.logger.info('Deleted old backup', {
                    path: backup.path,
                    age: Math.floor((Date.now() - backup.created) / (1000 * 60 * 60 * 24)) + ' days'
                });
                deletedCount++;
            }
        }

        return deletedCount;
    }

    /**
     * Delete a specific backup
     * @param {string} backupPath - Path to backup file
     */
    async delete(backupPath) {
        const absolutePath = path.isAbsolute(backupPath)
            ? backupPath
            : path.join(this.basePath, backupPath);

        await fs.unlink(absolutePath);
        this.logger.info('Deleted backup', { path: absolutePath });
    }

    /**
     * Get storage type
     */
    getType() {
        return 'local';
    }
}

module.exports = LocalBackupStorage;
