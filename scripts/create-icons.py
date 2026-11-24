"""Generate the launcher icons. Requires Pillow."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent.parent
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

for filename, size in [("icon.png", 80), ("largeIcon.png", 160)]:
    image = Image.new("RGB", (size, size), "#071a33")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (size * 0.05, size * 0.05, size * 0.95, size * 0.95),
        radius=size * 0.12,
        fill="#164a78",
    )
    for text, center_y, color in [
        ("JOURNAAL", 0.50, "#ffffff"),
    ]:
        font_size = int(size * 0.20)
        font = ImageFont.truetype(FONT, font_size)
        while draw.textbbox((0, 0), text, font=font)[2] > size * 0.86:
            font_size -= 1
            font = ImageFont.truetype(FONT, font_size)
        bounds = draw.textbbox((0, 0), text, font=font)
        draw.text(
            ((size - (bounds[2] - bounds[0])) / 2,
             size * center_y - (bounds[3] - bounds[1]) / 2 - bounds[1]),
            text,
            font=font,
            fill=color,
        )
    image.save(ROOT / "app" / filename)
