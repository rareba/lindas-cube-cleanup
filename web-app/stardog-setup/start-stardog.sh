#!/bin/bash
# Start Stardog via Docker
# Requires: stardog-license-key.bin in the same directory

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LICENSE_FILE="$SCRIPT_DIR/stardog-license-key.bin"

# Check for license file
if [ ! -f "$LICENSE_FILE" ]; then
    echo "ERROR: License file not found!"
    echo ""
    echo "Please place your Stardog license file at:"
    echo "  $LICENSE_FILE"
    echo ""
    echo "To obtain a license:"
    echo "  1. Visit https://www.stardog.com/get-started/"
    echo "  2. Register for a free 60-day trial"
    echo "  3. Download stardog-license-key.bin"
    echo "  4. Place it in this directory"
    exit 1
fi

# Check if container already exists
if docker ps -a --format '{{.Names}}' | grep -q '^stardog$'; then
    echo "Stardog container already exists."

    if docker ps --format '{{.Names}}' | grep -q '^stardog$'; then
        echo "Stardog is already running."
        echo "Access at: http://localhost:5820"
    else
        echo "Starting existing container..."
        docker start stardog
        echo "Stardog started at: http://localhost:5820"
    fi
else
    echo "Creating and starting Stardog container..."
    docker run -d --name stardog -p 5820:5820 \
        -v "$LICENSE_FILE:/var/opt/stardog/stardog-license-key.bin:ro" \
        -v stardog-data:/var/opt/stardog \
        stardog/stardog:latest

    echo "Waiting for Stardog to start..."
    sleep 10

    echo "Creating 'lindas' database..."
    docker exec stardog stardog-admin db create -n lindas 2>/dev/null || true

    echo ""
    echo "Stardog is running at: http://localhost:5820"
    echo "Default credentials: admin / admin"
fi
