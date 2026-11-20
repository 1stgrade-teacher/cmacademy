# organize-sisakim-g2-grammar.ps1
# Chungmyeong middle-2 (Sisa Kim) lessons 7 and 8, grammar folder: rename into the deploy names
# that each grammar\index.html looks for (same layout as lesson 6):
#   <...> 7 <...> 1 <title>_AI(lecture).html   -> 1.html
#   <...>_audio\ (folder)                      -> 1_audio\
#   <...>_(recording script).txt               -> 1-script.txt
#   <...>_(student dictation).pdf              -> 1_worksheet.pdf          (button "worksheet")
#   <...>_(with answers).pdf                   -> 1_worksheet-answers.pdf  (button "with answers")
# and the same for grammar 2. "audioDir" inside each html is rewritten so audio keeps working.
# Nothing is changed if the pre-check finds a problem.

$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

$lessons = @(7, 8)
$points  = @(1, 2)
$gwa  = [string][char]0xACFC   # the character after the lesson number
$beop = '문법'

function Get-Dir($L) { return (Join-Path $base ("$L" + $gwa + '\' + $beop)) }

function Find-Items($L, $n) {
    $dir = Get-Dir $L
    $key = "중2 시사(김) $L$gwa $beop$n "
    $akey = "중2_시사(김)_$L$($gwa)_$beop$($n)_"
    $files = @(Get-ChildItem -LiteralPath $dir -File | Where-Object { $_.Name.StartsWith($key) })
    $dirs  = @(Get-ChildItem -LiteralPath $dir -Directory | Where-Object { $_.Name.StartsWith($akey) -and $_.Name.EndsWith('_audio') })
    return @{
        Dir  = $dir
        Html = @($files | Where-Object { $_.Extension -eq '.html' })
        Txt  = @($files | Where-Object { $_.Extension -eq '.txt' })
        Ans  = @($files | Where-Object { $_.Extension -eq '.pdf' -and $_.Name.Contains('정답포함') })
        Ws   = @($files | Where-Object { $_.Extension -eq '.pdf' -and $_.Name.Contains('학생용') })
        Aud  = $dirs
    }
}

# ---------- 1) pre-check ----------
$problems = @(); $warns = @()
foreach ($L in $lessons) {
    if (-not (Test-Path -LiteralPath (Get-Dir $L))) { $problems += "missing folder: $(Get-Dir $L)"; continue }
    foreach ($n in $points) {
        $it = Find-Items $L $n
        $tag = "L$L-grammar$n"
        if ($it.Html.Count -ne 1) { $problems += "${tag}: html files found = $($it.Html.Count) (need 1)" }
        if ($it.Aud.Count  -ne 1) { $problems += "${tag}: audio folders found = $($it.Aud.Count) (need 1)" }
        if ($it.Txt.Count -gt 1 -or $it.Ans.Count -gt 1 -or $it.Ws.Count -gt 1) { $problems += "${tag}: more than one txt/pdf matched" }
        if ($it.Txt.Count -eq 0) { $warns += "${tag}: no recording script (.txt) found - skipped" }
        if ($it.Ws.Count  -eq 0) { $warns += "${tag}: no student worksheet pdf found - skipped" }
        if ($it.Ans.Count -eq 0) { $warns += "${tag}: no answers pdf found - skipped" }
        foreach ($name in "$n.html", "${n}_audio", "$n-script.txt", "${n}_worksheet.pdf", "${n}_worksheet-answers.pdf") {
            if (Test-Path -LiteralPath (Join-Path $it.Dir $name)) { $problems += "${tag}: already exists: $(Join-Path $it.Dir $name)" }
        }
    }
}
if ($problems.Count -gt 0) {
    Write-Host "STOPPED - nothing was changed. Please fix the following:" -ForegroundColor Red
    $problems | ForEach-Object { Write-Host "  $_" }
    exit 1
}
$warns | ForEach-Object { Write-Host "  note: $_" -ForegroundColor Yellow }

# ---------- 2) rename + fix html ----------
$done = 0
foreach ($L in $lessons) {
    Write-Host "=== lesson $L ===" -ForegroundColor Cyan
    foreach ($n in $points) {
        $it = Find-Items $L $n
        $dir = $it.Dir
        Rename-Item -LiteralPath $it.Html[0].FullName -NewName "$n.html"
        Rename-Item -LiteralPath $it.Aud[0].FullName  -NewName "${n}_audio"
        if ($it.Txt.Count -eq 1) { Rename-Item -LiteralPath $it.Txt[0].FullName -NewName "$n-script.txt" }
        if ($it.Ws.Count  -eq 1) { Rename-Item -LiteralPath $it.Ws[0].FullName  -NewName "${n}_worksheet.pdf" }
        if ($it.Ans.Count -eq 1) { Rename-Item -LiteralPath $it.Ans[0].FullName -NewName "${n}_worksheet-answers.pdf" }

        $h = Join-Path $dir "$n.html"
        $text = [System.IO.File]::ReadAllText($h, $utf8)
        $new = [regex]::Replace($text, '"audioDir":"[^"]*"', ('"audioDir":"' + $n + '_audio"'))
        if ($new -eq $text) { Write-Host "  WARN: audioDir not changed in $h" -ForegroundColor Yellow }
        [System.IO.File]::WriteAllText($h, $new, $utf8)
        $done++
        Write-Host "  lesson $L grammar $n  ->  $n.html, ${n}_audio, $n-script.txt, ${n}_worksheet(.pdf / -answers.pdf)"
    }
}

# ---------- 3) verify ----------
Write-Host ""
Write-Host "=== verify ===" -ForegroundColor Cyan
$bad = 0
foreach ($L in $lessons) {
    foreach ($n in $points) {
        $dir = Get-Dir $L
        $h = Join-Path $dir "$n.html"
        $text = [System.IO.File]::ReadAllText($h, $utf8)
        $m  = [regex]::Match($text, '"audioDir":"([^"]+)"')
        $cm = [regex]::Match($text, '"count":(\d+)')
        $tag = "L$L-grammar$n"
        if (-not $m.Success) { Write-Host "  $tag : audioDir not found" -ForegroundColor Red; $bad++; continue }
        $adir = Join-Path $dir $m.Groups[1].Value
        if (-not (Test-Path -LiteralPath $adir)) { Write-Host "  $tag : audio folder missing" -ForegroundColor Red; $bad++; continue }
        $mp3 = @(Get-ChildItem -LiteralPath $adir -Filter *.mp3).Count
        if ($cm.Success -and $mp3 -lt [int]$cm.Groups[1].Value) {
            Write-Host "  $tag : mp3 $mp3 / expected $($cm.Groups[1].Value)" -ForegroundColor Yellow; $bad++
        }
    }
}
Write-Host ""
if ($bad -eq 0) { Write-Host "DONE: $done grammar lectures renamed, all checks OK." -ForegroundColor Green }
else            { Write-Host "DONE: $done grammar lectures renamed, $bad item(s) need a look (see above)." -ForegroundColor Yellow }
