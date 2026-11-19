const fs=require('fs');const {JSDOM}=require('/tmp/claude-0/work/node_modules/jsdom');
const [,,page]=process.argv;const d=new JSDOM(fs.readFileSync(`/tmp/claude-0/dl_snap/${page}.html`,'utf8')).window.document;
for(const list of d.querySelectorAll('.w-dyn-list')){
  const items=[...list.querySelectorAll('.w-dyn-item')];
  const sec=list.closest('section,div[class*=section],footer,.header');
  console.log('== list in',(sec&&sec.className||'').slice(0,40),'items',items.length);
  const it=items[0]; if(!it)continue;
  const walk=(e,p)=>{const c=(typeof e.className==='string'?e.className.split(/\s+/)[0]:'')||e.tagName.toLowerCase();
    const leaf=!e.children.length||[...e.children].every(x=>/^(SPAN|STRONG|EM|BR)$/.test(x.tagName));
    const v=e.tagName==='IMG'?'img '+(e.getAttribute('src')||'').slice(-40):e.tagName==='A'?'a '+e.getAttribute('href'):'';
    const t=leaf?e.textContent.trim().slice(0,50):'';
    if(v||t)console.log('  '+p+'>'+c, v, t?JSON.stringify(t):'');
    for(const k of e.children)if(!/svg/i.test(k.tagName))walk(k,p+'>'+c);};
  walk(it,'');
}
