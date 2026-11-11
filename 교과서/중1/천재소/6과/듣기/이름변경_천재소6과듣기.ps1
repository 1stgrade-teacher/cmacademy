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

Mv '중1 천재(소) 6과 대화문 A1_AI강의.html' '1.html'
Mv '중1_천재(소)_6과_대화문_A1_audio' '1_audio'
Mv '중1 천재(소) 6과 대화문 A1_녹음대본.txt' '1-script.txt'
Mv '중1 천재(소) 6과 대화문 A1_학생용_받아쓰기.pdf' '1_dictation.pdf'
Mv '중1 천재(소) 6과 대화문 A1_정답포함.pdf' '1_dictation-answers.pdf'
FixHtml '1.html' '1_audio'
Mv '중1 천재(소) 6과 대화문 A2_AI강의.html' '2.html'
Mv '중1_천재(소)_6과_대화문_A2_audio' '2_audio'
Mv '중1 천재(소) 6과 대화문 A2_녹음대본.txt' '2-script.txt'
Mv '중1 천재(소) 6과 대화문 A2_학생용_받아쓰기.pdf' '2_dictation.pdf'
Mv '중1 천재(소) 6과 대화문 A2_정답포함.pdf' '2_dictation-answers.pdf'
FixHtml '2.html' '2_audio'
Mv '중1 천재(소) 6과 대화문 A3_AI강의.html' '3.html'
Mv '중1_천재(소)_6과_대화문_A3_audio' '3_audio'
Mv '중1 천재(소) 6과 대화문 A3_녹음대본.txt' '3-script.txt'
Mv '중1 천재(소) 6과 대화문 A3_학생용_받아쓰기.pdf' '3_dictation.pdf'
Mv '중1 천재(소) 6과 대화문 A3_정답포함.pdf' '3_dictation-answers.pdf'
FixHtml '3.html' '3_audio'
Mv '중1 천재(소) 6과 대화문 B_AI강의.html' '4.html'
Mv '중1_천재(소)_6과_대화문_B_audio' '4_audio'
Mv '중1 천재(소) 6과 대화문 B_녹음대본.txt' '4-script.txt'
Mv '중1 천재(소) 6과 대화문 B_학생용_받아쓰기.pdf' '4_dictation.pdf'
Mv '중1 천재(소) 6과 대화문 B_정답포함.pdf' '4_dictation-answers.pdf'
FixHtml '4.html' '4_audio'
Write-Host ""
Write-Host "이동 $ok개, 건너뜀 $skip개"
