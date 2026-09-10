#!/usr/bin/env python3
"""Generate Chrome/iOS PWA PNG icons from the existing SVG artwork."""
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
LOGO_SVG = PUBLIC / "icon.svg"
MARK_SVG = PUBLIC / "favicon.svg"


def svg_to_pil(svg_path: Path, size: int) -> Image.Image:
    png_bytes = cairosvg.svg2png(
        url=str(svg_path),
        output_width=size,
        output_height=size,
    )
    from io import BytesIO

    img = Image.open(BytesIO(png_bytes)).convert("RGBA")
    return img


def pad_for_maskable(src: Image.Image, size: int, bg: str = "#cc0000") -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    # Keep artwork in the inner 70% so Android maskable crop stays readable.
    inner = int(size * 0.70)
    artwork = src.resize((inner, inner), Image.Resampling.LANCZOS)
    offset = (size - inner) // 2
    canvas.paste(artwork, (offset, offset), artwork)
    return canvas


def rounded_any_icon(src: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), "#ffffff")
    artwork = src.resize((size, size), Image.Resampling.LANCZOS)
    canvas.paste(artwork, (0, 0), artwork)
    return canvas.convert("RGB")


def save_rgb(img: Image.Image, path: Path) -> None:
    img.convert("RGB").save(path, "PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


def main() -> None:
    PUBLIC.mkdir(exist_ok=True)
    logo = svg_to_pil(LOGO_SVG, 512)
    mark = svg_to_pil(MARK_SVG, 512)

    save_rgb(rounded_any_icon(logo, 192), PUBLIC / "icon-192x192.png")
    save_rgb(rounded_any_icon(logo, 512), PUBLIC / "icon-512x512.png")
    save_rgb(pad_for_maskable(mark, 192), PUBLIC / "icon-maskable-192.png")
    save_rgb(pad_for_maskable(mark, 512), PUBLIC / "icon-maskable-512.png")
    save_rgb(pad_for_maskable(mark, 180), PUBLIC / "apple-touch-icon.png")
    save_rgb(rounded_any_icon(mark, 180), PUBLIC / "icon-180x180.png")
    save_rgb(rounded_any_icon(mark, 32), PUBLIC / "icon-32x32.png")
    save_rgb(rounded_any_icon(mark, 16), PUBLIC / "icon-16x16.png")
    save_rgb(rounded_any_icon(mark, 192), PUBLIC / "icon-192.png")

    # Tiny valid favicon replacement for the old 1x1 data-URL file.
    print("PWA icons generated.")


if __name__ == "__main__":
    main()
