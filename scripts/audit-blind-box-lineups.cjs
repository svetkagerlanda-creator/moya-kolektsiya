#!/usr/bin/env node
/** Audit mystery-box series without confusing retail packaging and revealed figures.
 * Run: node scripts/audit-blind-box-lineups.cjs
 * Read-only audit: writes diagnostics; never changes collection/user data.
 */
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..','catalogs');
const files=fs.readdirSync(root).filter(n=>n.startsWith('verified-')&&n.endsWith('.json'));
const blind=/(blind[ -]?box|blind[ -]?bag|mystery|surprise|secret box|bratziez|сюрприз|секретн|s?leep.*elves|skullpanda|crybaby|hirono|labubu|pop mart|52toys|lets?van|nono sova|tnt anita|penny.s box)/i;
const packaged=/(single box|blind box|mystery box|sealed box|surprise box|mystery pack|random box|в асортименті|фігурка-сюрприз|іграшка-сюрприз)/i;
const report={schemaVersion:1,description:'Static coverage audit, not proof of complete manufacturer lineups or image availability',generatedAt:new Date().toISOString(),files:files.length,seriesInspected:0,flagged:[],summary:{oneItemSeries:0,partialSeries:0,missingImageCards:0,packagingOnly:0,declaredCountMismatch:0}};
for(const file of files){
  let raw;
  try{raw=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}catch(e){continue}
  for(const s of raw.series||[]){
    if(!blind.test([s.name,s.group,s.fandomKey].join(' ')))continue;
    report.seriesInspected++;
    const cards=s.items||[];
    const missingImages=cards.filter(c=>!c.photo).length;
    const packaging=cards.filter(c=>packaged.test(c.name||'')||/retailer:bi.ua/.test(c.variantKey||'')).length;
    const single=cards.length===1;
    const partial=/selected|partial/i.test(s.completeness||'');
    const mismatch=Number.isInteger(s.sourceDeclaredCount)&&s.sourceDeclaredCount>cards.length;
    if(single||partial||missingImages||mismatch){
      if(single)report.summary.oneItemSeries++;
      if(partial)report.summary.partialSeries++;
      if(missingImages)report.summary.missingImageCards+=missingImages;
      if(single&&packaging===1)report.summary.packagingOnly++;
      if(mismatch)report.summary.declaredCountMismatch++;
      report.flagged.push({file,series:s.name,records:cards.length,packagingRecords:packaging,figureRecords:cards.length-packaging,missingPhotos:missingImages,completeness:s.completeness||'unspecified',sourceDeclaredCount:s.sourceDeclaredCount||null,reasons:[single?'one-record-series':null,partial?'partial-series':null,missingImages?'missing-individual-photos':null,mismatch?'declared-count-mismatch':null].filter(Boolean)});
    }
  }
}
report.flagged.sort((a,b)=>(a.figureRecords-b.figureRecords)||(b.missingPhotos-a.missingPhotos)||a.series.localeCompare(b.series));
fs.writeFileSync(path.join(root,'blind-box-lineup-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({seriesInspected:report.seriesInspected,flagged:report.flagged.length,summary:report.summary}));
