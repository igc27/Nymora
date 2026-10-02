"""Recreate the original Nymora icon; Pillow is needed only to regenerate assets."""
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).resolve().parent.parent / "assets"
im = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rounded_rectangle((0, 0, 511, 511), radius=128, fill="#121725")
d.line([(128, 360), (128, 152), (340, 360), (384, 348), (384, 152)], fill="#94edce", width=48, joint="curve")
for x, y in [(128, 360), (128, 152), (340, 360), (384, 348), (384, 152)]:
    d.ellipse((x - 24, y - 24, x + 24, y + 24), fill="#94edce")
d.ellipse((360, 72, 408, 120), fill="#b6a4fb")
im.save(out / "icon.png")
im.save(out / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
