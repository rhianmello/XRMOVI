#!/usr/bin/env python3
"""Rasterize existing, versioned XRMOVI SVG logos for browser PWA compatibility.

The SVGs are the sole artwork source; this script does not redesign the brand.
Run from repository root: python scripts/build_pwa_icons.py
Dependencies: cairosvg, Pillow.
"""
from io import BytesIO
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PWA = ROOT / "pwa"
ASSETS = (
    ("icon.svg", "icon-192.png", 192),
    ("icon.svg", "icon-512.png", 512),
    ("icon-maskable.svg", "icon-maskable-512.png", 512),
    ("icon.svg", "apple-touch-icon.png", 180),
)


def main() -> None:
    for source_name, target_name, dimension in ASSETS:
        source = PWA / source_name
        target = PWA / target_name
        if not source.is_file():
            raise FileNotFoundError(source)
        png_bytes = cairosvg.svg2png(url=str(source), output_width=dimension,
                                     output_height=dimension)
        with Image.open(BytesIO(png_bytes)) as image:
            if image.size != (dimension, dimension):
                raise ValueError(f"Wrong dimensions for {target}: {image.size}")
            image.convert("RGBA").save(target, format="PNG", optimize=True)
        with Image.open(target) as verify:
            verify.verify()
        print(f"{target.relative_to(ROOT)}: {dimension}x{dimension}, "
              f"{target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
