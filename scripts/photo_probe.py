#!/usr/bin/env python3
import json,requests
from bs4 import BeautifulSoup
from pathlib import Path
url="https://data.mlpmerch.com/cmc/series/series-1/"
r=requests.get(url,timeout=25,headers={"User-Agent":"Mozilla/5.0"});r.raise_for_status()
soup=BeautifulSoup(r.text,"html.parser")
samples=[]
for a in soup.select('a[href*="/cmc/details/"]'):
 bottom=a.find_parent(class_="data-bottom")
 if not bottom:continue
 root=bottom.find_parent(class_="data-item")
 if not root:continue
 imgs=[]
 for img in root.find_all("img"):
  imgs.append({"alt":img.get("alt"),"attrs":dict(img.attrs),"parent_href":img.parent.get("href") if img.parent else None})
 samples.append({"name":a.get_text(" ",strip=True),"url":a.get("href"),"images":imgs[:4],"html":str(root)[:2400]})
 if len(samples)>=12:break
Path("catalogs/photo-probe.json").write_text(json.dumps(samples,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
print("wrote",len(samples))
