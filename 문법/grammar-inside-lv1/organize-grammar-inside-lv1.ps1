# organize-grammar-inside-lv1.ps1
# Grammar Inside Lv.1 : rename + move lecture files into the deploy layout that index.html expects
#   ChCC-UU <title>_AI(lecture).html   -> chapterCC\unitUU\lecture.html
#   ChCC-UU_<title>_audio\             -> chapterCC\unitUU\lecture_audio\
#   ChCC-UU <title>_(script).txt       -> chapterCC\unitUU\lecture-script.txt
# Also rewrites "audioDir" inside each html so audio keeps working.
# Nothing is changed if the pre-check finds any problem.

$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

# units per chapter (matches index.html): ch1..ch12
$units = @(2,4,2,2,3,2,3,3,3,3,3,5)

function Find-Items($c, $u) {
    $key = ('Ch{0:00}-{1:00}' -f $c, $u)
    $html = @(Get-ChildItem -LiteralPath $base -File -Filter '*.html' | Where-Object { $_.Name.StartsWith($key + ' ') })
    $txt  = @(Get-ChildItem -LiteralPath $base -File -Filter '*.txt'  | Where-Object { $_.Name.StartsWith($key + ' ') })
    $aud  = @(Get-ChildItem -LiteralPath $base -Directory | Where-Object { $_.Name.StartsWith($key + '_') -and $_.Name.EndsWith('_audio') })
    return @{ Key = $key; Html = $html; Txt = $txt; Aud = $aud }
}

# ---------- 1) pre-check ----------
$problems = @()
for ($c = 1; $c -le $units.Count; $c++) {
    for ($u = 1; $u -le $units[$c-1]; $u++) {
        $it = Find-Items $c $u
        $dstD = Join-Path $base ('chapter{0:00}\unit{1:00}' -f $c, $u)
        if ($it.Html.Count -ne 1) { $problems += "$($it.Key): html files found = $($it.Html.Count) (need 1)" }
        if ($it.Aud.Count  -ne 1) { $problems += "$($it.Key): audio folders found = $($it.Aud.Count) (need 1)" }
        if ($it.Txt.Count  -gt 1) { $problems += "$($it.Key): txt files found = $($it.Txt.Count) (need 0 or 1)" }
        foreach ($n in 'lecture.html','lecture_audio','lecture-script.txt') {
            if (Test-Path -LiteralPath (Join-Path $dstD $n)) { $problems += "$($it.Key): already exists: $dstD\$n" }
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
for ($c = 1; $c -le $units.Count; $c++) {
    for ($u = 1; $u -le $units[$c-1]; $u++) {
        $it = Find-Items $c $u
        $dstD = Join-Path $base ('chapter{0:00}\unit{1:00}' -f $c, $u)
        New-Item -ItemType Directory -Force -Path $dstD | Out-Null
        $dstH = Join-Path $dstD 'lecture.html'
        $dstA = Join-Path $dstD 'lecture_audio'

        $oldAudioName = $it.Aud[0].Name
        Move-Item -LiteralPath $it.Html[0].FullName -Destination $dstH
        Move-Item -LiteralPath $it.Aud[0].FullName  -Destination $dstA
        if ($it.Txt.Count -eq 1) { Move-Item -LiteralPath $it.Txt[0].FullName -Destination (Join-Path $dstD 'lecture-script.txt') }

        $text = [System.IO.File]::ReadAllText($dstH, $utf8)
        $before = $text
        $text = [regex]::Replace($text, '"audioDir":"[^"]*"', '"audioDir":"lecture_audio"')
        if ($text -eq $before) { Write-Host "  WARN: audioDir not changed in $dstH" -ForegroundColor Yellow }
        [System.IO.File]::WriteAllText($dstH, $text, $utf8)

        $moved++
        Write-Host ("  {0}  ->  chapter{1:00}\unit{2:00}\lecture" -f $it.Key, $c, $u)
    }
}

# ---------- 3) verify ----------
Write-Host ""
Write-Host "=== verify ===" -ForegroundColor Cyan
$bad = 0
for ($c = 1; $c -le $units.Count; $c++) {
    for ($u = 1; $u -le $units[$c-1]; $u++) {
        $dstD = Join-Path $base ('chapter{0:00}\unit{1:00}' -f $c, $u)
        $dstH = Join-Path $dstD 'lecture.html'
        $text = [System.IO.File]::ReadAllText($dstH, $utf8)
        $m  = [regex]::Match($text, '"audioDir":"([^"]+)"')
        $cm = [regex]::Match($text, '"count":(\d+)')
        if (-not $m.Success) { Write-Host "  ch$c-$u : audioDir not found" -ForegroundColor Red; $bad++; continue }
        $adir = Join-Path $dstD $m.Groups[1].Value
        if (-not (Test-Path -LiteralPath $adir)) { Write-Host "  ch$c-$u : audio folder missing" -ForegroundColor Red; $bad++; continue }
        $mp3 = @(Get-ChildItem -LiteralPath $adir -Filter *.mp3).Count
        if ($cm.Success -and $mp3 -lt [int]$cm.Groups[1].Value) {
            Write-Host "  ch$c-$u : mp3 $mp3 / expected $($cm.Groups[1].Value)" -ForegroundColor Yellow; $bad++
        }
    }
}
Write-Host ""
if ($bad -eq 0) { Write-Host "DONE: $moved lectures moved, all checks OK." -ForegroundColor Green }
else            { Write-Host "DONE: $moved lectures moved, $bad item(s) need a look (see above)." -ForegroundColor Yellow }
