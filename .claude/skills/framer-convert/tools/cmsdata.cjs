const fs=require('fs');const {JSDOM}=require('/tmp/claude-0/work/node_modules/jsdom');
const COLS={solutions:'solutions',team:'team',values:'values',blog:'blog'};
const LISTPAGES=['index','solutions','our-team','values','blog','about-us','platform','research','contact-us','testimonials','faq','resources','404',...fs.readdirSync('/tmp/claude-0/dl_snap').filter(f=>f.includes('__')).map(f=>f.replace('.html',''))];
const docs={};const doc=p=>docs[p]||(docs[p]=new JSDOM(fs.readFileSync(`/tmp/claude-0/dl_snap/${p}.html`,'utf8')).window.document);
const leafVals=(it)=>{const out={};const walk=(e,p)=>{const c=(typeof e.className==='string'?e.className.split(/\s+/)[0]:'')||e.tagName.toLowerCase();
  const sib=[...e.parentElement.children].filter(x=>((typeof x.className==='string'?x.className.split(/\s+/)[0]:'')||x.tagName.toLowerCase())===c);const path=p+'>'+c+(sib.length>1&&p?'['+sib.indexOf(e)+']':'');
  if(/w-richtext/.test(e.className||'')){out[path+'#html']=e.innerHTML;return;}
  if(e.tagName==='IMG')out[path+'#src']=e.getAttribute('src');
  const leaf=!e.children.length||[...e.children].every(x=>/^(SPAN|STRONG|EM|BR)$/.test(x.tagName)&&!x.children.length);
  if(leaf){const t=e.textContent.trim().replace(/\s+/g,' ');if(t)out[path+'#text']=t;}
  for(const k of e.children)if(!/svg|script|style/i.test(k.tagName))walk(k,path);};walk(it,'');return out;};
const data={};
for(const [col,seg] of Object.entries(COLS)){
  const det=JSON.parse(fs.readFileSync(`cms_${col}.json`,'utf8'));
  const items={};det.slugs.forEach((s,i)=>{items[s]={};for(const [k,v] of Object.entries(det.fields))items[s]['D'+k]=v[i];});
  for(const p of LISTPAGES){const d=doc(p);[...d.querySelectorAll('.w-dyn-list')].forEach((list,li)=>{
    if(list.closest('.header,.w-nav'))return;
    for(const it of list.querySelectorAll('.w-dyn-item')){const a=[...it.querySelectorAll('a[href]'),...(it.matches('a[href]')?[it]:[])].map(x=>x.getAttribute('href')).find(h=>h.startsWith('/'+seg+'/'));if(!a)continue;
      const slug=a.split('/')[2];if(!items[slug])continue;for(const [k,v] of Object.entries(leafVals(it)))items[slug][`L${p}:${li}${k}`]=v;}});}
  const slugs=Object.keys(items);
  // per list: a relpath with one value across its >=2 items is static copy, not a field
  const groups={};for(const s of slugs)for(const k of Object.keys(items[s])){if(!k.startsWith('L'))continue;const g=k.slice(0,k.indexOf('>'));(groups[g]=groups[g]||new Set()).add(s);}
  const isConst=(k)=>{if(!k.startsWith('L'))return false;const g=k.slice(0,k.indexOf('>'));const ss=[...groups[g]];if(ss.length<2)return false;return new Set(ss.map(s=>items[s][k])).size===1;};
  const norm=k=>k.startsWith('L')?k.slice(k.indexOf('>')):k.slice(1);
  const typeOf=k=>k.endsWith('#src')?'image':k.endsWith('#html')?'richtext':k.endsWith('#href')?'link':'string';
  const keys=[...new Set(slugs.flatMap(s=>Object.keys(items[s])))].filter(k=>!isConst(k));
  const vec=k=>slugs.map(s=>items[s][k]===undefined?null:items[s][k]);
  const compat=(a,b)=>a.every((x,i)=>x===null||b[i]===null||x===b[i]);
  const fields=[];
  // details first, then lists; same relpath merges when compatible, other relpaths only with an overlap
  for(const k of keys.sort((a,b)=>(a[0]==='D'?0:1)-(b[0]==='D'?0:1))){const v=vec(k);const t=typeOf(k);
    let hit=fields.find(f=>f.type===t&&f.norms.includes(norm(k))&&compat(f.vals,v))||fields.find(f=>f.type===t&&compat(f.vals,v)&&v.some((x,i)=>x!==null&&f.vals[i]!==null));
    if(hit){hit.keys.push(k);hit.norms.push(norm(k));hit.vals=hit.vals.map((x,i)=>x===null?v[i]:x);continue;}
    fields.push({keys:[k],norms:[norm(k)],vals:v,type:t});}
  for(let i=fields.length-1;i>=0;i--){const nn=fields[i].vals.filter(x=>x!==null);if(new Set(nn).size<=1&&!(nn.length===1&&fields[i].keys.some(k=>k[0]==='D')))fields.splice(i,1);}
  if(process.env.DBG===col)console.log(keys.filter(k=>/sl-name|sl-desc/.test(k)), Object.keys(items[slugs[0]]).filter(k=>/sl-name/.test(k)));
  data[col]={slugs,fields};
  console.log('#####',col,slugs.length,'items',fields.length,'fields');
  fields.forEach((f,i)=>console.log(String(i).padStart(2),f.type.padEnd(8),String(f.vals.filter(x=>x!==null).length).padEnd(2),f.keys[0].replace(/^(D|L[^>]*)/,'$1 ').split('>').slice(-2).join('>').slice(0,50).padEnd(52),JSON.stringify(f.vals[0]).slice(0,60)));
}
fs.writeFileSync('cmsdata.json',JSON.stringify(data));
