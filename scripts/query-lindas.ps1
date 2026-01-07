# PowerShell script to query LINDAS SPARQL endpoint
param(
    [Parameter(Mandatory=$true)]
    [string]$QueryFile,

    [Parameter(Mandatory=$false)]
    [string]$Endpoint = "https://ld.admin.ch/query",

    [Parameter(Mandatory=$false)]
    [string]$Format = "json"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $QueryFile)) {
    Write-Error "Query file not found: $QueryFile"
    exit 1
}

$Query = Get-Content $QueryFile -Raw

Write-Host "Running query from: $QueryFile"
Write-Host "Endpoint: $Endpoint"
Write-Host ""

$AcceptHeader = switch ($Format) {
    "json" { "application/sparql-results+json" }
    "csv" { "text/csv" }
    "xml" { "application/sparql-results+xml" }
    default { "application/sparql-results+json" }
}

$Headers = @{
    "Accept" = $AcceptHeader
    "Content-Type" = "application/sparql-query"
}

try {
    $Response = Invoke-WebRequest -Uri $Endpoint `
        -Method POST `
        -Headers $Headers `
        -Body $Query `
        -TimeoutSec 300

    $Response.Content
}
catch {
    Write-Error "Query failed: $_"
    exit 1
}
