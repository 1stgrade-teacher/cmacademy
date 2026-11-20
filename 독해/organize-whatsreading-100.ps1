# organize-whatsreading-100.ps1
# What's Reading 100A / 100B : rename + move into deploy layout
#   N-0M-100a.html      -> whatsreading-100a\chapter0N\reading0M.html
#   N-0M-100a_audio\    -> whatsreading-100a\chapter0N\reading0M_audio\
#   N-0M-100a-script.txt -> whatsreading-100a\N-0M-script.txt
#   (same for 100b)
# Exception: 100A Ch2 Unit1 was split in two because the passage is long:
#   2-01-01 -> whatsreading-100a\chapter02\reading01-1.html (audio: reading01-1_audio)
#   2-01-02 -> whatsreading-100a\chapter02\reading01-2.html (audio: reading01-2_audio)
#   2-01-02 has "100B" in its title/cover by mistake; it is corrected to "100A".
# Also rewrites "audioDir" inside each html so audio keeps working.

$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

$jobs = @(
    @{ Name = '100A'; Suffix = '100a'; Dst = (Join-Path $base 'whatsreading-100a') },
    @{ Name = '100B'; Suffix = '100b'; Dst = (Join-Path $base 'whatsreading-100b') }
)

# returns list of @{Old; Name; C} for a job. Name = new base name (reading01, reading01-1 ...)
function Get-Items($job) {
    $items = @()
    foreach ($c in 1..5) {
        foreach ($u in 1..4) {
            if ($job.Suffix -eq '100a' -and $c -eq 2 -and $u -eq 1) {
                $items += @{ C = $c; Old = '2-01-01'; Name = 'reading01-1'; Fix100B = $false }
                $items += @{ C = $c; Old = '2-01-02'; Name = 'reading01-2'; Fix100B = $true }
            } else {
                $items += @{ C = $c; Old = "$c-0$u-$($job.Suffix)"; Name = "reading0$u"; Fix100B = $false }
            }
        }
    }
    return $items
}

# ---------- 1) pre-check (nothing is changed if any problem is found) ----------
$problems = @()
foreach ($job in $jobs) {
    if (-not (Test-Path -LiteralPath $job.Dst)) { $problems += "[$($job.Name)] missing folder: $($job.Dst)" }
    foreach ($it in (Get-Items $job)) {
        $old  = $it.Old
        $srcH = Join-Path $base "$old.html"
        $srcA = Join-Path $base "${old}_audio"
        $dstD = Join-Path $job.Dst ('chapter0' + $it.C)
        $dstH = Join-Path $dstD ($it.Name + '.html')
        $dstA = Join-Path $dstD ($it.Name + '_audio')
        if (-not (Test-Path -LiteralPath $srcH)) { $problems += "[$($job.Name)] missing: $srcH" }
        if (-not (Test-Path -LiteralPath $srcA)) { $problems += "[$($job.Name)] missing: $srcA" }
        if (Test-Path -LiteralPath $dstH) { $problems += "[$($job.Name)] already exists: $dstH" }
        if (Test-Path -LiteralPath $dstA) { $problems += "[$($job.Name)] already exists: $dstA" }
    }
}
if ($problems.Count -gt 0) {
    Write-Host "STOPPED - nothing was changed. Please fix the following:" -ForegroundColor Red
    $problems | ForEach-Object { Write-Host "  $_" }
    exit 1
}

# ---------- 2) move + rename + fix html ----------
$moved = 0
foreach ($job in $jobs) {
    Write-Host "=== $($job.Name) ===" -ForegroundColor Cyan
    foreach ($it in (Get-Items $job)) {
        $old  = $it.Old
        $srcH = Join-Path $base "$old.html"
        $srcA = Join-Path $base "${old}_audio"
        $srcS = Join-Path $base "$old-script.txt"
        $dstD = Join-Path $job.Dst ('chapter0' + $it.C)
        if (-not (Test-Path -LiteralPath $dstD)) { New-Item -ItemType Directory -Path $dstD | Out-Null }
        $dstH = Join-Path $dstD ($it.Name + '.html')
        $dstA = Join-Path $dstD ($it.Name + '_audio')

        Move-Item -LiteralPath $srcH -Destination $dstH
        Move-Item -LiteralPath $srcA -Destination $dstA

        $text = [System.IO.File]::ReadAllText($dstH, $utf8)
        $from = '"audioDir":"' + $old + '_audio"'
        $to   = '"audioDir":"' + $it.Name + '_audio"'
        if (-not $text.Contains($from)) { Write-Host "  WARN: audioDir not found in $dstH" -ForegroundColor Yellow }
        $text = $text.Replace($from, $to)
        if ($it.Fix100B) { $text = $text.Replace('100B', '100A') }
        [System.IO.File]::WriteAllText($dstH, $text, $utf8)

        if (Test-Path -LiteralPath $srcS) {
            Move-Item -LiteralPath $srcS -Destination (Join-Path $job.Dst "$old-script.txt")
        }
        $moved++
        Write-Host ("  {0}  ->  whatsreading-{1}\chapter0{2}\{3}" -f $old, $job.Suffix, $it.C, $it.Name)
    }
}

# ---------- 3) verify ----------
Write-Host ""
Write-Host "=== verify ===" -ForegroundColor Cyan
$bad = 0
foreach ($job in $jobs) {
    foreach ($it in (Get-Items $job)) {
        $dstD = Join-Path $job.Dst ('chapter0' + $it.C)
        $dstH = Join-Path $dstD ($it.Name + '.html')
        $text = [System.IO.File]::ReadAllText($dstH, $utf8)
        $m  = [regex]::Match($text, '"audioDir":"([^"]+)"')
        $cm = [regex]::Match($text, '"count":(\d+)')
        $tag = "[$($job.Name)] $($it.Old)"
        if (-not $m.Success) { Write-Host "  $tag : audioDir not found" -ForegroundColor Red; $bad++; continue }
        $adir = Join-Path $dstD $m.Groups[1].Value
        if (-not (Test-Path -LiteralPath $adir)) { Write-Host "  $tag : audio folder missing ($($m.Groups[1].Value))" -ForegroundColor Red; $bad++; continue }
        $mp3 = @(Get-ChildItem -LiteralPath $adir -Filter *.mp3).Count
        if ($cm.Success -and $mp3 -lt [int]$cm.Groups[1].Value) {
            Write-Host "  $tag : mp3 $mp3 / expected $($cm.Groups[1].Value)" -ForegroundColor Yellow; $bad++
        }
    }
}
Write-Host ""
if ($bad -eq 0) { Write-Host "DONE: $moved lessons moved, all checks OK." -ForegroundColor Green }
else            { Write-Host "DONE: $moved lessons moved, $bad item(s) need a look (see above)." -ForegroundColor Yellow }
