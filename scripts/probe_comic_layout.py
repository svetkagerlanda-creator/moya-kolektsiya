#!/usr/bin/env python3
"""Record small structural samples of MLP Merch comic pages for parser debugging.

No images are downloaded and no personal data is collected. Source data includes
only public CSS class names, element tags, and small snippets of item markup.
"""
import json
from pathlib import Path
import requests
from bs4 import BeautifulSoup

BASE=Path(__file__).resolve().parents[1]
OUT=BASE/"catalogs"/"comic-layout-probe.json"
URLS=[
 "https://data.mlpmerch.com/comics/series/friendship-is-magic/",
 "https://data.mlpmerch.com/comics/series/micro-series/",
 "https://data.mlpmerch.com/g5-comics/series/my-little-pony/",
]
def sample(url):
    reply=requests.get(url,headers={"User-Agent":"Mozilla/5.0 (personal noncommercial collection indexing)"},timeout=35)
    reply.raise_for_status()
    soup=BeautifulSoup(reply.text,"html.parser")
    nodes=[]
    for element in soup.find_all(True):
        names=element.get("class") or []
        if any(t.startswith(("data-","merch-","item-","comic-")) for t in names):
            nodes.append(element)
    classes={}
    for e in nodes:
        key=e.name+"."+".".join(e.get("class") or [])
        classes[key]=classes.get(key,0)+1
    examples=[]
    for e in nodes:
        classname=" ".join(e.get("class") or [])
        if not any(n in classname for n in ("item","bottom","top","comic","img","name","text")):
            continue
        if len(examples)>=12:break
        examples.append({"tag":e.name,"class":classname,
                         "text":e.get_text(" ",strip=True)[:180],
                         "html":str(e)[:1200]})
    return {"url":url,"counts":dict(sorted(classes.items(),key=lambda v:-v[1])[:35]),
            "dataBottom":len(soup.select(".data-bottom")),
            "dataTop":len(soup.select(".data-top")),
            "images":len(soup.select("img")),
            "linksDetails":len(soup.select('a[href*="/details/"]')),
            "samples":examples}

def main():
    records=[]
    for url in URLS:
        try:records.append(sample(url))
        except Exception as e:records.append({"url":url,"error":str(e)[:300]})
    OUT.write_text(json.dumps({"schemaVersion":1,"pages":records},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    for page in records:
        print(page["url"],page.get("dataBottom"),page.get("dataTop"),page.get("error"))

if __name__=="__main__":
    main()
