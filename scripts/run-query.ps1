# PowerShell script to run a SPARQL query against local or remote endpoint

param(
    [Parameter(Mandatory=$true)]
    [string]$QueryFile,

    [Parameter(Mandatory=$false)]
    [string]$Endpoint = "http://localhost:3030/lindas/query",

    [Parameter(Mandatory=$false)]
    [switch]$Update,

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

# Determine content type based on format
$AcceptHeader = switch ($Format) {
    "json" { "application/sparql-results+json" }
    "csv" { "text/csv" }
    "xml" { "application/sparql-results+xml" }
    "text" { "text/plain" }
    default { "application/sparql-results+json" }
}

if ($Update) {
    $Endpoint = $Endpoint -replace "/query$", "/update"
    Write-Host "Using UPDATE endpoint: $Endpoint"
}

$Headers = @{
    "Accept" = $AcceptHeader
    "Content-Type" = "application/sparql-query"
}

if ($Update) {
    $Headers["Content-Type"] = "application/sparql-update"
}

try {
    $Response = Invoke-WebRequest -Uri $Endpoint `
        -Method POST `
        -Headers $Headers `
        -Body $Query `
        -TimeoutSec 600

    $Response.Content
}
catch {
    Write-Error "Query failed: $_"
    if ($_.Exception.Response) {
        $Reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $ResponseBody = $Reader.ReadToEnd()
        Write-Host "Response: $ResponseBody"
    }
    exit 1
}
