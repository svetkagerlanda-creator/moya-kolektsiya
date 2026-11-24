#!/usr/bin/env node
// Read-only: checks EVERY verified catalog's fandom key against the app's options.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'catalogs');
const src=fs.readFileSync(path.join(root,'index.html'),'utf8');
const catalogStart=src.indexOf('const FANDOM_CATALOG_GROUPS=');
const catalogEnd=src.indexOf('];',catalogStart);
const groups=JSON.parse(src.slice(catalogStart+'const FANDOM_CATALOG_GROUPS='.length,catalogEnd+1));
const keyed=new Map(groups.flatMap(group=>group.entries).map(entry=>[entry.key,entry.name]));
const main=src.slice(src.indexOf('const FANDOMS=['),src.indexOf('/* Curated choices'));
for(const match of main.matchAll(/key:'([^']+)',name:'([^']+)'/g))keyed.set(match[1],match[2]);
const aliases={'harrypotter':'catalog-3-01','harry-potter':'catalog-3-01','harry_potter':'catalog-3-01','pokemon':'catalog-1-02','pokémon':'catalog-1-02','sanrio':'catalog-5-04','hello-kitty':'catalog-5-04'};
const canonical=x=>aliases[x]||x;
const expectations=[
 [/harry potter|wizarding world/i,'catalog-3-01'],
 [/my little pony|mlp merch|equestria girls|cutie mark crew|kayou · .*pony/i,'mlp'],
 [/monster high/i,'monsterhigh'],[/ever after high/i,'everafterhigh'],
 [/\bbratz\b/i,'bratz'],[/\bwinx\b/i,'winx'],
 [/littlest pet shop/i,'lps'],[/sylvanian families/i,'sylvanian'],
 [/\bnaruto\b/i,'naruto'],[/demon slayer|kimetsu/i,'demonslayer'],
 [/doctor who/i,'doctorwho']
];
const rows=[],errors=[],seriesKeys={},seen=new Map();
let items=0,series=0,nonEmpty=0,missingKey=0,unknown=0,wrong=0;
for(const name of fs.readdirSync(directory).filter(n=>/^verified-.*\.json$/.test(n)&&!n.includes('photo-patches')).sort()){
 let obj;try{obj=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));}catch(e){errors.push({file:name,error:String(e)});continue}
 const list=obj.series||[],count={},examples=[];
 for(const entry of list){
  if(!entry||!Array.isArray(entry.items)){errors.push({file:name,series:entry?.name,error:'missing items'});continue}
  series++;items+=entry.items.length;
  const key=String(entry.fandomKey||''),canon=canonical(key);
  count[canon]=(count[canon]||0)+1;
  if(!key){missingKey++;examples.push({name:entry.name,issue:'missing key'});continue}
  if(!keyed.has(canon)){unknown++;examples.push({name:entry.name,key,issue:'unknown fandom key'});}
  else nonEmpty++;
  const matches=expectations.filter(([p])=>p.test(entry.name||''));
  if(matches.length===1&&canon!==matches[0][1]&&canon!=='blind-box'){
   wrong++;examples.push({name:entry.name,key,expected:matches[0][1],issue:'likely miscategorized'});
  }
  const ident=String(entry.name||'').trim().toLowerCase();
  if(seen.has(ident)&&canonical(seen.get(ident).key)!==canon)examples.push({name:entry.name,key,other:seen.get(ident),issue:'same series inconsistent across feeds'});
  else if(!seen.has(ident))seen.set(ident,{file:name,key});
 }
 seriesKeys[name]=count;rows.push({file:name,series:list.length,keyCounts:count,issues:examples.slice(0,30),issueCount:examples.length});
}
const report={checkedSeries:series,checkedItems:items,files:rows.length,missingFandomKey:missingKey,unknownFandomKey:unknown,suspiciousMismatches:wrong,errors,filesWithIssues:rows.filter(r=>r.issueCount>0),byFile:seriesKeys};
console.log('FANDOM AUDIT FINAL '+JSON.stringify(report));
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'### Catalog fandom assignment audit\n\n'+JSON.stringify({series,items,missingKey,unknown,wrong})+'\n');
