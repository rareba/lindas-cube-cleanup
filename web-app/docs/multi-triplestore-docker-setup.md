# Multi-Triplestore Docker Setup Guide

This guide documents the complete setup for running the LINDAS Cube Cleanup web application with all three supported triplestore backends: Apache Fuseki, GraphDB, and Stardog.

## Overview

| Triplestore | Port | License | Status |
|-------------|------|---------|--------|
| Apache Fuseki | 3030 | Free/Open Source | Ready to use |
| GraphDB Free | 7200 | Free (rate limited) | Ready to use |
| Stardog | 5820 | Requires license | Needs license file |

## Quick Start

### 1. Apache Fuseki (Simplest - No License Required)

**Using Docker:**
```bash
docker run -d --name fuseki -p 3030:3030 \
  -e ADMIN_PASSWORD=admin \
  stain/jena-fuseki
```

**Or native (already running in this project):**
```bash
cd fuseki
java -jar fuseki-server.jar --config=lindas-config.ttl
```

Access at: http://localhost:3030

### 2. GraphDB Free (No License Required)

**Using Docker:**
```bash
docker run -d --name graphdb -p 7200:7200 \
  ontotext/graphdb:free
```

Access at: http://localhost:7200

**Note:** GraphDB Free has rate limits (2 queries/second, 1 concurrent query).

### 3. Stardog (License Required)

Stardog requires a license file to run. See the detailed setup in `../stardog-setup/README.md`.

**Quick steps:**
1. Get a free 60-day trial license from https://www.stardog.com/get-started/
2. Place `stardog-license-key.bin` in the `stardog-setup/` directory
3. Run the setup script:
   ```powershell
   # Windows
   .\stardog-setup\start-stardog.ps1

   # Linux/macOS
   ./stardog-setup/start-stardog.sh
   ```

Access at: http://localhost:5820

## Current Running Services

As of this setup:

| Service | Container/Process | Port | Status |
|---------|-------------------|------|--------|
| Fuseki | Native Java (PID: 40992) | 3030 | Running |
| GraphDB | rdf-forge-graphdb | 7200 | Running |
| Stardog | - | 5820 | Needs license |

## Testing with the Web App

### Start the Web App
```bash
cd web-app
npm start
```

Access at: http://localhost:3001

### Test Each Triplestore

1. **Fuseki Test:**
   - Select "Apache Fuseki" in Triplestore Type
   - Set Mode to "Local (Development)"
   - Endpoint: http://localhost:3030
   - Dataset: lindas
   - Click "Check Connection"
   - Expected: "Connected to Fuseki!" with datasets listed

2. **GraphDB Test:**
   - Select "GraphDB" in Triplestore Type
   - Set Mode to "Local (Development)"
   - Endpoint: http://localhost:7200
   - Repository: rdf-forge (or create your own)
   - Click "Check Connection"
   - Expected: "Connected to GraphDB!" with repositories listed

3. **Stardog Test:**
   - Select "Stardog" in Triplestore Type
   - Set Mode to "Local (Development)"
   - Endpoint: http://localhost:5820
   - Database: lindas
   - Username: admin
   - Password: admin
   - Click "Check Connection"
   - Expected (without license): "Connection failed: Could not connect to triplestore"
   - Expected (with license): "Connected to Stardog!" with databases listed

## API Verification

Test triplestore connections via API:

```bash
# Fuseki
curl -s http://localhost:3001/api/triplestore/check \
  -H "Content-Type: application/json" \
  -d '{"type":"fuseki","mode":"local","baseUrl":"http://localhost:3030","dataset":"lindas"}'

# GraphDB
curl -s http://localhost:3001/api/triplestore/check \
  -H "Content-Type: application/json" \
  -d '{"type":"graphdb","mode":"local","baseUrl":"http://localhost:7200","repository":"rdf-forge"}'

# Stardog
curl -s http://localhost:3001/api/triplestore/check \
  -H "Content-Type: application/json" \
  -d '{"type":"stardog","mode":"local","baseUrl":"http://localhost:5820","database":"lindas","username":"admin","password":"admin"}'
```

## Docker Container Management

### Start All Containers
```bash
# Start existing containers
docker start fuseki graphdb stardog

# Or start GraphDB (Fuseki runs natively in this project)
docker start rdf-forge-graphdb
```

### Stop All Containers
```bash
docker stop fuseki graphdb stardog
# Or for this project's GraphDB:
docker stop rdf-forge-graphdb
```

### View Container Status
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### Remove and Recreate
```bash
# Remove container (keeps data in volume)
docker rm -f graphdb

# Remove container and data
docker rm -f graphdb
docker volume rm graphdb-data
```

## Troubleshooting

### Port Conflicts

Check what's using a port:
```bash
# Windows
netstat -ano | findstr ":3030"
netstat -ano | findstr ":5820"
netstat -ano | findstr ":7200"

# Linux/macOS
lsof -i :3030
lsof -i :5820
lsof -i :7200
```

### Container Won't Start

Check logs:
```bash
docker logs fuseki
docker logs graphdb
docker logs stardog
```

### GraphDB Repository Not Found

Create a repository via the GraphDB Workbench:
1. Open http://localhost:7200
2. Go to Setup > Repositories
3. Click "Create new repository"
4. Select "GraphDB Repository"
5. Name it "lindas" or "test"
6. Click "Create"

### Fuseki Dataset Not Found

Create via Fuseki UI:
1. Open http://localhost:3030
2. Click "manage datasets"
3. Click "add new dataset"
4. Name it "lindas"
5. Select "Persistent (TDB2)"
6. Click "create dataset"

Or via API:
```bash
curl -X POST http://localhost:3030/$/datasets \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "dbName=lindas&dbType=tdb2"
```

## Architecture Summary

```
+----------------+     +------------------+
|   Web Browser  |     |   Web App        |
|   :3001        |<--->|   (Node.js)      |
+----------------+     +--------+---------+
                                |
          +---------------------+---------------------+
          |                     |                     |
          v                     v                     v
+------------------+  +------------------+  +------------------+
|  Apache Fuseki   |  |    GraphDB       |  |    Stardog       |
|  :3030           |  |    :7200         |  |    :5820         |
|  (Native/Docker) |  |    (Docker)      |  |    (Docker)      |
+------------------+  +------------------+  +------------------+
          |                     |                     |
          v                     v                     v
+------------------+  +------------------+  +------------------+
|  TDB2 Storage    |  |  GraphDB Store   |  |  Stardog Store   |
|  (filesystem)    |  |  (Docker volume) |  |  (Docker volume) |
+------------------+  +------------------+  +------------------+
```

## Files Created/Modified

- `web-app/stardog-setup/README.md` - Stardog setup instructions
- `web-app/stardog-setup/start-stardog.sh` - Bash script to start Stardog
- `web-app/stardog-setup/start-stardog.ps1` - PowerShell script to start Stardog
- `web-app/docs/multi-triplestore-docker-setup.md` - This documentation

## Next Steps

1. **For Fuseki and GraphDB:** Ready to use for testing and development
2. **For Stardog:**
   - Register at https://www.stardog.com/get-started/
   - Download the license file
   - Place in `stardog-setup/` directory
   - Run the start script

## Related Documentation

- [Local-First Update](./local-first-update-2026-01.md) - Local-first architecture changes
- [API Reference](./api-reference.md) - Complete API documentation
- [Backup System](./backup-system.md) - Backup and restore functionality
