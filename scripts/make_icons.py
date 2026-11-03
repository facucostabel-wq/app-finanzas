"""Genera los íconos PNG de la app en public/icons. Uso: python3 scripts/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

BG = (15, 118, 110)
FG = (255, 255, 255)


def draw(size: int, padding: float) -> Image.Image:
    """Fondo verde con tres barras ascendentes (motivo simple de 'finanzas')."""
    s = 4  # supersampling para bordes suaves
    big = size * s
    img = Image.new("RGB", (big, big), BG)
    d = ImageDraw.Draw(img)
    inner = big * (1 - 2 * padding)
    x0 = big * padding
    y_base = big * (1 - padding) - inner * 0.12
    bar_w = inner * 0.2
    gap = inner * 0.1
    heights = [0.35, 0.55, 0.78]
    start = x0 + (inner - (3 * bar_w + 2 * gap)) / 2
    for i, h in enumerate(heights):
        left = start + i * (bar_w + gap)
        top = y_base - inner * h
        d.rounded_rectangle([left, top, left + bar_w, y_base], radius=bar_w * 0.3, fill=FG)
    return img.resize((size, size), Image.LANCZOS)


draw(192, 0.14).save(OUT / "icon-192.png")
draw(512, 0.14).save(OUT / "icon-512.png")
draw(512, 0.24).save(OUT / "icon-maskable-512.png")
draw(180, 0.14).save(OUT / "apple-touch-icon.png")
print("Íconos generados en", OUT)
