#!/usr/bin/env python3
"""Incrementally extend six collectible fandoms from real product pages.

Only real product listings become cards. No guessed figure numbers, characters,
editions, photos or source URLs. A catalog subset is explicitly marked partial;
the absence of an exact individual photo is not filled with unrelated imagery.
"""
import concurrent.futures
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit, parse_qs
import requests
from bs4 import BeautifulSoup

BASE=Path(__file__).resolve().parents[1]
OUTPUT=BASE/"catalogs/verified-new-fandoms.json"
ERRORS=BASE/"catalogs/new-fandoms-errors.json"
HEADERS={"User-Agent":"Mozilla/5.0 (personal noncommercial collectible catalog; contact repository maintainer)"}
# name, fandom, manufacturer, index; all published manufacturer catalogs.
SOURCES=[
 ("Bratz · Alwayz Bratz","bratz","MGA Entertainment","https://www.bratz.com/collections/alwayz-bratz"),
 ("Bratz · Slumber Party","bratz","MGA Entertainment","https://www.bratz.com/collections/bratz-slumber-party"),
 ("Bratz · Bratziez Blind Box","bratz","MGA Entertainment","https://www.bratz.com/collections/bratz-bratziez"),
 ("Bratz · Babyz","bratz","MGA Entertainment","https://www.bratz.com/collections/bratz-babyz"),
 ("Bratz · Fashion Pixiez","bratz","MGA Entertainment","https://www.bratz.com/collections/bratz-fashion-pixiez"),
 ("Bratz · Play Sportz","bratz","MGA Entertainment","https://www.bratz.com/collections/bratz-play-sportz"),
 ("Bratz · Charmz","bratz","MGA Entertainment","https://www.bratz.com/collections/bratz-charmz"),
 ("Bratz · Official Collections","bratz","MGA Entertainment","https://www.bratz.com/products"),
 ("Monster High · Skulltimate Secrets","monsterhigh","Mattel","https://shop.mattel.com/collections/monster-high-skulltimate-secrets"),
 ("Monster High · Official Mattel","monsterhigh","Mattel","https://shop.mattel.com/collections/monster-high"),
 ("Sylvanian Families · Families","sylvanian","Epoch","https://my.sylvanianfamilies.com/collections/figures"),
 ("Sylvanian Families · Babies","sylvanian","Epoch","https://my.sylvanianfamilies.com/collections/babies"),
 ("Littlest Pet Shop · Generation 7","lps","Basic Fun","https://www.basicfun.com/brand/littlest-pet-shop/"),
 ("Littlest Pet Shop · Product Series","lps","Basic Fun","https://www.basicfun.com/LPS/"),
 ("Winx Club · Iconic Dolls","winx","Giochi Preziosi","https://www.winxclub.com/products/winx-iconic-fashion-doll-giochi-preziosi"),
 ("Winx Club · Figures","winx","Rainbow","https://www.winxclub.com/collections/figures"),
 ("Winx Club · Fashion Dolls","winx","Rainbow","https://www.winxclub.com/collections/fashion-dolls"),
 ("Winx Club · Official Products","winx","Rainbow","https://www.winxclub.com/collections/all-products"),
 ("Ever After High · First Chapter","everafterhigh","Mattel","https://eahmerch.com/dolls/series/first-chapter/"),
 ("Ever After High · Legacy Day","everafterhigh","Mattel","https://eahmerch.com/dolls/series/legacy-day/"),
 ("Ever After High · Doll Series","everafterhigh","Mattel","https://eahmerch.com/dolls/series/"),
]
# Curated, exact official product pages; provide initial cards even when pages
# are not linked from a navigation page.
SEEDS=[
 ("Bratz · Babyz","bratz","MGA Entertainment","https://shop.mgae.com/collections/bratz-babyz/products/bratz-big-babyz-doll-yasmin"),
 ("Monster High · Skulltimate Secrets","monsterhigh","Mattel","https://shop.mattel.com/products/monster-high-skulltimate-secrets-clawdeen-wolf-doll-jbg80"),
 ("Monster High · Skulltimate Secrets","monsterhigh","Mattel","https://shop.mattel.com/products/monster-high-skulltimate-secrets-frankie-stein-doll-jbg81"),
 ("Sylvanian Families · Chocolate Rabbit Family","sylvanian","Epoch","https://www.sylvanianfamilies.com/uk-ua/catalog/item_detail.php?product_id=2356"),
 ("Sylvanian Families · Chocolate Rabbit Family","sylvanian","Epoch","https://www.sylvanianfamilies.com/en-uk/catalog/item_detail.php?product_id=2627"),
 ("Littlest Pet Shop · Series 5","lps","Basic Fun","https://www.basicfun.com/product/littlest-pet-shop-pet-surprise-singles-series-5/"),
 ("Littlest Pet Shop · Series 5","lps","Basic Fun","https://www.basicfun.com/product/littlest-pet-shop-opposites-attract-pet-pairs-series-5/"),
 ("Littlest Pet Shop · Series 6","lps","Basic Fun","https://www.basicfun.com/product/littlest-pet-shop-pet-surprise-singles-series-6/"),
 ("Winx Club · Iconic Dolls","winx","Giochi Preziosi","https://www.winxclub.com/products/winx-iconic-fashion-doll-giochi-preziosi"),
 ("Winx Club · Figures","winx","Rainbow","https://www.winxclub.com/en-us/products/winx-dreamix-figure-collection-6-characters"),
 ("Ever After High · First Chapter","everafterhigh","Mattel","https://service.mattel.com/us/productDetail.aspx?prodno=BBD42&siteid=27"),
]
HOSTS={
 "bratz":{"www.bratz.com","bratz.com","shop.mgae.com"},
 "monsterhigh":{"shop.mattel.com"},
 "sylvanian":{"www.sylvanianfamilies.com","my.sylvanianfamilies.com"},
 "lps":{"www.basicfun.com"},
 "winx":{"www.winxclub.com"},
 "everafterhigh":{"eahmerch.com","www.eahmerch.com","service.mattel.com"},
}
MAX_PER_SOURCE=100

def canonical(url):
    p=urlsplit(url)
    # Strip transient marketing parameters but preserve product_id and Mattel ID.
    q=p.query if ("item_detail.php" in p.path or "productDetail.aspx" in p.path) else ""
    return urlunsplit((p.scheme.lower(),p.netloc.lower(),p.path.rstrip("/")+("/" if p.path.endswith("/") else ""),q,""))

def get(url):
    r=requests.get(url,headers=HEADERS,timeout=28,allow_redirects=True)
    r.raise_for_status()
    return BeautifulSoup(r.text,"html.parser")

def links_from(soup,url,fandom):
    out=set()
    for a in soup.select("a[href]"):
        href=urljoin(url,a["href"])
        p=urlsplit(href)
        if p.scheme!="https" or p.hostname not in HOSTS[fandom]:continue
        path=p.path.lower()
        valid={
            "bratz":"/products/" in path and not path.endswith("/products/"),
            "monsterhigh":"/products/" in path,
            "sylvanian":("item_detail.php" in path and "product_id=" in p.query) or ("/products/" in path and p.hostname=="my.sylvanianfamilies.com"),
            "lps":"/product/" in path and "littlest-pet-shop" in path,
            "winx":"/products/" in path,
            "everafterhigh":"/dolls/details/" in path or ("/dolls/" in path and "/details/" in path),
        }[fandom]
        if valid:out.add(canonical(href))
    return sorted(out)[:MAX_PER_SOURCE]

def meta(soup,key):
    x=soup.find("meta",attrs={"property":key}) or soup.find("meta",attrs={"name":key})
    return (x.get("content") or "").strip() if x else ""

def parse_product(url,fandom,manufacturer):
    soup=get(url)
    node=soup.find("h1")
    title=meta(soup,"og:title") or (node.get_text(" ",strip=True) if node else "")
    title=re.sub(r"\s+[|–]\s+(?:Bratz|Mattel|Sylvanian Families|BasicFun!|Winx Club).*$","",title,flags=re.I).strip()
    if not title or len(title)>170:raise ValueError("missing trustworthy product title")
    # Avoid marketing, navigation or product-page galleries masquerading as a SKU.
    photo=meta(soup,"og:image") or meta(soup,"twitter:image")
    photo=urljoin(url,photo) if photo else ""
    if photo and (urlsplit(photo).scheme!="https" or not urlsplit(photo).hostname):photo=""
    description=meta(soup,"og:description")[:350]
    if fandom=="winx":
        combined=(title+" "+description).lower()
        if "giochi preziosi" in combined:manufacturer="Giochi Preziosi"
        elif "playmates" in combined:manufacturer="Playmates Toys"
    # Verified page-level product image, not claimed as variant-specific.
    p=urlsplit(url)
    number=""
    if p.hostname=="shop.mattel.com":
        m=re.search(r"[-/]([a-z]{2,4}\d{2,6})(?:[-/]|$)",p.path,re.I)
        if m:number=m.group(1).upper()
    elif "product_id=" in p.query:
        number=parse_qs(p.query).get("product_id",[""])[0]
    elif "prodno=" in p.query.lower():
        number=parse_qs(p.query).get("prodno",[""])[0]
    return {"name":title,"figureNumber":number,"manufacturer":manufacturer,
            "sourceUrl":canonical(url),"photo":photo,"description":description}

def verified_product_cards(url,fandom,manufacturer):
    """Read distinct Shopify variants when available, otherwise one real SKU."""
    base=parse_product(url,fandom,manufacturer)
    parsed=urlsplit(url)
    if (parsed.hostname not in {"www.bratz.com","shop.mgae.com","www.winxclub.com","my.sylvanianfamilies.com"}
            or "/products/" not in parsed.path):
        return [base]
    endpoint=urlunsplit((parsed.scheme,parsed.netloc,parsed.path.rstrip("/")+".js","",""))
    try:
        response=requests.get(endpoint,headers=HEADERS,timeout=18)
        response.raise_for_status()
        product=response.json()
    except (ValueError,requests.RequestException):
        return [base]
    variants=product.get("variants",[])
    image_candidates=[product.get("featured_image"),*(product.get("images") or [])]
    if not base["photo"]:
        for raw in image_candidates:
            image=raw.get("src","") if isinstance(raw,dict) else raw
            if not image:continue
            candidate=urljoin(url,image)
            if urlsplit(candidate).scheme=="https":
                base["photo"]=candidate
                break
    if len(variants)<2:
        return [base]
    result=[]
    for v in variants:
        if not v.get("id"):continue
        title=str(v.get("public_title") or v.get("title") or "").strip()
        if not title or title.lower() in {"default title","default"}:
            continue
        photo=""
        featured=v.get("featured_image")
        if isinstance(featured,dict):photo=featured.get("src") or ""
        elif isinstance(featured,str):photo=featured
        if not photo:
            # Select a photo only if its filename explicitly identifies this
            # character/physical variant (not another doll in a group picture).
            token=re.sub(r"[^a-z0-9]","",title.lower())
            for raw in product.get("images",[]):
                candidate=raw.get("src","") if isinstance(raw,dict) else str(raw)
                tail=urlsplit(candidate).path.split("/")[-1].lower()
                if token and token in re.sub(r"[^a-z0-9]","",tail):
                    photo=candidate
                    break
        photo=urljoin(url,photo) if photo else ""
        if urlsplit(photo).scheme!="https":photo=""
        # Every variant needs its own verified photo. Never apply the parent
        # product's generic gallery image to all six different characters.
        entry=dict(base)
        entry.update(name=base["name"]+" — "+title,
                     figureNumber=str(v.get("sku") or ""),
                     variantKey=str(product.get("id") or "")+"|"+str(v["id"]),
                     photo=photo,description=(base["description"]+"; variant: "+title).strip("; "))
        result.append(entry)
    return result or [base]

def identity(card):
    return (card["sourceUrl"],card.get("variantKey") or "")

def belongs_to_series(name,card):
    """Exclude unrelated recommendations and apparel from named doll lines."""
    title=card["name"].lower()
    slug=urlsplit(card["sourceUrl"]).path.lower()
    common=title+" "+slug
    checks={
      "Bratz · Alwayz Bratz":"alwayz bratz",
      "Bratz · Babyz":"babyz",
      "Bratz · Charmz":"charmz",
      "Bratz · Fashion Pixiez":"fashion pixiez",
      "Bratz · Play Sportz":"play sportz",
      "Bratz · Slumber Party":"slumber party",
      "Bratz · Bratziez Blind Box":"bratziez",
    }
    if name in checks:
        key=checks[name]
        if key not in common and key.replace(" ","-") not in common:return False
        # Apparel and unrelated recommended items are not dolls in a doll line.
        if re.search(r"t-shirt|shirt|hoodie|sweatshirt|adult|tote|legging|pijama|pajama",title):
            return False
    if name=="Bratz · Official Collections":
        if "doll" not in title and "figure" not in title:return False
    if name=="Winx Club · Fashion Dolls":
        return "doll" in title
    if name=="Winx Club · Figures":
        return "figure" in title
    if name=="Littlest Pet Shop · Generation 7":
        if "series 5" in title or "series 6" in title:return False
    if name=="Monster High · Skulltimate Secrets":
        return "skulltimate" in common or "monstrueux secrets" in common
    return True

def main():
    previous={}
    if OUTPUT.exists():
        try:
            previous={s["name"]:s for s in json.loads(OUTPUT.read_text(encoding="utf8")).get("series",[])}
        except (OSError,ValueError,KeyError):pass
    # Reapply individually source-verified cards after each refresh. A workflow
    # may check out an older catalog snapshot; these seeds must never disappear.
    seeds_path=BASE/"catalogs/verified-new-fandoms-seeds.json"
    if seeds_path.exists():
        seeds=json.loads(seeds_path.read_text(encoding="utf8")).get("series",[])
        for seed in seeds:
            name=seed["name"]
            old=previous.get(name,{})
            original={identity(c):c for c in old.get("items",[]) if c.get("sourceUrl")}
            for card in seed["items"]:
                key=identity(card)
                if key not in original:
                    original[key]=card
                elif not original[key].get("photo") and card.get("photo"):
                    original[key]["photo"]=card["photo"]
            previous[name]={**seed,**old,"name":name,"items":list(original.values()),"count":len(original)}
    errors={}
    candidates={}
    for name,fandom,maker,index in SOURCES:
        try:
            links=links_from(get(index),index,fandom)
            for url in links:candidates.setdefault((name,fandom,maker),set()).add(url)
        except Exception as e:errors[index]=str(e)[:250]
    for name,fandom,maker,url in SEEDS:
        candidates.setdefault((name,fandom,maker),set()).add(canonical(url))
    def task(info):
        (name,fandom,maker),url=info
        try:return (name,fandom,maker,url,verified_product_cards(url,fandom,maker),None)
        except Exception as e:return (name,fandom,maker,url,None,str(e)[:250])
    # A single physical product may appear on many storefront category pages.
    # Assign each exact product URL to one most specific catalog series.
    preferred={canonical(url):(name,fandom,maker) for name,fandom,maker,url in SEEDS}
    jobs=[]
    seen=set()
    for key,urls in candidates.items():
        for url in sorted(urls):
            if url in seen or (url in preferred and preferred[url]!=key):
                continue
            seen.add(url)
            jobs.append((key,url))
    results={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for name,fandom,maker,url,card,error in pool.map(task,jobs):
            if error:
                errors[url]=error
            elif card:
                for item in card:
                    if belongs_to_series(name,item):
                        results.setdefault((name,fandom,maker),{})[identity(item)]=item
    for (name,fandom,maker),cards in results.items():
        old=previous.get(name,{})
        # Preserve old cards and exact-source photos if a store changes navigation.
        merged={identity(c):c for c in old.get("items",[]) if c.get("sourceUrl")}
        for key,card in cards.items():
            matching_old=[(oldkey,oldcard) for oldkey,oldcard in merged.items()
                          if oldcard.get("sourceUrl")==card.get("sourceUrl")
                          and oldcard.get("name","").casefold()==card.get("name","").casefold()]
            # Some storefronts block public variant feeds intermittently.
            # Never replace six exact character cards with one generic parent SKU.
            if not card.get("variantKey") and any(
                    c.get("variantKey") for c in merged.values()
                    if c.get("sourceUrl")==card.get("sourceUrl")):
                continue
            oldcard=merged.get(key,{})
            if matching_old:
                oldkey,oldcard=matching_old[0]
                if oldkey!=key:merged.pop(oldkey,None)
            if not card["photo"] and oldcard.get("photo"):card["photo"]=oldcard["photo"]
            merged[key]=card
        items=sorted(merged.values(),key=lambda c:(c["name"],c["sourceUrl"],c.get("variantKey","")))
        previous[name]={"name":name,"verified":True,"completeness":"verified-selected-releases",
                        "source":next((src for n,f,m,src in SOURCES if n==name),items[0]["sourceUrl"]),
                        "manufacturer":maker,"fandomKey":fandom,
                        "group":{"bratz":"💄 Bratz","monsterhigh":"🦇 Monster High",
                                 "everafterhigh":"📖 Ever After High","sylvanian":"🐰 Sylvanian Families",
                                 "lps":"🐾 Littlest Pet Shop","winx":"🧚 Winx Club"}[fandom],
                        "count":len(items),"items":items}
    # Clean earlier crawls with storefront "you may also like" recommendations.
    # Keep only releases belonging to their series, and one identity across
    # different country/language storefront pages where SKU is identical.
    old_wrong_names={"Bratz · Official Fashion Dolls"}
    priority=lambda name:(any(x in name for x in
        ("Official Collections","Official Products","Official Mattel",
         "Generation 7","Product Series","Doll Series")),name)
    dedup=set()
    clean=[]
    for series in sorted(previous.values(),key=lambda x:priority(x["name"])):
        if series["name"] in old_wrong_names:continue
        valid=[]
        for card in series.get("items",[]):
            if not belongs_to_series(series["name"],card):continue
            url=card.get("sourceUrl","")
            sku=str(card.get("figureNumber") or "")
            if series.get("fandomKey")=="monsterhigh" and sku:
                release_key=("monsterhigh",sku.casefold())
            elif card.get("variantKey"):
                release_key=(series.get("fandomKey"),url,card["variantKey"])
            else:
                release_key=(series.get("fandomKey"),url)
            if release_key in dedup:continue
            dedup.add(release_key)
            valid.append(card)
        if not valid:continue
        series["items"]=sorted(valid,key=lambda c:(c.get("name",""),c.get("sourceUrl","")))
        series["count"]=len(valid)
        clean.append(series)
    output={"schemaVersion":1,"series":sorted(clean,key=lambda s:s["name"])}
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(output,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf8")
    ERRORS.write_text(json.dumps({"sourcePages":len(SOURCES),"queriedProductPages":len(jobs),
       "verifiedSeries":len(output["series"]),"verifiedProducts":sum(s["count"] for s in output["series"]),
       "photoRecords":sum(sum(bool(c.get("photo")) for c in s["items"]) for s in output["series"]),
       "errors":errors},ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print(f"NEW FANDOMS {len(output['series'])} series, {sum(s['count'] for s in output['series'])} individual products, {len(errors)} retrieval errors")

if __name__=="__main__":
    main()
