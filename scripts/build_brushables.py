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
                candidate=urljoin(url,path) if path else ""
                if (urlsplit(candidate).scheme=="https"
                        and "/v/pixel.gif" not in candidate.lower()
                        and "mlpmerch.mlpmerch.com" not in urlsplit(candidate).hostname):
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
    for title,slug,count in SERIES:
        name="Hasbro · G4 Brushables · "+title
        try:
            found=extract(title,slug,count)
            old[name]=found
            print(f"OK {name}: {count} releases; images={sum(bool(x['photo']) for x in found['items'])}")
        except Exception as error:
            errors[name]=str(error)
            print(f"SKIP {name}: {error}")
    result=[old["Hasbro · G4 Brushables · "+title] for title,_,_ in SERIES if "Hasbro · G4 Brushables · "+title in old]
    DEST.parent.mkdir(parents=True,exist_ok=True)
    DEST.write_text(json.dumps({"schemaVersion":1,"series":result},ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf8")
    (DEST.parent/"brushables-errors.json").write_text(json.dumps(errors,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print(f"Verified {len(result)}/{len(SERIES)} series; {sum(x['count'] for x in result)} items")

if __name__=="__main__":
    main()
