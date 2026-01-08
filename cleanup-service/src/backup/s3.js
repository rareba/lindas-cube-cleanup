/**
 * S3-Compatible Backup Storage
 *
 * Supports AWS S3, MinIO, and other S3-compatible storage
 * Uses AWS SDK v3 for modern async/await support
 */
const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    DeleteObjectCommand,
    HeadObjectCommand
} = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getLogger } = require('../utils/logger');

class S3BackupStorage {
    constructor(config) {
        this.bucket = config.bucket;
        this.prefix = config.prefix || 'cube-backups/';
        this.retentionDays = config.retentionDays || 90;
        this.logger = getLogger();

        // Configure S3 client
        const clientConfig = {
            region: config.region || 'eu-central-1'
        };

        // Custom endpoint for MinIO or other S3-compatible storage
        if (config.endpoint) {
            clientConfig.endpoint = config.endpoint;
            clientConfig.forcePathStyle = true; // Required for MinIO
        }

        // Credentials (can also use environment variables)
        if (config.accessKeyId && config.secretAccessKey) {
            clientConfig.credentials = {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey
            };
        }

        this.client = new S3Client(clientConfig);
    }

    /**
     * Initialize storage (verify bucket access)
     */
    async initialize() {
        try {
            await this.client.send(new ListObjectsV2Command({
                Bucket: this.bucket,
                MaxKeys: 1
            }));
            this.logger.info('S3 bucket accessible', { bucket: this.bucket });
        } catch (error) {
            throw new Error(`Cannot access S3 bucket ${this.bucket}: ${error.message}`);
        }
    }

    /**
     * Generate S3 key from cube URI
     * @param {string} cubeUri - Full cube URI
     * @returns {string} - S3 object key
     */
    generateKey(cubeUri) {
        const uriParts = cubeUri.split('/');
        const version = uriParts.pop();
        const cubeName = uriParts.pop();
        const domain = uriParts[2] || 'default';

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `v${version}_${timestamp}.nt`;

        return `${this.prefix}${domain}/${cubeName}/${filename}`;
    }

    /**
     * Save backup to S3
     * @param {string} cubeUri - Cube URI
     * @param {string} ntriples - N-Triples content
     * @returns {Promise<object>} - Backup info
     */
    async save(cubeUri, ntriples) {
        const key = this.generateKey(cubeUri);
        const body = Buffer.from(ntriples, 'utf8');

        // Use multipart upload for large files
        const upload = new Upload({
            client: this.client,
            params: {
                Bucket: this.bucket,
                Key: key,
                Body: body,
                ContentType: 'application/n-triples',
                Metadata: {
                    'cube-uri': cubeUri,
                    'triple-count': String(ntriples.split('\n').filter(l => l.trim()).length),
                    'created': new Date().toISOString()
                }
            }
        });

        await upload.done();

        this.logger.info('Backup saved to S3', {
            cube: cubeUri,
            bucket: this.bucket,
            key: key,
            size: body.length
        });

        return {
            cubeUri,
            bucket: this.bucket,
            key: key,
            path: `s3://${this.bucket}/${key}`,
            size: body.length,
            timestamp: new Date().toISOString(),
            tripleCount: ntriples.split('\n').filter(l => l.trim()).length
        };
    }

    /**
     * Load backup from S3
     * @param {string} key - S3 object key
     * @returns {Promise<string>} - N-Triples content
     */
    async load(key) {
        // Handle full S3 URI or just key
        const objectKey = key.replace(`s3://${this.bucket}/`, '');

        const response = await this.client.send(new GetObjectCommand({
            Bucket: this.bucket,
            Key: objectKey
        }));

        // Convert stream to string
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }

        return Buffer.concat(chunks).toString('utf8');
    }

    /**
     * List all backups
     * @param {string} filter - Optional filter (cube name pattern)
     * @returns {Promise<Array>} - List of backup info
     */
    async list(filter = null) {
        const backups = [];
        let continuationToken = null;

        do {
            const params = {
                Bucket: this.bucket,
                Prefix: this.prefix,
                MaxKeys: 1000
            };

            if (continuationToken) {
                params.ContinuationToken = continuationToken;
            }

            const response = await this.client.send(new ListObjectsV2Command(params));

            for (const obj of (response.Contents || [])) {
                if (!obj.Key.endsWith('.nt')) continue;

                // Parse path: prefix/domain/cubeName/vX_timestamp.nt
                const keyParts = obj.Key.replace(this.prefix, '').split('/');
                if (keyParts.length < 3) continue;

                const domain = keyParts[0];
                const cube = keyParts[1];
                const filename = keyParts[2];

                if (filter && !cube.includes(filter)) continue;

                // Parse version and timestamp from filename
                const match = filename.match(/^v(\d+)_(.+)\.nt$/);
                const version = match ? match[1] : null;

                backups.push({
                    domain,
                    cube,
                    version,
                    filename,
                    key: obj.Key,
                    path: `s3://${this.bucket}/${obj.Key}`,
                    size: obj.Size,
                    created: obj.LastModified
                });
            }

            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        // Sort by creation date (newest first)
        backups.sort((a, b) => b.created - a.created);

        return backups;
    }

    /**
     * Delete old backups based on retention policy
     * Note: Consider using S3 Lifecycle policies instead for production
     * @returns {Promise<number>} - Number of deleted backups
     */
    async cleanupOldBackups() {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

        const backups = await this.list();
        let deletedCount = 0;

        for (const backup of backups) {
            if (backup.created < cutoffDate) {
                await this.client.send(new DeleteObjectCommand({
                    Bucket: this.bucket,
                    Key: backup.key
                }));

                this.logger.info('Deleted old backup from S3', {
                    key: backup.key,
                    age: Math.floor((Date.now() - backup.created) / (1000 * 60 * 60 * 24)) + ' days'
                });
                deletedCount++;
            }
        }

        return deletedCount;
    }

    /**
     * Delete a specific backup
     * @param {string} key - S3 object key
     */
    async delete(key) {
        const objectKey = key.replace(`s3://${this.bucket}/`, '');

        await this.client.send(new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: objectKey
        }));

        this.logger.info('Deleted backup from S3', { key: objectKey });
    }

    /**
     * Check if backup exists
     * @param {string} key - S3 object key
     * @returns {Promise<boolean>}
     */
    async exists(key) {
        const objectKey = key.replace(`s3://${this.bucket}/`, '');

        try {
            await this.client.send(new HeadObjectCommand({
                Bucket: this.bucket,
                Key: objectKey
            }));
            return true;
        } catch (error) {
            if (error.name === 'NotFound') {
                return false;
            }
            throw error;
        }
    }

    /**
     * Get storage type
     */
    getType() {
        return 's3';
    }
}

module.exports = S3BackupStorage;
