# organize-sisakim-g2-l7-listening.ps1
# Middle-2 Sisa(Kim) Lesson 7, listening folder: rename to the deploy names auto-list.js looks for
#   Listen A1 -> 1, Listen A2 -> 2, B. Listen and Answer -> 3, Watch -> 4
#   <...>_AI(lecture).html -> N.html      <...>_audio\ -> N_audio\
#   <...>_(recording script).txt -> N-script.txt
#   <...>_(student dictation).pdf -> N_worksheet.pdf   <...>_(with answers).pdf -> N_worksheet-answers.pdf
# "audioDir" inside each html is rewritten. Nothing changes if the pre-check finds a problem.

$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

$items = @(
    @{ N = 1; Key = 'Listen A1' },
    @{ N = 2; Key = 'Listen A2' },
    @{ N = 3; Key = 'B. Listen and Answer' },
    @{ N = 4; Key = 'Watch' }
)

function Find-Items($it) {
    $pre  = '중2 시사(김) Lesson7 ' + $it.Key + '_'
    $apre = ('중2_시사(김)_Lesson7_' + $it.Key + '_').Replace(' ', '_')
    $files = @(Get-ChildItem -LiteralPath $base -File | Where-Object { $_.Name.StartsWith($pre) })
    return @{
        Html = @($files | Where-Object { $_.Extension -eq '.html' -and $_.Name -ne 'index.html' })
        Txt  = @($files | Where-Object { $_.Extension -eq '.txt' })
        Ans  = @($files | Where-Object { $_.Extension -eq '.pdf' -and $_.Name.Contains('정답포함') })
        Ws   = @($files | Where-Object { $_.Extension -eq '.pdf' -and $_.Name.Contains('학생용') })
        Aud  = @(Get-ChildItem -LiteralPath $base -Directory | Where-Object { $_.Name -eq ($apre + 'audio') })
    }
}

$problems = @()
foreach ($it in $items) {
    $f = Find-Items $it; $n = $it.N; $tag = "[$($it.Key)]"
    if ($f.Html.Count -ne 1) { $problems += "$tag html found = $($f.Html.Count) (need 1)" }
    if ($f.Aud.Count  -ne 1) { $problems += "$tag audio folder found = $($f.Aud.Count) (need 1)" }
    if ($f.Txt.Count -gt 1 -or $f.Ans.Count -gt 1 -or $f.Ws.Count -gt 1) { $problems += "$tag more than one txt/pdf matched" }
    foreach ($name in "$n.html", "${n}_audio", "$n-script.txt", "${n}_worksheet.pdf", "${n}_worksheet-answers.pdf") {
        if (Test-Path -LiteralPath (Join-Path $base $name)) { $problems += "$tag already exists: $name" }
    }
}
if ($problems.Count -gt 0) {
    Write-Host "STOPPED - nothing was changed. Please fix the following:" -ForegroundColor Red
    $problems | ForEach-Object { Write-Host "  $_" }
    exit 1
}

foreach ($it in $items) {
    $f = Find-Items $it; $n = $it.N
    Rename-Item -LiteralPath $f.Html[0].FullName -NewName "$n.html"
    Rename-Item -LiteralPath $f.Aud[0].FullName  -NewName "${n}_audio"
    if ($f.Txt.Count -eq 1) { Rename-Item -LiteralPath $f.Txt[0].FullName -NewName "$n-script.txt" }
    if ($f.Ws.Count  -eq 1) { Rename-Item -LiteralPath $f.Ws[0].FullName  -NewName "${n}_worksheet.pdf" }
    if ($f.Ans.Count -eq 1) { Rename-Item -LiteralPath $f.Ans[0].FullName -NewName "${n}_worksheet-answers.pdf" }
    $h = Join-Path $base "$n.html"
    $text = [System.IO.File]::ReadAllText($h, $utf8)
    $new = [regex]::Replace($text, '"audioDir":"[^"]*"', ('"audioDir":"' + $n + '_audio"'))
    if ($new -eq $text) { Write-Host "  WARN: audioDir not changed in $h" -ForegroundColor Yellow }
    [System.IO.File]::WriteAllText($h, $new, $utf8)
    Write-Host "  $($it.Key)  ->  $n.html, ${n}_audio, $n-script.txt, ${n}_worksheet(.pdf / -answers.pdf)"
}

$bad = 0
foreach ($it in $items) {
    $n = $it.N
    $text = [System.IO.File]::ReadAllText((Join-Path $base "$n.html"), $utf8)
    $m  = [regex]::Match($text, '"audioDir":"([^"]+)"')
    $cm = [regex]::Match($text, '"count":(\d+)')
    $adir = Join-Path $base $m.Groups[1].Value
    if (-not $m.Success -or -not (Test-Path -LiteralPath $adir)) { Write-Host "  [$($it.Key)] audio folder problem" -ForegroundColor Red; $bad++; continue }
    $mp3 = @(Get-ChildItem -LiteralPath $adir -Filter *.mp3).Count
    if ($cm.Success -and $mp3 -lt [int]$cm.Groups[1].Value) { Write-Host "  [$($it.Key)] mp3 $mp3 / expected $($cm.Groups[1].Value)" -ForegroundColor Yellow; $bad++ }
}
if ($bad -eq 0) { Write-Host "DONE: 4 listening lectures renamed, all checks OK." -ForegroundColor Green }
else            { Write-Host "DONE: 4 renamed, $bad item(s) need a look (see above)." -ForegroundColor Yellow }
