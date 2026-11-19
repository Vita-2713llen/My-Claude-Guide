const fs=require('fs'),zlib=require('zlib');const R=JSON.parse(fs.readFileSync('r.json','utf8'));
const tok=Object.fromEntries(R.tokens.map(t=>[t.key,t.name]));const pre=Object.fromEntries(R.presets.map(p=>[p.key,p.name]));
const cms=JSON.parse(fs.readFileSync('cms.json','utf8'));
fs.mkdirSync('pk',{recursive:true});
for(const [page,sections] of Object.entries(R.pages)){
  const idx=JSON.parse(fs.readFileSync(`m/${page}/index.json`,'utf8'));
  const H={};for(const w of idx.widths){let h=0;for(const s of idx.sections){const t=JSON.parse(fs.readFileSync(`m/${page}/${s}.json`,'utf8')).tree;const b=t.bp[w];if(b&&!b.none)h+=b.r.h;}H[w]=Math.ceil(h);}
  const data={page,heights:H,tok,pre,sections};
  fs.writeFileSync(`pk/${page}.json`,JSON.stringify({z:zlib.gzipSync(JSON.stringify(data)).toString('base64')}));
  console.log(page,JSON.stringify(H),fs.statSync(`pk/${page}.json`).size);
}
