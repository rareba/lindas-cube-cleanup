#!/usr/bin/env node
/**
 * LINDAS Cube Cleanup Service CLI
 *
 * Commands:
 * - cleanup: Run cleanup process
 * - restore: Restore from backup
 * - list-backups: List available backups
 * - preview: Preview what would be deleted (dry-run)
 */
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { createLogger } = require('./utils/logger');
const { createAdapter } = require('./triplestore');
const { createStorage } = require('./backup');
const CleanupService = require('./cleanup');
const RestoreService = require('./restore');

// Version from package.json
const packageJson = require('../package.json');

/**
 * Load configuration from file or environment
 */
function loadConfig(configPath) {
    let config = {};

    // Try to load config file
    if (configPath) {
        const absolutePath = path.isAbsolute(configPath)
            ? configPath
            : path.join(process.cwd(), configPath);

        if (!fs.existsSync(absolutePath)) {
            throw new Error(`Config file not found: ${absolutePath}`);
        }

        const content = fs.readFileSync(absolutePath, 'utf8');
        config = JSON.parse(content);
    } else {
        // Try default locations
        const defaultPaths = [
            './config.json',
            './config/config.json',
            '../config/config.json'
        ];

        for (const p of defaultPaths) {
            const fullPath = path.join(process.cwd(), p);
            if (fs.existsSync(fullPath)) {
                const content = fs.readFileSync(fullPath, 'utf8');
                config = JSON.parse(content);
                break;
            }
        }
    }

    // Override with environment variables
    if (process.env.TRIPLESTORE_TYPE) {
        config.triplestore = config.triplestore || {};
        config.triplestore.type = process.env.TRIPLESTORE_TYPE;
    }
    if (process.env.SPARQL_QUERY_ENDPOINT) {
        config.triplestore = config.triplestore || {};
        config.triplestore.queryEndpoint = process.env.SPARQL_QUERY_ENDPOINT;
    }
    if (process.env.SPARQL_UPDATE_ENDPOINT) {
        config.triplestore = config.triplestore || {};
        config.triplestore.updateEndpoint = process.env.SPARQL_UPDATE_ENDPOINT;
    }
    if (process.env.SPARQL_USERNAME) {
        config.triplestore = config.triplestore || {};
        config.triplestore.authentication = config.triplestore.authentication || {};
        config.triplestore.authentication.type = 'basic';
        config.triplestore.authentication.username = process.env.SPARQL_USERNAME;
        config.triplestore.authentication.password = process.env.SPARQL_PASSWORD;
    }
    if (process.env.CLEANUP_GRAPHS) {
        config.cleanup = config.cleanup || {};
        config.cleanup.graphs = process.env.CLEANUP_GRAPHS.split(',');
    }
    if (process.env.VERSIONS_TO_KEEP) {
        config.cleanup = config.cleanup || {};
        config.cleanup.versionsToKeep = parseInt(process.env.VERSIONS_TO_KEEP, 10);
    }
    if (process.env.BACKUP_TYPE) {
        config.backup = config.backup || {};
        config.backup.type = process.env.BACKUP_TYPE;
    }
    if (process.env.BACKUP_PATH) {
        config.backup = config.backup || {};
        config.backup.local = config.backup.local || {};
        config.backup.local.path = process.env.BACKUP_PATH;
    }
    if (process.env.AWS_S3_BUCKET) {
        config.backup = config.backup || {};
        config.backup.s3 = config.backup.s3 || {};
        config.backup.s3.bucket = process.env.AWS_S3_BUCKET;
    }

    return config;
}

/**
 * Expand environment variables in config values
 */
function expandEnvVars(config) {
    const expand = (obj) => {
        for (const key in obj) {
            if (typeof obj[key] === 'string') {
                obj[key] = obj[key].replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] || '');
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                expand(obj[key]);
            }
        }
    };
    expand(config);
    return config;
}

// Setup CLI
program
    .name('lindas-cleanup')
    .description('LINDAS Cube Version Cleanup Service')
    .version(packageJson.version)
    .option('-c, --config <path>', 'Path to configuration file')
    .option('-v, --verbose', 'Enable verbose logging');

// Cleanup command
program
    .command('cleanup')
    .description('Run cube cleanup process')
    .option('-g, --graph <uri...>', 'Named graph(s) to clean (overrides config)')
    .option('-k, --keep <n>', 'Number of versions to keep (default: 2)', parseInt)
    .option('-d, --dry-run', 'Preview changes without deleting')
    .option('--no-backup', 'Skip backup creation')
    .action(async (options, cmd) => {
        try {
            const globalOpts = cmd.parent.opts();
            let config = loadConfig(globalOpts.config);
            config = expandEnvVars(config);

            // Initialize logger
            const logger = createLogger({
                level: globalOpts.verbose ? 'debug' : (config.logging?.level || 'info'),
                file: config.logging?.file,
                console: config.logging?.console !== false
            });

            // Apply command-line overrides
            const graphs = options.graph || config.cleanup?.graphs || [];
            const versionsToKeep = options.keep || config.cleanup?.versionsToKeep || 2;
            const dryRun = options.dryRun || config.cleanup?.dryRun || false;

            if (graphs.length === 0) {
                logger.error('No graphs specified. Use --graph or config file.');
                process.exit(1);
            }

            // Create triplestore adapter
            const triplestore = createAdapter(config.triplestore);

            // Test connection
            logger.info('Testing triplestore connection...');
            const connected = await triplestore.testConnection();
            if (!connected) {
                logger.error('Cannot connect to triplestore');
                process.exit(1);
            }
            logger.info(`Connected to ${triplestore.getType()}`);

            // Create backup storage (unless disabled)
            let backupStorage = null;
            if (options.backup !== false && config.backup?.enabled !== false) {
                backupStorage = createStorage(config.backup);
            }

            // Create cleanup service
            const cleanup = new CleanupService(triplestore, backupStorage, {
                versionsToKeep,
                chunkSize: config.cleanup?.chunkSize || 50000,
                dryRun
            });

            // Run cleanup
            const stats = await cleanup.run(graphs);

            // Exit with error code if there were errors
            if (stats.errors.length > 0) {
                process.exit(1);
            }

        } catch (error) {
            console.error('Cleanup failed:', error.message);
            process.exit(1);
        }
    });

// Restore command
program
    .command('restore <backup>')
    .description('Restore a cube from backup')
    .requiredOption('-g, --graph <uri>', 'Target named graph')
    .option('-o, --overwrite', 'Overwrite if cube exists')
    .option('-d, --dry-run', 'Preview without restoring')
    .option('--no-validate', 'Skip validation after restore')
    .action(async (backup, options, cmd) => {
        try {
            const globalOpts = cmd.parent.opts();
            let config = loadConfig(globalOpts.config);
            config = expandEnvVars(config);

            // Initialize logger
            const logger = createLogger({
                level: globalOpts.verbose ? 'debug' : (config.logging?.level || 'info'),
                file: config.logging?.file,
                console: config.logging?.console !== false
            });

            // Create triplestore adapter
            const triplestore = createAdapter(config.triplestore);

            // Test connection
            logger.info('Testing triplestore connection...');
            const connected = await triplestore.testConnection();
            if (!connected) {
                logger.error('Cannot connect to triplestore');
                process.exit(1);
            }

            // Create backup storage
            const backupStorage = createStorage(config.backup);
            await backupStorage.initialize();

            // Create restore service
            const restoreService = new RestoreService(triplestore, backupStorage, config);

            // Run restore
            const result = await restoreService.restore(backup, options.graph, {
                overwrite: options.overwrite || false,
                dryRun: options.dryRun || false,
                validate: options.validate !== false
            });

            logger.info('Restore result:', result);

        } catch (error) {
            console.error('Restore failed:', error.message);
            process.exit(1);
        }
    });

// List backups command
program
    .command('list-backups')
    .description('List available backups')
    .option('-f, --filter <pattern>', 'Filter by cube name')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
        try {
            const globalOpts = cmd.parent.opts();
            let config = loadConfig(globalOpts.config);
            config = expandEnvVars(config);

            // Create backup storage
            const backupStorage = createStorage(config.backup);
            await backupStorage.initialize();

            // List backups
            const backups = await backupStorage.list(options.filter);

            if (options.json) {
                console.log(JSON.stringify(backups, null, 2));
            } else {
                if (backups.length === 0) {
                    console.log('No backups found.');
                    return;
                }

                console.log(`Found ${backups.length} backup(s):\n`);
                console.log('%-60s %-8s %-12s %s'.replace(/%(-?\d+)s/g, (_, n) => {
                    const width = Math.abs(parseInt(n, 10));
                    return '-'.repeat(width);
                }));
                console.log('CUBE'.padEnd(60) + 'VERSION'.padEnd(8) + 'SIZE'.padEnd(12) + 'DATE');
                console.log('-'.repeat(90));

                for (const backup of backups) {
                    const size = (backup.size / 1024).toFixed(1) + ' KB';
                    const date = backup.created.toISOString().slice(0, 10);
                    console.log(
                        `${backup.cube.slice(0, 58).padEnd(60)}` +
                        `${('v' + backup.version).padEnd(8)}` +
                        `${size.padEnd(12)}` +
                        `${date}`
                    );
                }
            }

        } catch (error) {
            console.error('List failed:', error.message);
            process.exit(1);
        }
    });

// Preview command (alias for cleanup --dry-run)
program
    .command('preview')
    .description('Preview what would be deleted (dry-run)')
    .option('-g, --graph <uri...>', 'Named graph(s) to check')
    .option('-k, --keep <n>', 'Number of versions to keep (default: 2)', parseInt)
    .action(async (options, cmd) => {
        // Delegate to cleanup with --dry-run
        const cleanupCmd = program.commands.find(c => c.name() === 'cleanup');
        await cleanupCmd.parseAsync(['cleanup', '--dry-run', ...(options.graph ? ['-g', ...options.graph] : []), ...(options.keep ? ['-k', options.keep] : [])], { from: 'user' });
    });

// Test connection command
program
    .command('test-connection')
    .description('Test triplestore connection')
    .action(async (options, cmd) => {
        try {
            const globalOpts = cmd.parent.opts();
            let config = loadConfig(globalOpts.config);
            config = expandEnvVars(config);

            console.log('Testing connection to triplestore...');
            console.log(`Type: ${config.triplestore?.type}`);
            console.log(`Query endpoint: ${config.triplestore?.queryEndpoint}`);

            const triplestore = createAdapter(config.triplestore);
            const connected = await triplestore.testConnection();

            if (connected) {
                console.log('Connection successful!');
            } else {
                console.log('Connection failed.');
                process.exit(1);
            }

        } catch (error) {
            console.error('Connection test failed:', error.message);
            process.exit(1);
        }
    });

// Parse arguments
program.parse();
