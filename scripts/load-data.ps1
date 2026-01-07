# PowerShell script to load data into local Fuseki instance

$ErrorActionPreference = "Stop"

# Configuration
$FusekiEndpoint = "http://localhost:3030/lindas/data"
$GraphUri = "https://lindas.admin.ch/sfoe/cube"
$DataDir = "..\data"
$DataFile = "sfoe-cube.nt"

$DataPath = Join-Path $DataDir $DataFile

if (-not (Test-Path $DataPath)) {
    # Try merged file
    $DataPath = Join-Path $DataDir "sfoe-cube-merged.nt"
    if (-not (Test-Path $DataPath)) {
        Write-Error "Data file not found. Please run download-graph.ps1 first."
        exit 1
    }
}

Write-Host "Loading data into Fuseki..."
Write-Host "Data file: $DataPath"
Write-Host "Target graph: $GraphUri"
Write-Host "Endpoint: $FusekiEndpoint"

$FileSize = (Get-Item $DataPath).Length / 1MB
Write-Host "File size: $([math]::Round($FileSize, 2)) MB"

try {
    # Load data into the named graph
    $EncodedGraph = [System.Web.HttpUtility]::UrlEncode($GraphUri)
    $UploadUrl = "$FusekiEndpoint`?graph=$EncodedGraph"

    $Headers = @{
        "Content-Type" = "application/n-triples"
    }

    $Content = Get-Content $DataPath -Raw

    Invoke-WebRequest -Uri $UploadUrl `
        -Method POST `
        -Headers $Headers `
        -Body $Content `
        -TimeoutSec 3600

    Write-Host "Data loaded successfully!"
    Write-Host ""
    Write-Host "You can now run queries against:"
    Write-Host "  SPARQL endpoint: http://localhost:3030/lindas/query"
    Write-Host "  Update endpoint: http://localhost:3030/lindas/update"
}
catch {
    Write-Error "Failed to load data: $_"
    Write-Host ""
    Write-Host "Make sure Fuseki is running (start-fuseki.ps1)"
    exit 1
}
