#!/usr/bin/env python3
import json,requests
from bs4 import BeautifulSoup
from pathlib import Path
targets={
 "sweet-2015":"https://data.mlpmerch.com/other-figures/set/sweet-box-figure/",
 "sweet-2020":"https://data.mlpmerch.com/other-figures/set/confitrade/sweet-box-figure-set-2/",
 "funko-series2":"https://data.mlpmerch.com/funko-figures/series/series-2/",
}
samples={}
for label,url in targets.items():
 r=requests.get(url,timeout=25,headers={"User-Agent":"Mozilla/5.0"});r.raise_for_status()
 soup=BeautifulSoup(r.text,"html.parser")
 rows=[]
 for a in soup.select('a[href*="/details/"]'):
  bottom=a.find_parent(class_="data-bottom")
  if not bottom:continue
  images=bottom.parent.select(".data-top img.data-img") if bottom.parent else []
  photo=(images[0].get("src") if images else "")
  rows.append({"name":a.get_text(" ",strip=True),"url":a.get("href"),"image":photo,
   "info":bottom.get_text(" ",strip=True)[:200],"html":str(bottom.parent)[:400]})
 samples[label]={"url":url,"items":rows,"total":len(rows)}
Path("catalogs/photo-probe.json").write_text(json.dumps(samples,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
print("wrote", {k:v["total"] for k,v in samples.items()})
