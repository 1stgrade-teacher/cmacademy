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

Mv '비상김\7과\듣기\중1 비상(황) 7과 Watch & Present_AI강의.html' '비상김\7과\듣기\1.html'
Mv '비상김\7과\듣기\중1_비상(황)_7과_Watch_&_Present_audio' '비상김\7과\듣기\1_audio'
Mv '비상김\7과\듣기\중1 비상(황) 7과 Watch & Present_녹음대본.txt' '비상김\7과\듣기\1-script.txt'
Mv '비상김\7과\듣기\중1 비상(황) 7과 Watch & Present_학생용_받아쓰기.pdf' '비상김\7과\듣기\1_dictation.pdf'
Mv '비상김\7과\듣기\중1 비상(황) 7과 Watch & Present_정답포함.pdf' '비상김\7과\듣기\1_dictation-answers.pdf'
FixHtml '비상김\7과\듣기\1.html' '1_audio'
Mv '비상김\7과\듣기\중1 비상(황) 7과 Watch & Present 2_AI강의.html' '비상김\7과\듣기\2.html'
Mv '비상김\7과\듣기\중1_비상(황)_7과_Watch_&_Present_2_audio' '비상김\7과\듣기\2_audio'
Mv '비상김\7과\듣기\중1 비상(황) 7과 Watch & Present 2_녹음대본.txt' '비상김\7과\듣기\2-script.txt'
Mv '비상김\7과\듣기\중1 비상(황) 7과 Watch & Present 2_학생용_받아쓰기.pdf' '비상김\7과\듣기\2_dictation.pdf'
Mv '비상김\7과\듣기\중1 비상(황) 7과 Watch & Present 2_정답포함.pdf' '비상김\7과\듣기\2_dictation-answers.pdf'
FixHtml '비상김\7과\듣기\2.html' '2_audio'

# --- 폴더 이름 변경: 비상김 -> 비상(황) ---
Mv '비상김' '비상(황)'
$base = Join-Path $root '비상(황)'
if(Test-Path -LiteralPath $base){
  $files = @(Get-ChildItem -LiteralPath $base -Recurse -File -Include *.html,*.js,*.json) + @(Get-Item -LiteralPath (Join-Path $root 'index.html'))
  foreach($f in $files){
    $t = [IO.File]::ReadAllText($f.FullName,$utf8)
    if($t.Contains('비상김')){
      [IO.File]::WriteAllText($f.FullName,$t.Replace('비상김','비상(황)'),$utf8)
      Write-Host "[링크수정] $($f.FullName.Substring($root.Length+1))" -ForegroundColor Cyan }
  }
}
# 중1 밖에서 '비상김'을 쓰는 파일은 바꾸지 않고 목록만 보여 줍니다 (다른 학년 폴더일 수 있음)
$repo = (Resolve-Path (Join-Path $root '..\..')).Path
$others = Get-ChildItem -LiteralPath $repo -Recurse -File -Include *.html,*.js,*.json -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notlike "$root*" -and $_.FullName -notlike '*\.git\*' -and $_.FullName -notlike '*\node_modules\*' } |
  Where-Object { Select-String -LiteralPath $_.FullName -Pattern '비상김' -Quiet }
if($others){ Write-Host ""; Write-Host "[확인필요] 중1 밖에서 '비상김'을 쓰는 파일:" -ForegroundColor Yellow; $others | ForEach-Object { Write-Host "  $($_.FullName)" } }
Write-Host ""
Write-Host "이동 $ok개, 건너뜀 $skip개"
