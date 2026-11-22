#!/usr/bin/env python3
"""Audit collectible catalogue image references without changing catalogue data.

Usage:
  python scripts/audit_catalog_images.py
  python scripts/audit_catalog_images.py --output catalogs/image-audit.json

This is a static URL audit. It does NOT establish whether remote hosts return
working image bytes. The image availability must be checked separately.
"""
import argparse
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlsplit
import json

ROOT = Path(__file__).resolve().parents[1]
TRACKER_MARKERS = ("/v/pixel.gif", "1x1.gif", "tracking.gif", "spacer.gif")
PHOTO_KEYS = ("photo", "image", "imageUrl", "image_url", "thumbnail")

def collect_items(node, where="root"):
    if isinstance(node, dict):
        if isinstance(node.get("items"), list):
            series = str(node.get("name", where))
            for index, item in enumerate(node["items"], 1):
                if isinstance(item, dict):
                    yield (series, index, item)
        for key, value in node.items():
            if key != "items" and isinstance(value, (list, dict)):
                yield from collect_items(value, str(key))
    elif isinstance(node, list):
        for index, value in enumerate(node, 1):
            yield from collect_items(value, f"{where}[{index}]")

def audit_catalog(path):
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return {"file": str(path.relative_to(ROOT)), "error": str(exc)}
    problems = []
    reused = defaultdict(list)
    count = 0
    for series, index, item in collect_items(raw):
        count += 1
        ident = str(item.get("figureNumber") or item.get("number") or item.get("id") or item.get("name") or index)
        photo = next((item[k] for k in PHOTO_KEYS if isinstance(item.get(k), str) and item[k].strip()), "")
        label = {"series": series, "item": ident}
        if not photo:
            problems.append({**label, "issue": "missing_photo"})
        elif any(marker in photo.lower() for marker in TRACKER_MARKERS):
            problems.append({**label, "issue": "tracking_pixel", "photo": photo})
        elif urlsplit(photo).scheme not in ("https", "http", "data") and not photo.startswith(("./", "../", "/")):
            problems.append({**label, "issue": "unrecognized_photo_path", "photo": photo})
        else:
            reused[photo].append(label)
    for photo, occurrences in reused.items():
        # Repetition within one catalogue may be intentional for variants; flag only.
        if len(occurrences) > 1:
            problems.append({"issue": "duplicate_photo_reference", "photo": photo, "occurrences": occurrences})
    return {"file": str(path.relative_to(ROOT)), "items": count, "problems": problems}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Optional JSON report path")
    args = parser.parse_args()
    paths = sorted((ROOT / "catalogs").rglob("*.json"))
    paths = [p for p in paths if p.name not in ("image-audit.json",)]
    results = [audit_catalog(path) for path in paths]
    totals = defaultdict(int)
    for result in results:
        for problem in result.get("problems", []):
            totals[problem["issue"]] += 1
    report = {"catalogFiles": len(results), "catalogItems": sum(r.get("items", 0) for r in results), "issues": dict(sorted(totals.items())), "catalogs": results}
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        dest = args.output if args.output.is_absolute() else ROOT / args.output
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(rendered, encoding="utf-8")
        print(f"Report saved: {dest}")
    else:
        print(rendered)

if __name__ == "__main__":
    main()
