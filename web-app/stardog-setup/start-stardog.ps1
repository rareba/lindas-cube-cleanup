# Start Stardog via Docker (Windows PowerShell)
# Requires: stardog-license-key.bin in the same directory

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LicenseFile = Join-Path $ScriptDir "stardog-license-key.bin"

# Check for license file
if (-not (Test-Path $LicenseFile)) {
    Write-Host "ERROR: License file not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please place your Stardog license file at:"
    Write-Host "  $LicenseFile" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To obtain a license:"
    Write-Host "  1. Visit https://www.stardog.com/get-started/"
    Write-Host "  2. Register for a free 60-day trial"
    Write-Host "  3. Download stardog-license-key.bin"
    Write-Host "  4. Place it in this directory"
    exit 1
}

# Convert Windows path to Docker-compatible format
$DockerLicensePath = $LicenseFile -replace '\\', '/' -replace '^([A-Z]):', '/$1'.ToLower()

# Check if container already exists
$existingContainer = docker ps -a --format '{{.Names}}' | Where-Object { $_ -eq 'stardog' }

if ($existingContainer) {
    Write-Host "Stardog container already exists."

    $runningContainer = docker ps --format '{{.Names}}' | Where-Object { $_ -eq 'stardog' }

    if ($runningContainer) {
        Write-Host "Stardog is already running." -ForegroundColor Green
        Write-Host "Access at: http://localhost:5820"
    } else {
        Write-Host "Starting existing container..."
        docker start stardog
        Write-Host "Stardog started at: http://localhost:5820" -ForegroundColor Green
    }
} else {
    Write-Host "Creating and starting Stardog container..."

    docker run -d --name stardog -p 5820:5820 `
        -v "${LicenseFile}:/var/opt/stardog/stardog-license-key.bin:ro" `
        -v "stardog-data:/var/opt/stardog" `
        stardog/stardog:latest

    Write-Host "Waiting for Stardog to start..."
    Start-Sleep -Seconds 10

    Write-Host "Creating 'lindas' database..."
    docker exec stardog stardog-admin db create -n lindas 2>$null

    Write-Host ""
    Write-Host "Stardog is running at: http://localhost:5820" -ForegroundColor Green
    Write-Host "Default credentials: admin / admin"
}
