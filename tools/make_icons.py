"""Рисует PNG-значки для установки дашборда на экран телефона (icons/*.png).

Запуск: python tools/make_icons.py
Нужен пакет PyMuPDF (pymupdf) — он умеет превращать SVG в картинку.
"""
import os

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "icons")
ACCENT = "#2f6f62"


def tiles(scale, offset):
    """Четыре плитки логотипа; scale/offset — чтобы уменьшить рисунок до «безопасной зоны»."""
    def r(x, y, op):
        x, y, s = offset + x * scale, offset + y * scale, 15 * scale
        return f'<rect x="{x:.2f}" y="{y:.2f}" width="{s:.2f}" height="{s:.2f}" rx="{4 * scale:.2f}" fill="#ffffff" opacity="{op}"/>'
    return r(15, 15, 1) + r(34, 15, .55) + r(15, 34, .55) + r(34, 34, .85)


def svg(full_bleed, safe):
    bg = f'<rect width="64" height="64" fill="{ACCENT}"/>' if full_bleed else f'<rect width="64" height="64" rx="15" fill="{ACCENT}"/>'
    scale = 0.8 if safe else 1.0
    offset = 32 - 32 * scale
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">{bg}{tiles(scale, offset)}</svg>'


def render(svg_text, size, name):
    doc = pymupdf.open(stream=svg_text.encode("utf-8"), filetype="svg")
    page = doc[0]
    zoom = size / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=True)
    pix.save(os.path.join(OUT, name))
    print("готово:", name, pix.width, "x", pix.height)


os.makedirs(OUT, exist_ok=True)
render(svg(full_bleed=True, safe=False), 180, "icon-180.png")          # iPhone сам скругляет углы
render(svg(full_bleed=False, safe=False), 192, "icon-192.png")
render(svg(full_bleed=False, safe=False), 512, "icon-512.png")
render(svg(full_bleed=True, safe=True), 512, "icon-maskable-512.png")  # Android обрезает по своей форме
