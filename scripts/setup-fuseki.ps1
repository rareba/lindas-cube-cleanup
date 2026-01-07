# PowerShell script to download and setup Apache Jena Fuseki for local testing
# Fuseki is a SPARQL server that can be used to test queries locally

$ErrorActionPreference = "Stop"

# Configuration
$FusekiVersion = "4.10.0"
$FusekiUrl = "https://dlcdn.apache.org/jena/binaries/apache-jena-fuseki-$FusekiVersion.zip"
$InstallDir = "..\fuseki"
$DataDir = "..\data"

Write-Host "Setting up Apache Jena Fuseki $FusekiVersion for local testing"
Write-Host "============================================================"

# Check if Java is installed
try {
    $JavaVersion = java -version 2>&1 | Select-String "version"
    Write-Host "Java found: $JavaVersion"
}
catch {
    Write-Error "Java is required but not found. Please install Java 11 or later."
    exit 1
}

# Create directories
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir | Out-Null
}

$ZipFile = Join-Path $InstallDir "fuseki.zip"
$ExtractedDir = Join-Path $InstallDir "apache-jena-fuseki-$FusekiVersion"

# Download Fuseki if not already present
if (-not (Test-Path $ExtractedDir)) {
    Write-Host "Downloading Fuseki from $FusekiUrl..."

    try {
        Invoke-WebRequest -Uri $FusekiUrl -OutFile $ZipFile -TimeoutSec 300
        Write-Host "Extracting..."
        Expand-Archive -Path $ZipFile -DestinationPath $InstallDir -Force
        Remove-Item $ZipFile
        Write-Host "Fuseki installed to: $ExtractedDir"
    }
    catch {
        Write-Error "Download failed: $_"
        Write-Host "You can manually download from: https://jena.apache.org/download/"
        exit 1
    }
}
else {
    Write-Host "Fuseki already installed at: $ExtractedDir"
}

# Create a configuration file for the LINDAS dataset
$ConfigFile = Join-Path $ExtractedDir "lindas-config.ttl"
$ConfigContent = @"
@prefix :      <#> .
@prefix fuseki: <http://jena.apache.org/fuseki#> .
@prefix rdf:   <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix tdb2:  <http://jena.apache.org/2016/tdb#> .
@prefix ja:    <http://jena.hpl.hp.com/2005/11/Assembler#> .

:service a fuseki:Service ;
    fuseki:name "lindas" ;
    fuseki:endpoint [ fuseki:operation fuseki:query ; fuseki:name "query" ] ;
    fuseki:endpoint [ fuseki:operation fuseki:update ; fuseki:name "update" ] ;
    fuseki:endpoint [ fuseki:operation fuseki:gsp-rw ; fuseki:name "data" ] ;
    fuseki:dataset :dataset .

:dataset a tdb2:DatasetTDB2 ;
    tdb2:location "lindas-db" .
"@

Set-Content -Path $ConfigFile -Value $ConfigContent
Write-Host "Configuration file created: $ConfigFile"

Write-Host ""
Write-Host "Setup complete!"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Run start-fuseki.ps1 to start the server"
Write-Host "2. Run load-data.ps1 to load the downloaded graph data"
Write-Host "3. Access the web UI at http://localhost:3030"
Write-Host "4. Run queries against http://localhost:3030/lindas/query"
Write-Host "5. Run updates against http://localhost:3030/lindas/update"
