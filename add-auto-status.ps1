# ------------------------------------------------------------
# add-auto-status.ps1
#
# cmacademy 저장소 폴더 안의 모든 index.html 파일을 자동으로 찾아서,
# </body> 바로 위에 auto-status.js 스크립트 태그를 추가해주는 프로그램입니다.
#
# 사용법:
#   1) 이 파일을 cmacademy 저장소의 가장 바깥쪽(최상위) 폴더에 넣습니다.
#      (auto-status.js 파일과 같은 위치)
#   2) 그 폴더 안 빈 곳에서 Shift + 마우스 오른쪽 버튼 클릭
#   3) "여기에 PowerShell 창 열기" 또는 "여기에 터미널 열기" 선택
#   4) 아래 명령어를 그대로 입력하고 Enter:
#      powershell -ExecutionPolicy Bypass -File .\add-auto-status.ps1
#   5) 화면에 어떤 파일이 수정되었는지 목록이 뜹니다.
#   6) 끝나면 GitHub Desktop으로 가서 Commit + Push 하시면 됩니다.
# ------------------------------------------------------------

$root = Get-Location
$files = Get-ChildItem -Path $root -Recurse -Filter "index.html" -File

$scriptTag = '  <script src="/auto-status.js" defer></script>'

$updatedCount = 0
$skippedCount = 0
$notFoundCount = 0

foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8

    if ($content -match 'auto-status\.js') {
        Write-Host "이미 적용됨 (건너뜀): $($file.FullName)" -ForegroundColor Yellow
        $skippedCount++
        continue
    }

    if ($content -match '(?i)</body>') {
        $newContent = $content -replace '(?i)</body>', ($scriptTag + "`r`n</body>")
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($file.FullName, $newContent, $utf8NoBom)
        Write-Host "적용 완료: $($file.FullName)" -ForegroundColor Green
        $updatedCount++
    } else {
        Write-Host "</body> 태그를 찾지 못해 건너뜀: $($file.FullName)" -ForegroundColor Red
        $notFoundCount++
    }
}

Write-Host ""
Write-Host "========================================"
Write-Host "작업 완료!"
Write-Host "새로 적용된 파일: $updatedCount 개"
Write-Host "이미 적용되어 건너뛴 파일: $skippedCount 개"
Write-Host "문제가 있어 건너뛴 파일: $notFoundCount 개"
Write-Host "========================================"
Write-Host ""
Write-Host "이제 GitHub Desktop을 열어서 변경사항을 확인하고 Commit + Push 해주세요."
