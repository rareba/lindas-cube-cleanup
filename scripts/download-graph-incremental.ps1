# PowerShell script to download SFOE graph in incremental chunks
# Uses OFFSET/LIMIT to avoid timeouts

$ErrorActionPreference = "Stop"

$SparqlEndpoint = "https://ld.admin.ch/query"
$GraphUri = "https://lindas.admin.ch/sfoe/cube"
$OutputDir = "..\data"
$ChunkSize = 500000  # 500k triples per chunk

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

Write-Host "Downloading graph in chunks: $GraphUri"
Write-Host "Chunk size: $ChunkSize triples"
Write-Host ""

$Offset = 0
$ChunkNum = 1
$TotalTriples = 0
$OutputFile = Join-Path $OutputDir "sfoe-cube-complete.nt"

# Clear output file if exists
if (Test-Path $OutputFile) {
    Remove-Item $OutputFile
}

do {
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

    $TempFile = Join-Path $OutputDir "chunk-$ChunkNum.nt"

    try {
        $Response = Invoke-WebRequest -Uri $SparqlEndpoint `
            -Method POST `
            -Headers @{
                "Accept" = "application/n-triples"
                "Content-Type" = "application/sparql-query"
            } `
            -Body $Query `
            -OutFile $TempFile `
            -TimeoutSec 600

        if (Test-Path $TempFile) {
            $LineCount = (Get-Content $TempFile -ErrorAction SilentlyContinue | Measure-Object -Line).Lines

            if ($LineCount -eq 0) {
                Remove-Item $TempFile -ErrorAction SilentlyContinue
                Write-Host "No more data. Download complete."
                break
            }

            # Append to main file
            Get-Content $TempFile | Add-Content $OutputFile
            Remove-Item $TempFile

            $TotalTriples += $LineCount
            Write-Host "  Downloaded $LineCount triples (total: $TotalTriples)"

            $Offset += $ChunkSize
            $ChunkNum++
        }
    }
    catch {
        Write-Error "Chunk download failed: $_"
        break
    }

} while ($true)

Write-Host ""
Write-Host "Download complete!"
Write-Host "Total triples: $TotalTriples"
Write-Host "Output file: $OutputFile"
