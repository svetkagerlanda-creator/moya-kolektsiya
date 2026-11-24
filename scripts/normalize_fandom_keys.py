#!/usr/bin/env python3
"""Repair explicitly verified MLP/Kayou feeds lacking fandomKey. Never move user folders."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'catalogs'
FILES=(
 'verified-blind-bags.json',
 'verified-brushables.json',
 'verified-kayou.json',
 'verified-mlp-all-series.json',
 'verified-mlp-figures.json',
 'verified-mlpmerch.json',
)
def main():
 changed=0
 for filename in FILES:
  p=ROOT/filename
  data=json.loads(p.read_text(encoding='utf8'))
  edited=0
  for entry in data.get('series',[]):
   name=str(entry.get('name',''))
   if filename=='verified-kayou.json' or filename=='verified-mlpmerch.json':
    if not name.startswith(('Kayou ·','Kayou TCG ·')):
     raise ValueError(f'Unexpected non-Kayou series in {filename}: {name}')
   elif filename=='verified-mlp-all-series.json':
    if not name.startswith('MLP Merch ·'):raise ValueError(f'Unexpected non-MLP series: {name}')
   else:
    if not name.startswith('Hasbro ·'):raise ValueError(f'Unexpected non-Hasbro series: {name}')
   if entry.get('fandomKey') not in (None,'','mlp'):
    raise ValueError(f'Unexpected fandomKey in {filename}: {entry.get("fandomKey")}')
   if not entry.get('fandomKey'):
    entry['fandomKey']='mlp';edited+=1
  if edited:
   p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
   changed+=edited
  print(filename,edited,'MLP fandom keys added',flush=True)
 print('MLP FANDOM REPAIR:',changed,'series',flush=True)
if __name__=='__main__':main()
