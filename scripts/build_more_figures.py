#!/usr/bin/env python3
"""Build separate verified figure series across eight MLP Merch databases.

Discover actual subseries (not imagined line names) from each source index.
Check that each item's detail URL is distinct and that the *source-declared*
count matches the extracted catalog. Anything incomplete goes to diagnostics,
never into the app's one-click import list.
"""
import concurrent.futures as cf
import json
import re
from pathlib import Path
from urllib.parse import urljoin,urlsplit,unquote
import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/"catalogs"/"verified-mlp-figures.json"
ERRORS=ROOT/"catalogs"/"figure-errors.json"
BASE="https://data.mlpmerch.com"
# Prefer lines / series; by-set or by-year where the publisher supplies no
# series hierarchy. These are *separate* importable folders, never mass-created.
CATALOGS=[
    ("cmc","Cutie Mark Crew","series"),
    ("ponyville","Ponyville","year"),
    ("goh","Guardians of Harmony","series"),
    ("equestria-girls","Equestria Girls","series"),
    ("playskool","Playskool","set"),
    ("g1-retro","G1 Retro","set"),
    ("other-figures","G4 Other Figures","set"),
    ("funko-figures","Funko Figures","series"),
]
# Categories like Other Figures have hundreds of independent sets; keep the
# run bounded and continue with previously validated records each time.
MAX_PER_CATEGORY=80
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; noncommercial-personal-collectibles-index/1.0)"}

def get(url):
    reply=requests.get(url,headers=HEADERS,timeout=35)
    reply.raise_for_status()
    return BeautifulSoup(reply.text,"html.parser")

def discover(root,category,index):
    url=f"{BASE}/{root}/{category}/"
    soup=get(url)
    pattern=re.compile(r"^/"+re.escape(root)+"/"+re.escape(category)+r"/([^/]+(?:/[^/]+)?)/$")
    links={}
    for a in soup.select("a[href]"):
        raw=a.get("href","")
        dest=urljoin(url,raw)
        parsed=urlsplit(dest)
        if parsed.hostname!="data.mlpmerch.com":
            continue
        found=pattern.fullmatch(parsed.path)
        if not found:
            continue
        slug=found.group(1)
        title=a.get_text(" ",strip=True)
        if not title:
            img=a.find("img")
            if img: title=img.get("alt","")
        if not title:
            title=unquote(slug).replace("-"," ").title()
        title=re.sub(r"\s+"," ",title).strip()
        if len(title)>100: title=title[:100].strip()
        name=f"Hasbro · {index} · {title}"
        links[slug]={"name":name,"url":dest,"root":root,"category":category}
    # Source index may list linked image and name separately for same URL;
    # keep one per real indexed set.
    return list(links.values())[:MAX_PER_CATEGORY]

def source_count(soup):
    text=soup.get_text(" ",strip=True)
    expressions=[
        r"(?:with\s+)?a\s+total\s+of\s+([\d,]+)\s+(?:releases|figures|ponies|dolls|items|toys)",
        r"([\d,]+)\s+(?:total\s+)?(?:releases|figures|ponies|dolls|items|toys)\s+(?:in this|for this)",
        r"([\d,]+)\s+(?:releases|figures|ponies|dolls|items|toys)\s+found",
    ]
    for expr in expressions:
        m=re.search(expr,text,re.I)
        if m: return int(m.group(1).replace(",",""))
    return None

def parse(entry):
    name,url,root=entry["name"],entry["url"],entry["root"]
    soup=get(url)
    expected=source_count(soup)
    if not expected:
        raise ValueError("No source-declared total; skipped rather than guessing completeness")
    items={}
    for a in soup.select(f'a[href*="/{root}/details/"]'):
        bottom=a.find_parent(class_="data-bottom")
        if bottom is None: continue
        href=urljoin(url,a.get("href",""))
        parsed=urlsplit(href)
        if parsed.hostname!="data.mlpmerch.com":continue
        detail_id=parsed.path.strip("/").split("/")[-1]
        title=a.get_text(" ",strip=True)
        if not title or not detail_id:continue
        data=bottom.find_parent(class_="data-item")
        if data is None:continue
        image=""
        for img in data.select(".data-top img"):
            alt=img.get("alt","")
            if "Buy " in alt:continue
            raw=img.get("data-src") or img.get("src") or ""
            candidate=urljoin(url,raw) if raw else ""
            if urlsplit(candidate).scheme=="https":
                image=candidate;break
        if not image:
            continue
        # Metadata kept separately; source IDs distinguish repeated names.
        year=""
        notes=[]
        for extra in bottom.select(".data-smallt"):
            value=extra.get_text(" ",strip=True)
            if re.fullmatch(r"20\d{2}",value):
                year=value
            elif value:
                notes.append(value)
        set_node=bottom.select_one(f'a[href*="/{root}/set/"]')
        type_node=(bottom.select_one(f'a[href*="/{root}/type/"]')
            or bottom.select_one(f'a[href*="/{root}/body/"]')
            or bottom.select_one(f'a[href*="/{root}/species/"]'))
        items[detail_id]={
            "name":title,"catalogPosition":detail_id,"figureNumber":"",
            "manufacturer":"Hasbro / ліцензіат",
            "year":year,
            "setName":set_node.get_text(" ",strip=True) if set_node else "",
            "bodyType":type_node.get_text(" ",strip=True) if type_node else "",
            "description":"; ".join(notes),
            "sourceUrl":href,"photo":image
        }
    if len(items)!=expected:
        raise ValueError(f"Source declares {expected} releases; found {len(items)} unique photographed details")
    return {"name":name,"count":len(items),"source":url,"verified":True,
            "manufacturer":"Hasbro / ліцензіат","items":list(items.values())}

def main():
    previous={}
    if OUTPUT.exists():
        try:
            previous={e["name"]:e for e in json.loads(OUTPUT.read_text(encoding="utf8")).get("series",[])}
        except (OSError,ValueError): pass
    all_pages=[]
    errors={}
    for root,label,category in CATALOGS:
        try:
            found=discover(root,category,label)
            all_pages.extend(found)
            print(f"INDEX {label}: {len(found)} named series",flush=True)
        except Exception as ex:
            errors[f"INDEX {label}"]=str(ex)
    with cf.ThreadPoolExecutor(max_workers=6) as pool:
        jobs={pool.submit(parse,entry):entry for entry in all_pages}
        for future in cf.as_completed(jobs):
            entry=jobs[future]
            try:
                result=future.result()
                previous[result["name"]]=result
                print(f"OK {result['name']}: {result['count']} photographed releases",flush=True)
            except Exception as exc:
                errors[entry["name"]]=str(exc)
                print(f"SKIP {entry['name']}: {exc}",flush=True)
    # Never drop previously complete series because a source is temporarily down.
    existing=list(previous.values())
    existing.sort(key=lambda s:s["name"])
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps({"schemaVersion":1,"series":existing},
        ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf8")
    ERRORS.write_text(json.dumps({"indexed":len(all_pages),"verified":len(existing),"skipped":errors},
        ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print(f"PUBLISHED {len(existing)} verified figure series / {len(all_pages)} scanned, "
          f"{sum(s['count'] for s in existing)} photographed releases",flush=True)

if __name__=="__main__":
    main()
