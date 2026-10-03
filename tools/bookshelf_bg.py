"""產生手繪風書櫃背景（可無縫平鋪）：python3 tools/bookshelf_bg.py"""
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'bookshelf-bg.svg'
W, H = 520, 300          # 一個平鋪單位：兩層書櫃
SHELF_Y = [140, 290]     # 層板位置
INK = '#A89482'
BOOK_COLORS = ['#97B3AE', '#D2E0D3', '#F0DDD6', '#F2C3B9', '#D6CBBF', '#E8D9B5', '#C3D5D1', '#E9C9BE']

rnd = random.Random(20211201)


def j(v, amt=1.2):
    return round(v + rnd.uniform(-amt, amt), 1)


def wobbly_rect(x, y, w, h):
    """手繪感的矩形：四角微微抖動、邊線略彎"""
    p = [(j(x), j(y)), (j(x + w), j(y)), (j(x + w), j(y + h)), (j(x), j(y + h))]
    mid = lambda a, b: (j((a[0] + b[0]) / 2, 1.5), j((a[1] + b[1]) / 2, 1.5))
    d = f'M{p[0][0]},{p[0][1]}'
    for a, b in zip(p, p[1:] + p[:1]):
        m = mid(a, b)
        d += f' Q{m[0]},{m[1]} {b[0]},{b[1]}'
    return d + 'Z'


def wobbly_line(x1, y1, x2, y2):
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    return f'M{j(x1)},{j(y1)} Q{j(mx, 2)},{j(my, 2)} {j(x2)},{j(y2)}'


parts = []
for base in SHELF_Y:
    x = 6
    plants = 0
    while x < W - 30:
        kind = rnd.random()
        if kind < 0.08 and x < W - 70 and not plants:  # 小盆栽（每層最多一盆）
            plants += 1
            parts.append(f'<path d="{wobbly_rect(x + 6, base - 26, 26, 24)}" fill="#E9C9BE" stroke="{INK}"/>')
            for dx in (12, 19, 26):
                parts.append(f'<path d="M{x + dx},{base - 26} q{rnd.uniform(-8, 8):.1f},-14 {rnd.uniform(-6, 6):.1f},-22" fill="none" stroke="#7FA39C" stroke-width="2.4"/>')
            x += 44
            continue
        if kind < 0.16 and x < W - 60:  # 平放的一疊書
            y = base
            for _ in range(rnd.randint(2, 3)):
                bw, bh = rnd.randint(40, 52), rnd.randint(8, 11)
                y -= bh
                parts.append(f'<path d="{wobbly_rect(x + rnd.uniform(0, 4), y, bw, bh)}" fill="{rnd.choice(BOOK_COLORS)}" stroke="{INK}"/>')
            x += 58
            continue
        bw, bh = rnd.randint(12, 22), rnd.randint(70, 112)
        color = rnd.choice(BOOK_COLORS)
        tilt = rnd.random() < 0.12
        g_open = f'<g transform="rotate({rnd.choice([-9, 9])} {x + bw / 2} {base})">' if tilt else ''
        parts.append(g_open)
        parts.append(f'<path d="{wobbly_rect(x, base - bh, bw, bh)}" fill="{color}" stroke="{INK}"/>')
        for ly in (base - bh + 12, base - 16):  # 書背上的兩條線
            parts.append(f'<path d="{wobbly_line(x + 3, ly, x + bw - 3, ly)}" fill="none" stroke="{INK}" stroke-width="1"/>')
        if rnd.random() < 0.4:  # 書名標籤
            parts.append(f'<path d="{wobbly_rect(x + 3, base - bh / 2 - 8, bw - 6, 14)}" fill="#FFFDF9" stroke="{INK}" stroke-width="1"/>')
        if tilt:
            parts.append('</g>')
        x += bw + rnd.randint(1, 4) + (10 if tilt else 0)
    # 層板（延伸到兩側邊界，平鋪時能接起來）
    parts.append(f'<path d="M-4,{base} L{W + 4},{base} L{W + 4},{base + 9} L-4,{base + 9}Z" fill="#D9CCBD" stroke="{INK}"/>')
    parts.append(f'<path d="{wobbly_line(-4, base + 4, W + 4, base + 4)}" fill="none" stroke="{INK}" stroke-width="0.8" opacity=".6"/>')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
<defs><filter id="pencil" x="-2%" y="-2%" width="104%" height="104%">
<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7"/>
<feDisplacementMap in="SourceGraphic" scale="2.2"/></filter></defs>
<g filter="url(#pencil)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
{chr(10).join(parts)}
</g></svg>
'''
OUT.write_text(svg)
# 淡色版：整頁平鋪用，透明度直接寫在 SVG 裡（不需要 fixed 圖層，手機上也穩定）
faint = svg.replace('<g filter="url(#pencil)"', '<g opacity=".2" filter="url(#pencil)"')
OUT.with_name('bookshelf-faint.svg').write_text(faint)
print('wrote', OUT, len(svg), 'bytes')
