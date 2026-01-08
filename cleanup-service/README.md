# LINDAS Cube Cleanup Service

A standalone service for cleaning up old cube versions from LINDAS and other SPARQL triplestores. Supports Fuseki, Stardog, and GraphDB with configurable backup storage (local filesystem or S3).

## Features

- **Multi-triplestore support**: Fuseki, Stardog, GraphDB
- **Configurable retention**: Keep N newest versions per cube (default: 2)
- **Automatic backups**: N-Triples export before deletion
- **Flexible backup storage**: Local filesystem or S3-compatible storage
- **Restore capability**: One-command restore from any backup
- **GitLab CI/CD ready**: Scheduled and manual pipeline triggers
- **Docker support**: Containerized deployment option

## Quick Start

### Installation

```bash
cd cleanup-service
npm install
```

### Configuration

1. Copy the example configuration:
```bash
cp config/config.example.json config/config.json
```

2. Edit `config/config.json` with your settings:
```json
{
  "triplestore": {
    "type": "fuseki",
    "queryEndpoint": "http://localhost:3030/lindas/query",
    "updateEndpoint": "http://localhost:3030/lindas/update"
  },
  "cleanup": {
    "graphs": ["https://lindas.admin.ch/sfoe/cube"],
    "versionsToKeep": 2
  },
  "backup": {
    "type": "local",
    "local": { "path": "./backups" },
    "retentionDays": 90
  }
}
```

### Usage

#### Preview what would be deleted (dry-run)
```bash
npm run preview
# or
node src/cli.js cleanup --dry-run --graph https://lindas.admin.ch/sfoe/cube
```

#### Run cleanup
```bash
npm run cleanup
# or
node src/cli.js cleanup --graph https://lindas.admin.ch/sfoe/cube --keep 2
```

#### List available backups
```bash
npm run list-backups
# or
node src/cli.js list-backups
```

#### Restore from backup
```bash
node src/cli.js restore <backup-path> --graph https://lindas.admin.ch/sfoe/cube
```

## CLI Commands

### `cleanup`
Run the cube cleanup process.

```bash
node src/cli.js cleanup [options]

Options:
  -g, --graph <uri...>  Named graph(s) to clean
  -k, --keep <n>        Number of versions to keep (default: 2)
  -d, --dry-run         Preview changes without deleting
  --no-backup           Skip backup creation
```

### `restore`
Restore a cube from backup.

```bash
node src/cli.js restore <backup-path> [options]

Options:
  -g, --graph <uri>     Target named graph (required)
  -o, --overwrite       Overwrite if cube exists
  -d, --dry-run         Preview without restoring
  --no-validate         Skip validation after restore
```

### `list-backups`
List all available backups.

```bash
node src/cli.js list-backups [options]

Options:
  -f, --filter <pattern>  Filter by cube name
  --json                  Output as JSON
```

### `test-connection`
Test triplestore connection.

```bash
node src/cli.js test-connection
```

## Configuration

### Environment Variables

All settings can be overridden with environment variables:

| Variable | Description |
|----------|-------------|
| `TRIPLESTORE_TYPE` | `fuseki`, `stardog`, or `graphdb` |
| `SPARQL_QUERY_ENDPOINT` | SPARQL query endpoint URL |
| `SPARQL_UPDATE_ENDPOINT` | SPARQL update endpoint URL |
| `SPARQL_USERNAME` | Basic auth username |
| `SPARQL_PASSWORD` | Basic auth password |
| `CLEANUP_GRAPHS` | Comma-separated graph URIs |
| `VERSIONS_TO_KEEP` | Number of versions to keep |
| `BACKUP_TYPE` | `local` or `s3` |
| `BACKUP_PATH` | Local backup directory |
| `AWS_S3_BUCKET` | S3 bucket name |
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |

### Triplestore Configuration

#### Fuseki
```json
{
  "triplestore": {
    "type": "fuseki",
    "queryEndpoint": "http://localhost:3030/dataset/query",
    "updateEndpoint": "http://localhost:3030/dataset/update",
    "graphStoreEndpoint": "http://localhost:3030/dataset/data"
  }
}
```

#### Stardog
```json
{
  "triplestore": {
    "type": "stardog",
    "queryEndpoint": "http://localhost:5820/database/query",
    "updateEndpoint": "http://localhost:5820/database/update",
    "authentication": {
      "type": "basic",
      "username": "admin",
      "password": "admin"
    }
  }
}
```

#### GraphDB
```json
{
  "triplestore": {
    "type": "graphdb",
    "queryEndpoint": "http://localhost:7200/repositories/repo",
    "updateEndpoint": "http://localhost:7200/repositories/repo/statements"
  }
}
```

### Backup Storage Configuration

#### Local Filesystem
```json
{
  "backup": {
    "type": "local",
    "retentionDays": 90,
    "local": {
      "path": "./backups"
    }
  }
}
```

#### AWS S3
```json
{
  "backup": {
    "type": "s3",
    "retentionDays": 90,
    "s3": {
      "bucket": "my-backup-bucket",
      "region": "eu-central-1",
      "prefix": "cube-backups/",
      "accessKeyId": "${AWS_ACCESS_KEY_ID}",
      "secretAccessKey": "${AWS_SECRET_ACCESS_KEY}"
    }
  }
}
```

#### S3-Compatible (MinIO)
```json
{
  "backup": {
    "type": "s3",
    "s3": {
      "bucket": "backups",
      "endpoint": "http://minio:9000",
      "accessKeyId": "minioadmin",
      "secretAccessKey": "minioadmin"
    }
  }
}
```

## GitLab CI/CD Integration

The service includes a `.gitlab-ci.yml` for automated deployments:

### Scheduled Cleanup (Weekly)
Set up a pipeline schedule in GitLab:
- Go to CI/CD > Schedules
- Create schedule: "Weekly Cleanup"
- Interval: `0 2 * * 0` (Sundays at 2 AM)

### Manual Trigger
Run cleanup manually from GitLab:
- Go to CI/CD > Pipelines
- Click "Run pipeline"
- Set variables if needed (DRY_RUN, ENVIRONMENT)

### Required CI/CD Variables
Set these in GitLab > Settings > CI/CD > Variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `SPARQL_QUERY_ENDPOINT` | Yes | Query endpoint URL |
| `SPARQL_UPDATE_ENDPOINT` | Yes | Update endpoint URL |
| `TRIPLESTORE_TYPE` | Yes | fuseki/stardog/graphdb |
| `CLEANUP_GRAPHS` | Yes | Comma-separated graph URIs |
| `SPARQL_USERNAME` | No | Auth username |
| `SPARQL_PASSWORD` | No | Auth password (masked) |
| `AWS_ACCESS_KEY_ID` | No | For S3 backups |
| `AWS_SECRET_ACCESS_KEY` | No | For S3 backups (masked) |

## Docker

### Build
```bash
docker build -t lindas-cleanup .
```

### Run
```bash
# Preview
docker run -v ./config:/app/config lindas-cleanup cleanup --dry-run

# Cleanup with local backups
docker run -v ./config:/app/config -v ./backups:/app/backups lindas-cleanup cleanup

# Restore
docker run -v ./config:/app/config -v ./backups:/app/backups \
  lindas-cleanup restore ./backups/cube_v5_2024-01-15.nt --graph https://lindas.admin.ch/sfoe/cube
```

## Programmatic API

Use the service as a library:

```javascript
const {
  CleanupService,
  RestoreService,
  createAdapter,
  createStorage
} = require('lindas-cube-cleanup-service');

// Create triplestore adapter
const triplestore = createAdapter({
  type: 'fuseki',
  queryEndpoint: 'http://localhost:3030/lindas/query',
  updateEndpoint: 'http://localhost:3030/lindas/update'
});

// Create backup storage
const backup = createStorage({
  type: 'local',
  local: { path: './backups' },
  retentionDays: 90
});

// Run cleanup
const cleanup = new CleanupService(triplestore, backup, {
  versionsToKeep: 2,
  dryRun: false
});

const stats = await cleanup.run(['https://lindas.admin.ch/sfoe/cube']);
console.log('Deleted cubes:', stats.cubesDeleted);

// Restore from backup
const restore = new RestoreService(triplestore, backup);
await restore.restore('./backups/cube_v5.nt', 'https://lindas.admin.ch/sfoe/cube');
```

## Backup File Format

Backups are stored as N-Triples files with metadata:

```
backups/
  energy.ld.admin.ch/
    bfe_ogd18_gebaeudeprogramm_co2wirkung/
      v5_2024-01-15T02-00-00Z.nt
      v4_2024-01-15T02-00-00Z.nt
```

## How Cleanup Works

1. **Identify**: Query each graph to find cubes with >N versions
2. **Rank**: Sort versions by version number (highest = newest)
3. **Backup**: Export old versions to N-Triples
4. **Delete**: Remove in chunks (50,000 triples/batch):
   - Step 1: Delete observations
   - Step 2: Delete observation links
   - Step 3: Delete metadata and shapes
5. **Verify**: Confirm cube no longer exists
6. **Cleanup**: Remove backups older than retention period

## Troubleshooting

### Connection Issues
```bash
# Test connection
node src/cli.js test-connection

# Check with verbose logging
node src/cli.js cleanup --dry-run -v
```

### Large Cubes Timeout
Increase chunk size or use a smaller value:
```json
{
  "cleanup": {
    "chunkSize": 25000
  }
}
```

### Authentication Errors
Verify credentials:
```bash
curl -u username:password http://localhost:3030/$/ping
```

## License

MIT
