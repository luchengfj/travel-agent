# -*- coding: utf-8 -*-
"""把 HTML 渲染成 PNG：渲染足够高，再自动裁掉底部空白。"""
import subprocess, sys, os
from PIL import Image

EDGE = r"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
html = os.path.abspath(sys.argv[1])
out = os.path.abspath(sys.argv[2])
W = int(sys.argv[3]) if len(sys.argv) > 3 else 1080
scale = 2
H = 4000

subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                f"--screenshot={out}", f"--window-size={W},{H}",
                f"--force-device-scale-factor={scale}",
                "--default-background-color=00000000",
                f"file:///{html.replace(chr(92), '/')}"],
               capture_output=True)

img = Image.open(out).convert("RGB")
px = img.load()
w, h = img.size
# 从底部往上找第一行不是背景色的
bg = (251, 248, 242)
last = h - 1
for y in range(h - 1, -1, -1):
    row_is_bg = True
    for x in range(0, w, 17):
        r, g, b = px[x, y]
        if abs(r - bg[0]) > 4 or abs(g - bg[1]) > 4 or abs(b - bg[2]) > 4:
            row_is_bg = False
            break
    if not row_is_bg:
        last = y
        break

img.crop((0, 0, w, min(h, last + 40))).save(out)
print(f"ok  {img.size[0]}x{min(h,last+40)}  -> {out}")
