const fs=require('fs');const D=JSON.parse(fs.readFileSync('cmsdata.json','utf8'));
const NAMES={
 solutions:['Name','Lead','Panel Title','Location','Running Since','Partners','Story Place','Story Line','Body','Scale','Cycle','Traceability','Calibration','Steps Title','Steps Lead','Step One','Step One Text','Step Two','Step Two Text','Step Three','Step Three Text','Number','Headline','Summary','Capability One','Capability Two','Capability Three','Link Label'],
 team:['Photo','Role','Name','Lead','Lab','Since','Field','Bio Title','Bio','Work Lead'],
 values:['Name','Lead','Index','Check','Since','Rule One','Rule One Text','Rule Two','Rule Two Text','Rule Three','Rule Three Text','Photo','Person Photo','Person Tag','Person','Quote'],
 blog:['Category','-','Title','Lead','Author','Topic','Date','Read Time','Photo','Body','Run Title','Crop','Sites','Plots','Outcome','Reported','-']};
const ORDER={solutions:['biomaterials','agritech','data-lab','field-trials','sensing','lab-assays'],team:['marta-jansen','daniel-reyes','tom-berg','kofi-mensah','amara-okafor','luca-moretti','lena-hoffmann','isabel-duarte'],values:['proof-before-promise','growers-in-the-room','open-by-default','materials-that-return','small-teams-long-seasons'],blog:['soil-sensors-full-season','forty-trial-plots-yield','biomaterials-leave-the-lab','moisture-every-ten-minutes','reading-a-season','grown-instead-of-mined']};
const TITLE={solutions:'Solutions',team:'Team',values:'Values',blog:'Blog'};
const brand=s=>typeof s==='string'?s.replace(/(?<![\w\/.-])Noeta/g,'Germina').replace(/(?<![\w\/.-])noeta(?![\w-]*\.(jpe?g|png|webp|svg|json|gif))/g,'germina').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g,'info@example.com'):s;
const out={};
for(const [col,{slugs,fields}] of Object.entries(D)){
  const names=NAMES[col];if(names.length!==fields.length)throw new Error(col+' '+names.length+' vs '+fields.length);
  const F=fields.map((f,i)=>({name:names[i],type:names[i]==='Date'?'date':f.type,keys:f.keys,vals:f.vals})).filter(f=>f.name!=='-');
  const items=ORDER[col].map(slug=>{const i=slugs.indexOf(slug);const v={};for(const f of F){let x=f.vals[i];if(x==null)continue;if(f.type!=='image')x=brand(x);if(f.type==='date')x=new Date(x+' 12:00 UTC').toISOString().slice(0,10)+'T00:00:00.000Z';if(f.type==='richtext')x=x.replace(/<p>‍<\/p>/g,'<p><br></p>');v[f.name]=x;}return {slug,v};});
  out[col]={title:TITLE[col],fields:F.map(f=>({name:f.name,type:f.type,keys:f.keys})),items};
}
fs.writeFileSync('cms.json',JSON.stringify(out));
for(const c in out)console.log(c,out[c].items.length,out[c].fields.map(f=>f.name+':'+f.type).join(', '));
console.log(out.blog.items.map(i=>i.v.Date));
