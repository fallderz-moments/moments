"""產生網站使用的像素風 SVG 圖案：python3 tools/pixel_sprites.py"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'pixel'

PALETTE = {
    'O': '#4A3628',  # 輪廓
    'E': '#2B2622',  # 眼睛 / 鼻子
    'W': '#FFFFFF',  # 高光
    # 黃金獵犬
    'G': '#E3A857', 'L': '#F4D19B', 'D': '#C2843E', 'T': '#F2A39A',
    # 花栗鼠
    'n': '#3A2A20',  # 鼻頭
    'B': '#C98A55', 'C': '#F3E1C7', 'S': '#6B4A33', 'K': '#FFF6E9', 'P': '#EBA49A',
    # 橡實 / 書本 / 蛋糕 / 帽子
    'A': '#A86B3C', 'a': '#6E4526',
    'R': '#F2C3B9', 'r': '#D98F80', 'M': '#97B3AE', 'm': '#6F938D', 'Y': '#F5D77E', 'y': '#D9B44F',
    'N': '#D2E0D3', 'V': '#F0EEEA', 'Q': '#D6CBBF', 'q': '#B5A797', 'F': '#F7E9A0',
}

SPRITES = {
    # 正面坐著的 Q 版黃金獵犬
    'dog': """
.......OOOOOOOO.......
....OOOGGGGGGGGOOO....
...OGGGGGGGGGGGGGGO...
..ODDGGGGGGGGGGGGDDO..
.ODDDGGGGGGGGGGGGDDDO.
ODDDDGGGGGGGGGGGGDDDDO
ODDDDGGEEGGGGEEGGDDDDO
ODDDDGEEWGGGGEEWGDDDDO
ODDDDGEEEGGGGEEEGDDDDO
.ODDDGPPGLLLLLGPPGDDO.
.ODDGGGGLLLnnLLLGGGDO.
..OOGGGGLLLnnLLLGGGOO.
....OGGGLLOLLOLLGGO...
.....OGGGLLTTLLGGO....
......OOGGLLLLGGOOO...
.....OGGGGLLLLGGGGO.OO
....OGGGGLLLLLLGGGGOGO
....OGGGGLLLLLLGGGGOGO
....OGGOGLLLLLLGOGGGO.
....OGGOGGLLLLGGOGGO..
....OLLOOGGGGGGOOLLO..
....OOOO.OOOOOO.OOOO..
""",
    # 正面坐著抱橡實的 Q 版花栗鼠
    'chipmunk': """
...OOO.........OOO....
..OPPBO.......OBPPO...
..OPBBOOOOOOOOOBBPO...
...OBBBBBBSSBBBBBO....
..OBBBBBBBSSBBBBBBO...
.OBSSSBBBBSSBBBBSSSBO.
.OBBEEBBBBBBBBBBEEBBO.
.OBBEWBBBBBBBBBBEWBBO.
.OKKEEKBBBBBBBBKEEKKO.
.OBPPCCCCCnnCCCCCPPBO.
..OBCCCCCOCCOCCCCCBO..
...OOBCCCCCCCCCCBOO.OO
....OBBCCCCCCCCBBO.OBSO
...OBBCCaaaaaaCCBBOBBSO
...OBBCaaaaaaaaCBBOBSBO
...OBCCOAAAAAAOCCBOSBO.
...OBCCCOAAAAOCCCBOBO..
...OBBCCCOOOOCCCBBOO...
....OBBPOOOOOOPBBO.....
....OOOO......OOOO.....
""",
    'cake': """
.......Y........
......YFY.......
.......r........
...O...O...O....
..ORO.OMO.ORO...
..OOOOOOOOOOOO..
.OKKKKKKKKKKKKO.
.ORKRRKRRKRRKRO.
.ORRRRRRRRRRRRO.
.OMMMMMMMMMMMMO.
.ORRRRRRRRRRRRO.
.OrrrrrrrrrrrrO.
OOOOOOOOOOOOOOOO
OqqqqqqqqqqqqqqO
.OOOOOOOOOOOOOO.
""",
    'hat': """
....Y...
...OYO..
...ORO..
..OMRMO.
..ORMRO.
.OMRMRMO
.ORMRMRO
OOOOOOOO
""",
    'books': """
..OOO...........OOO.
..OMO..OOO.....ORrO.
.OOMOO.ORO.OOO.ORrO.
OYOMORrORO.OMO.ORrO.
OYOMORrORO.OMOOORrO.
OYOmORrORO.OmOVORrO.
OYOMORrORO.OMOVORrO.
OyOMORrORO.OMOVORrO.
OYOMORrORO.OMOVORrO.
OOOOOOOOOOOOOOOOOOOO
""",
    'acorn': """
..OO....
.OaaO...
OaaaaO..
OAAAAO..
.OAAO...
..OO....
""",
    'heart': """
.OO.OO.
ORROrRO
ORRRRRO
.ORRRO.
..ORO..
...O...
""",
}


def compose(base: str, top: str, ox: int, overlap: int = 1) -> str:
    """把 top 疊在 base 上方（例如生日帽），ox 為水平位移"""
    b = base.strip('\n').split('\n')
    t = top.strip('\n').split('\n')
    w = max(max(len(r) for r in b), ox + max(len(r) for r in t))
    rows = [list(r.ljust(w, '.')) for r in ['.' * w] * (len(t) - overlap) + b]
    for y, row in enumerate(t):
        for x, ch in enumerate(row):
            if ch != '.':
                rows[y][ox + x] = ch
    return '\n'.join(''.join(r) for r in rows)


SPRITES['dog-party'] = compose(SPRITES['dog'], SPRITES['hat'], 7, overlap=1)
SPRITES['chipmunk-party'] = compose(SPRITES['chipmunk'], SPRITES['hat'], 7, overlap=0)


def to_svg(art: str) -> str:
    rows = [r for r in art.strip('\n').split('\n')]
    w = max(len(r) for r in rows)
    h = len(rows)
    rects = []
    for y, row in enumerate(rows):
        x = 0
        while x < len(row):
            ch = row[x]
            if ch == '.':
                x += 1
                continue
            run = 1
            while x + run < len(row) and row[x + run] == ch:
                run += 1
            rects.append(f'<rect x="{x}" y="{y}" width="{run}" height="1" fill="{PALETTE[ch]}"/>')
            x += run
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w * 4}" height="{h * 4}" '
            f'shape-rendering="crispEdges">' + ''.join(rects) + '</svg>\n')


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, art in SPRITES.items():
        (OUT / f'{name}.svg').write_text(to_svg(art))
        print('wrote', name)
