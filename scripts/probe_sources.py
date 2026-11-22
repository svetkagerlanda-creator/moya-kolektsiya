#!/usr/bin/env python3
"""Check public MLP Merch page structure for verified item import; never publish incomplete lists."""
import json, re
from pathlib import Path
import requests
from bs4 import BeautifulSoup
TARGETS = {
 "cmc_series1":"https://data.mlpmerch.com/cmc/series/series-1/",
 "cmc_index":"https://data.mlpmerch.com/cmc/series/",
 "ponyville_set_index":"https://data.mlpmerch.com/ponyville/set/",
 "ponyville_year_index":"https://data.mlpmerch.com/ponyville/year/",
 "goh_series_index":"https://data.mlpmerch.com/goh/series/",
 "goh_main":"https://data.mlpmerch.com/goh/series/main-series/",
 "equestria_series_index":"https://data.mlpmerch.com/equestria-girls/series/",
 "equestria_one":"https://data.mlpmerch.com/equestria-girls/series/original-series/",
 "playskool_index":"https://data.mlpmerch.com/playskool/set/",
 "g1retro_index":"https://data.mlpmerch.com/g1-retro/set/",
 "otherfig_index":"https://data.mlpmerch.com/other-figures/set/",
 "funko_index":"https://data.mlpmerch.com/funko-figures/series/",
 "blind_wave1":"https://data.mlpmerch.com/blind-bags/release/wave-1/",
 "blind_wave2":"https://data.mlpmerch.com/blind-bags/release/wave-2/",
 "blind_releases":"https://data.mlpmerch.com/blind-bags/release/",
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
  sample=soup.select_one('a[href*="/kayou-cards/details/"]') or soup.select_one('a[href*="/brushables/details/"]') or soup.select_one('a[href*="/cmc/details/"]') or soup.select_one('a[href*="/ponyville/details/"]') or soup.select_one('a[href*="/goh/details/"]') or soup.select_one('a[href*="/blind-bags/details/"]') or soup.select_one('span.data-smallt')
  snippet=str(sample.parent.parent)[:7000] if sample else ""
  result[name]={"http":r.status_code,"length":len(body),"title":soup.title.get_text(" ",strip=True)[:180] if soup.title else "","text":soup.get_text(" ",strip=True)[:400],"links":links,"sample_html":snippet,"candidate_details":[{"href":a.get("href"),"text":a.get_text(" ",strip=True)[:80]} for a in soup.select('a[href*="/details/"]')][:5],"candidate_categories":[{"href":a.get("href"),"text":a.get_text(" ",strip=True)[:80]} for a in soup.select("a[href]") if any(f"/{c}/" in a.get("href","") for c in ("series","set","year","release"))][:45],"detail_count":len(soup.select('a[href*="/kayou-cards/details/"]')),"blind_links":len(soup.select('a[href*="/blind-bags/details/"]')),"release_links":[{"label":a.get_text(" ",strip=True)[:90],"href":a.get("href")} for a in soup.select('a[href*="/blind-bags/release/"]')][:120],"brushable_links":len(soup.select('a[href*="/brushables/details/"]')),"smallt_count":len(soup.select("span.data-smallt"))}
 except Exception as e: result[name]={"error":str(e)[:240]}
p=Path(__file__).resolve().parents[1]/"catalogs"/"source-probe.json"
p.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
