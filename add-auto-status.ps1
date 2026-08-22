# ------------------------------------------------------------
# add-auto-status.ps1  (v2 - 폴더 위치 고정 버전)
#
# cmacademy 저장소 폴더 안의 모든 index.html 파일을 자동으로 찾아서,
# </body> 바로 위에 auto-status.js 스크립트 태그를 추가해주는 프로그램입니다.
# ------------------------------------------------------------

# 관리자 권한 등으로 실행 위치가 바뀌어도, 항상 "이 스크립트 파일이 있는 폴더"를 기준으로 검색합니다.
$root = $PSScriptRoot
if ([string]::IsNullOrEmpty($root)) {
    $root = Get-Location
}

Write-Host "검색 기준 폴더: $root" -ForegroundColor Cyan
Write-Host ""

$files = Get-ChildItem -Path $root -Recurse -Filter "index.html" -File

Write-Host "찾은 index.html 파일 개수: $($files.Count)" -ForegroundColor Cyan
Write-Host ""

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
