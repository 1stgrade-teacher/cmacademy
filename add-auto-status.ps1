# ------------------------------------------------------------
# add-auto-status.ps1
# Finds every index.html file in this folder (and all subfolders)
# and inserts a <script> tag that loads auto-status.js
# right before the closing </body> tag, if it is not already there.
# ------------------------------------------------------------

$root = $PSScriptRoot
if ([string]::IsNullOrEmpty($root)) {
    $root = Get-Location
}

Write-Host "Search folder: $root" -ForegroundColor Cyan
Write-Host ""

$files = Get-ChildItem -Path $root -Recurse -Filter "index.html" -File

Write-Host "Found index.html files:" $files.Count -ForegroundColor Cyan
Write-Host ""

$scriptTag = '  <script src="/auto-status.js" defer></script>'

$updatedCount = 0
$skippedCount = 0
$notFoundCount = 0

foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8

    if ($content -match 'auto-status\.js') {
        Write-Host "Already applied, skipping:" $file.FullName -ForegroundColor Yellow
        $skippedCount++
        continue
    }

    if ($content -match '(?i)</body>') {
        $newContent = $content -replace '(?i)</body>', ($scriptTag + "`r`n</body>")
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($file.FullName, $newContent, $utf8NoBom)
        Write-Host "Updated:" $file.FullName -ForegroundColor Green
        $updatedCount++
    } else {
        Write-Host "No closing body tag, skipping:" $file.FullName -ForegroundColor Red
        $notFoundCount++
    }
}

Write-Host ""
Write-Host "========================================"
Write-Host "Done."
Write-Host "Updated files:" $updatedCount
Write-Host "Already applied (skipped):" $skippedCount
Write-Host "Problem files (skipped):" $notFoundCount
Write-Host "========================================"
