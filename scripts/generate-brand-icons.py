#!/usr/bin/env python3
"""Generate PWA / home-screen icons from the Canam CRM mark."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SOURCE = PUBLIC / "canam-crm-favicon.png"
NAVY = (11, 18, 32, 255)
WHITE = (255, 255, 255, 255)


def knock_out_white(img: Image.Image, threshold: int = 246) -> Image.Image:
    pixels = img.getdata()
    cleaned = []
    for r, g, b, a in pixels:
        if a > 0 and r >= threshold and g >= threshold and b >= threshold:
            cleaned.append((255, 255, 255, 0))
        else:
            cleaned.append((r, g, b, a))
    out = img.copy()
    out.putdata(cleaned)
    return out


def tight_crop(img: Image.Image, padding: int = 4) -> Image.Image:
    transparent = knock_out_white(img.convert("RGBA"))
    bbox = transparent.getbbox()
    if not bbox:
        return transparent
    cropped = transparent.crop(bbox)
    padded = Image.new("RGBA", (cropped.width + padding * 2, cropped.height + padding * 2), (0, 0, 0, 0))
    padded.paste(cropped, (padding, padding), cropped)
    return padded


def fit_on_canvas(src: Image.Image, size: int, bg, pad_ratio: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    artwork = tight_crop(src)
    inner = int(size * (1 - pad_ratio * 2))
    ratio = min(inner / artwork.width, inner / artwork.height)
    nw = max(1, int(artwork.width * ratio))
    nh = max(1, int(artwork.height * ratio))
    resized = artwork.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas


def maskable_icon(src: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), NAVY)
    circle_d = int(size * 0.68)
    circle = Image.new("RGBA", (circle_d, circle_d), (0, 0, 0, 0))
    ImageDraw.Draw(circle).ellipse((0, 0, circle_d - 1, circle_d - 1), fill=WHITE)
    art = tight_crop(src)
    art_size = int(circle_d * 0.72)
    ratio = min(art_size / art.width, art_size / art.height)
    nw, nh = max(1, int(art.width * ratio)), max(1, int(art.height * ratio))
    resized = art.resize((nw, nh), Image.Resampling.LANCZOS)
    circle.paste(resized, ((circle_d - nw) // 2, (circle_d - nh) // 2), resized)
    offset = (size - circle_d) // 2
    canvas.paste(circle, (offset, offset), circle)
    return canvas


def save_png(img: Image.Image, path: Path, rgb: bool = True) -> None:
    out = img.convert("RGB") if rgb else img
    out.save(path, "PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} {out.size}")


def main() -> None:
    mark = Image.open(SOURCE).convert("RGBA")
    save_png(fit_on_canvas(mark, 192, WHITE, 0.10), PUBLIC / "icon-192x192.png")
    save_png(fit_on_canvas(mark, 512, WHITE, 0.10), PUBLIC / "icon-512x512.png")
    save_png(fit_on_canvas(mark, 180, WHITE, 0.10), PUBLIC / "apple-touch-icon.png")
    save_png(fit_on_canvas(mark, 180, WHITE, 0.10), PUBLIC / "icon-180x180.png")
    save_png(fit_on_canvas(mark, 192, WHITE, 0.10), PUBLIC / "icon-192.png")
    save_png(fit_on_canvas(mark, 32, WHITE, 0.08), PUBLIC / "icon-32x32.png")
    save_png(fit_on_canvas(mark, 16, WHITE, 0.08), PUBLIC / "icon-16x16.png")
    save_png(maskable_icon(mark, 192), PUBLIC / "icon-maskable-192.png")
    save_png(maskable_icon(mark, 512), PUBLIC / "icon-maskable-512.png")
    print("Brand icons generated.")


if __name__ == "__main__":
    main()
