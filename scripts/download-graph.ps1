# PowerShell script to download the SFOE cube graph from LINDAS
# For Windows users

$ErrorActionPreference = "Stop"

# Configuration
$SparqlEndpoint = "https://ld.admin.ch/query"
$GraphUri = "https://lindas.admin.ch/sfoe/cube"
$OutputDir = "..\data"
$OutputFile = "sfoe-cube.nt"

# Create output directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$OutputPath = Join-Path $OutputDir $OutputFile

Write-Host "Downloading graph: $GraphUri"
Write-Host "From endpoint: $SparqlEndpoint"
Write-Host "This may take a while for large graphs..."

# SPARQL CONSTRUCT query to get all triples
$Query = "CONSTRUCT { ?s ?p ?o } WHERE { GRAPH <$GraphUri> { ?s ?p ?o } }"

try {
    $Headers = @{
        "Accept" = "application/n-triples"
        "Content-Type" = "application/sparql-query"
    }

    Invoke-WebRequest -Uri $SparqlEndpoint `
        -Method POST `
        -Headers $Headers `
        -Body $Query `
        -OutFile $OutputPath `
        -TimeoutSec 3600

    $FileInfo = Get-Item $OutputPath
    $LineCount = (Get-Content $OutputPath | Measure-Object -Line).Lines

    Write-Host "Download complete: $OutputPath"
    Write-Host "File size: $([math]::Round($FileInfo.Length / 1MB, 2)) MB"
    Write-Host "Triple count (approx): $LineCount"
}
catch {
    Write-Error "Download failed: $_"
    exit 1
}
