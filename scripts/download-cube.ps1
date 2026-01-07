# PowerShell script to download a single cube for testing
param(
    [Parameter(Mandatory=$true)]
    [string]$CubeUri,

    [Parameter(Mandatory=$false)]
    [string]$OutputDir = "..\data\cubes"
)

$ErrorActionPreference = "Stop"

$SparqlEndpoint = "https://ld.admin.ch/query"
$GraphUri = "https://lindas.admin.ch/sfoe/cube"

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Extract cube name for filename
$CubeName = $CubeUri -replace ".*/(.*)", '$1' -replace "/", "_"
$OutputFile = Join-Path $OutputDir "$CubeName.nt"

Write-Host "Downloading cube: $CubeUri"
Write-Host "Output: $OutputFile"

$Query = @"
PREFIX cube: <https://cube.link/>
PREFIX sh: <http://www.w3.org/ns/shacl#>

CONSTRUCT {
  ?cube ?p1 ?o1 .
  ?o1 ?p2 ?o2 .
  ?shape ?shapeP ?shapeO .
  ?propertyS ?propertyP ?propertyO .
  ?set ?setP ?setO .
  ?obs ?obsP ?obsO .
}
WHERE {
  GRAPH <$GraphUri> {
    BIND(<$CubeUri> AS ?cube)
    ?cube a cube:Cube .

    {
      ?cube ?p1 ?o1 .
      OPTIONAL {
        ?o1 ?p2 ?o2 .
        FILTER(isBlank(?o1))
      }
    }
    UNION
    {
      ?cube cube:observationConstraint ?shape .
      ?shape ?shapeP ?shapeO .
    }
    UNION
    {
      ?cube cube:observationConstraint/sh:property ?property .
      ?property (<>|!<>)* ?propertyS .
      ?propertyS ?propertyP ?propertyO .
    }
    UNION
    {
      ?cube cube:observationSet ?set .
      ?set ?setP ?setO .
    }
    UNION
    {
      ?cube cube:observationSet ?set .
      ?set cube:observation ?obs .
      ?obs ?obsP ?obsO .
    }
  }
}
"@

try {
    Invoke-WebRequest -Uri $SparqlEndpoint `
        -Method POST `
        -Headers @{
            "Accept" = "application/n-triples"
            "Content-Type" = "application/sparql-query"
        } `
        -Body $Query `
        -OutFile $OutputFile `
        -TimeoutSec 300

    if (Test-Path $OutputFile) {
        $LineCount = (Get-Content $OutputFile | Measure-Object -Line).Lines
        $FileSize = (Get-Item $OutputFile).Length / 1KB
        Write-Host "Downloaded $LineCount triples ($([math]::Round($FileSize, 2)) KB)"
    }
}
catch {
    Write-Error "Download failed: $_"
    exit 1
}
