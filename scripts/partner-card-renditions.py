#!/usr/bin/env python3
"""
Card-sized copies of the partner homes' cover photos.

Why this exists
---------------
The partner (Tripwix) photos are static files under /homes/photos
(scripts/tripwix-images.py): the cover, images[0], the photo every card shows,
at 1600 px; the others at 1080 px. Guesty photos get a srcset from Cloudinary
(lib/images.ts, guestySrcSet), but a static file has one size, so a card drew
the 1600 px cover in a 272-358 CSS px box. The destination guides' homes strip
sits about one screen down, inside Chrome's lazy-load margin: a phone opening
the Douro guide fetched 612 KB for its first two covers (revisão 2 do PR #175).

This writes <name>-480w.webp, <name>-800w.webp and <name>-1080w.webp next to
each cover and lists the covers in client/src/data/partner-card-renditions.json,
which lib/images.ts (cardSrcSet) reads to give those photos a srcset. Only the
covers: the other photos load when a guest swipes, as before.

A cover without renditions keeps its single file, so nothing breaks; but
server/partner-card-renditions.test.ts fails until this is run again after an
import moves a different photo to the front (content/tripwix-copy.json,
coverIndex). Existing files are left alone, so re-runs are cheap.

Usage:  python3 scripts/partner-card-renditions.py
"""

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PROPS = ROOT / "client" / "src" / "data" / "tripwix-properties.json"
PUBLIC = ROOT / "client" / "public"
MANIFEST = ROOT / "client" / "src" / "data" / "partner-card-renditions.json"

# A phone card is 272-358 CSS px wide: 480 covers 1x-1.75x, 800 2x, 1080 3x.
WIDTHS = [480, 800, 1080]
QUALITY = 72  # as scripts/tripwix-images.py


def rendition_path(cover: Path, width: int) -> Path:
    return cover.with_name(f"{cover.stem}-{width}w{cover.suffix}")


def main() -> None:
    props = json.loads(PROPS.read_text())
    covers: dict[str, int] = {}
    written = 0
    for p in props:
        images = p.get("images") or []
        if not images or not str(images[0]).startswith("/homes/photos/"):
            continue
        url = images[0]
        src = PUBLIC / url.lstrip("/")
        with Image.open(src) as im:
            original_width = im.size[0]
            for width in WIDTHS:
                if width >= original_width:
                    continue
                dest = rendition_path(src, width)
                if dest.exists() and dest.stat().st_size > 0:
                    continue
                copy = im.convert("RGB") if im.mode not in ("RGB", "L") else im.copy()
                copy.thumbnail((width, width * 10), Image.LANCZOS)
                copy.save(dest, "WEBP", quality=QUALITY, method=6)
                written += 1
        covers[url] = original_width

    MANIFEST.write_text(json.dumps({
        "_README": "Written by scripts/partner-card-renditions.py: the partner covers (images[0]) that have <name>-<w>w.webp copies next to them, with the original's width. lib/images.ts (cardSrcSet) builds their srcset from this.",
        "widths": WIDTHS,
        "covers": dict(sorted(covers.items())),
    }, indent=2) + "\n")
    print(f"{len(covers)} covers, {written} new files -> {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
