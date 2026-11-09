$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
$ok=0;$skip=0
function Mv($src,$dst){
  $s = Join-Path $root $src; $d = Join-Path $root $dst
  if(-not (Test-Path -LiteralPath $s)){ Write-Host "[없음]   $src" -ForegroundColor Yellow; $script:skip++; return }
  if(Test-Path -LiteralPath $d){ Write-Host "[건너뜀] 이미 있음: $dst" -ForegroundColor Yellow; $script:skip++; return }
  Move-Item -LiteralPath $s -Destination $d; Write-Host "[완료]   $dst" -ForegroundColor Green; $script:ok++ }
function FixHtml($rel,$audio){
  $p = Join-Path $root $rel
  if(-not (Test-Path -LiteralPath $p)){ return }
  $t = [IO.File]::ReadAllText($p,$utf8)
  $n = [regex]::Replace($t,'"audioDir":"[^"]*"','"audioDir":"' + $audio + '"')
  if($n -ne $t){ [IO.File]::WriteAllText($p,$n,$utf8); Write-Host "[경로수정] $rel -> $audio" -ForegroundColor Cyan }
}

Mv 'g1-7-1.html' '1.html'
Mv 'g1-7-1_audio' '1_audio'
Mv 'g1-7-1-script.txt' '1-script.txt'
FixHtml '1.html' '1_audio'
Mv 'g1-7-2.html' '2.html'
Mv 'g1-7-2_audio' '2_audio'
Mv 'g1-7-2-script.txt' '2-script.txt'
FixHtml '2.html' '2_audio'
Write-Host ""
Write-Host "이동 $ok개, 건너뜀 $skip개"
