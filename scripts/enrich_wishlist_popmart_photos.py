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
         "prod-eu-res.popmart.com","prod-asia-res.popmart.com",
         "cdn.shopify.com","hi52toys.com","www.hi52toys.com"}

def normalized(text):
    text=unicodedata.normalize("NFKC",text or "").casefold()
    return re.sub(r"[^a-z0-9]+","",text)

def photo_url(image,page):
    raw=image.get("data-src") or image.get("src") or ""
    if not raw or raw.startswith("data:"):
        srcset=image.get("srcset","")
        if srcset:raw=srcset.split(",")[0].strip().split()[0]
    url=urljoin(page,raw)
    hostname=urlsplit(url).hostname or ""
    return url if urlsplit(url).scheme=="https" and (hostname in ALLOWED or hostname.endswith(".shopifycdn.net")) else ""

def collect(page,maker):
    response=requests.get(page,timeout=35,headers={"User-Agent":"Mozilla/5.0 (compatible; collectors index; images not downloaded)"})
    response.raise_for_status()
    soup=BeautifulSoup(response.text,"html.parser")
    images={}
    for img in soup.select("img[alt]"):
        alt=img.get("alt","")
        # Only official named character art, never banners, thumbnails, etc.
        if maker=="POP MART" and "pop mart-" not in alt.lower() and "popmart-" not in alt.lower():
            continue
        url=photo_url(img,page)
        if not url:continue
        images.setdefault(normalized(alt),set()).add(url)
    return images

def main():
    data=json.loads(FILE.read_text(encoding="utf8"))
    records=[]; updated=0
    for series in data.get("series",[]):
        # 52TOYS Shopify alt labels may identify a figure while the linked media
        # depicts a sealed box: do not publish potentially wrong figure images.
        if series.get("manufacturer")!="POP MART" or not series.get("verifiedFigureCount"):continue
        source=series["source"]; candidates={}
        error=""
        try:candidates=collect(source,series["manufacturer"])
        except Exception as exc:error=str(exc)[:250]
        completed=0; unfilled=[]
        for card in series["items"]:
            if not card.get("rarity"):continue # unopened retailer product
            if card.get("photo"):
                completed+=1
                continue
            wanted=normalized(card["name"].replace("(Secret)",""))
            matched=[]
            for alt,urls in candidates.items():
                if series["manufacturer"]=="POP MART":
                    # Source labels mark secrets in parentheses; never turn
                    # them into regular figures or miss their model photos.
                    valid=alt.endswith(wanted) or (
                        card.get("rarity")=="Secret" and alt.endswith(wanted+"secret"))
                else:
                    # 52TOYS describes the physical model at the start of alt.
                    valid=alt.startswith(wanted) and len(alt)>len(wanted)+12
                if valid:matched.extend(sorted(urls))
            if matched:
                # Multiple camera angles of the very same model are fine.
                # Never use series banner art when a model name is absent.
                card["photo"]=matched[0];updated+=1;completed+=1
            else:unfilled.append({"figure":card["name"],"matches":0})
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
