# Stardog Local Setup Guide

This directory contains helpers for setting up Stardog locally for development and testing.

## Prerequisites

Stardog requires a license file to run. You can obtain a free 60-day trial license:

1. Visit https://www.stardog.com/get-started/
2. Click "Get Stardog Free" or "Request Trial License"
3. Fill out the registration form
4. Download the license file (stardog-license-key.bin)
5. Place the license file in this directory

## Directory Structure

```
stardog-setup/
  README.md           # This file
  stardog-license-key.bin  # Your license file (YOU MUST ADD THIS)
  start-stardog.sh    # Script to start Stardog via Docker
  start-stardog.ps1   # PowerShell script for Windows
```

## Quick Start

### Option 1: Docker (Recommended)

After placing your license file in this directory:

**Linux/macOS:**
```bash
./start-stardog.sh
```

**Windows (PowerShell):**
```powershell
.\start-stardog.ps1
```

**Or manually:**
```bash
docker run -d --name stardog -p 5820:5820 \
  -v "$(pwd)/stardog-license-key.bin:/var/opt/stardog/stardog-license-key.bin" \
  -v stardog-data:/var/opt/stardog \
  stardog/stardog:latest
```

### Option 2: Native Installation

1. Download Stardog from https://www.stardog.com/get-started/
2. Extract to a directory (e.g., C:\stardog or /opt/stardog)
3. Copy your license file to the Stardog home directory
4. Start the server:
   ```bash
   stardog-admin server start
   ```
5. Create a database:
   ```bash
   stardog-admin db create -n lindas
   ```

## Verifying Installation

After starting Stardog, verify it's running:

```bash
curl http://localhost:5820/admin/databases -u admin:admin
```

Or open http://localhost:5820 in your browser.

## Default Credentials

- Username: `admin`
- Password: `admin`

## Free Edition Limits

- Max 25 databases
- Max 10GB data
- Max 1 hour query time

## Troubleshooting

### License File Not Found
Ensure `stardog-license-key.bin` is in the correct location and the filename matches exactly.

### Port Already in Use
```bash
# Check what's using port 5820
netstat -ano | findstr ":5820"
# Kill the process or change the port in the Docker command
```

### Container Won't Start
```bash
# Check container logs
docker logs stardog

# Remove and recreate
docker rm -f stardog
docker volume rm stardog-data
# Then run the start command again
```

## Using with the Web App

Once Stardog is running:

1. Open the web app at http://localhost:3001
2. In the Setup tab, select "Stardog" from the Triplestore Type dropdown
3. Set Mode to "Local (Development)"
4. The default settings should be:
   - Endpoint URL: http://localhost:5820
   - Database Name: lindas (or mydb)
   - Username: admin
   - Password: admin
5. Click "Check Connection" to verify

## Creating the lindas Database

After starting Stardog for the first time:

```bash
# Using Docker
docker exec stardog stardog-admin db create -n lindas

# Or using native installation
stardog-admin db create -n lindas
```
