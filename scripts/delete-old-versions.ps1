# PowerShell script to delete old cube versions (keeping newest 2)
# This script orchestrates the deletion process

param(
    [Parameter(Mandatory=$false)]
    [string]$Endpoint = "http://localhost:3030/lindas",

    [Parameter(Mandatory=$false)]
    [switch]$DryRun,

    [Parameter(Mandatory=$false)]
    [int]$ChunkSize = 100000
)

$ErrorActionPreference = "Stop"

$QueryEndpoint = "$Endpoint/query"
$UpdateEndpoint = "$Endpoint/update"

Write-Host "=============================================="
Write-Host "LINDAS Old Cube Version Deletion Script"
Write-Host "=============================================="
Write-Host "Query endpoint: $QueryEndpoint"
Write-Host "Update endpoint: $UpdateEndpoint"
Write-Host "Dry run: $DryRun"
Write-Host ""

# Step 1: Find cubes to delete
Write-Host "Step 1: Finding cube versions to delete..."

$FindQuery = @"
PREFIX cube: <https://cube.link/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?cubeToDelete ?rank
WHERE {
  {
    SELECT ?cube ?baseCube ?version (COUNT(DISTINCT ?newerCube) + 1 AS ?rank)
    WHERE {
      GRAPH <https://lindas.admin.ch/sfoe/cube> {
        ?cube a cube:Cube .
        BIND(REPLACE(STR(?cube), "^.*/([^/]+)/([0-9]+)$", "$2") AS ?versionStr)
        BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+$"), xsd:integer(?versionStr), 0) AS ?version)
        BIND(REPLACE(STR(?cube), "^(.*/[^/]+)/[0-9]+$", "$1") AS ?baseCubeStr)
        BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+$"), IRI(?baseCubeStr), ?cube) AS ?baseCube)

        OPTIONAL {
          ?newerCube a cube:Cube .
          BIND(REPLACE(STR(?newerCube), "^.*/([^/]+)/([0-9]+)$", "$2") AS ?newerVersionStr)
          BIND(IF(REGEX(STR(?newerCube), "^.*/[^/]+/[0-9]+$"), xsd:integer(?newerVersionStr), 0) AS ?newerVersion)
          BIND(REPLACE(STR(?newerCube), "^(.*/[^/]+)/[0-9]+$", "$1") AS ?newerBaseCubeStr)
          BIND(IF(REGEX(STR(?newerCube), "^.*/[^/]+/[0-9]+$"), IRI(?newerBaseCubeStr), ?newerCube) AS ?newerBaseCube)
          FILTER(?newerBaseCube = ?baseCube && ?newerVersion > ?version)
        }
      }
    }
    GROUP BY ?cube ?baseCube ?version
  }
  FILTER(?rank > 2)
  BIND(?cube AS ?cubeToDelete)
}
ORDER BY ?cubeToDelete
"@

$Headers = @{
    "Accept" = "application/sparql-results+json"
    "Content-Type" = "application/sparql-query"
}

try {
    $Response = Invoke-WebRequest -Uri $QueryEndpoint -Method POST -Headers $Headers -Body $FindQuery
    $Results = $Response.Content | ConvertFrom-Json

    $CubesToDelete = $Results.results.bindings | ForEach-Object {
        [PSCustomObject]@{
            Cube = $_.cubeToDelete.value
            Rank = $_.rank.value
        }
    }

    if ($CubesToDelete.Count -eq 0) {
        Write-Host "No cube versions to delete. All cubes have 2 or fewer versions."
        exit 0
    }

    Write-Host "Found $($CubesToDelete.Count) cube versions to delete:"
    $CubesToDelete | Format-Table -AutoSize

    if ($DryRun) {
        Write-Host ""
        Write-Host "DRY RUN - No changes will be made."
        Write-Host "Remove -DryRun flag to perform actual deletion."
        exit 0
    }

    # Step 2: Delete each cube
    Write-Host ""
    Write-Host "Step 2: Deleting cube versions..."

    foreach ($CubeInfo in $CubesToDelete) {
        $CubeUri = $CubeInfo.Cube
        Write-Host ""
        Write-Host "Deleting: $CubeUri (rank: $($CubeInfo.Rank))"

        # Delete observations in chunks
        $DeletedCount = 0
        do {
            $DeleteObsQuery = @"
PREFIX cube: <https://cube.link/>

WITH <https://lindas.admin.ch/sfoe/cube>
DELETE {
  ?observationS ?observationP ?observationO .
}
WHERE {
  BIND(<$CubeUri> AS ?cube)
  ?cube cube:observationSet ?set .
  ?set cube:observation ?observationS .
  ?observationS ?observationP ?observationO .
}
LIMIT $ChunkSize
"@

            $UpdateHeaders = @{
                "Content-Type" = "application/sparql-update"
            }

            $UpdateResponse = Invoke-WebRequest -Uri $UpdateEndpoint -Method POST -Headers $UpdateHeaders -Body $DeleteObsQuery

            # Check if any triples were deleted
            $CountQuery = @"
PREFIX cube: <https://cube.link/>
SELECT (COUNT(*) AS ?count) WHERE {
  GRAPH <https://lindas.admin.ch/sfoe/cube> {
    <$CubeUri> cube:observationSet ?set .
    ?set cube:observation ?obs .
  }
}
"@
            $CountResponse = Invoke-WebRequest -Uri $QueryEndpoint -Method POST -Headers $Headers -Body $CountQuery
            $CountResult = ($CountResponse.Content | ConvertFrom-Json).results.bindings[0].count.value

            Write-Host "  Remaining observations: $CountResult"

            if ([int]$CountResult -eq 0) { break }
            $DeletedCount++

        } while ($DeletedCount -lt 1000)  # Safety limit

        # Delete observation links
        Write-Host "  Deleting observation links..."
        $DeleteLinksQuery = @"
PREFIX cube: <https://cube.link/>
WITH <https://lindas.admin.ch/sfoe/cube>
DELETE { ?set cube:observation ?obs . }
WHERE {
  <$CubeUri> cube:observationSet ?set .
  ?set cube:observation ?obs .
}
"@
        Invoke-WebRequest -Uri $UpdateEndpoint -Method POST -Headers $UpdateHeaders -Body $DeleteLinksQuery | Out-Null

        # Delete metadata and shapes
        Write-Host "  Deleting metadata and shapes..."
        $DeleteMetaQuery = Get-Content "..\queries\09-delete-cube-metadata.rq" -Raw
        $DeleteMetaQuery = $DeleteMetaQuery -replace "CUBE_URI_HERE", $CubeUri
        Invoke-WebRequest -Uri $UpdateEndpoint -Method POST -Headers $UpdateHeaders -Body $DeleteMetaQuery | Out-Null

        Write-Host "  Deleted successfully!"
    }

    Write-Host ""
    Write-Host "=============================================="
    Write-Host "Deletion complete!"
    Write-Host "=============================================="

}
catch {
    Write-Error "Operation failed: $_"
    exit 1
}
