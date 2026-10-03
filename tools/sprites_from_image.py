"""把放大過的像素圖（透明背景）還原成像素格，輸出 SVG，並產生戴派對帽的生日版。
用法：convert 原圖.webp -depth 8 rgba:src.rgba
      python3 tools/sprites_from_image.py src.rgba 1774 887"""
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'pixel'
CELL_X, OFF_X = 14.17, 0.7
CELL_Y, OFF_Y = 14.2, 12.6 - 14.2
FIGURES = {'dog': (84, 850), 'chipmunk': (1092, 1647)}  # 原圖中的水平範圍

HAT = """
.....YY.....
....YFFY....
.....YY.....
.....OO.....
....ORRO....
....OMMO....
...ORRRRO...
...OMMMMO...
..ORRRRRRO..
..OMMMMMMO..
.ORRRRRRRRO.
.OMMMMMMMMO.
OOOOOOOOOOOO
"""
HAT_COLORS = {'O': (74, 54, 40), 'F': (250, 240, 190), 'Y': (245, 215, 126), 'R': (242, 195, 185), 'M': (151, 179, 174)}


def load(path, w, h):
    data = Path(path).read_bytes()
    return lambda x, y: data[(y * w + x) * 4:(y * w + x) * 4 + 4]


def sample(px, w, h, x0, x1):
    grid = []
    gy = 0
    while OFF_Y + (gy + 1) * CELL_Y <= h:
        row = []
        gx = int((x0 - OFF_X) // CELL_X)
        while OFF_X + gx * CELL_X <= x1:
            cx = OFF_X + (gx + .5) * CELL_X
            cy = OFF_Y + (gy + .5) * CELL_Y
            samples = [px(int(cx + dx), int(cy + dy)) for dx in (-3, 0, 3) for dy in (-3, 0, 3)
                       if 0 <= int(cx + dx) < w and 0 <= int(cy + dy) < h]
            opaque = [s for s in samples if s[3] > 128]
            if len(opaque) >= 5:
                row.append(tuple(sorted(c[i] for c in opaque)[len(opaque) // 2] for i in range(3)))
            else:
                row.append(None)
            gx += 1
        grid.append(row)
        gy += 1
    # 去掉上下左右的空白
    while grid and all(c is None for c in grid[0]): grid.pop(0)
    while grid and all(c is None for c in grid[-1]): grid.pop()
    left = min(next(i for i, c in enumerate(r) if c) for r in grid if any(r))
    right = max(max(i for i, c in enumerate(r) if c) for r in grid if any(r))
    return [r[left:right + 1] for r in grid]


def quantize(grid, dist=22):
    """把相近的顏色合併，讓色塊乾淨"""
    palette = []
    out = []
    for row in grid:
        new = []
        for c in row:
            if c is None:
                new.append(None)
                continue
            for p in palette:
                if sum((a - b) ** 2 for a, b in zip(c, p)) < dist ** 2:
                    new.append(p)
                    break
            else:
                palette.append(c)
                new.append(c)
        out.append(new)
    return out


def add_hat(grid, head_x):
    """在頭頂（head_x 為頭部中心欄）戴上派對帽"""
    hat = [r for r in HAT.strip('\n').split('\n')]
    top = next(y for y, r in enumerate(grid) if any(r[max(0, head_x - 2):head_x + 3]))
    hx = head_x - len(hat[0]) // 2
    need = max(0, len(hat) - 1 - top)
    width = len(grid[0])
    g = [[None] * width for _ in range(need)] + [list(r) for r in grid]
    top += need
    for y, line in enumerate(hat):
        for x, ch in enumerate(line):
            if ch != '.':
                g[top - len(hat) + 1 + y][hx + x] = HAT_COLORS[ch]
    return g


def to_svg(grid):
    h, w = len(grid), len(grid[0])
    rects = []
    for y, row in enumerate(grid):
        x = 0
        while x < w:
            c = row[x]
            if c is None:
                x += 1
                continue
            run = 1
            while x + run < w and row[x + run] == c:
                run += 1
            rects.append(f'<rect x="{x}" y="{y}" width="{run}" height="1" fill="#{c[0]:02x}{c[1]:02x}{c[2]:02x}"/>')
            x += run
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w * 4}" height="{h * 4}" '
            f'shape-rendering="crispEdges">' + ''.join(rects) + '</svg>\n')


if __name__ == '__main__':
    path, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    px = load(path, w, h)
    for name, (x0, x1) in FIGURES.items():
        grid = quantize(sample(px, w, h, x0, x1))
        (OUT / f'{name}.svg').write_text(to_svg(grid))
        # 頭部中心：狗狗頭在右側、花栗鼠頭在左側
        cols = len(grid[0])
        head = int(cols * (0.72 if name == 'dog' else 0.30))
        (OUT / f'{name}-party.svg').write_text(to_svg(add_hat(grid, head)))
        print(name, f'{cols}x{len(grid)}')
