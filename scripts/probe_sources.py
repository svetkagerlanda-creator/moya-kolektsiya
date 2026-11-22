#!/usr/bin/env python3
"""Check public MLP Merch page structure for verified item import; never publish incomplete lists."""
import json, re
from pathlib import Path
import requests
from bs4 import BeautifulSoup
TARGETS = {
 "original_brushables":"https://data.mlpmerch.com/brushables/series/original-series/",
 "moon4":"https://data.mlpmerch.com/kayou-cards/subset/moon-edition/series-4/",
 "fun4":"https://data.mlpmerch.com/kayou-cards/subset/fun-moments-edition/series-4/",
 "brushables":"https://data.mlpmerch.com/brushables/series/",
 "blind_bags":"https://data.mlpmerch.com/blind-bags/series/",
 "cutie_mark_crew":"https://data.mlpmerch.com/cmc/",
}
result={}
for name,url in TARGETS.items():
 try:
  r=requests.get(url,headers={"User-Agent":"Mozilla/5.0 (compatible; personal-catalog-research/1.0)"},timeout=18)
  body=r.text
  soup=BeautifulSoup(body,"html.parser")
  links=[{"text":a.get_text(" ",strip=True)[:100],"href":a.get("href","")[:160],"img":(a.find("img").get("alt","")[:100] if a.find("img") else "")} for a in soup.select("a[href]") if a.find("img") or "card" in a.get("href","").lower()][:24]
  sample=soup.select_one('a[href*="/kayou-cards/details/"]') or soup.select_one('a[href*="/brushables/details/"]') or soup.select_one('span.data-smallt')
  snippet=str(sample.parent.parent)[:7000] if sample else ""
  result[name]={"http":r.status_code,"length":len(body),"title":soup.title.get_text(" ",strip=True)[:180] if soup.title else "","text":soup.get_text(" ",strip=True)[:400],"links":links,"sample_html":snippet,"detail_count":len(soup.select('a[href*="/kayou-cards/details/"]')),"brushable_links":len(soup.select('a[href*="/brushables/details/"]')),"smallt_count":len(soup.select("span.data-smallt"))}
 except Exception as e: result[name]={"error":str(e)[:240]}
p=Path(__file__).resolve().parents[1]/"catalogs"/"source-probe.json"
p.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
