#!/usr/bin/env python3
"""Export two complete Kayou Series 4 checklists from MLP Merch.

Only writes catalogs when the source has the expected exact number of unique printed IDs.
"""
from pathlib import Path
from urllib.parse import urljoin, urlsplit
import json
import requests
from bs4 import BeautifulSoup

BASE = "https://data.mlpmerch.com"
OUTPUT = Path(__file__).resolve().parents[1] / "catalogs" / "verified-mlpmerch.json"
SOURCES = [
    ("Kayou · Moon Edition · Series 4", "/kayou-cards/subset/moon-edition/series-4/", 162),
    ("Kayou · Fun Moments Edition · Series 4", "/kayou-cards/subset/fun-moments-edition/series-4/", 287)
]

def extract(name,path,expected):
    url=urljoin(BASE,path)
    response=requests.get(url,timeout=40,headers={"User-Agent":"Mozilla/5.0 (personal collection indexing)"})
    response.raise_for_status()
    soup=BeautifulSoup(response.text,"html.parser")
    items={}
    for a in soup.select('a[href*="/kayou-cards/details/"]'):
        box=a.find_parent(class_="data-bottom")
        if not box:
            continue
        code_node=box.select_one("span.data-smallt")
        if not code_node:
            continue
        code=code_node.get_text(" ",strip=True).upper()
        title=a.get_text(" ",strip=True)
        if not code or not title:
            continue
        rarity_link=box.select_one('a[href*="/kayou-cards/rarity/"]')
        rarity=rarity_link.get_text(" ",strip=True) if rarity_link else ""
        photo=""
        for parent in (box.parent,box.parent.parent if box.parent else None):
            if not parent:
                continue
            image=parent.find("img",alt=lambda x: bool(x and "Kayou Card" in x))
            if image:
                src=image.get("data-src") or image.get("src") or ""
                candidate=urljoin(url,src) if src else ""
                if urlsplit(candidate).scheme=="https":
                    photo=candidate
                    break
        items[code]={"name":title,"figureNumber":code,"rarity":rarity,"manufacturer":"Kayou","photo":photo,"sourceUrl":urljoin(url,a["href"])}
    if len(items)!=expected:
        raise ValueError(f"{name}: wanted {expected}, parsed {len(items)} unique codes")
    return {"name":name,"count":expected,"source":url,"verified":True,"items":list(items.values())}

def main():
    previous={}
    if OUTPUT.exists():
        try:
            previous={x["name"]:x for x in json.loads(OUTPUT.read_text(encoding="utf8")).get("series",[])}
        except (OSError,ValueError):
            pass
    for name,path,count in SOURCES:
        try:
            found=extract(name,path,count)
            previous[name]=found
            print(f"OK: {name} ({count}), photos={sum(bool(x['photo']) for x in found['items'])}")
        except Exception as error:
            print(f"SKIPPED: {name}: {error}")
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    series=[previous[name] for name,_,_ in SOURCES if name in previous]
    OUTPUT.write_text(json.dumps({"schemaVersion":1,"series":series},ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf8")
    if not series:
        raise SystemExit("No fully verified data available")

if __name__=="__main__":
    main()
