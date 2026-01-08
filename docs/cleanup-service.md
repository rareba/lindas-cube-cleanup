# LINDAS Cube Cleanup Service - Architecture and Implementation

This document describes the standalone cleanup service for production deployment on LINDAS.

## Overview

The cleanup service provides automated cube version management with:
- Multi-triplestore support (Fuseki, Stardog, GraphDB)
- Configurable backup storage (local filesystem, S3)
- GitLab CI/CD integration for scheduled and manual execution
- Full restore capability from backups

## Architecture

```
+------------------+     +--------------------+     +------------------+
|   GitLab CI/CD   |---->|  Cleanup Service   |---->|   Triplestore    |
|  (Scheduled Job) |     |                    |     | (Fuseki/Stardog/ |
+------------------+     |  1. Identify       |     |     GraphDB)     |
                         |  2. Backup         |     +------------------+
                         |  3. Delete         |
                         |  4. Verify         |     +------------------+
                         +--------------------+---->|  Backup Storage  |
                                                    |  (Local/S3)      |
                                                    +------------------+
```

## Components

### 1. Triplestore Adapters

Each triplestore has its own adapter implementing a common interface:

| Adapter | Query Endpoint | Update Endpoint | Bulk Load |
|---------|---------------|-----------------|-----------|
| Fuseki | `/dataset/query` | `/dataset/update` | POST to `/dataset/data?graph=` |
| Stardog | `/db/query` | `/db/update` | POST to `/db?graph-uri=` |
| GraphDB | `/repositories/repo` | `/repositories/repo/statements` | POST with `?context=` |

### 2. Backup Storage

Two storage backends are supported:

**Local Filesystem:**
- Simple file-based storage
- Directory structure: `{basePath}/{domain}/{cube}/{version}_{timestamp}.nt`
- Automatic cleanup of files older than retention period

**S3-Compatible:**
- AWS S3, MinIO, or any S3-compatible storage
- Uses AWS SDK v3
- Supports lifecycle policies for automatic expiration
- Key structure: `{prefix}{domain}/{cube}/{version}_{timestamp}.nt`

### 3. Cleanup Process

The cleanup process follows these steps:

```
1. IDENTIFY
   - Query: List all cubes with version numbers
   - Rank: Calculate rank for each version (1 = newest)
   - Filter: Select cubes where rank > versionsToKeep

2. BACKUP (per cube)
   - CONSTRUCT query to export all cube triples
   - Save as N-Triples to backup storage
   - Record metadata (cube URI, graph, timestamp, triple count)

3. DELETE (per cube, chunked)
   - Step 1: Delete observations (LIMIT 50000 per iteration)
   - Step 2: Delete observation set links
   - Step 3: Delete cube metadata and SHACL shapes

4. VERIFY
   - ASK query to confirm cube no longer exists
   - Log success or error

5. CLEANUP BACKUPS
   - List backups older than retention period
   - Delete expired backups
```

### 4. Restore Process

```
1. LOAD
   - Read N-Triples from backup storage
   - Extract cube URI from content

2. CHECK
   - Query if cube already exists in target graph
   - If exists and not --overwrite: error
   - If exists and --overwrite: delete existing first

3. IMPORT
   - Bulk load N-Triples via Graph Store Protocol
   - Use chunked upload for large files

4. VALIDATE
   - ASK query to confirm cube exists
   - Count observations to verify data
```

## Configuration Options

### Triplestore

```json
{
  "triplestore": {
    "type": "fuseki|stardog|graphdb",
    "queryEndpoint": "http://...",
    "updateEndpoint": "http://...",
    "graphStoreEndpoint": "http://...",
    "authentication": {
      "type": "none|basic|bearer",
      "username": "...",
      "password": "...",
      "token": "..."
    }
  }
}
```

### Cleanup

```json
{
  "cleanup": {
    "graphs": ["https://lindas.admin.ch/sfoe/cube"],
    "versionsToKeep": 2,
    "chunkSize": 50000,
    "dryRun": false
  }
}
```

### Backup

```json
{
  "backup": {
    "enabled": true,
    "type": "local|s3",
    "retentionDays": 90,
    "local": { "path": "./backups" },
    "s3": {
      "bucket": "...",
      "region": "...",
      "prefix": "...",
      "endpoint": "..."
    }
  }
}
```

## GitLab CI/CD Integration

### Pipeline Jobs

| Job | Stage | Trigger | Description |
|-----|-------|---------|-------------|
| `test-connection` | test | push/MR | Verify triplestore connectivity |
| `preview-cleanup` | preview | schedule/manual | Dry-run to see what would be deleted |
| `scheduled-cleanup` | cleanup | schedule | Weekly automated cleanup |
| `manual-cleanup` | cleanup | manual | On-demand cleanup |
| `list-backups` | preview | manual | Show available backups |
| `restore-backup` | restore | manual | Restore from backup |

### Required Variables

Set these in GitLab > Settings > CI/CD > Variables:

| Variable | Protected | Masked | Description |
|----------|-----------|--------|-------------|
| `SPARQL_QUERY_ENDPOINT` | Yes | No | Query endpoint |
| `SPARQL_UPDATE_ENDPOINT` | Yes | No | Update endpoint |
| `TRIPLESTORE_TYPE` | Yes | No | fuseki/stardog/graphdb |
| `CLEANUP_GRAPHS` | Yes | No | Graphs to clean |
| `SPARQL_PASSWORD` | Yes | Yes | Auth password |
| `AWS_SECRET_ACCESS_KEY` | Yes | Yes | S3 credentials |

### Schedule Setup

1. Go to CI/CD > Schedules
2. Create new schedule:
   - Description: "Weekly Cube Cleanup"
   - Interval pattern: `0 2 * * 0` (Sundays 2 AM)
   - Target branch: `main`
3. Save schedule

## Deployment Options

### 1. GitLab Runner (Recommended for LINDAS)

```yaml
# .gitlab-ci.yml
scheduled-cleanup:
  stage: cleanup
  script:
    - cd cleanup-service
    - npm ci
    - node src/cli.js cleanup
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
```

### 2. Docker Container

```bash
# Build
docker build -t lindas-cleanup ./cleanup-service

# Run scheduled via cron
0 2 * * 0 docker run --rm \
  -e SPARQL_QUERY_ENDPOINT=... \
  -e SPARQL_UPDATE_ENDPOINT=... \
  -v /backups:/app/backups \
  lindas-cleanup cleanup
```

### 3. Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: lindas-cube-cleanup
spec:
  schedule: "0 2 * * 0"
  jobTemplate:
    spec:
      containers:
      - name: cleanup
        image: lindas-cleanup:latest
        args: ["cleanup"]
        env:
        - name: SPARQL_QUERY_ENDPOINT
          valueFrom:
            secretKeyRef:
              name: lindas-secrets
              key: query-endpoint
```

## Monitoring and Alerts

### Log Output

The service produces structured JSON logs:

```json
{
  "timestamp": "2024-01-15T02:00:15.123Z",
  "level": "info",
  "message": "Cleanup completed",
  "cubesDeleted": 15,
  "triplesDeleted": 1250000,
  "errors": []
}
```

### Webhook Notifications

Configure notifications in config.json:

```json
{
  "notifications": {
    "enabled": true,
    "onSuccess": false,
    "onFailure": true,
    "webhook": "https://hooks.slack.com/..."
  }
}
```

## Security Considerations

1. **Credentials**: Store in GitLab CI/CD variables (masked + protected)
2. **Network**: Run cleanup from within secure network
3. **Backups**: Encrypt S3 bucket at rest
4. **Access**: Limit who can trigger manual pipelines
5. **Audit**: All operations logged with timestamps

## Rollback Procedure

If a cube needs to be restored:

1. **Find backup**:
   ```bash
   node src/cli.js list-backups --filter bfe_ogd18
   ```

2. **Preview restore**:
   ```bash
   node src/cli.js restore path/to/backup.nt \
     --graph https://lindas.admin.ch/sfoe/cube \
     --dry-run
   ```

3. **Execute restore**:
   ```bash
   node src/cli.js restore path/to/backup.nt \
     --graph https://lindas.admin.ch/sfoe/cube
   ```

4. **Verify**:
   - Check cube exists in LINDAS
   - Verify observation count
   - Test dependent applications

## Cost Estimation

### S3 Storage Costs (AWS eu-central-1)

| Monthly Deletions | Avg Size | 90-Day Storage | Monthly Cost |
|-------------------|----------|----------------|--------------|
| 50 cubes | 10 MB | ~4.5 GB | ~$0.10 |
| 200 cubes | 50 MB | ~90 GB | ~$2.00 |
| 500 cubes | 100 MB | ~450 GB | ~$10.00 |

### Compute Costs

- GitLab Runner: Included in GitLab subscription
- Docker: Minimal (~5 min/week execution)
