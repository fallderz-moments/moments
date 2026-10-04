"""把透明背景的貼圖表切成一張張獨立圖案（以連通區塊判斷），每個圖案只保留自己的像素。
用法：
  convert sheet.webp -depth 8 rgba:sheet.rgba
  python3 tools/split_sprite_sheets.py sheet.rgba 寬 高 輸出資料夾 檔名前綴 [分界y:前綴2]
例如第三張表上半是狗、下半是花栗鼠：... out dog 500:chipmunk
整齊排成格子的表（例如 4×4）：
  python3 tools/split_sprite_sheets.py --grid 4x4 sheet.rgba 寬 高 輸出資料夾 dog 1
"""
import json
import struct
import sys
import zlib
from collections import deque
from pathlib import Path

ALPHA = 40      # 視為不透明的 alpha 門檻
BIG = 90        # 寬高都至少這麼大才算一隻動物；其餘（愛心、ZZ、!、線條）併入最近的動物
NEAR = 60       # 小片段距離動物多遠以內才合併


def components(data, w, h):
    seen = bytearray(w * h)
    comps = []
    for start in range(w * h):
        if seen[start] or data[start * 4 + 3] <= ALPHA:
            continue
        q = deque([start])
        seen[start] = 1
        pixels = []
        x0 = x1 = start % w
        y0 = y1 = start // w
        n = 0
        while q:
            i = q.popleft()
            n += 1
            pixels.append(i)
            x, y = i % w, i // w
            x0, x1, y0, y1 = min(x0, x), max(x1, x), min(y0, y), max(y1, y)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not seen[j] and data[j * 4 + 3] > ALPHA:
                            seen[j] = 1
                            q.append(j)
        if n >= 12:  # 忽略雜點
            comps.append([x0, y0, x1 + 1, y1 + 1, pixels])
    return comps


def gap(a, b):
    dx = max(0, max(a[0], b[0]) - min(a[2], b[2]))
    dy = max(0, max(a[1], b[1]) - min(a[3], b[3]))
    return (dx * dx + dy * dy) ** .5


def write_png(path, w, h, rgba):
    raw = b''.join(b'\x00' + rgba[y * w * 4:(y + 1) * w * 4] for y in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    Path(path).write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                           + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def grid_main(path, w, h, cols, rows, out, prefix, start):
    """整齊排成 cols×rows 格的貼圖表：每個連通區塊依中心點歸到所在的格子，同格合併（狗鼠一起的圖不會被拆開）"""
    data = open(path, 'rb').read()
    cells = {}
    for c in components(data, w, h):
        cx, cy = (c[0] + c[2]) / 2, (c[1] + c[3]) / 2
        key = (int(cy * rows / h), int(cx * cols / w))
        if key in cells:
            b = cells[key]
            cells[key] = [min(b[0], c[0]), min(b[1], c[1]), max(b[2], c[2]), max(b[3], c[3]), b[4] + c[4]]
        else:
            cells[key] = c
    out.mkdir(parents=True, exist_ok=True)
    names = []
    for n, key in enumerate(sorted(cells), start):
        x0, y0, x1, y1, pixels = cells[key]
        bw, bh = x1 - x0, y1 - y0
        buf = bytearray(bw * bh * 4)
        for i in pixels:
            x, y = i % w - x0, i // w - y0
            buf[(y * bw + x) * 4:(y * bw + x) * 4 + 4] = data[i * 4:i * 4 + 4]
        fname = f'{prefix}-{n}.png'
        write_png(out / fname, bw, bh, bytes(buf))
        names.append(fname)
    print(json.dumps(names))


def main():
    if sys.argv[1] == '--grid':  # --grid 4x4 sheet.rgba 寬 高 輸出資料夾 檔名前綴 起始編號
        cols, rows = map(int, sys.argv[2].split('x'))
        grid_main(sys.argv[3], int(sys.argv[4]), int(sys.argv[5]), cols, rows, Path(sys.argv[6]), sys.argv[7], int(sys.argv[8]))
        return
    path, w, h, out, prefix = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), Path(sys.argv[4]), sys.argv[5]
    split = sys.argv[6].split(':') if len(sys.argv) > 6 else None
    data = open(path, 'rb').read()
    comps = components(data, w, h)
    big = [c for c in comps if c[2] - c[0] >= BIG and c[3] - c[1] >= BIG]
    small = [c for c in comps if c not in big]

    def overlap_ratio(a, b):
        ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
        iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
        area = lambda r: (r[2] - r[0]) * (r[3] - r[1])
        return ix * iy / min(area(a), area(b))

    def absorb(a, b):
        return [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]), a[4] + b[4]]

    # 只有一個大區塊大部分落在另一個裡面時才合併；相鄰動物的外框只是稍微重疊，不合併
    merged = True
    while merged:
        merged = False
        for i in range(len(big)):
            for j in range(i + 1, len(big)):
                if overlap_ratio(big[i], big[j]) > 0.5:
                    big[i] = absorb(big[i], big.pop(j))
                    merged = True
                    break
            if merged:
                break
    for s_ in small:  # 愛心、ZZ、! 等小片段併入最近的動物
        d, k = min((gap(s_, b), k) for k, b in enumerate(big))
        if d <= NEAR:
            big[k] = absorb(big[k], s_)
    big.sort(key=lambda b: (round(b[1] / 120), b[0]))

    out.mkdir(parents=True, exist_ok=True)
    counters, names = {}, []
    for b in big:
        name = prefix
        if split and b[1] >= int(split[0]):
            name = split[1]
        counters[name] = counters.get(name, 0) + 1
        x0, y0, x1, y1, pixels = b
        bw, bh = x1 - x0, y1 - y0
        buf = bytearray(bw * bh * 4)
        for i in pixels:
            x, y = i % w - x0, i // w - y0
            buf[(y * bw + x) * 4:(y * bw + x) * 4 + 4] = data[i * 4:i * 4 + 4]
        fname = f'{name}-{counters[name]:02d}-{Path(path).stem}.png'
        write_png(out / fname, bw, bh, bytes(buf))
        names.append(fname)
    print(json.dumps(names))


if __name__ == '__main__':
    main()
