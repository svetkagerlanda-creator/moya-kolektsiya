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
MAX_PER_CATEGORY=250
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
        expected=None
        # Some source indexes display the count on a series tile rather than
        # its detail page. Accept it only when clearly tied to this link.
        for node in (a, a.parent, a.parent.parent if a.parent else None):
            if node is None: continue
            count_match=re.search(r"\\(([\\d,]+)\\s+(?:releases|figures|ponies|dolls|items|toys)\\)",node.get_text(" ",strip=True),re.I)
            if count_match:
                expected=int(count_match.group(1).replace(",",""))
                break
        links[slug]={"name":name,"url":dest,"root":root,"category":category,"index_count":expected}
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
    detail_count=source_count(soup)
    index_count=entry.get("index_count")
    if detail_count and index_count and detail_count!=index_count:
        raise ValueError(f"Conflicting source totals: page={detail_count} index={index_count}")
    expected=detail_count or index_count
    # When the source has no authoritative total, publish *only* the
    # individually evidenced releases, explicitly flagged as a partial list.
    # A partial series can be useful to a collector but is never labelled complete.
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
        # The item wrapper can be 'data-item' or 'data-small-long'.
        # bottom.parent keeps the image tied to the correct figure and avoids
        # accidentally pulling an image from the preceding card or a pixel.gif.
        image=""
        wrapper=bottom.parent
        images=wrapper.select(".data-top img.data-img") if wrapper else []
        for img in images:
            raw=img.get("data-src") or img.get("src") or ""
            if "/v/pixel.gif" in raw.lower():
                raw=(img.parent.get("href") if img.parent else "") or ""
            candidate=urljoin(url,raw) if raw else ""
            if (urlsplit(candidate).scheme=="https"
                    and "/v/pixel.gif" not in candidate.lower()
                    and urlsplit(candidate).hostname!="mlpmerch.mlpmerch.com"):
                image=candidate;break
        # Keep source-verified releases even when the matching photo is missing.
        # Otherwise a legitimate set is incorrectly rejected as incomplete.
        # Never substitute a photo from a different release.
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
        maker={"funko-figures":"Funko","g1-retro":"Hasbro / Basic Fun / Just Play",
               "other-figures":"Ліцензіат My Little Pony"}.get(root,"Hasbro")
        items[detail_id]={
            "name":title,"catalogPosition":detail_id,"figureNumber":"",
            "manufacturer":maker,
            "year":year,
            "setName":set_node.get_text(" ",strip=True) if set_node else "",
            "bodyType":type_node.get_text(" ",strip=True) if type_node else "",
            "description":"; ".join(notes),
            "sourceUrl":href,"photo":image
        }
    if not items:
        raise ValueError("No confirmed individual release links")
    if expected and len(items)!=expected:
        raise ValueError(f"Source declares {expected} releases; found {len(items)} unique details")
    return {"name":name,"count":len(items),"source":url,"verified":True,
            "completeness":"verified-full-series" if expected else "verified-selected-releases",
            "sourceDeclaredCount":expected,
            "manufacturer":items[next(iter(items))]["manufacturer"],"items":list(items.values())}

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
                old_record=previous.get(result['name'],{})
                # Never demote an already verified complete series to a partial
                # upstream extract. Existing collector data remains unchanged.
                if (old_record.get('verified') is True
                        and old_record.get('completeness')!='verified-selected-releases'
                        and result.get('completeness')=='verified-selected-releases'):
                    print(f"KEEP COMPLETE {result['name']}",flush=True)
                    continue
                if (old_record.get('completeness')=='verified-selected-releases'
                        and result.get('completeness')=='verified-selected-releases'
                        and len(result['items'])<len(old_record.get('items',[]))):
                    print(f"KEEP BROADER PARTIAL {result['name']}",flush=True)
                    continue
                old_photos={card.get('sourceUrl'):card.get('photo') for card in old_record.get('items',[]) if card.get('photo')}
                for card in result['items']:
                    if not card.get('photo'):
                        card['photo']=old_photos.get(card['sourceUrl'],'')
                previous[result["name"]]=result
                photographed=sum(bool(card.get('photo')) for card in result['items'])
                print(f"OK {result['name']}: {result['count']} verified releases, {photographed} photographed",flush=True)
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
          f"{sum(s['count'] for s in existing)} releases; "
          f"{sum(sum(bool(x.get('photo')) for x in s['items']) for s in existing)} photos",flush=True)

if __name__=="__main__":
    main()
