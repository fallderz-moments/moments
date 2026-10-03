"""更新 CSS / JS 的版本號，讓瀏覽器在網站更新後一定會載入新檔案。
每次修改 assets/ 裡的 .css 或 .js 後執行：python3 tools/bump_version.py"""
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
version = time.strftime('%Y%m%d%H%M')

# HTML 裡引用的 assets/*.css、assets/*.js
for html in ROOT.glob('*.html'):
    text = html.read_text()
    text = re.sub(r'(assets/[\w-]+\.(?:css|js))(\?v=\w+)?"', rf'\1?v={version}"', text)
    html.write_text(text)

# JS 模組之間的 import（例如 './common.js'）
for js in (ROOT / 'assets').glob('*.js'):
    text = js.read_text()
    text = re.sub(r"(from '\./[\w-]+\.js)(\?v=\w+)?'", rf"\1?v={version}'", text)
    js.write_text(text)

print('version', version)
