# LINDAS Cube Cleanup Web App Starter
# PowerShell script for Windows (alternative to batch file)

$ErrorActionPreference = "Stop"

# Change to script directory
Set-Location $PSScriptRoot

Write-Host "========================================"
Write-Host "  LINDAS Cube Cleanup Web App"
Write-Host "========================================"
Write-Host ""

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "Node.js version: $nodeVersion"
} catch {
    Write-Host "ERROR: Node.js is not installed." -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/"
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if npm is installed
try {
    $npmVersion = npm --version
    Write-Host "npm version: $npmVersion"
} catch {
    Write-Host "ERROR: npm is not installed." -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/"
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Install dependencies if node_modules doesn't exist
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..."
    npm install
    Write-Host ""
}

# Start the server
Write-Host "Starting server..."
Write-Host "Press Ctrl+C to stop"
Write-Host ""
node server.js
