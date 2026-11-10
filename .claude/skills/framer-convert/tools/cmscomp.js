// @step Componentize CMS list item: LIST_ID / COMP_NAME are replaced before sending
const {tree}=api;
const LIST='__LIST__', NAME='__NAME__';
const log=[];
const L=tree.get(LIST); const R=tree.get(L.collectionList.repeatedDescendantId);
const page=tree.get(R.$scopeId); const bps=page.children.map(b=>b.id); const ground=R.$groundNodeId;
const repBps=bps.filter(b=>b!==ground);
const KEYS=['width','height','minHeight','maxWidth','minWidth','maxHeight','stackDirection','stackAlignment','stackDistribution','gap','padding','visible','fontSize','lineHeight','letterSpacing','position','top','left','right','bottom','radius','gridColumnCount','stackWrapEnabled','aspectRatio','textAlignment','opacity','layout','overflow'];
const LAYOUT=['layout','stackDirection','stackAlignment','stackDistribution','gap','padding','stackWrapEnabled','gridColumnCount'];
// 1) target: single child frame, or wrap children
let T;
const kids=(R.children||[]);
if(kids.length===1 && kids[0].type==='FrameNode'){ T=kids[0].id; }
else {
  const attrs={parent:R.id,name:(R.name||'item').split(' ')[0]+'-content',width:'100%',height:R.height==='auto'?'auto':'100%'};
  for(const k of LAYOUT) if(R[k]!==undefined) attrs[k]=R[k];
  const w=tree.insert('FrameNode',NAME.replace(/\W/g,'-').toLowerCase()+'-wrap',attrs);
  for(const c of kids) tree.move(c.id,w.id,(tree.get(w.id).children||[]).length);
  // replica layout of R -> wrapper replicas
  for(const bp of repBps){ const rr=tree.get(bp+R.id); if(!rr) continue; const p={}; for(const k of LAYOUT) if(JSON.stringify(rr[k])!==JSON.stringify(R[k])&&rr[k]!==undefined) p[k]=rr[k]; if(Object.keys(p).length) tree.patch(bp+w.id,p); }
  tree.patch(R.id,{padding:'0px',gap:'0px'});
  T=w.id; log.push('wrapped '+kids.length+' kids into '+w.id);
}
// 2) record replica diffs by path
const paths=[]; const rec=(id,path)=>{ paths.push([path,id]); (tree.get(id).children||[]).forEach((c,i)=>rec(c.id,path.concat(i))); }; rec(T,[]);
const diffs={}; for(const bp of repBps){ const arr=[]; for(const [path,id] of paths){ const o=tree.get(id), r=tree.get(bp+id); if(!r) continue; const d={}; for(const k of KEYS){ if(r[k]!==undefined && JSON.stringify(r[k])!==JSON.stringify(o[k])) d[k]=r[k]; } if(Object.keys(d).length) arr.push([path,d]); } diffs[bp]=arr; }
// 3) componentize
const ORIG=(tree.get(T).name||NAME).replace(/\s*\[data-.*$/,'').trim();
const COMP=await tree.createComponentFromFrame(T,NAME);
const comp=tree.get(COMP); const PV=comp.children[0].id;
const inst=(tree.get(R.id).children||[]).find(c=>c.type==='ComponentInstanceNode');
log.push('comp '+COMP+' pv '+PV+' inst '+inst.id);
const nodeAt=(root,path)=>{ let n=tree.get(root); for(const i of path){ n=(n.children||[])[i]; if(!n) return null; } return n; };
// 4) CMS bindings -> variables
const walkAll=(n,f)=>{ f(n); for(const c of n.children||[]) walkAll(c,f); };
const made={}; const ctlSet={};
const isRef=(v)=>v&&typeof v==='object'&&v.type==='reference'&&v.providerId===LIST;
walkAll(tree.get(PV),(c)=>{
  for(const k of ['text','fill','visible']){
    const v=c[k];
    if(isRef(v)){ const key=k+':'+v.id; let vr=made[key]; if(!vr){ vr=tree.var(COMP,{type:k==='fill'?'image':k==='visible'?'boolean':'string',name:(c.name||k).split(' ')[0].replace(/^span$/,'text')}); made[key]=vr; ctlSet['$control__'+(vr.id||vr)]=tree.ref(v.id,LIST);} tree.patch(c.id,{[k]:tree.ref(vr,COMP)}); }
    else if(v&&typeof v==='object'&&isRef(v.from)){ const key=k+':from:'+v.from.id; let vr=made[key]; if(!vr){ vr=tree.var(COMP,{type:'date',name:(c.name||'date').split(' ')[0]}); made[key]=vr; ctlSet['$control__'+(vr.id||vr)]=tree.ref(v.from.id,LIST);} try{ tree.patch(c.id,{[k]:{from:tree.ref(vr,COMP),transforms:v.transforms}}); }catch(e){log.push('date bind fail '+e.message.slice(0,80));} }
  }
  const lk=c.link;
  if(lk && c.id!==PV && (isRef(lk.href)||isRef(lk.collectionItem))){ const vr=tree.var(COMP,{type:'link',name:((c.name||'link').split(' ')[0])+' link'}); ctlSet['$control__'+(vr.id||vr)]={...lk}; tree.patch(c.id,{link:{href:tree.ref(vr,COMP),openInNewTab:lk.openInNewTab||false}}); }
});
for(const [k,v] of Object.entries(ctlSet)){ try{ tree.patch(inst.id,{[k]:v}); }catch(e){ log.push('ctl fail '+k); } }
log.push('vars '+Object.keys(ctlSet).length);
// 5) variants per replica breakpoint
let top=0; const vnames=['Tablet','Phone','Small'];
repBps.forEach((bp,i)=>{
  const arr=diffs[bp]; if(!arr.length){ log.push('no diffs for '+bp); return; }
  top+=600;
  const v=tree.createVariant(PV,NAME.replace(/\W/g,'')+vnames[i],{gesture:null,name:vnames[i]});
  const vid=v.id||v; tree.patch(vid,{top:top+'px'});
  for(const [path,d] of arr){ const n=path.length?nodeAt(vid,path):tree.get(vid); if(!n){log.push('nopath '+path);continue;} const p={...d}; if(!path.length){ delete p.width; if(!/px$/.test(String(p.height||''))) delete p.height; } if(Object.keys(p).length) try{ tree.patch(n.id,p);}catch(e){log.push('patch fail '+n.id);} }
  tree.patch(bp+inst.id,{'$control__variant':vid});
  log.push(vnames[i]+' '+vid+' diffs '+arr.length);
});
// 6) variant roots carry the live class (hover/motion selectors)
for(const v of tree.get(COMP).children||[]){ const nm=v.id===PV?ORIG:ORIG+' '+String(v.name||'').toLowerCase(); try{ tree.patch(v.id,{name:nm}); }catch(e){ log.push('rename fail '+v.id); } }
return {log, shot: await tree.screenshot(LIST)};
