#!/usr/bin/env python3
"""Audit every verified collection feed without modifying anyone's collections.

Source URLs, not character names, identify individual physical releases.
The report records per-feed coverage and is only rewritten when facts change.
"""
import collections
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[1]
CATALOGS=ROOT/"catalogs"
DEST=CATALOGS/"catalog-coverage.json"
EXCLUDE={"source-probe.json","photo-probe.json","catalog-coverage.json"}

def main():
    result={"schemaVersion":1,"feeds":[],"totals":{},"sourceRoots":{},
            "issues":[],"duplicateExamples":[]}
    total_series=total_items=total_photos=total_partial=0
    source_roots=collections.defaultdict(lambda:{"series":0,"items":0,"photos":0})
    known_urls=collections.defaultdict(set)
    for path in sorted(CATALOGS.glob("verified-*.json")):
        if path.name in EXCLUDE:
            continue
        try:
            obj=json.loads(path.read_text(encoding="utf-8"))
        except (OSError,ValueError) as error:
            result["issues"].append({"file":path.name,"problem":"not valid JSON","detail":str(error)[:150]})
            continue
        entries=obj.get("series",[]) if isinstance(obj,dict) else []
        if not isinstance(entries,list):
            result["issues"].append({"file":path.name,"problem":"series is not an array"})
            continue
        stats={"file":path.name,"series":0,"items":0,"photos":0,
               "missingPhotos":0,"invalidSeries":0,"duplicateUrls":0,"partialSeries":0}
        for series in entries:
            if not isinstance(series,dict) or not isinstance(series.get("items"),list):
                stats["invalidSeries"]+=1
                continue
            cards=series["items"]
            if not cards or series.get("count")!=len(cards) or series.get("verified") is not True:
                stats["invalidSeries"]+=1
                continue
            source=str(series.get("source") or "")
            parsed=urlsplit(source)
            root=parsed.path.strip("/").split("/")[0] if parsed.hostname=="data.mlpmerch.com" else ""
            root=root or "other"
            if series.get("completeness")=="verified-selected-releases":stats["partialSeries"]+=1
            stats["series"]+=1
            stats["items"]+=len(cards)
            stats["photos"]+=sum(bool(i.get("photo")) for i in cards if isinstance(i,dict))
            source_roots[root]["series"]+=1
            source_roots[root]["items"]+=len(cards)
            source_roots[root]["photos"]+=sum(bool(i.get("photo")) for i in cards if isinstance(i,dict))
            seen=set()
            for card in cards:
                if not isinstance(card,dict):continue
                item_url=str(card.get("sourceUrl") or "")
                if not item_url:continue
                # Comic issues and physical variants can share a source page.
                # A separately documented variantKey makes their identities distinct.
                variant=str(card.get("variantKey") or "")
                identity=(item_url,variant) if variant else item_url
                if identity in seen:stats["duplicateUrls"]+=1
                seen.add(identity)
                known_urls[item_url].add(path.name)
        stats["missingPhotos"]=stats["items"]-stats["photos"]
        total_partial+=stats["partialSeries"]
        total_series+=stats["series"]
        total_items+=stats["items"]
        total_photos+=stats["photos"]
        result["feeds"].append(stats)
    overlaps=[{"sourceUrl":url,"files":sorted(files)} for url,files in known_urls.items() if len(files)>1]
    result["duplicateExamples"]=overlaps[:15]
    result["totals"]={"verifiedSeriesRecords":total_series,"partialSeriesRecords":total_partial,"releaseRecords":total_items,
                       "photoRecords":total_photos,"missingPhotoRecords":total_items-total_photos,
                       "crossFeedOverlappingSourceUrls":len(overlaps),
                       "distinctSourceUrls":len(known_urls)}
    result["sourceRoots"]={k:v for k,v in sorted(source_roots.items())}
    # Overlaps between distinct catalog feeds are diagnostics, not automatically
    # deletable duplicates. A release may legitimately appear in multiple views.
    new_text=json.dumps(result,ensure_ascii=False,indent=2)+"\n"
    if not DEST.exists() or DEST.read_text(encoding="utf-8")!=new_text:
        DEST.write_text(new_text,encoding="utf-8")
    print("AUDIT",result["totals"])
    for feed in result["feeds"]:
        print(feed["file"],feed["series"],"series,",feed["items"],"releases,",feed["photos"],"photos")
    if result["issues"]:
        print("AUDIT ISSUES",len(result["issues"]),result["issues"][:5])

if __name__=="__main__":
    main()
