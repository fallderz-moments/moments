"""燒字幕：依 subs.json 產生 ASS（粉圓體、黑底白字、下方置中、左上標題）並重新編碼。

用法：python tools/burn.py input/影片.mp4 work/影片.subs.json [-o output/xxx.mp4]
subs.json：{"title": "...", "lines": [[開始秒, 結束秒, "字幕"], ...]}
規格：解析度與影格率不變；libx264 two-pass，位元率＝原檔影像位元率；音軌直接複製。
"""
import argparse, json, pathlib, subprocess, tempfile, shutil, os

ROOT = pathlib.Path(__file__).resolve().parent.parent

ap = argparse.ArgumentParser()
ap.add_argument("video")
ap.add_argument("subs")
ap.add_argument("-o", "--out")
a = ap.parse_args()

src = pathlib.Path(a.video)
out = pathlib.Path(a.out) if a.out else ROOT / "output" / f"{src.stem}_中字.mp4"
out.parent.mkdir(exist_ok=True)
font_dir = ROOT / "fonts"
if not (font_dir / "Huninn-Regular.ttf").exists():
    raise SystemExit("找不到粉圓體，請先執行 python tools/get_font.py")

probe = json.loads(subprocess.check_output(
    ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(src)]))
v = next(s for s in probe["streams"] if s["codec_type"] == "video")
W, H = int(v["width"]), int(v["height"])
rate = v.get("avg_frame_rate") or v["r_frame_rate"]
vbr = int(v.get("bit_rate") or 0)
if not vbr:  # 有些容器沒有影像位元率：用總位元率扣掉音訊
    abr = sum(int(s.get("bit_rate") or 0) for s in probe["streams"] if s["codec_type"] == "audio")
    vbr = int(probe["format"]["bit_rate"]) - abr
has_audio = any(s["codec_type"] == "audio" for s in probe["streams"])

def ts(t):
    t = max(0, float(t)); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"

def esc(x):
    return x.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("\n", "\\N")

d = json.loads(pathlib.Path(a.subs).read_text(encoding="utf-8"))
base = min(W, H) if W > H else W          # 橫式影片以高度為準，避免字過大
fs, tfs = round(base * 30 / 720), round(base * 22 / 720)
mv, pad = round(base * 34 / 720), max(2, round(base * 6 / 720))
ass = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Huninn,{fs},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,3,{pad},0,2,{mv},{mv},{mv},1
Style: Title,Huninn,{tfs},&H00FFFFFF,&H00FFFFFF,&H26000000,&H26000000,0,0,0,0,100,100,0,0,3,{pad},0,7,{round(base*16/720)},0,{round(base*16/720)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
dur = float(probe["format"]["duration"])
if d.get("title"):
    ass += f"Dialogue: 1,{ts(0)},{ts(dur)},Title,,0,0,0,,{esc(d['title'])}\n"
for s, e, text in d["lines"]:
    ass += f"Dialogue: 0,{ts(s)},{ts(e)},Sub,,0,0,0,,{esc(text)}\n"

tmp = pathlib.Path(tempfile.mkdtemp())
try:
    (tmp / "subs.ass").write_text(ass, encoding="utf-8")
    shutil.copy(font_dir / "Huninn-Regular.ttf", tmp / "Huninn-Regular.ttf")
    shutil.copy(tmp / "subs.ass", out.with_suffix(".ass"))
    # 在暫存資料夾內用相對路徑，避免 Windows 磁碟代號與中文路徑造成 filter 解析錯誤
    vf = "subtitles=subs.ass:fontsdir=."
    common = ["-i", str(src.resolve()), "-vf", vf, "-c:v", "libx264", "-profile:v", "high",
              "-pix_fmt", "yuv420p", "-r", rate, "-b:v", str(vbr), "-passlogfile", "pass"]
    subprocess.run(["ffmpeg", "-v", "error", "-stats", "-y", *common, "-pass", "1", "-an", "-f", "null", os.devnull],
                   cwd=tmp, check=True)
    audio = ["-map", "0:v:0", "-map", "0:a?", "-c:a", "copy"] if has_audio else []
    subprocess.run(["ffmpeg", "-v", "error", "-stats", "-y", *common, "-pass", "2", *audio,
                    "-movflags", "+faststart", str(out.resolve())], cwd=tmp, check=True)
finally:
    shutil.rmtree(tmp, ignore_errors=True)

new = int(json.loads(subprocess.check_output(
    ["ffprobe", "-v", "error", "-show_format", "-of", "json", str(out)]))["format"]["size"])
print(f"完成：{out}\n規格：{W}x{H} @ {rate}，原檔 {src.stat().st_size/1e6:.2f}MB → 成品 {new/1e6:.2f}MB")
