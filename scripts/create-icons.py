"""Generate the launcher icons. Requires Pillow."""
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
for filename, size in [("icon.png", 80), ("largeIcon.png", 160)]:
    # Draw at higher resolution to keep small launcher icons smooth.
    canvas_size = size * 4
    image = Image.new("RGB", (canvas_size, canvas_size), "#071a33")
    draw = ImageDraw.Draw(image)

    def box(left, top, right, bottom):
        return tuple(value * canvas_size for value in (left, top, right, bottom))

    # A simple news card, with a red headline accent and short article lines.
    draw.rounded_rectangle(
        box(0.14, 0.21, 0.86, 0.79),
        radius=canvas_size * 0.055,
        fill="#ffffff",
    )
    draw.rounded_rectangle(
        box(0.22, 0.30, 0.48, 0.36),
        radius=canvas_size * 0.015,
        fill="#e34248",
    )
    for top, right in [(0.44, 0.46), (0.54, 0.43), (0.64, 0.46)]:
        draw.rounded_rectangle(
            box(0.22, top, right, top + 0.035),
            radius=canvas_size * 0.012,
            fill="#8292a5",
        )
    # The play symbol makes direct video playback the primary message.
    draw.polygon(
        [(canvas_size * x, canvas_size * y)
         for x, y in [(0.56, 0.37), (0.56, 0.67), (0.79, 0.52)]],
        fill="#164a78",
    )
    image = image.resize((size, size), Image.Resampling.LANCZOS)
    image.save(ROOT / "app" / filename)
