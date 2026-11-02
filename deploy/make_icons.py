"""生成 FitCheck PWA 图标（192/512 PNG，藏青底 + 白色杠铃图案）。"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "web" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
BG = (31, 58, 95, 255)          # #1F3A5F
WHITE = (255, 255, 255, 255)


def draw_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = size * 0.22
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(radius), fill=BG)
    # 杠铃：横杆 + 两端铃片
    bar_h = size * 0.10
    bar_y = size * 0.45
    d.rectangle([size * 0.18, bar_y, size * 0.82, bar_y + bar_h], fill=WHITE)
    plate_w = size * 0.09
    plate_h = size * 0.30
    plate_y = size * 0.35
    d.rounded_rectangle(
        [size * 0.18 - plate_w, plate_y, size * 0.18, plate_y + plate_h],
        radius=int(size * 0.02), fill=WHITE)
    d.rounded_rectangle(
        [size * 0.82, plate_y, size * 0.82 + plate_w, plate_y + plate_h],
        radius=int(size * 0.02), fill=WHITE)
    inner_w = size * 0.05
    inner_h = size * 0.40
    inner_y = size * 0.30
    d.rounded_rectangle(
        [size * 0.18 - plate_w - inner_w, inner_y, size * 0.18 - plate_w, inner_y + inner_h],
        radius=int(size * 0.02), fill=WHITE)
    d.rounded_rectangle(
        [size * 0.82 + plate_w, inner_y, size * 0.82 + plate_w + inner_w, inner_y + inner_h],
        radius=int(size * 0.02), fill=WHITE)
    return img


for s in (192, 512):
    path = OUT / f"icon-{s}.png"
    draw_icon(s).save(path)
    print(path, path.stat().st_size, "bytes")
