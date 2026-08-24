# ------------------------------------------------------------
# add-auto-list.ps1
#
# This script finds every index.html that sits directly inside a folder
# named 본문, 문법, or 듣기, and:
#   1. Replaces the old static unit-list block with a data-auto-list container.
#   2. Makes sure /auto-list.js is loaded (adds the script tag if missing).
#
# After running this once, uploading 1.html, 2.html, etc. into those
# folders is enough - the index page will show them automatically,
# with no further editing needed.
# ------------------------------------------------------------

$root = $PSScriptRoot
if ([string]::IsNullOrEmpty($root)) {
    $root = Get-Location
}

Write-Host "Search folder:" $root -ForegroundColor Cyan
Write-Host ""

$files = Get-ChildItem -Path $root -Recurse -Filter "index.html" -File

$updatedCount = 0
$skippedCount = 0

foreach ($file in $files) {
    $folderName = $file.Directory.Name

    $kind = $null
    $hasFull = "false"
    $maxN = 6

    if ($folderName -eq "본문") { $kind = "본문"; $hasFull = "true"; $maxN = 6 }
    elseif ($folderName -eq "문법") { $kind = "문법"; $hasFull = "false"; $maxN = 4 }
    elseif ($folderName -eq "듣기") { $kind = "듣기"; $hasFull = "false"; $maxN = 6 }
    else {
        continue
    }

    $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8

    if ($content -match 'data-auto-list') {
        Write-Host "Already converted, skipping:" $file.FullName -ForegroundColor Yellow
        $skippedCount++
        continue
    }

    # Replace everything from "<div class="unit-list" up to (but not including) "<footer"
    # This safely handles nested <div> tags inside the old placeholder block.
    $newBlock = '  <div class="unit-list compact" data-auto-list data-kind="' + $kind + '" data-full="' + $hasFull + '" data-max="' + $maxN + '"></div>' + "`r`n`r`n  "

    $pattern = '(?s)<div class="unit-list.*?(?=<footer)'
    if ($content -notmatch $pattern) {
        Write-Host "No unit-list block found, skipping:" $file.FullName -ForegroundColor Red
        continue
    }
    $evaluator = [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $newBlock }
    $newContent = [regex]::Replace($content, $pattern, $evaluator, 1)

    if ($newContent -notmatch 'auto-list\.js') {
        $newContent = $newContent -replace '(?i)</body>', ('  <script src="/auto-list.js" defer></script>' + "`r`n</body>")
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($file.FullName, $newContent, $utf8NoBom)
    Write-Host "Updated:" $file.FullName -ForegroundColor Green
    $updatedCount++
}

Write-Host ""
Write-Host "========================================"
Write-Host "Done."
Write-Host "Updated files:" $updatedCount
Write-Host "Already converted (skipped):" $skippedCount
Write-Host "========================================"
