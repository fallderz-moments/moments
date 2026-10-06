"""語音辨識：輸出逐字時間（work/<名>.words.json）與可讀文字（work/<名>.txt）。

用法：python tools/transcribe.py input/影片.mp4 [--model large-v3-turbo] [--lang ko]
"""
import argparse, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

ap = argparse.ArgumentParser()
ap.add_argument("video")
ap.add_argument("--model", default="large-v3-turbo")
ap.add_argument("--lang", default="ko")
a = ap.parse_args()

from faster_whisper import WhisperModel

try:
    import ctranslate2
    gpu = ctranslate2.get_cuda_device_count() > 0
except Exception:
    gpu = False
model = WhisperModel(a.model, device="cuda" if gpu else "cpu",
                     compute_type="float16" if gpu else "int8")
print("模型：", a.model, "（GPU）" if gpu else "（CPU）")

glossary = (ROOT / "tools" / "glossary.txt").read_text(encoding="utf-8").strip()
segs, info = model.transcribe(a.video, language=a.lang, word_timestamps=True,
                              vad_filter=True, initial_prompt=glossary,
                              condition_on_previous_text=False)

stem = pathlib.Path(a.video).stem
work = ROOT / "work"
work.mkdir(exist_ok=True)
out, lines = [], []
for s in segs:
    words = [{"w": w.word.strip(), "s": round(w.start, 2), "e": round(w.end, 2)} for w in (s.words or [])]
    out.append({"s": round(s.start, 2), "e": round(s.end, 2), "text": s.text.strip(), "words": words})
    lines.append(f"[{s.start:7.2f} → {s.end:7.2f}] {s.text.strip()}")
    print(lines[-1], flush=True)

(work / f"{stem}.words.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
(work / f"{stem}.txt").write_text("\n".join(lines), encoding="utf-8")
print("完成：", work / f"{stem}.words.json")
