/**
 * LINDAS Cube Cleanup Service
 *
 * Programmatic API for cube cleanup operations
 */
const { createLogger, getLogger } = require('./utils/logger');
const { createAdapter, FusekiAdapter, StardogAdapter, GraphDBAdapter } = require('./triplestore');
const { createStorage, LocalBackupStorage, S3BackupStorage } = require('./backup');
const CleanupService = require('./cleanup');
const RestoreService = require('./restore');
const sparql = require('./utils/sparql');

module.exports = {
    // Main services
    CleanupService,
    RestoreService,

    // Factories
    createAdapter,
    createStorage,

    // Triplestore adapters
    FusekiAdapter,
    StardogAdapter,
    GraphDBAdapter,

    // Backup storage
    LocalBackupStorage,
    S3BackupStorage,

    // Utilities
    sparql,
    createLogger,
    getLogger
};
