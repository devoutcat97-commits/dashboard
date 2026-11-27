"""Рисует PNG-значки для установки дашборда на экран телефона (icons/*.png).

Запуск: python tools/make_icons.py
Нужен пакет PyMuPDF (pymupdf) — он умеет превращать SVG в картинку.

Логотип «Страница планера»: строчки ежедневника на тёмном фоне, одна выделена салатовым маркером.
Маленький вариант (icon.svg: вкладка браузера, шапка) нарисован отдельно — строчки там толще.
"""
import os

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "icons")
INK = "#17142b"
LIME = "#d4f55a"


def lines(scale, offset):
    """Строчки планера; scale/offset — чтобы уменьшить рисунок до «безопасной зоны»."""
    def r(x, y, w, h, rx, fill, op=1):
        return (f'<rect x="{offset + x * scale:.2f}" y="{offset + y * scale:.2f}" width="{w * scale:.2f}" '
                f'height="{h * scale:.2f}" rx="{rx * scale:.2f}" fill="{fill}" opacity="{op}"/>')
    return (r(15, 15, 30, 6, 3, "#ffffff", .9) + r(11, 27, 42, 11, 3.5, LIME) +
            r(15, 29.5, 24, 6, 3, INK) + r(15, 44, 20, 6, 3, "#ffffff", .55))


def svg(full_bleed, safe):
    bg = f'<rect width="64" height="64" fill="{INK}"/>' if full_bleed else f'<rect width="64" height="64" rx="15" fill="{INK}"/>'
    scale = 0.8 if safe else 1.0
    offset = 32 - 32 * scale
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">{bg}{lines(scale, offset)}</svg>'


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
