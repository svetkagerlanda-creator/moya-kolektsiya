#!/usr/bin/env python3
"""Audit real photo bytes across every verified catalogue. Does not edit any catalogue."""
import concurrent.futures as futures
import collections, hashlib, io, json, os
from pathlib import Path
import requests
from PIL import Image, ImageStat

BASE=Path(__file__).resolve().parents[1]/'catalogs'
Image.MAX_IMAGE_PIXELS=25000000
def check(url):
    if not url.startswith('https://'): return ('not_https',None)
    try:
        with requests.get(url,timeout=(5,12),stream=True,headers={'User-Agent':'Mozilla/5.0','Referer':'https://svetkagerlanda-creator.github.io/'}) as response:
            if response.status_code!=200:return ('http_'+str(response.status_code),None)
            buf=bytearray()
            for part in response.iter_content(65536):
                buf.extend(part)
                if len(buf)>12000000:return ('too_large',None)
        raw=bytes(buf)
        with Image.open(io.BytesIO(raw)) as image:
            image.load()
            w,h=image.size
            image.thumbnail((32,32))
            variance=max(ImageStat.Stat(image.convert('RGB')).var)
        if w<80 or h<80:return ('too_small',None)
        if variance<12:return ('nearly_blank',None)
        return ('decoded',hashlib.sha256(raw).hexdigest())
    except Exception as exc:return ('error_'+type(exc).__name__,None)

def main():
    items=0;missing=[];byurl=collections.defaultdict(list);bad=[]
    for p in sorted(BASE.glob('verified-*.json')):
        try: data=json.loads(p.read_text(encoding='utf8'))
        except Exception as e:bad.append((p.name,str(e)[:100]));continue
        for series in data.get('series',[]):
            for card in series.get('items',[]):
                items+=1
                info=(p.name,series.get('name',''),card.get('name',''))
                url=str(card.get('photo') or '').strip()
                if url:byurl[url].append(info)
                else:missing.append(info)
    print('PHOTO AUDIT START',json.dumps({'items':items,'missing':len(missing),'uniqueImages':len(byurl),'invalidFiles':bad},ensure_ascii=False),flush=True)
    counts=collections.Counter();fail=[];same=collections.defaultdict(set)
    with futures.ThreadPoolExecutor(max_workers=24) as pool:
        jobs={pool.submit(check,u):u for u in byurl}
        for n,job in enumerate(futures.as_completed(jobs),1):
            u=jobs[job]
            try:state,digest=job.result()
            except Exception:state,digest='unknown_error',None
            counts[state]+=len(byurl[u])
            if state!='decoded':fail.append({'status':state,'url':u,'cards':byurl[u][:3],'count':len(byurl[u])})
            if digest:
                for _,series,name in byurl[u]:same[(series,digest)].add(name)
            if n%1000==0:print('AUDITED',n,'/',len(byurl),flush=True)
    duplicates=[{'series':series,'names':sorted(names)[:12]} for (series,_),names in same.items() if len(names)>1]
    print('PHOTO AUDIT FINAL',json.dumps({'totalCards':items,'withPhotoField':items-len(missing),'decodedCards':counts['decoded'],'withoutPhoto':len(missing),'failedOrSuspicious':sum(v for k,v in counts.items() if k!='decoded'),'statuses':dict(counts),'duplicateImageDifferentItemGroups':len(duplicates),'failures':fail[:100],'duplicates':duplicates[:100],'missingSamples':missing[:30],'invalidFiles':bad},ensure_ascii=False),flush=True)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a',encoding='utf8') as f:f.write(f"### Actual image decoding audit\n\nCards: {items}; decoded: {counts['decoded']}; missing: {len(missing)}; other failures: {sum(v for k,v in counts.items() if k!='decoded')}.\n\nImage identity and actual browser rendering require separate visual verification.\n")

if __name__=='__main__':main()
