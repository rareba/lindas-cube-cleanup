# PowerShell script to run LINDAS queries with parameter substitution
# Supports both TEST and PROD environments

param(
    [Parameter(Mandatory=$true)]
    [string]$QueryFile,

    [Parameter(Mandatory=$false)]
    [ValidateSet("TEST", "PROD", "LOCAL")]
    [string]$Environment = "TEST",

    [Parameter(Mandatory=$false)]
    [string]$GraphUri = "https://lindas.admin.ch/sfoe/cube",

    [Parameter(Mandatory=$false)]
    [string]$CubeUri,

    [Parameter(Mandatory=$false)]
    [switch]$Update,

    [Parameter(Mandatory=$false)]
    [string]$Format = "csv"
)

$ErrorActionPreference = "Stop"

# Set endpoint based on environment
$Endpoint = switch ($Environment) {
    "TEST"  { "https://test.ld.admin.ch" }
    "PROD"  { "https://ld.admin.ch" }
    "LOCAL" { "http://localhost:3030/lindas" }
}

$QueryEndpoint = "$Endpoint/query"
$UpdateEndpoint = "$Endpoint/update"

if (-not (Test-Path $QueryFile)) {
    Write-Error "Query file not found: $QueryFile"
    exit 1
}

# Read and substitute parameters
$Query = Get-Content $QueryFile -Raw
$Query = $Query -replace "GRAPH_URI", $GraphUri
if ($CubeUri) {
    $Query = $Query -replace "CUBE_URI", $CubeUri
}

Write-Host "Environment: $Environment"
Write-Host "Graph URI: $GraphUri"
if ($CubeUri) { Write-Host "Cube URI: $CubeUri" }
Write-Host "Endpoint: $(if ($Update) { $UpdateEndpoint } else { $QueryEndpoint })"
Write-Host ""

$AcceptHeader = switch ($Format) {
    "csv"  { "text/csv" }
    "json" { "application/sparql-results+json" }
    "xml"  { "application/sparql-results+xml" }
    default { "text/csv" }
}

$Headers = @{
    "Accept" = $AcceptHeader
    "Content-Type" = if ($Update) { "application/sparql-update" } else { "application/sparql-query" }
}

$TargetEndpoint = if ($Update) { $UpdateEndpoint } else { $QueryEndpoint }

try {
    $Response = Invoke-WebRequest -Uri $TargetEndpoint `
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
