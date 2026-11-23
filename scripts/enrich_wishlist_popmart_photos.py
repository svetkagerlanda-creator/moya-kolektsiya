#!/usr/bin/env python3
"""Populate exact official POP MART variant images for wishlist series.

Never copy a series banner/box image to individual figures. Match the explicit
per-design <img alt="POP MART-... - FIGURE NAME"> label on the official
manufacturer page, reject ambiguous matches, preserve previous photos.
"""
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import urljoin, urlsplit
import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
FILE=ROOT/"catalogs/verified-user-wishlist-starters.json"
REPORT=ROOT/"catalogs/wishlist-variant-photo-audit.json"
ALLOWED={"prod-global-biz.popmart.com","global-static.popmart.com",
         "prod-america-res.popmart.com","cdn-global-naus.popmart.com",
         "prod-eu-res.popmart.com","prod-asia-res.popmart.com"}

def normalized(text):
    text=unicodedata.normalize("NFKC",text or "").casefold()
    return re.sub(r"[^a-z0-9]+","",text)

def photo_url(image,page):
    raw=image.get("data-src") or image.get("src") or ""
    if not raw or raw.startswith("data:"):
        srcset=image.get("srcset","")
        if srcset:raw=srcset.split(",")[0].strip().split()[0]
    url=urljoin(page,raw)
    return url if urlsplit(url).scheme=="https" and urlsplit(url).hostname in ALLOWED else ""

def collect(page):
    response=requests.get(page,timeout=35,headers={"User-Agent":"Mozilla/5.0 (compatible; collectors index; images not downloaded)"})
    response.raise_for_status()
    soup=BeautifulSoup(response.text,"html.parser")
    images={}
    for img in soup.select("img[alt]"):
        alt=img.get("alt","")
        # Only official named character art, never banners, thumbnails, etc.
        if "POP MART-" not in alt and "popmart-" not in alt.lower():
            continue
        url=photo_url(img,page)
        if not url:continue
        images.setdefault(normalized(alt),set()).add(url)
    return images

def main():
    data=json.loads(FILE.read_text(encoding="utf8"))
    records=[]; updated=0
    for series in data.get("series",[]):
        if series.get("manufacturer")!="POP MART" or not series.get("verifiedFigureCount"):continue
        source=series["source"]; candidates={}
        error=""
        try:candidates=collect(source)
        except Exception as exc:error=str(exc)[:250]
        completed=0; unfilled=[]
        for card in series["items"]:
            if not card.get("rarity"):continue # unopened retailer product
            if card.get("photo"):
                completed+=1
                continue
            wanted=normalized(card["name"])
            matches=[urls for name,urls in candidates.items()
                     if name.endswith(wanted) and
                     (len(name)-len(wanted))>3]
            urls=set().union(*matches) if matches else set()
            if len(urls)==1:
                card["photo"]=next(iter(urls));updated+=1;completed+=1
            else:unfilled.append({"figure":card["name"],"matches":len(urls)})
        records.append({"series":series["name"],"figures":series["verifiedFigureCount"],
                        "photos":completed,"missing":unfilled,"error":error})
    if updated:
        FILE.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    report={"schemaVersion":1,"verifiedSeries":len(records),"newExactPhotos":updated,
            "verifiedFigures":sum(r["figures"] for r in records),
            "photoRecords":sum(r["photos"] for r in records),"series":records}
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print(json.dumps({"newExactPhotos":updated,"figures":report["verifiedFigures"],
                      "photos":report["photoRecords"],
                      "errors":sum(bool(r["error"]) for r in records)}))

if __name__=="__main__":
    main()
