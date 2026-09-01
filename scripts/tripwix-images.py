#!/usr/bin/env python3
"""
Bring the Tripwix partner photos onto our own domain.

Why this exists
---------------
The partner API hands back photo URLs on Tripwix's CloudFront, and their CDN
does no transformation at all: every request returns the same ~453 KB JPEG,
whatever width you ask for and whatever formats you say you accept. Twenty of
those on a property page is roughly 9 MB of images.

Serving them from their CDN also means every visitor to one of our pages shows
up in their logs — which property, how often, and the referring URL. They sell
the same houses, so that is a live read on our demand.

This downloads the originals once, converts them to WebP at the widths the site
actually renders, and writes them into client/public so they ship with the
build and are served from portugalactive.com like the rest of our imagery.

Their originals are 1920x1080, so 1600 is the practical ceiling — there is no
2560 master to work from, unlike our own homes.

The untouched JPEGs are kept in exports/ (gitignored) because they are the
usable source for social posts.

Usage:  python3 scripts/tripwix-images.py [--limit N]
"""

import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PROPS = ROOT / "client" / "src" / "data" / "tripwix-properties.json"
ORIGINALS = ROOT / "exports" / "tripwix-photos"
PUBLIC = ROOT / "client" / "public" / "homes" / "tripwix"

# Widths the site renders. The gallery and cards use 1080; only the hero on the
# PDP asks for more, so only the first photo carries the larger file.
GALLERY_WIDTH = 1080
HERO_WIDTH = 1600
QUALITY = 72

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"


def fetch(url: str, dest: Path) -> bool:
    """Download once. Existing files are left alone so re-runs are cheap."""
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        if not data:
            return False
        dest.write_bytes(data)
        return True
    except Exception as e:  # noqa: BLE001 - report and carry on
        print(f"    download failed {url}: {e}", file=sys.stderr)
        return False


def convert(src: Path, dest: Path, width: int) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        im = Image.open(src)
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        # Never upscale: their sources are modest and enlarging only adds bytes.
        if im.size[0] > width:
            im.thumbnail((width, width * 10), Image.LANCZOS)
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest, "WEBP", quality=QUALITY, method=6)
        return True
    except Exception as e:  # noqa: BLE001
        print(f"    convert failed {src}: {e}", file=sys.stderr)
        return False


def handle(job):
    ref, idx, url = job
    ext = os.path.splitext(url.split("?")[0])[1] or ".jpg"
    original = ORIGINALS / ref / f"{idx:02d}{ext}"
    original.parent.mkdir(parents=True, exist_ok=True)

    if not fetch(url, original):
        return None

    out = PUBLIC / ref / f"{idx:02d}.webp"
    width = HERO_WIDTH if idx == 0 else GALLERY_WIDTH
    if not convert(original, out, width):
        return None
    return (ref, idx, f"/homes/tripwix/{ref}/{idx:02d}.webp")


def main() -> None:
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])

    props = json.loads(PROPS.read_text())
    if limit:
        props = props[:limit]

    jobs = []
    for p in props:
        for i, url in enumerate(p.get("images", [])):
            jobs.append((p["supplierReference"], i, url))

    print(f"{len(props)} properties, {len(jobs)} photos")
    ORIGINALS.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)

    done = 0
    results = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        for res in pool.map(handle, jobs):
            done += 1
            if res:
                results.append(res)
            if done % 50 == 0:
                print(f"  {done}/{len(jobs)}")

    # Map each property to its local paths, in order, for the importer to read.
    mapping: dict[str, list[str]] = {}
    for ref, idx, path in results:
        mapping.setdefault(ref, []).append((idx, path))
    out = {ref: [p for _, p in sorted(v)] for ref, v in mapping.items()}

    manifest = ROOT / "content" / "tripwix-images.json"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(out, indent=2) + "\n")

    total = sum(f.stat().st_size for f in PUBLIC.rglob("*.webp"))
    orig = sum(f.stat().st_size for f in ORIGINALS.rglob("*") if f.is_file())
    print(f"\nconverted {len(results)}/{len(jobs)}")
    print(f"webp shipped : {total / 1024 / 1024:.1f} MB  -> {PUBLIC}")
    print(f"originals    : {orig / 1024 / 1024:.1f} MB  -> {ORIGINALS} (gitignored, use for social)")
    print(f"manifest     : {manifest}")


if __name__ == "__main__":
    main()
