#!/bin/bash
# 影片上字幕工作包：Mac 一鍵安裝（在終端機進入 video-kit 資料夾後執行：bash setup-mac.sh）
set -e
cd "$(dirname "$0")"
if ! command -v brew >/dev/null; then
  echo "請先安裝 Homebrew：https://brew.sh （貼上網站上的那一行指令），再重新執行本腳本。"; exit 1
fi
command -v python3 >/dev/null || brew install python
command -v ffmpeg  >/dev/null || brew install ffmpeg
python3 -m pip install --upgrade pip
python3 -m pip install -r tools/requirements.txt
python3 tools/get_font.py
echo; python3 --version; ffmpeg -version | head -1
python3 -c "import faster_whisper; print('faster-whisper OK')"
echo "完成！"
