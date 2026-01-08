#!/bin/bash

# LINDAS Cube Cleanup Demo Launcher (macOS/Linux)

echo "============================================"
echo "  LINDAS Cube Cleanup Demo Launcher"
echo "============================================"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FUSEKI_DIR="$SCRIPT_DIR/fuseki"
WEBAPP_DIR="$SCRIPT_DIR/web-app"
FUSEKI_VERSION="5.0.0"
STARTED_FUSEKI=0

# Function to check if a port is in use
check_port() {
    lsof -i :"$1" >/dev/null 2>&1
    return $?
}

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down..."

    # Kill Web App
    if [ -n "$WEBAPP_PID" ]; then
        echo "Stopping Web App (PID: $WEBAPP_PID)..."
        kill $WEBAPP_PID 2>/dev/null
    fi

    # Kill Fuseki only if we started it
    if [ "$STARTED_FUSEKI" -eq 1 ] && [ -n "$FUSEKI_PID" ]; then
        echo "Stopping Fuseki (PID: $FUSEKI_PID)..."
        kill $FUSEKI_PID 2>/dev/null
    fi

    echo ""
    echo "[OK] Demo shutdown complete"
    exit 0
}

# Set trap for cleanup on Ctrl+C or exit
trap cleanup SIGINT SIGTERM

# Check for required commands
command -v java >/dev/null 2>&1 || {
    echo "[ERROR] Java is required but not installed."
    echo "        Install Java with: brew install openjdk"
    exit 1
}

command -v node >/dev/null 2>&1 || {
    echo "[ERROR] Node.js is required but not installed."
    echo "        Install Node.js with: brew install node"
    exit 1
}

# Check if Fuseki is already running on port 3030
echo "Checking if Fuseki is running..."
if check_port 3030; then
    echo "[OK] Fuseki is already running on port 3030"
else
    echo "[..] Fuseki not running, starting it..."

    # Check if Fuseki is installed
    if [ ! -f "$FUSEKI_DIR/fuseki-server" ]; then
        echo "[..] Fuseki not installed, downloading..."

        # Create fuseki directory
        mkdir -p "$FUSEKI_DIR"

        # Download Fuseki
        echo "[..] Downloading Apache Jena Fuseki $FUSEKI_VERSION..."
        FUSEKI_URL="https://archive.apache.org/dist/jena/binaries/apache-jena-fuseki-${FUSEKI_VERSION}.tar.gz"

        if command -v curl >/dev/null 2>&1; then
            curl -L -o "$FUSEKI_DIR/fuseki.tar.gz" "$FUSEKI_URL"
        elif command -v wget >/dev/null 2>&1; then
            wget -O "$FUSEKI_DIR/fuseki.tar.gz" "$FUSEKI_URL"
        else
            echo "[ERROR] Neither curl nor wget found. Please install one of them."
            exit 1
        fi

        if [ ! -f "$FUSEKI_DIR/fuseki.tar.gz" ]; then
            echo "[ERROR] Failed to download Fuseki"
            exit 1
        fi

        # Extract Fuseki
        echo "[..] Extracting Fuseki..."
        tar -xzf "$FUSEKI_DIR/fuseki.tar.gz" -C "$FUSEKI_DIR"

        # Move contents up one level
        mv "$FUSEKI_DIR"/apache-jena-fuseki-*/* "$FUSEKI_DIR/"
        rm -rf "$FUSEKI_DIR"/apache-jena-fuseki-*

        # Clean up tar file
        rm "$FUSEKI_DIR/fuseki.tar.gz"

        # Make fuseki-server executable
        chmod +x "$FUSEKI_DIR/fuseki-server"

        echo "[OK] Fuseki installed successfully"
    fi

    # Start Fuseki in background
    cd "$FUSEKI_DIR"
    ./fuseki-server --mem /lindas &
    FUSEKI_PID=$!
    STARTED_FUSEKI=1

    # Wait for Fuseki to start
    echo "[..] Waiting for Fuseki to start..."
    sleep 8

    # Verify Fuseki started
    if check_port 3030; then
        echo "[OK] Fuseki started successfully"
    else
        echo "[WARNING] Fuseki may still be starting, waiting more..."
        sleep 5
    fi
fi

echo ""

# Check if web app is already running on port 3001
echo "Checking if Web App is running..."
if check_port 3001; then
    echo "[OK] Web App is already running on port 3001"
else
    echo "[..] Starting Web App..."

    # Check if web app directory exists
    if [ ! -f "$WEBAPP_DIR/server.js" ]; then
        echo "[ERROR] Web App not found at $WEBAPP_DIR"
        exit 1
    fi

    # Check if node_modules exists
    if [ ! -d "$WEBAPP_DIR/node_modules" ]; then
        echo "[..] Installing npm dependencies..."
        cd "$WEBAPP_DIR"
        npm install
    fi

    # Start Web App in background
    cd "$WEBAPP_DIR"
    node server.js &
    WEBAPP_PID=$!

    # Wait for Web App to start
    sleep 3
    echo "[OK] Web App started"
fi

echo ""
echo "============================================"
echo "  Demo is ready!"
echo "============================================"
echo ""
echo "  Fuseki:   http://localhost:3030"
echo "  Web App:  http://localhost:3001"
echo ""

# Open browser (macOS)
if [ "$(uname)" = "Darwin" ]; then
    echo "  Opening Web App in browser..."
    open http://localhost:3001
elif command -v xdg-open >/dev/null 2>&1; then
    # Linux
    echo "  Opening Web App in browser..."
    xdg-open http://localhost:3001
fi

echo ""
echo "============================================"
echo "  Press ENTER to shutdown both services"
echo "============================================"
read

cleanup
