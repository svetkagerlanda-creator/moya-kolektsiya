#!/usr/bin/env python3
"""Build MLP Merch Hasbro G4 Brushables offline checklists.

Each entry is an actual photographed release identified by its distinct MLP Merch
detail URL. Publish a series only when the unique item count exactly matches the
source's published total. Do not invent product numbers.
"""
import json
import re
from pathlib import Path
from urllib.parse import urljoin,urlsplit
import requests
from bs4 import BeautifulSoup

BASE="https://data.mlpmerch.com"
DEST=Path(__file__).resolve().parents[1]/"catalogs"/"verified-brushables.json"
SERIES=[
 ("Original Series","original-series",172),
 ("Pony Wedding","pony-wedding",35),
 ("Crystal Empire","crystal-empire",36),
 ("Crystal Princess Celebration","crystal-princess-celebration",23),
 ("Rainbow Power","rainbow-power",50),
 ("Cutie Mark Magic","cutie-mark-magic",89),
 ("Explore Equestria","explore-equestria",70),
 ("Reboot Series","reboot-series",64),
 ("My Little Pony the Movie","my-little-pony-the-movie",132),
 ("School of Friendship","school-of-friendship",61),
 ("Rainbow Road Trip","rainbow-road-trip",72),
 ("Reveal the Magic","reveal-the-magic",7),
]


def discover_series():
    """Read EVERY linked series and its published count, including store exclusives.

    The source index, not an outdated manually curated list, is authoritative.
    """
    index_url = f"{BASE}/brushables/series/"
    reply = requests.get(index_url, timeout=50, headers={"User-Agent": "Mozilla/5.0 (noncommercial personal collection index)"})
    reply.raise_for_status()
    soup = BeautifulSoup(reply.text, "html.parser")
    seen = {}
    for a in soup.select('a[href*="/brushables/series/"]'):
        url = urljoin(index_url, a.get("href", ""))
        parsed = urlsplit(url)
        matched = re.fullmatch(r"/brushables/series/([a-z0-9-]+)/", parsed.path)
        if parsed.hostname != "data.mlpmerch.com" or not matched:
            continue
        slug = matched.group(1)
        container = a
        count = None
        # Counts are adjacent to links in source cards, not always in the anchor.
        for parent in [a, a.parent, a.parent.parent if a.parent else None]:
            if parent is None:
                continue
            label = parent.get_text(" ", strip=True)
            match = re.search(r"\\(([0-9,]+)\\s+(?:ponies|pony|figures|releases)\\)", label, re.I)
            if match:
                count = int(match.group(1).replace(",", ""))
                container = parent
                break
        if not count:
            continue
        title = a.get_text(" ", strip=True)
        if not title or re.fullmatch(r"[0-9,]+\\s+(?:ponies|pony|figures|releases)", title, re.I):
            title = slug.replace("-", " ").title()
        title = re.sub(r"\\s*\\([0-9,]+\\s+(?:ponies|pony|figures|releases)\\).*", "", title, flags=re.I).strip()
        if len(title) > 80:
            title = slug.replace("-", " ").title()
        seen[slug] = (title, slug, count)
    if not seen:
        raise ValueError("Source series index returned no recognized series")
    # Keep canonical names for already published folders.
    for title, slug, _ in SERIES:
        if slug in seen:
            seen[slug] = (title, slug, seen[slug][2])
    return list(seen.values())

def extract(title,slug,expected):
    url=urljoin(BASE,f"/brushables/series/{slug}/")
    reply=requests.get(url,timeout=50,headers={"User-Agent":"Mozilla/5.0 (noncommercial personal collection index)"})
    reply.raise_for_status()
    soup=BeautifulSoup(reply.text,"html.parser")
    items={}
    for a in soup.select('a[href*="/brushables/details/"]'):
        bottom=a.find_parent(class_="data-bottom")
        if bottom is None:
            continue
        href=urljoin(url,a.get("href",""))
        if urlsplit(href).hostname!="data.mlpmerch.com":
            continue
        key=urlsplit(href).path.rstrip("/").split("/")[-1]
        if not key:
            continue
        name=a.get_text(" ",strip=True)
        body=bottom.select_one('a[href*="/brushables/body/"]')
        setlink=bottom.select_one('a[href*="/brushables/set/"]')
        original=bottom.get_text(" ",strip=True)
        year_match=re.search(r"\((20\d{2})\)",original)
        note_el=bottom.select_one(".data-smallt")
        notes=note_el.get_text(" ",strip=True) if note_el else ""
        photo=""
        root=bottom.parent
        # Product card wrappers differ between MLP Merch databases. Always
        # select the image from this very item; pixel.gif is a tracking image.
        if root:
            for img in root.select(".data-top img.data-img"):
                path=img.get("data-src") or img.get("src") or ""
                if "/v/pixel.gif" in path.lower():
                    path=(img.parent.get("href") if img.parent else "") or ""
                candidate=urljoin(url,path) if path else ""
                if (urlsplit(candidate).scheme=="https"
                        and "/v/pixel.gif" not in candidate.lower()
                        and urlsplit(candidate).hostname!="mlpmerch.mlpmerch.com"):
                    photo=candidate
                    break
        if not name:
            continue
        items[key]={
            "name":name,
            "catalogPosition":key,
            "figureNumber":"",
            "manufacturer":"Hasbro",
            "seriesNumber":slug,
            "bodyType":body.get_text(" ",strip=True) if body else "",
            "setName":setlink.get_text(" ",strip=True) if setlink else "",
            "year":year_match.group(1) if year_match else "",
            "description":notes,
            "sourceUrl":href,
            "photo":photo,
        }
    if len(items)!=expected:
        raise ValueError(f"{title}: expected {expected} releases, found {len(items)} distinct links")
    return {"name":"Hasbro · G4 Brushables · "+title,"manufacturer":"Hasbro","source":url,"count":expected,"verified":True,"items":list(items.values())}

def main():
    old={}
    if DEST.exists():
        try:
            old={s["name"]:s for s in json.loads(DEST.read_text(encoding="utf8")).get("series",[])}
        except (OSError,ValueError):
            pass
    errors={}
    try:
        target_series=discover_series()
        print(f"SOURCE INDEX: {len(target_series)} G4 Brushables series")
    except Exception as error:
        target_series=SERIES
        errors["SERIES INDEX"]=str(error)
        print(f"SOURCE INDEX unavailable; retaining original {len(SERIES)} known series: {error}")
    for title,slug,count in target_series:
        name="Hasbro · G4 Brushables · "+title
        try:
            found=extract(title,slug,count)
            # Keep a previously verified image for the same exact release when
            # the source temporarily omits an image during a subsequent scrape.
            # Never borrow a photo from another variant or matching pony name.
            previous_by_url = {
                item.get("sourceUrl"): item
                for item in old.get(name, {}).get("items", [])
                if item.get("sourceUrl")
            }
            for item in found["items"]:
                previous = previous_by_url.get(item["sourceUrl"])
                if not item["photo"] and previous and previous.get("photo"):
                    item["photo"] = previous["photo"]
            old[name]=found
            print(f"OK {name}: {count} releases; images={sum(bool(x['photo']) for x in found['items'])}")
        except Exception as error:
            errors[name]=str(error)
            print(f"SKIP {name}: {error}")
    result=sorted(old.values(),key=lambda entry: entry["name"])
    DEST.parent.mkdir(parents=True,exist_ok=True)
    DEST.write_text(json.dumps({"schemaVersion":1,"series":result},ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf8")
    (DEST.parent/"brushables-errors.json").write_text(json.dumps(errors,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print(f"Verified {len(result)}/{len(target_series)} indexed series; {sum(x['count'] for x in result)} items")

if __name__=="__main__":
    main()
