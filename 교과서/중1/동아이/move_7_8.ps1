$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
$ok=0;$skip=0
function Mv($src,$dst){
  $s = Join-Path $root $src; $d = Join-Path $root $dst
  if(-not (Test-Path -LiteralPath $s)){ Write-Host "[없음]   $src" -ForegroundColor Yellow; $script:skip++; return }
  if(Test-Path -LiteralPath $d){ Write-Host "[건너뜀] 이미 있음: $dst" -ForegroundColor Yellow; $script:skip++; return }
  Move-Item -LiteralPath $s -Destination $d; Write-Host "[완료]   $dst" -ForegroundColor Green; $script:ok++ }

Mv '중1 동아(이) 7과 문법1 비교급_AI강의.html' '7과\문법\1.html'
Mv '중1_동아(이)_7과_문법1_비교급_audio' '7과\문법\1_audio'
Mv '중1 동아(이) 7과 문법1 비교급_녹음대본.txt' '7과\문법\1-script.txt'
Mv '중1 동아(이) 7과 문법1 비교급_학생용_받아쓰기.pdf' '7과\문법\1_worksheet.pdf'
Mv '중1 동아(이) 7과 문법1 비교급_정답포함.pdf' '7과\문법\1_worksheet-answers.pdf'
Mv '중1 동아(이) 7과 문법2 접속사 when_AI강의.html' '7과\문법\2.html'
Mv '중1_동아(이)_7과_문법2_접속사_when_audio' '7과\문법\2_audio'
Mv '중1 동아(이) 7과 문법2 접속사 when_녹음대본.txt' '7과\문법\2-script.txt'
Mv '중1 동아(이) 7과 문법2 접속사 when_학생용_받아쓰기.pdf' '7과\문법\2_worksheet.pdf'
Mv '중1 동아(이) 7과 문법2 접속사 when_정답포함.pdf' '7과\문법\2_worksheet-answers.pdf'
Mv '중1 동아(이) 7과 Topic 1   A-1_AI강의.html' '7과\듣기\1.html'
Mv '중1_동아(이)_7과_Topic_1_A-1_audio' '7과\듣기\1_audio'
Mv '중1 동아(이) 7과 Topic 1   A-1_녹음대본.txt' '7과\듣기\1-script.txt'
Mv '중1 동아(이) 7과 Topic 1   A-1_학생용_받아쓰기.pdf' '7과\듣기\1_worksheet.pdf'
Mv '중1 동아(이) 7과 Topic 1   A-1_정답포함.pdf' '7과\듣기\1_worksheet-answers.pdf'
Mv '중1 동아(이) 7과 Topic 1   A-2_AI강의.html' '7과\듣기\2.html'
Mv '중1_동아(이)_7과_Topic_1_A-2_audio' '7과\듣기\2_audio'
Mv '중1 동아(이) 7과 Topic 1   A-2_녹음대본.txt' '7과\듣기\2-script.txt'
Mv '중1 동아(이) 7과 Topic 1   A-2_학생용_받아쓰기.pdf' '7과\듣기\2_worksheet.pdf'
Mv '중1 동아(이) 7과 Topic 1   A-2_정답포함.pdf' '7과\듣기\2_worksheet-answers.pdf'
Mv '중1 동아(이) 7과 Topic 1   A-3_AI강의.html' '7과\듣기\3.html'
Mv '중1_동아(이)_7과_Topic_1_A-3_audio' '7과\듣기\3_audio'
Mv '중1 동아(이) 7과 Topic 1   A-3_녹음대본.txt' '7과\듣기\3-script.txt'
Mv '중1 동아(이) 7과 Topic 1   A-3_학생용_받아쓰기.pdf' '7과\듣기\3_worksheet.pdf'
Mv '중1 동아(이) 7과 Topic 1   A-3_정답포함.pdf' '7과\듣기\3_worksheet-answers.pdf'
Mv '중1 동아(이) 7과 Topic 2   A_AI강의.html' '7과\듣기\4.html'
Mv '중1_동아(이)_7과_Topic_2_A_audio' '7과\듣기\4_audio'
Mv '중1 동아(이) 7과 Topic 2   A_녹음대본.txt' '7과\듣기\4-script.txt'
Mv '중1 동아(이) 7과 Topic 2   A_학생용_받아쓰기.pdf' '7과\듣기\4_worksheet.pdf'
Mv '중1 동아(이) 7과 Topic 2   A_정답포함.pdf' '7과\듣기\4_worksheet-answers.pdf'
Mv '문법_중1_동아(이)_8과_문법1_AI강의.html' '8과\문법\1.html'
Mv '문법_중1_동아(이)_8과_문법1_audio' '8과\문법\1_audio'
Mv '문법_중1_동아(이)_8과_문법1_녹음대본.txt' '8과\문법\1-script.txt'
Mv '중1 동아(이) 8과 문법1 수여동사_학생용_받아쓰기.pdf' '8과\문법\1_worksheet.pdf'
Mv '중1 동아(이) 8과 문법1 수여동사_정답포함.pdf' '8과\문법\1_worksheet-answers.pdf'
Mv '문법_중1_동아(이)_8과_문법2_AI강의.html' '8과\문법\2.html'
Mv '문법_중1_동아(이)_8과_문법2_audio' '8과\문법\2_audio'
Mv '문법_중1_동아(이)_8과_문법2_녹음대본.txt' '8과\문법\2-script.txt'
Mv '중1 동아(이) 8과 문법2 접속사 that_학생용_받아쓰기.pdf' '8과\문법\2_worksheet.pdf'
Mv '중1 동아(이) 8과 문법2 접속사 that_정답포함.pdf' '8과\문법\2_worksheet-answers.pdf'
Mv '대화문_중1_동아(이)_8과_과거에_한_일_묻고_답하기와_감상_묻고_답하기_AI강의.html' '8과\듣기\1.html'
Mv '대화문_중1_동아(이)_8과_과거에_한_일_묻고_답하기와_감상_묻고_답하기_audio' '8과\듣기\1_audio'
Mv '대화문_중1_동아(이)_8과_과거에_한_일_묻고_답하기와_감상_묻고_답하기_녹음대본.txt' '8과\듣기\1-script.txt'
Mv '대화문_중1_동아(이)_8과_안부_묻고_답하기_AI강의.html' '8과\듣기\2.html'
Mv '대화문_중1_동아(이)_8과_안부_묻고_답하기_audio' '8과\듣기\2_audio'
Mv '대화문_중1_동아(이)_8과_안부_묻고_답하기_녹음대본.txt' '8과\듣기\2-script.txt'
Mv '중1 동아(이) 8과 Topic 1   A-3_학생용_받아쓰기.pdf' '8과\듣기\2_worksheet.pdf'
Mv '중1 동아(이) 8과 Topic 1   A-3_정답포함.pdf' '8과\듣기\2_worksheet-answers.pdf'
Mv '대화문_중1_동아(이)_8과_과거에_한_일_묻고_답하기_감상_묻고_답하기_AI강의.html' '8과\듣기\3.html'
Mv '대화문_중1_동아(이)_8과_과거에_한_일_묻고_답하기_감상_묻고_답하기_audio' '8과\듣기\3_audio'
Mv '대화문_중1_동아(이)_8과_과거에_한_일_묻고_답하기_감상_묻고_답하기_녹음대본.txt' '8과\듣기\3-script.txt'
Mv '중1 동아(이) 8과 Topic 1   B_학생용_받아쓰기.pdf' '8과\듣기\3_worksheet.pdf'
Mv '중1 동아(이) 8과 Topic 1   B_정답포함.pdf' '8과\듣기\3_worksheet-answers.pdf'
Mv '대화문_중1_동아(이)_8과_제안하기와_감탄하며_반응하기_AI강의.html' '8과\듣기\4.html'
Mv '대화문_중1_동아(이)_8과_제안하기와_감탄하며_반응하기_audio' '8과\듣기\4_audio'
Mv '대화문_중1_동아(이)_8과_제안하기와_감탄하며_반응하기_녹음대본.txt' '8과\듣기\4-script.txt'
Mv '중1 동아(이) 8과 Topic 2   A_학생용_받아쓰기.pdf' '8과\듣기\4_worksheet.pdf'
Mv '중1 동아(이) 8과 Topic 2   A_정답포함.pdf' '8과\듣기\4_worksheet-answers.pdf'

Write-Host ""
Write-Host "이동 $ok개, 건너뜀 $skip개"
