# Create distribution zip file
$source = $PSScriptRoot
$dest = Join-Path (Split-Path $source -Parent) "lindas-cube-cleanup-demo.zip"

# Remove existing zip
if (Test-Path $dest) { Remove-Item $dest }

# Create temp directory
$tempDir = Join-Path $env:TEMP "lindas-zip-temp"
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Path $tempDir | Out-Null

# Directories and files to exclude
$excludeDirs = @("node_modules", "backups", ".git", "fuseki", "web-app\backups")
$excludeFiles = @("nul", "*.tar.gz", "*.zip", "create-zip.ps1")

# Copy files
Get-ChildItem -Path $source -Recurse -Force | ForEach-Object {
    $relativePath = $_.FullName.Substring($source.Length + 1)

    # Check if should be excluded
    $skip = $false
    foreach ($d in $excludeDirs) {
        if ($relativePath -like "$d\*" -or $relativePath -eq $d) {
            $skip = $true
            break
        }
    }

    if (-not $skip) {
        foreach ($f in $excludeFiles) {
            if ($_.Name -like $f) {
                $skip = $true
                break
            }
        }
    }

    if (-not $skip) {
        $targetPath = Join-Path $tempDir $relativePath
        if ($_.PSIsContainer) {
            New-Item -ItemType Directory -Path $targetPath -Force -ErrorAction SilentlyContinue | Out-Null
        } else {
            $parentDir = Split-Path $targetPath -Parent
            if (-not (Test-Path $parentDir)) {
                New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
            }
            Copy-Item $_.FullName -Destination $targetPath -Force
        }
    }
}

# Create zip
Compress-Archive -Path (Join-Path $tempDir "*") -DestinationPath $dest -Force

# Cleanup
Remove-Item -Recurse -Force $tempDir

Write-Host "Created: $dest"
Write-Host "Size: $([math]::Round((Get-Item $dest).Length / 1MB, 2)) MB"
