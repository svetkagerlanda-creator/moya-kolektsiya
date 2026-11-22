#!/usr/bin/env python3
"""Build individually importable G4 Blind Bags waves from the MLP Merch database.

Every wave must match the source's exact release count. Use source detail IDs to
keep variant mini-figures separate. Failed/incomplete waves are excluded rather
than silently padded with fake figures. Published series may be imported one by one.
"""
import json
import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "catalogs" / "verified-blind-bags.json"
ERRORS = ROOT / "catalogs" / "blind-bags-errors.json"
BASE = "https://data.mlpmerch.com"
LISTING = BASE + "/blind-bags/release/"
HTTP = requests.Session()
HTTP.headers.update({"User-Agent": "Mozilla/5.0 (compatible; personal-collectibles-archive/1.0)"})

def get(url):
    resp = HTTP.get(url, timeout=45)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")

def discover():
    soup = get(LISTING)
    result = {}
    for link in soup.select('a[href*="/blind-bags/release/"]'):
        url = urljoin(LISTING,link.get("href",""))
        parts = urlsplit(url)
        if parts.hostname != "data.mlpmerch.com":
            continue
        match = re.fullmatch(r"/blind-bags/release/(wave-\d+[a-z]?)/", parts.path)
        if not match:
            continue
        slug = match.group(1)
        name = "Wave " + slug[5:].upper()
        result[slug] = {"name": "Hasbro · G4 Blind Bags · " + name, "url": url}
    if not result:
        raise ValueError("Source does not list any wave pages")
    return list(result.values())

def parse_wave(name,url):
    soup = get(url)
    h1 = soup.find("h1")
    heading = h1.get_text(" ",strip=True) if h1 else ""
    if "Blind Bags" not in heading:
        raise ValueError(f"Unexpected page title: {heading!r}")
    # The published count is on the specific release page, not the overview:
    # regional releases may be represented differently between sections.
    text = soup.get_text(" ",strip=True)
    match = re.search(r"with a total of (\d+) releases",text,re.I)
    if not match:
        raise ValueError("Source does not specify a full release count")
    expected = int(match.group(1))
    items = {}
    for link in soup.select('a[href*="/blind-bags/details/"]'):
        bottom = link.find_parent(class_="data-bottom")
        if bottom is None:
            continue
        source = urljoin(url, link.get("href",""))
        if urlsplit(source).hostname != "data.mlpmerch.com":
            continue
        key = urlsplit(source).path.rstrip("/").rsplit("/",1)[-1]
        if not key:
            continue
        title = link.get_text(" ",strip=True)
        if not title:
            continue
        info = bottom.get_text(" ",strip=True)
        set_link = bottom.select_one('a[href*="/blind-bags/set/"]')
        body_link = bottom.select_one('a[href*="/blind-bags/body/"]')
        annotations = [x.get_text(" ",strip=True) for x in bottom.select(".data-smallt")]
        year = next((value for value in annotations if re.fullmatch(r"20\d{2}",value)),"")
        numbered = re.search(r":\s*(#[0-9][0-9A-Za-z, #]*)",info)
        number_text = numbered.group(1).strip() if numbered else ""
        # Distinct MLP Merch item IDs preserve regional and packaging variants.
        photo = ""
        root = bottom.parent
        if root:
            for img in root.select("img"):
                alt = img.get("alt","")
                if "Blind Bag" not in alt or "Buy " in alt:
                    continue
                original = img.get("data-src") or img.get("src") or ""
                candidate = urljoin(url,original) if original else ""
                if urlsplit(candidate).scheme == "https":
                    photo = candidate
                    break
        items[key] = {
            "name": title,
            "catalogPosition": key,
            "figureNumber": number_text,
            "manufacturer": "Hasbro",
            "seriesNumber": name.rsplit(" · ",1)[-1],
            "bodyType": body_link.get_text(" ",strip=True) if body_link else "",
            "setName": set_link.get_text(" ",strip=True) if set_link else "",
            "year": year,
            "description": "; ".join(x for x in annotations if x != year),
            "sourceUrl": source,
            "photo": photo,
        }
    if len(items) != expected:
        raise ValueError(f"Expected {expected} release variants; parsed {len(items)} unique figure links")
    return {"name":name,"count":expected,"manufacturer":"Hasbro","source":url,
            "verified":True,"items":list(items.values())}

def main():
    known = {}
    if OUTPUT.exists():
        try:
            known = {x["name"]: x for x in json.loads(OUTPUT.read_text(encoding="utf8")).get("series",[])}
        except (ValueError,OSError):
            pass
    errors = {}
    waves = discover()
    for entry in waves:
        name,url = entry["name"],entry["url"]
        try:
            record = parse_wave(name,url)
            known[name] = record
            count = sum(bool(x["photo"]) for x in record["items"])
            print(f"OK {name}: {record['count']} verified figures, {count} photos",flush=True)
        except Exception as error:
            errors[name] = str(error)
            print(f"SKIPPED {name}: {error}",flush=True)
        time.sleep(0.2)
    complete = [known[x["name"]] for x in waves if x["name"] in known]
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps({"schemaVersion":1,"series":complete},
        ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf8")
    ERRORS.write_text(json.dumps(errors,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print(f"COMPLETE {len(complete)}/{len(waves)} waves, {sum(x['count'] for x in complete)} figures; {len(errors)} skipped",flush=True)

if __name__ == "__main__":
    main()
