// Finds CMS fields of a Webflow template by diffing its item pages: every element whose text / img src / href
// differs between items is a field. Parse-only (jsdom, no scripts). Usage: node cmsfields.cjs <prefix> <slug,…>
const fs=require('fs');const {JSDOM}=require('/tmp/claude-0/work/node_modules/jsdom');
const [,,prefix,slugsArg]=process.argv; const slugs=slugsArg.split(',');
const pages=slugs.map(s=>{const d=new JSDOM(fs.readFileSync(`/tmp/claude-0/dl_snap/${prefix}__${s}.html`,'utf8')).window.document;return d;});
function collect(d){
  const out={};
  const secs=[...d.body.children].filter(e=>!/header|footer|w-nav|cta|w-webflow-badge/.test(e.className||'')&&!/SCRIPT|STYLE/.test(e.tagName));
  const walk=(e,p)=>{
    const cls=(typeof e.className==='string'?e.className:'').split(/\s+/)[0]||e.tagName.toLowerCase();
    const sibs=[...e.parentElement.children].filter(x=>((typeof x.className==='string'?x.className:'').split(/\s+/)[0]||x.tagName.toLowerCase())===cls);
    const path=p+'>'+cls+(sibs.length>1?'['+sibs.indexOf(e)+']':'');
    if(/w-richtext/.test(e.className||'')){out[path+'#html']=e.innerHTML;return;}
    if(e.tagName==='IMG') out[path+'#src']=e.getAttribute('src');
    if(e.tagName==='A'&&e.getAttribute('href')) out[path+'#href']=e.getAttribute('href');
    if(!e.children.length||[...e.children].every(c=>/^(SPAN|STRONG|EM|BR|A)$/.test(c.tagName)&&!c.children.length)){const t=e.textContent.trim().replace(/\s+/g,' ');if(t)out[path+'#text']=t;}
    for(const c of e.children) if(!/SCRIPT|STYLE|svg/i.test(c.tagName)) walk(c,path);
  };
  secs.forEach(s=>walk(s,''));
  return out;
}
const all=pages.map(collect);
const keys=[...new Set(all.flatMap(o=>Object.keys(o)))];
const fields={};
for(const k of keys){const vals=all.map(o=>o[k]);if(new Set(vals).size>1)fields[k]=vals;}
const res={slugs,fields};
fs.writeFileSync(`cms_${prefix}.json`,JSON.stringify(res,null,1));
for(const [k,v] of Object.entries(fields)) console.log(k.slice(-90).padEnd(92), JSON.stringify(v[0]).slice(0,70));
