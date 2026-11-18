# What's Reading 70A: move lecture files into chapterNN folders (deploy layout)
#   1-01.html          -> chapter01\reading01.html   (audioDir inside is updated)
#   1-01_audio\        -> chapter01\reading01_audio\
#   1-01-script.txt    -> _archive\script\chapter01_reading01_script.txt
# Safe to run twice. Nothing is deleted and nothing is overwritten.

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# archive folder name is "_" + Korean "bogwan" (built from char codes to keep this file ASCII-only)
$arch = '_' + [char]0xBCF4 + [char]0xAD00
$scriptDir = Join-Path (Join-Path $PSScriptRoot $arch) 'script'
New-Item -ItemType Directory -Force -Path $scriptDir | Out-Null

$utf8 = New-Object System.Text.UTF8Encoding($false)
$done = 0
$problems = New-Object System.Collections.ArrayList

foreach ($c in 1..5) {
  $chDir = 'chapter{0:00}' -f $c
  New-Item -ItemType Directory -Force -Path $chDir | Out-Null

  foreach ($r in 1..4) {
    $old = '{0}-{1:00}' -f $c, $r
    $new = 'reading{0:00}' -f $r

    # 1) HTML
    $srcHtml = "$old.html"
    $dstHtml = Join-Path $chDir "$new.html"
    if (Test-Path -LiteralPath $srcHtml) {
      if (Test-Path -LiteralPath $dstHtml) {
        [void]$problems.Add("SKIP (target exists): $dstHtml")
      } else {
        $txt = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot $srcHtml), $utf8)
        $from = '"audioDir":"' + $old + '_audio"'
        $to   = '"audioDir":"' + $new + '_audio"'
        if (-not $txt.Contains($from)) { [void]$problems.Add("WARN (audioDir not found, left as is): $srcHtml") }
        $txt = $txt.Replace($from, $to)
        [System.IO.File]::WriteAllText((Join-Path (Join-Path $PSScriptRoot $chDir) "$new.html"), $txt, $utf8)
        Remove-Item -LiteralPath $srcHtml
        $done++
      }
    } elseif (-not (Test-Path -LiteralPath $dstHtml)) {
      [void]$problems.Add("MISSING: $srcHtml")
    }

    # 2) audio folder
    $srcAudio = "${old}_audio"
    $dstAudio = Join-Path $chDir "${new}_audio"
    if (Test-Path -LiteralPath $srcAudio) {
      if (Test-Path -LiteralPath $dstAudio) {
        [void]$problems.Add("SKIP (target exists): $dstAudio")
      } else {
        Move-Item -LiteralPath $srcAudio -Destination $dstAudio
        $done++
      }
    }

    # 3) recording script
    $srcTxt = "$old-script.txt"
    $dstTxt = Join-Path $scriptDir ('chapter{0:00}_reading{1:00}_script.txt' -f $c, $r)
    if (Test-Path -LiteralPath $srcTxt) {
      if (Test-Path -LiteralPath $dstTxt) {
        [void]$problems.Add("SKIP (target exists): $dstTxt")
      } else {
        Move-Item -LiteralPath $srcTxt -Destination $dstTxt
        $done++
      }
    }
  }

  # folder placeholder is no longer needed once files are inside
  $keep = Join-Path $chDir '.gitkeep'
  if (Test-Path -LiteralPath $keep) { Remove-Item -LiteralPath $keep }
}

Write-Host ''
Write-Host "Done. Moved/updated $done items."
if ($problems.Count -gt 0) {
  Write-Host 'Notes:'
  $problems | ForEach-Object { Write-Host "  $_" }
} else {
  Write-Host 'No problems.'
}
