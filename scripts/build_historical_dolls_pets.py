#!/usr/bin/env python3
"""Incrementally import historical MH, EAH doll series and LPS pets by line.

A release is published only when its original detail page is linked on the
series page. Exact image is tied to its source card, never copied from a
neighbor. Source-declared totals enforce full/partial status. Preserve
previously confirmed data when an external site has problems.
"""
import concurrent.futures
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit
import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/"catalogs"/"verified-historical-dolls-pets.json"
DIAGNOSTICS=ROOT/"catalogs"/"historical-dolls-pets-errors.json"
HEADERS={"User-Agent":"Mozilla/5.0 (personal noncommercial historical toy catalog)"}
ROOTS=[
 ("thetoypool.com","bratz","series","bratz","Bratz","MGA Entertainment"),
 ("mh-merch.com","dolls","series","monsterhigh","Monster High","Mattel"),
 ("eahmerch.com","dolls","series","everafterhigh","Ever After High","Mattel"),
 ("lpsmerch.com","g1","line","lps","Littlest Pet Shop G1","Hasbro"),
 ("lpsmerch.com","g2","line","lps","Littlest Pet Shop G2","Hasbro"),
 ("lpsmerch.com","g3","line","lps","Littlest Pet Shop G3","Hasbro"),
 ("lpsmerch.com","g4","line","lps","Littlest Pet Shop G4","Hasbro"),
 ("lpsmerch.com","g5","line","lps","Littlest Pet Shop G5","Hasbro"),
 ("lpsmerch.com","g6","line","lps","Littlest Pet Shop G6","Hasbro"),
]
COUNT_RE=re.compile(r"(?:with a total of|total of)\s+([\d,]+)\s+(?:releases?|dolls?|pets?|figures?)",re.I)
INDEX_RE=re.compile(r"\(([\d,]+)\s+(?:releases?|dolls?|pets?|figures?)\)",re.I)
MAX_NEW_PER_RUN=120

def get(url):
    response=requests.get(url,headers=HEADERS,timeout=30)
    response.raise_for_status()
    return BeautifulSoup(response.text,"html.parser")

def discover(host,part,group,fandom,label,manufacturer):
    url=f"https://{host}/{part}/{group}/"
    page=get(url)
    prefix=f"/{part}/{group}/"
    entries={}
    for anchor in page.select("a[href]"):
        target=urljoin(url,anchor["href"])
        u=urlsplit(target)
        if u.hostname not in {host,"www."+host} or not u.path.startswith(prefix):
            continue
        suffix=u.path[len(prefix):].strip("/")
        if not suffix or "/" in suffix:continue
        # A named catalog entry may include a linked image + linked label.
        labeltext=anchor.get_text(" ",strip=True)
        if not labeltext or len(labeltext)>95:
            parent=anchor.parent
            labeltext=parent.get_text(" ",strip=True) if parent else ""
        count=None
        for node in (anchor,anchor.parent):
            if node is None:continue
            match=INDEX_RE.search(node.get_text(" ",strip=True))
            if match:
                count=int(match.group(1).replace(",",""));break
        if not labeltext or len(labeltext)>95 or INDEX_RE.search(labeltext) and len(labeltext)>65:
            labeltext=suffix.replace("-"," ").title()
        labeltext=re.sub(r"\s*\([\d,]+\s+(?:releases?|dolls?|pets?|figures?)\).*","",labeltext,flags=re.I).strip()
        if not labeltext:labeltext=suffix.replace("-"," ").title()
        name=f"{label} · {labeltext}"
        entries[target]={"source":target,"name":name,"fandomKey":fandom,
                         "manufacturer":manufacturer,"root":part,
                         "label":label,"expectedIndex":count}
    return list(entries.values())

def parse(entry):
    url=entry["source"]
    soup=get(url)
    text=soup.get_text(" ",strip=True)
    header=COUNT_RE.search(text[:2000])
    expected=int(header.group(1).replace(",","")) if header else entry.get("expectedIndex")
    root=entry["root"]
    host=urlsplit(url).hostname
    items={}
    for link in soup.select('a[href*="/details/"]'):
        dest=urljoin(url,link.get("href",""))
        parsed=urlsplit(dest)
        if parsed.hostname not in {host,"www."+host} or not parsed.path.startswith(f"/{root}/details/"):
            continue
        bottom=link.find_parent(class_="data-bottom")
        if not bottom:continue
        unique=parsed.path.strip("/").split("/")[-1]
        if not unique:continue
        title=link.get_text(" ",strip=True)
        if not title:continue
        wrapper=bottom.parent
        photo=""
        if wrapper:
            for img in wrapper.select(".data-top img"):
                raw=img.get("data-src") or img.get("src") or ""
                if "/v/pixel.gif" in raw.lower():
                    raw=(img.parent.get("href") if img.parent else "") or ""
                possible=urljoin(url,raw) if raw else ""
                if urlsplit(possible).scheme=="https" and "/v/pixel.gif" not in possible.lower():
                    photo=possible
                    break
        notes=[x.get_text(" ",strip=True) for x in bottom.select(".data-smallt")]
        items[unique]={"name":title,"catalogPosition":unique,
                       "manufacturer":entry["manufacturer"],
                       "sourceUrl":dest,"photo":photo,
                       "description":"; ".join(t for t in notes if t)}
    if not items:
        raise ValueError("no item detail links found inside confirmed release cards")
    # A matching item count is insufficient for a photo-complete catalog.
    # Never label a series full when any individual release lacks its own image.
    complete_count = expected is not None and len(items) == expected
    complete_photos = all(card.get("photo") for card in items.values())
    completeness = ("verified-full-series" if complete_count and complete_photos
                    else "verified-selected-releases")
    return {"name":entry["name"],"source":url,"fandomKey":entry["fandomKey"],
            "group":{"bratz":"💄 Bratz · Historical Dolls",
                     "monsterhigh":"🦇 Monster High · Historical Dolls",
                     "everafterhigh":"📖 Ever After High · Historical Dolls",
                     "lps":"🐾 Littlest Pet Shop · "+entry["label"]}[entry["fandomKey"]],
            "manufacturer":entry["manufacturer"],"verified":True,
            "completeness":completeness,"sourceDeclaredCount":expected,
            "count":len(items),"items":list(items.values())}

def main():
    past={}
    if DEST.exists():
        try:
            past={s["source"]:s for s in json.loads(DEST.read_text(encoding="utf8")).get("series",[])
                  if s.get("source")}
        except (ValueError,OSError):pass
    errors={}
    discovered=[]
    for args in ROOTS:
        try:
            found=discover(*args)
            discovered.extend(found)
            print("INDEX",args[4],len(found),flush=True)
        except Exception as error:
            errors[f"{args[0]}/{args[1]}/{args[2]}"] = str(error)[:220]
    seen=set()
    unique=[]
    for entry in discovered:
        if entry["source"] not in seen:
            seen.add(entry["source"]);unique.append(entry)
    # Interleave MH, EAH, and LPS so a bounded run expands all three fandoms.
    # Recheck incomplete series and complete series with missing exact photos.
    # New series are processed first to keep expanding catalog coverage.
    def needs_recheck(entry):
        old=past.get(entry["source"])
        return (not old or old.get("completeness")!="verified-full-series"
                or any(not card.get("photo") for card in old.get("items",[])))
    pending=[e for e in unique if needs_recheck(e)]
    pending.sort(key=lambda e: (e["source"] in past, e["name"]))
    by_fandom={}
    for e in pending:by_fandom.setdefault(e["fandomKey"],[]).append(e)
    selected=[]
    while len(selected)<MAX_NEW_PER_RUN and any(by_fandom.values()):
        for fandom in ("bratz","monsterhigh","everafterhigh","lps"):
            if len(selected)>=MAX_NEW_PER_RUN:break
            if by_fandom.get(fandom):selected.append(by_fandom[fandom].pop(0))
    def safe_parse(entry):
        try:return entry,parse(entry),None
        except Exception as error:return entry,None,str(error)[:220]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for entry,result,error in pool.map(safe_parse,selected):
            if error:
                errors[entry["source"]]=error
                continue
            old=past.get(entry["source"],{})
            if old.get("completeness")=="verified-full-series" and result["completeness"]!="verified-full-series":
                continue
            olditems={c["sourceUrl"]:c for c in old.get("items",[]) if c.get("sourceUrl")}
            for card in result["items"]:
                previous=olditems.get(card["sourceUrl"],{})
                if not card.get("photo") and previous.get("photo"):card["photo"]=previous["photo"]
            if (old.get("completeness")=="verified-selected-releases"
                    and result["completeness"]=="verified-selected-releases"
                    and len(result["items"])<len(old.get("items",[]))):
                continue
            past[entry["source"]]=result
    series=sorted(past.values(),key=lambda s:s["name"])
    DEST.write_text(json.dumps({"schemaVersion":1,"series":series},ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf8")
    DIAGNOSTICS.write_text(json.dumps({"indexed":len(unique),"selected":len(selected),"verified":len(series),
        "items":sum(x["count"] for x in series),
        "photos":sum(sum(bool(c.get("photo")) for c in x["items"]) for x in series),
        "missingIndividualPhotos":sum(sum(not bool(c.get("photo")) for c in x["items"]) for x in series),
        "partialSeries":sum(x.get("completeness")!="verified-full-series" for x in series),
        "remainingUnscanned":len([e for e in unique if e["source"] not in past]),
        "errors":errors},ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print("HISTORICAL",len(series),"series",sum(x["count"] for x in series),"items",
          "unscanned",len([e for e in unique if e["source"] not in past]),flush=True)

if __name__=="__main__":
    main()
