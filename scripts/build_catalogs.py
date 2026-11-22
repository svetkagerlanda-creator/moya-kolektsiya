#!/usr/bin/env python3
"""Build verified offline Kayou card catalogs from public Golden TCG set pages.

A catalog is published only if every expected distinct printed card ID is parsed.
No placeholders, no invented names or image URLs.
"""
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "catalogs" / "verified-kayou.json"
SOURCES = [
    ("Kayou · Moon Edition · Series 1", "kayou-mlp-moon-001-na", 186),
    ("Kayou TCG · Friendships Begin — Twilight Sparkle", "kayou-mlp-friendships-begin-twilight-sparkle-na", 21),
    ("Kayou TCG · Friendships Begin — Fluttershy", "kayou-mlp-friendships-begin-fluttershy-na", 21),
    ("Kayou TCG · Friendships Begin — Pinkie Pie", "kayou-mlp-friendships-begin-pinkie-pie-na", 21),
    ("Kayou TCG · Friendships Begin — Applejack", "kayou-mlp-friendships-begin-applejack-na", 21),
    ("Kayou TCG · Friendships Begin — Rainbow Dash", "kayou-mlp-friendships-begin-rainbow-dash-na", 21),
    ("Kayou TCG · Friendships Begin — Rarity", "kayou-mlp-friendships-begin-rarity-na", 21),
    ("Kayou TCG · Friendships Begin — Bonus Pack", "kayou-mlp-friendships-begin-bonus-pack-na", 68),
    ("Kayou TCG · Booster Pack — Fantasy Wonderland", "kayou-mlp-booster-fantasy-wonderland-na", 191),
    ("Kayou TCG · Booster Pack — Discord!!!", "kayou-series-ry03llcx", 191),
    ("Kayou TCG · Booster Pack — Nightmare Night", "kayou-series-27z4pa09", 190),
    ("Kayou TCG · Booster Pack — Hearth's Warming Eve", "kayou-series-i9q374dz", 197),
    ("Kayou · Fun Moments Edition · Series 1", "kayou-mlp-fun-moments-001-na", 127),
    ("Kayou · Star Edition · Series 1", "kayou-mlp-star-001-na", 105),
    ("Kayou · Moon Edition · Series 2", "kayou-mlp-moon-002-na", 189),
    ("Kayou · Moon Edition · Series 3", "kayou-mlp-moon-003-na", 290),
    ("Kayou · Moon Edition · Series 4", "kayou-mlp-moon-004-na", 162),
    ("Kayou · Fun Moments Edition · Series 2", "kayou-mlp-fun-moments-002-na", 136),
    ("Kayou · Fun Moments Edition · Series 3", "kayou-mlp-fun-moments-003-na", 148),
    ("Kayou · Fun Moments Edition · Series 4", "kayou-mlp-fun-moments-004-na", 287),
    ("Kayou · Rainbow Edition · Series 1", "kayou-mlp-rainbow-001-na", 146),
    ("Kayou · Rainbow Edition · Series 2", "kayou-mlp-rainbow-002-na", 170),
]
CARD_RE = re.compile(r"(MLP-(?:[A-Z0-9]+-){1,4}\d{3})", re.I)
session = requests.Session()
session.headers.update({"User-Agent": "MoyaKolektsiyaCatalogBuilder/1.0 (+public catalog indexing)"})

def parse(source, slug, expected):
    url = f"https://goldentcg.app/sets/{slug}"
    resp = session.get(url, timeout=35)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    cards = {}
    for link in soup.select('a[href*="/cards/"]'):
        href = urljoin(url, link.get("href", ""))
        if urlsplit(href).hostname != "goldentcg.app":
            continue
        match = CARD_RE.search(link.get_text(" ", strip=True))
        if not match:
            match = CARD_RE.search(href.upper())
        if not match:
            continue
        code = match.group(1).upper()
        # The visible anchor contains the name, the printed ID and rarity.
        label = link.get_text(" ", strip=True)
        start = label.upper().find(code)
        name = label[:start].strip() if start >= 0 else ""
        if not name:
            img = link.find("img")
            alt = img.get("alt", "") if img else ""
            name = re.split(re.escape(code), alt, flags=re.I)[0].strip()
        if not name or len(name) > 160:
            continue
        rarity = code.rsplit("-", 2)[-2]
        image = link.find("img")
        photo = ""
        if image:
            raw = image.get("src") or image.get("data-src") or ""
            if raw and not raw.startswith("data:"):
                resolved = urljoin(url, raw)
                if urlsplit(resolved).scheme == "https":
                    photo = resolved
        cards[code] = {
            "name": name,
            "figureNumber": code,
            "rarity": rarity,
            "manufacturer": "Kayou",
            "sourceUrl": href,
            "photo": photo,
        }
    if len(cards) != expected:
        raise ValueError(f"{source}: expected {expected}, extracted {len(cards)}; refusing incomplete catalog")
    values = sorted(cards.values(), key=lambda row: row["figureNumber"])
    return {"name": source, "source": url, "count": expected, "items": values, "verified": True}

def main():
    existing = []
    if OUTPUT.exists():
        try:
            existing = json.loads(OUTPUT.read_text(encoding="utf-8")).get("series", [])
        except (ValueError, OSError):
            pass
    prior = {entry["name"]: entry for entry in existing}
    success = 0
    errors = []
    for name, slug, expected in SOURCES:
        try:
            record = parse(name, slug, expected)
            prior[name] = record
            success += 1
            print(f"OK {name}: {expected} verified items")
        except Exception as exc:
            errors.append(f"{name}: {exc}")
            print(f"SKIPPED {name}: {exc}", file=sys.stderr)
        time.sleep(0.4)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    # Preserve earlier successfully verified data when a provider is temporarily down.
    series = [prior[name] for name, _, _ in SOURCES if name in prior]
    OUTPUT.write_text(json.dumps({"schemaVersion": 1, "series": series}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Written {len(series)} verified series; {success} refreshed; {len(errors)} unavailable")
    if errors and not series:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
