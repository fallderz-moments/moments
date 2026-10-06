"""下載粉圓體（Huninn）到 fonts/。"""
import pathlib, re, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
out = ROOT / "fonts" / "Huninn-Regular.ttf"
if out.exists():
    print("已存在：", out)
else:
    req = urllib.request.Request("https://fonts.googleapis.com/css2?family=Huninn",
                                 headers={"User-Agent": "Mozilla/5.0"})
    css = urllib.request.urlopen(req).read().decode()
    url = re.search(r"url\((https://[^)]+\.ttf)\)", css).group(1)
    out.parent.mkdir(exist_ok=True)
    urllib.request.urlretrieve(url, out)
    print("已下載：", out, out.stat().st_size, "bytes")
