# PowerShell script to start Apache Jena Fuseki server

$ErrorActionPreference = "Stop"

$FusekiVersion = "4.10.0"
$FusekiDir = "..\fuseki\apache-jena-fuseki-$FusekiVersion"

if (-not (Test-Path $FusekiDir)) {
    Write-Error "Fuseki not found. Please run setup-fuseki.ps1 first."
    exit 1
}

Write-Host "Starting Apache Jena Fuseki..."
Write-Host "Web UI will be available at: http://localhost:3030"
Write-Host "SPARQL endpoint: http://localhost:3030/lindas/query"
Write-Host "Update endpoint: http://localhost:3030/lindas/update"
Write-Host ""
Write-Host "Press Ctrl+C to stop the server"
Write-Host ""

Push-Location $FusekiDir
try {
    # Start Fuseki with the LINDAS configuration
    & java -jar fuseki-server.jar --config=lindas-config.ttl
}
finally {
    Pop-Location
}
