/**
 * Backup Storage Factory
 *
 * Creates the appropriate storage adapter based on configuration
 */
const LocalBackupStorage = require('./local');
const S3BackupStorage = require('./s3');

const storageTypes = {
    local: LocalBackupStorage,
    s3: S3BackupStorage
};

/**
 * Create a backup storage adapter based on config
 * @param {object} config - Backup configuration
 * @returns {LocalBackupStorage|S3BackupStorage}
 */
function createStorage(config) {
    const type = config.type?.toLowerCase();

    if (!type) {
        throw new Error('Backup storage type not specified in configuration');
    }

    const StorageClass = storageTypes[type];

    if (!StorageClass) {
        throw new Error(`Unknown backup storage type: ${type}. Supported: ${Object.keys(storageTypes).join(', ')}`);
    }

    // Merge type-specific config
    const storageConfig = {
        ...config,
        ...(config[type] || {})
    };

    return new StorageClass(storageConfig);
}

module.exports = {
    createStorage,
    LocalBackupStorage,
    S3BackupStorage
};
