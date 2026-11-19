# organize.ps1
# What's Reading 80A / 90B : rename + move into deploy layout
#   N-0M.html          -> chapter0N\reading0M.html
#   N-0M_audio\        -> chapter0N\reading0M_audio\
#   (90B only) N-0M-script.txt -> whatsreading-90b\
# Also rewrites "audioDir" inside each html so audio keeps working.

$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

$jobs = @(
    @{ Name = '80A'; Src = (Join-Path $base 'whatsreading-80a'); Dst = (Join-Path $base 'whatsreading-80a'); FixTitle = $false },
    @{ Name = '90B'; Src = $base;                                Dst = (Join-Path $base 'whatsreading-90b'); FixTitle = $true }
)

# ---------- 1) pre-check (nothing is changed if any problem is found) ----------
$problems = @()
foreach ($job in $jobs) {
    foreach ($c in 1..5) {
        foreach ($u in 1..4) {
            $old  = "$c-0$u"
            $srcH = Join-Path $job.Src "$old.html"
            $srcA = Join-Path $job.Src "${old}_audio"
            $dstD = Join-Path $job.Dst "chapter0$c"
            $dstH = Join-Path $dstD "reading0$u.html"
            $dstA = Join-Path $dstD "reading0${u}_audio"
            if (-not (Test-Path -LiteralPath $srcH)) { $problems += "[$($job.Name)] missing: $srcH" }
            if (-not (Test-Path -LiteralPath $srcA)) { $problems += "[$($job.Name)] missing: $srcA" }
            if (Test-Path -LiteralPath $dstH) { $problems += "[$($job.Name)] already exists: $dstH" }
            if (Test-Path -LiteralPath $dstA) { $problems += "[$($job.Name)] already exists: $dstA" }
        }
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
    foreach ($c in 1..5) {
        $dstD = Join-Path $job.Dst "chapter0$c"
        if (-not (Test-Path -LiteralPath $dstD)) { New-Item -ItemType Directory -Path $dstD | Out-Null }
        foreach ($u in 1..4) {
            $old  = "$c-0$u"
            $srcH = Join-Path $job.Src "$old.html"
            $srcA = Join-Path $job.Src "${old}_audio"
            $srcS = Join-Path $job.Src "$old-script.txt"
            $dstH = Join-Path $dstD "reading0$u.html"
            $dstA = Join-Path $dstD "reading0${u}_audio"

            Move-Item -LiteralPath $srcH -Destination $dstH
            Move-Item -LiteralPath $srcA -Destination $dstA

            $text = [System.IO.File]::ReadAllText($dstH, $utf8)
            $from = '"audioDir":"' + $old + '_audio"'
            $to   = '"audioDir":"reading0' + $u + '_audio"'
            if (-not $text.Contains($from)) { Write-Host "  WARN: audioDir not found in $dstH" -ForegroundColor Yellow }
            $text = $text.Replace($from, $to)
            if ($job.FixTitle) {
                $text = $text -replace "What's Reading 90B Ch(\d)-(\d\d)", 'What''s Reading 90 B Ch$1 Unit $2'
            }
            [System.IO.File]::WriteAllText($dstH, $text, $utf8)

            if ($job.Src -ne $job.Dst -and (Test-Path -LiteralPath $srcS)) {
                Move-Item -LiteralPath $srcS -Destination (Join-Path $job.Dst "$old-script.txt")
            }
            $moved++
            Write-Host "  $old  ->  chapter0$c\reading0$u"
        }
    }
}

# ---------- 3) verify ----------
Write-Host ""
Write-Host "=== verify ===" -ForegroundColor Cyan
$bad = 0
foreach ($job in $jobs) {
    foreach ($c in 1..5) {
        foreach ($u in 1..4) {
            $dstD = Join-Path $job.Dst "chapter0$c"
            $dstH = Join-Path $dstD "reading0$u.html"
            $text = [System.IO.File]::ReadAllText($dstH, $utf8)
            $m  = [regex]::Match($text, '"audioDir":"([^"]+)"')
            $cm = [regex]::Match($text, '"count":(\d+)')
            if (-not $m.Success) { Write-Host "  [$($job.Name)] ch$c-$u : audioDir not found" -ForegroundColor Red; $bad++; continue }
            $adir = Join-Path $dstD $m.Groups[1].Value
            if (-not (Test-Path -LiteralPath $adir)) { Write-Host "  [$($job.Name)] ch$c-$u : audio folder missing ($($m.Groups[1].Value))" -ForegroundColor Red; $bad++; continue }
            $mp3 = @(Get-ChildItem -LiteralPath $adir -Filter *.mp3).Count
            if ($cm.Success -and $mp3 -lt [int]$cm.Groups[1].Value) {
                Write-Host "  [$($job.Name)] ch$c-$u : mp3 $mp3 / expected $($cm.Groups[1].Value)" -ForegroundColor Yellow; $bad++
            }
        }
    }
}
Write-Host ""
if ($bad -eq 0) { Write-Host "DONE: $moved lessons moved, all checks OK." -ForegroundColor Green }
else            { Write-Host "DONE: $moved lessons moved, $bad item(s) need a look (see above)." -ForegroundColor Yellow }
