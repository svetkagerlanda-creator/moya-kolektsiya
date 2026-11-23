#!/usr/bin/env python3
"""Incrementally import every distinct MLP Merch category's real subseries.

No invented items: publish only series whose full source-declared number of
unique release detail links were extracted. Preserve previously verified data
if upstream pages are down. Each physical release is a separate card.
"""
import concurrent.futures as futures
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit
import requests
from bs4 import BeautifulSoup

BASE = "https://data.mlpmerch.com"
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "catalogs/verified-mlp-all-series.json"
ERRORS = ROOT / "catalogs/mlp-all-series-errors.json"
HEADERS = {"User-Agent": "Mozilla/5.0 (personal noncommercial collection indexing)"}

# Primary grouping per database, so one release is not duplicated under both
# its series and set. Earlier specialized importers cover brushables, blind bags,
# CMC, and some figures; source URLs identify the same release across files.
DATABASES = [
 ("g1","G1 Ponies","set"), ("g1-plush","G1 Plush","manufacturer"),
 ("g1-retro","G1 Retro","set"), ("petite-ponies","Petite Ponies","set"),
 ("dream-beauties","Dream Beauties","set"), ("g2","G2 Ponies","set"),
 ("g3","G3 Ponies","series"), ("g3-plush","G3 Plush","manufacturer"),
 ("g35","G3.5 Ponies","set"), ("ponyville","Ponyville","year"),
 ("blind-bags","G4 Blind Bags","wave"), ("brushables","G4 Brushables","series"),
 ("equestria-girls","Equestria Girls","series"),
 ("goh","Guardians of Harmony","series"), ("cmc","Cutie Mark Crew","series"),
 ("hasbro-pop","Hasbro POP","set"), ("playskool","Playskool","set"),
 ("plush","G4 Plush","manufacturer"), ("other-figures","G4 Other Figures","set"),
 ("kayou-cards","Kayou Cards","subset"), ("basic-fun","Basic Fun","set"),
 ("funko-figures","Funko Figures","series"), ("media","G4 Media","type"),
 ("enterplay","Enterplay","series"), ("comics","G4 Comics","series"),
 ("g45-blind-bags","G4.5 Blind Bags","series"),
 ("g45-brushables","G4.5 Brushables","set"),
 ("g5","G5 Main Series","series"), ("g5-blind-bags","G5 Blind Bags","series"),
 ("mini-world-magic","Mini World Magic","set"),
 ("g5-plush","G5 Plush","manufacturer"),
 ("g5-other-figures","G5 Other Figures","set"),
 ("g5-comics","G5 Comics","series"), ("fairy-tails","Fairy Tails","series"),
]
SKIP_SPECIALIZED = {"brushables", "blind-bags"}
COUNT_RE = re.compile(r"\(([\d,]+)\s+(?:ponies|pony|figures|releases|cards|items|comics|plush|dolls|toys)\)", re.I)
TOTAL_RE = re.compile(r"(?:a total of|total of)\s+([\d,]+)\s+(?:releases|ponies|pony|figures|cards|items|comics|plush|dolls|toys)", re.I)

def soup_at(url):
    response = requests.get(url,headers=HEADERS,timeout=35)
    response.raise_for_status()
    return BeautifulSoup(response.text,"html.parser")

def discover(root, label, grouping):
    index = f"{BASE}/{root}/{grouping}/"
    soup = soup_at(index)
    found = {}
    expr = re.compile(r"^/"+re.escape(root)+"/"+re.escape(grouping)+r"/([^/]+(?:/[^/]+)?)/$")
    for link in soup.select("a[href]"):
        url = urljoin(index,link.get("href",""))
        parsed = urlsplit(url)
        match = expr.fullmatch(parsed.path)
        if not match or parsed.hostname != "data.mlpmerch.com":
            continue
        count = None
        for element in (link, link.parent, link.parent.parent if link.parent else None):
            if element is None:continue
            result = COUNT_RE.search(element.get_text(" ",strip=True))
            if result:
                count=int(result.group(1).replace(",",""))
                break
        # Some MLP Merch indexes omit the count next to an individual link.
        # Its dedicated page must then declare the authoritative total.
        title=link.get_text(" ",strip=True)
        if not title or COUNT_RE.search(title):
            title=match.group(1).replace("-"," ").title()
        title=re.sub(r"\s*\([\d,]+\s+(?:ponies|pony|figures|releases|cards|items|comics|plush|dolls|toys)\).*","",title,flags=re.I).strip()
        if len(title)>90:title=match.group(1).replace("-"," ").title()
        key=f"{root}/{grouping}/{match.group(1)}"
        found[key]={"name":f"MLP Merch · {label} · {title}","source":url,
                    "root":root,"expected":count,"manufacturer":title if grouping=="manufacturer" else ""}
    if not found:
        raise ValueError("no linked indexed series with item counts")
    return list(found.values())

def parse(entry):
    url=entry["source"]
    soup=soup_at(url)
    text=soup.get_text(" ",strip=True)
    match=TOTAL_RE.search(text[:1800])
    expected=int(match.group(1).replace(",","")) if match else entry["expected"]
    if not expected:
        raise ValueError("neither index nor series page declares an item count")
    # An index could be stale. Do not silently change expected item counts.
    if entry["expected"] and expected!=entry["expected"]:
        raise ValueError(f"index says {entry['expected']}, page says {expected}")
    items={}
    root=entry["root"]
    for link in soup.select('a[href*="/details/"]'):
        href=urljoin(url,link.get("href",""))
        parsed=urlsplit(href)
        if parsed.hostname!="data.mlpmerch.com" or not parsed.path.startswith(f"/{root}/details/"):
            continue
        bottom=link.find_parent(class_="data-bottom")
        if not bottom:continue
        code=parsed.path.rstrip("/").split("/")[-1]
        name=link.get_text(" ",strip=True)
        if not name or not code:continue
        photo=""
        wrapper=bottom.parent
        if wrapper:
            for image in wrapper.select(".data-top img.data-img"):
                raw=image.get("data-src") or image.get("src") or ""
                if "/v/pixel.gif" in raw.lower():
                    raw=(image.parent.get("href") if image.parent else "") or ""
                candidate=urljoin(url,raw) if raw else ""
                if urlsplit(candidate).scheme=="https" and "/v/pixel.gif" not in candidate.lower() and urlsplit(candidate).hostname!="mlpmerch.mlpmerch.com":
                    photo=candidate
                    break
        notes=[node.get_text(" ",strip=True) for node in bottom.select(".data-smallt")]
        items[code]={"name":name,"catalogPosition":code,"manufacturer":entry["manufacturer"] or "Ліцензіат MLP",
                     "sourceUrl":href,"photo":photo,"description":"; ".join(x for x in notes if x)}
    if len(items)!=expected:
        raise ValueError(f"expected {expected}, extracted {len(items)} unique releases")
    return {"name":entry["name"],"count":expected,"source":url,"verified":True,
            "items":list(items.values())}

def main():
    previous={}
    if OUTPUT.exists():
        try:previous={row["source"]:row for row in json.loads(OUTPUT.read_text(encoding="utf-8")).get("series",[])}
        except (OSError,ValueError):pass
    errors={}
    entries=[]
    with futures.ThreadPoolExecutor(max_workers=6) as pool:
        jobs={pool.submit(discover,root,label,grouping):(root,label,grouping)
              for root,label,grouping in DATABASES if root not in SKIP_SPECIALIZED}
        for job in futures.as_completed(jobs):
            root,label,grouping=jobs[job]
            try:
                discovered=job.result()
                entries.extend(discovered)
                print(f"INDEX {label}: {len(discovered)}",flush=True)
            except Exception as exc:
                errors[f"INDEX {label}"]=str(exc)
    # Preserve old exact-release images when upstream index omits them.
    with futures.ThreadPoolExecutor(max_workers=8) as pool:
        jobs={pool.submit(parse,entry):entry for entry in entries}
        for job in futures.as_completed(jobs):
            entry=jobs[job]
            try:
                record=job.result()
                old={x.get("sourceUrl"):x.get("photo") for x in previous.get(record["source"],{}).get("items",[])}
                for item in record["items"]:
                    if not item["photo"]:item["photo"]=old.get(item["sourceUrl"]) or ""
                previous[record["source"]]=record
                print(f"OK {record['name']}: {record['count']}",flush=True)
            except Exception as exc:
                errors[entry["source"]]=str(exc)
    series=sorted(previous.values(),key=lambda row:row["name"])
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps({"schemaVersion":1,"series":series},ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    ERRORS.write_text(json.dumps({"indexed":len(entries),"verified":len(series),"errors":errors},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"PUBLISHED {len(series)} verified series / {len(entries)} indexed; {sum(row['count'] for row in series)} release records")

if __name__=="__main__":
    main()
