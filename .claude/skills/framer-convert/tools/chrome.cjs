const fs=require('fs');const {JSDOM}=require('/tmp/claude-0/work/node_modules/jsdom');
const dom=new JSDOM(fs.readFileSync('/tmp/claude-0/dl_snap/index.html','utf8'));const d=dom.window.document;
const header=d.querySelector('.header'), footer=d.querySelector('footer.footer');
const panel=d.querySelector('.drop-list .pages-panel');
// the panel as its own measured block, at its live width
const wrap=d.createElement('div');wrap.setAttribute('style','width:680px;margin:20px 0');wrap.appendChild(panel.cloneNode(true));
d.querySelector('.drop-list').remove();
// header in normal flow for measuring
header.setAttribute('style','position:relative');
const body=d.body;for(const c of [...body.children])c.remove();
header.setAttribute('data-dz-name','Header');wrap.setAttribute('data-dz-name','PagesPanel');footer.setAttribute('data-dz-name','Footer');
body.append(header,wrap,footer);
fs.writeFileSync('/tmp/claude-0/work/chrome_raw.html',dom.serialize());
d.querySelectorAll('script').forEach(e=>e.remove());
const w=d.createTreeWalker(d.body,4);let t;while((t=w.nextNode()))if(/noeta/i.test(t.nodeValue))t.nodeValue=t.nodeValue.replace(/Noeta/g,'Germina').replace(/noeta/g,'germina');
d.querySelectorAll('*').forEach(e=>{for(const a of [...e.attributes])if(/noeta/i.test(a.name)){e.setAttribute(a.name.replace(/-?noeta-?/i,'-').replace(/^data--/,'data-'),a.value);e.removeAttribute(a.name);}});
fs.writeFileSync('/tmp/claude-0/work/prep/chrome.html','<!doctype html>\n'+d.documentElement.outerHTML);
