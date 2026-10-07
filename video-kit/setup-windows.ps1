# 影片上字幕工作包：Windows 一鍵安裝（在 video-kit 資料夾按右鍵「在終端機中開啟」，執行：
#   powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Has($cmd) { $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue) }

if (-not (Has "python")) {
    Write-Host "安裝 Python..." -ForegroundColor Cyan
    winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
}
if (-not (Has "ffmpeg")) {
    Write-Host "安裝 ffmpeg..." -ForegroundColor Cyan
    winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
}
# 讓剛裝好的程式在這個視窗就能用
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")

python -m pip install --upgrade pip
python -m pip install -r tools\requirements.txt
python tools\get_font.py

Write-Host "`n檢查：" -ForegroundColor Cyan
python --version
ffmpeg -version | Select-Object -First 1
python -c "import faster_whisper; print('faster-whisper OK')"
Write-Host "`n完成！若 python 或 ffmpeg 顯示找不到，請關掉終端機重開再執行一次。" -ForegroundColor Green
