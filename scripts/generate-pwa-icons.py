#!/usr/bin/env python3
"""Generate PWA PNG icons and splash screens from the Canam STUDYABROAD logo."""
from io import BytesIO
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
LOGO_SVG = PUBLIC / "icon.svg"
MARK_SVG = PUBLIC / "favicon.svg"
RED = "#cc0000"
CREAM = "#fff7f5"
WHITE = "#ffffff"


def svg_to_pil(svg_path: Path, size: int) -> Image.Image:
    png_bytes = cairosvg.svg2png(url=str(svg_path), output_width=size, output_height=size)
    return Image.open(BytesIO(png_bytes)).convert("RGBA")


def knock_out_white(img: Image.Image, threshold: int = 248) -> Image.Image:
    pixels = img.getdata()
    cleaned = []
    for r, g, b, a in pixels:
        if a > 0 and r >= threshold and g >= threshold and b >= threshold:
            cleaned.append((255, 255, 255, 0))
        else:
            cleaned.append((r, g, b, a))
    img.putdata(cleaned)
    return img


def tight_crop(img: Image.Image, padding: int = 8) -> Image.Image:
    transparent = knock_out_white(img.copy())
    bbox = transparent.getbbox()
    if not bbox:
        return img
    cropped = transparent.crop(bbox)
    padded = Image.new("RGBA", (cropped.width + padding * 2, cropped.height + padding * 2), (0, 0, 0, 0))
    padded.paste(cropped, (padding, padding), cropped)
    return padded


def fit_on_canvas(src: Image.Image, size: int, bg: str, pad_ratio: float = 0.10) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    artwork = tight_crop(src)
    inner = int(size * (1 - pad_ratio * 2))
    ratio = min(inner / artwork.width, inner / artwork.height)
    nw = max(1, int(artwork.width * ratio))
    nh = max(1, int(artwork.height * ratio))
    resized = artwork.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas


def save_rgb(img: Image.Image, path: Path) -> None:
    img.convert("RGB").save(path, "PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def maskable_icon(mark: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), RED)
    circle_d = int(size * 0.64)
    circle = Image.new("RGBA", (circle_d, circle_d), (0, 0, 0, 0))
    ImageDraw.Draw(circle).ellipse((0, 0, circle_d - 1, circle_d - 1), fill=WHITE)
    art = tight_crop(mark.copy())
    art_size = int(circle_d * 0.58)
    ratio = min(art_size / art.width, art_size / art.height)
    nw, nh = max(1, int(art.width * ratio)), max(1, int(art.height * ratio))
    resized = art.resize((nw, nh), Image.Resampling.LANCZOS)
    circle.paste(resized, ((circle_d - nw) // 2, (circle_d - nh) // 2), resized)
    offset = (size - circle_d) // 2
    canvas.paste(circle, (offset, offset), circle)
    return canvas


def splash_badge(logo: Image.Image, width: int) -> Image.Image:
    art = tight_crop(logo.copy())
    ratio = width / art.width
    nw, nh = width, max(1, int(art.height * ratio))
    resized = art.resize((nw, nh), Image.Resampling.LANCZOS)
    pad = 36
    badge = Image.new("RGBA", (nw + pad * 2, nh + pad * 2), WHITE)
    badge.paste(resized, (pad, pad), resized)
    return badge


def make_splash(width: int, height: int, logo: Image.Image) -> Image.Image:
    img = Image.new("RGB", (width, height), CREAM)
    draw = ImageDraw.Draw(img)
    draw.ellipse((-int(width * 0.2), -int(height * 0.12), int(width * 1.2), int(height * 0.26)), fill=RED)
    draw.ellipse((int(width * 0.55), int(height * 0.78), int(width * 1.25), int(height * 1.18)), fill="#f8d7d4")

    logo_w = min(int(width * 0.62), 620)
    badge = splash_badge(logo, logo_w)
    lx = (width - badge.width) // 2
    ly = int(height * 0.34) - badge.height // 2
    img.paste(badge.convert("RGB"), (lx, ly))

    draw = ImageDraw.Draw(img)
    title = "Canam CRM"
    subtitle = "STUDYABROAD"
    title_font = font(max(36, width // 14), bold=True)
    sub_font = font(max(18, width // 26), bold=False)
    tw = draw.textlength(title, font=title_font)
    sw = draw.textlength(subtitle, font=sub_font)
    text_y = ly + badge.height + int(height * 0.03)
    draw.text(((width - tw) / 2, text_y), title, fill="#111827", font=title_font)
    draw.text(((width - sw) / 2, text_y + int(height * 0.038)), subtitle, fill=RED, font=sub_font)
    return img


def main() -> None:
    PUBLIC.mkdir(exist_ok=True)
    logo = svg_to_pil(LOGO_SVG, 1024)
    mark = svg_to_pil(MARK_SVG, 1024)

    save_rgb(fit_on_canvas(logo, 192, WHITE, 0.08), PUBLIC / "icon-192x192.png")
    save_rgb(fit_on_canvas(logo, 512, WHITE, 0.08), PUBLIC / "icon-512x512.png")
    save_rgb(maskable_icon(mark, 192), PUBLIC / "icon-maskable-192.png")
    save_rgb(maskable_icon(mark, 512), PUBLIC / "icon-maskable-512.png")
    save_rgb(fit_on_canvas(logo, 180, WHITE, 0.08), PUBLIC / "apple-touch-icon.png")
    save_rgb(fit_on_canvas(logo, 180, WHITE, 0.08), PUBLIC / "icon-180x180.png")
    save_rgb(fit_on_canvas(mark, 32, WHITE, 0.08), PUBLIC / "icon-32x32.png")
    save_rgb(fit_on_canvas(mark, 16, WHITE, 0.08), PUBLIC / "icon-16x16.png")
    save_rgb(fit_on_canvas(logo, 192, WHITE, 0.08), PUBLIC / "icon-192.png")

    splashes = {
        "splash-1080x1920.png": (1080, 1920),
        "splash-1290x2796.png": (1290, 2796),
        "splash-1179x2556.png": (1179, 2556),
        "splash-1170x2532.png": (1170, 2532),
        "splash-828x1792.png": (828, 1792),
        "splash-2048x2732.png": (2048, 2732),
    }
    for name, (w, h) in splashes.items():
        save_rgb(make_splash(w, h, logo), PUBLIC / name)

    print("PWA icons and splash screens generated.")


if __name__ == "__main__":
    main()
