"""Generate branded template images with market question text overlay."""
import io
import os
import textwrap
import logging

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

_DIR = os.path.dirname(__file__)
TEMPLATES_DIR = os.path.join(_DIR, "templates")
FONTS_DIR = os.path.join(_DIR, "fonts")

FONT_PATH = os.path.join(FONTS_DIR, "Inter-SemiBold.ttf")
SUBTITLE_FONT_PATH = os.path.join(FONTS_DIR, "Inter-Regular.ttf")

GREEN = "#4ade80"  # Tailwind green-400, matches the app

# White box coordinates (x_min, y_min, x_max, y_max) with inner padding applied
TEMPLATE_CONFIG = [
    {"file": "template_1.png", "box": (253, 99, 1076, 858)},
    {"file": "template_2.png", "box": (88, 312, 876, 689)},
    {"file": "template_3.png", "box": (117, 272, 905, 649)},
]

SUB_PRE = "Is trading on "
SUB_GREEN = "prediction markets"
SUB_LINE2 = "Read the AI Trade analysis"


def generate_image(market_question: str, template_index: int) -> bytes:
    """Generate a branded PNG image with market question overlaid on a template.

    Args:
        market_question: The full market question text to display.
        template_index: Used modulo 3 to select which template to use.

    Returns:
        PNG image bytes ready for Twitter media upload.
    """
    if not market_question:
        market_question = "Market Analysis"

    config = TEMPLATE_CONFIG[template_index % 3]
    with Image.open(os.path.join(TEMPLATES_DIR, config["file"])) as base:
        img = base.convert("RGBA")
    draw = ImageDraw.Draw(img)

    x_min, y_min, x_max, y_max = config["box"]
    box_w = x_max - x_min
    box_h = y_max - y_min
    padding = 30
    usable_w = box_w - padding * 2

    # Load fonts with fallback to default if files are missing
    try:
        _load_font = lambda path, size: ImageFont.truetype(path, size)
        _load_font(FONT_PATH, 20)  # test load
    except OSError:
        logger.warning("Font files not found at %s, using default font", FONTS_DIR)
        _load_font = lambda path, size: ImageFont.load_default()

    # Find best font size that fits the white box
    # M is the widest glyph; 0.55 approximates average char width for proportional fonts
    font = None
    wrapped = market_question
    line_height = 30
    for font_size in range(44, 18, -2):
        font = _load_font(FONT_PATH, font_size)
        avg_char_w = font.getbbox("M")[2]
        max_chars = int(usable_w / (avg_char_w * 0.55))
        wrapped = textwrap.fill(market_question, width=max(max_chars, 15))
        lines = wrapped.split("\n")
        line_height = font_size + 8
        text_h = len(lines) * line_height
        all_fit = all(draw.textlength(line, font=font) <= usable_w for line in lines)
        if all_fit and text_h < box_h * 0.50:
            break

    # Truncate if text still doesn't fit at smallest font size
    lines = wrapped.split("\n")
    text_h = len(lines) * line_height
    if text_h >= box_h * 0.50:
        max_lines = max(int(box_h * 0.50 / line_height) - 1, 1)
        lines = lines[:max_lines]
        lines[-1] = lines[-1][:max(len(lines[-1]) - 3, 0)] + "..."
        wrapped = "\n".join(lines)
        text_h = len(lines) * line_height

    subtitle_size = max(int(font_size * 0.45), 15)
    subtitle_font = _load_font(SUBTITLE_FONT_PATH, subtitle_size)
    subtitle_font_bold = _load_font(FONT_PATH, subtitle_size)

    lines = wrapped.split("\n")
    text_h = len(lines) * line_height

    sub1_h = subtitle_size + 6
    sub2_h = subtitle_size + 6
    gap1 = 28
    gap2 = 4
    total_h = text_h + gap1 + sub1_h + gap2 + sub2_h

    y_start = y_min + (box_h - total_h) // 2
    x_center = x_min + box_w // 2

    # Draw market question (center aligned, black)
    for line_idx, line in enumerate(lines):
        lw = draw.textlength(line, font=font)
        draw.text(
            (x_center - lw / 2, y_start + line_idx * line_height),
            line,
            fill="black",
            font=font,
        )

    # Subtitle line 1: "Is trading on " (gray) + "prediction markets" (green)
    sub1_y = y_start + text_h + gap1
    pre_w = draw.textlength(SUB_PRE, font=subtitle_font)
    green_w = draw.textlength(SUB_GREEN, font=subtitle_font_bold)
    total_sub1_w = pre_w + green_w
    sub1_x = x_center - total_sub1_w / 2

    draw.text((sub1_x, sub1_y), SUB_PRE, fill="#555555", font=subtitle_font)
    draw.text((sub1_x + pre_w, sub1_y), SUB_GREEN, fill=GREEN, font=subtitle_font_bold)

    # Subtitle line 2: "Read the AI Trade analysis" (gray)
    sub2_y = sub1_y + sub1_h + gap2
    sw2 = draw.textlength(SUB_LINE2, font=subtitle_font)
    draw.text((x_center - sw2 / 2, sub2_y), SUB_LINE2, fill="#555555", font=subtitle_font)

    # Export to PNG bytes
    out = img.convert("RGB")
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    result = buf.getvalue()
    buf.close()
    return result
