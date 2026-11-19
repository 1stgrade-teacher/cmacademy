# whatsreading-70b: 1-01.html -> chapter01/reading01.html (audio folder and audioDir updated too)
$ErrorActionPreference = 'Stop'
$base = (Get-ChildItem -Path $PSScriptRoot -Directory -Recurse -Filter 'whatsreading-70b' | Select-Object -First 1).FullName
if (-not $base) { Write-Host 'whatsreading-70b folder not found'; exit 1 }
Write-Host "Target: $base"
$utf8 = New-Object System.Text.UTF8Encoding($false)
$done = 0
foreach ($f in Get-ChildItem -Path $base -File -Filter '*.html') {
  $m = [regex]::Match($f.Name, '^(\d)-(\d\d)\.html$')
  if (-not $m.Success) { continue }
  $c = $m.Groups[1].Value; $u = $m.Groups[2].Value
  $dest = Join-Path $base "chapter0$c"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  $newHtml = Join-Path $dest "reading$u.html"
  $newAudio = Join-Path $dest "reading${u}_audio"
  $oldAudio = Join-Path $base "$c-${u}_audio"
  if ((Test-Path $newHtml) -or (Test-Path $newAudio)) { Write-Host "SKIP (already exists): chapter0$c/reading$u"; continue }
  $text = [IO.File]::ReadAllText($f.FullName, $utf8)
  $text = $text.Replace("$c-${u}_audio", "reading${u}_audio")
  [IO.File]::WriteAllText($newHtml, $text, $utf8)
  if (Test-Path $oldAudio) { Move-Item -LiteralPath $oldAudio -Destination $newAudio }
  Remove-Item -LiteralPath $f.FullName
  Write-Host "OK: $($f.Name) -> chapter0$c/reading$u.html"
  $done++
}
Write-Host "Done: $done units. (N-MM-script.txt files were left in place.)"
