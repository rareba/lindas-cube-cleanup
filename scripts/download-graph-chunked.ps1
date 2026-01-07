# PowerShell script to download the SFOE cube graph in chunks
# Use this if the graph is too large for a single download

$ErrorActionPreference = "Stop"

# Configuration
$SparqlEndpoint = "https://ld.admin.ch/query"
$GraphUri = "https://lindas.admin.ch/sfoe/cube"
$OutputDir = "..\data"
$ChunkSize = 1000000  # Number of triples per chunk

# Create output directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

Write-Host "Downloading graph in chunks: $GraphUri"
Write-Host "Chunk size: $ChunkSize triples"

$Offset = 0
$ChunkNum = 1
$TotalTriples = 0

do {
    $OutputFile = "sfoe-cube-chunk-$ChunkNum.nt"
    $OutputPath = Join-Path $OutputDir $OutputFile

    Write-Host "Downloading chunk $ChunkNum (offset: $Offset)..."

    $Query = @"
CONSTRUCT { ?s ?p ?o }
WHERE {
  SELECT ?s ?p ?o
  WHERE {
    GRAPH <$GraphUri> { ?s ?p ?o }
  }
  ORDER BY ?s ?p ?o
  OFFSET $Offset
  LIMIT $ChunkSize
}
"@

    $Headers = @{
        "Accept" = "application/n-triples"
        "Content-Type" = "application/sparql-query"
    }

    try {
        Invoke-WebRequest -Uri $SparqlEndpoint `
            -Method POST `
            -Headers $Headers `
            -Body $Query `
            -OutFile $OutputPath `
            -TimeoutSec 1800

        $LineCount = (Get-Content $OutputPath -ErrorAction SilentlyContinue | Measure-Object -Line).Lines

        if ($LineCount -eq 0) {
            Remove-Item $OutputPath -ErrorAction SilentlyContinue
            Write-Host "No more data. Download complete."
            break
        }

        $TotalTriples += $LineCount
        Write-Host "  Downloaded $LineCount triples (total: $TotalTriples)"

        $Offset += $ChunkSize
        $ChunkNum++
    }
    catch {
        Write-Error "Chunk download failed: $_"
        break
    }

} while ($true)

# Merge chunks
Write-Host "Merging chunks..."
$MergedFile = Join-Path $OutputDir "sfoe-cube-merged.nt"
Get-Content (Join-Path $OutputDir "sfoe-cube-chunk-*.nt") | Set-Content $MergedFile

Write-Host "Total triples downloaded: $TotalTriples"
Write-Host "Merged file: $MergedFile"
