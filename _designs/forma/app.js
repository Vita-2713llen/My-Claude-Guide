(function(){ var x=document.querySelector('.promo .x'); if(x) x.addEventListener('click',function(){this.closest('.promo').style.display='none';}); })();

/* ---- Burger / mobile menu ---- */
(function(){
  var burger=document.getElementById('burgerBtn'),
      menu=document.getElementById('mobileMenu'),
      ov=document.getElementById('mmOverlay');
  function open(){ burger.classList.add('open'); menu.classList.add('open'); ov.classList.add('open'); burger.setAttribute('aria-expanded','true'); }
  function close(){ burger.classList.remove('open'); menu.classList.remove('open'); ov.classList.remove('open'); burger.setAttribute('aria-expanded','false'); }
  burger.addEventListener('click',function(){ menu.classList.contains('open')?close():open(); });
  ov.addEventListener('click',close);
  var closeBtn=document.getElementById('mmClose'); if(closeBtn) closeBtn.addEventListener('click',close);
  menu.querySelectorAll('a').forEach(function(a){ a.addEventListener('click',close); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') close(); });
  // Safety: if resized up to desktop, always reset the menu so the header can't get stuck.
  window.addEventListener('resize',function(){ if(window.innerWidth>1080) close(); });
})();

/* ---- Pexels image sourcing (runtime; graceful fallback to gradient) ---- */
var PEXELS_KEY='WaeBQ61eXdor76RHLLCa3G5EYRvu2MJPqd1V35nRkfVZDQg4X5bJngYq';
// Stable media: deterministic pick (top-1) + localStorage cache -> same query always the same photo.
function cacheGet(k){ try{ return localStorage.getItem(k)||null; }catch(e){ return null; } }
function cacheSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
async function pexels(q,o){
  o=o||'landscape';
  var key='fimg:'+o+':'+q, cached=cacheGet(key);
  if(cached) return cached;
  try{
    var r=await fetch('https://api.pexels.com/v1/search?query='+encodeURIComponent(q)+'&per_page=20&orientation='+o,{headers:{Authorization:PEXELS_KEY}});
    if(!r.ok) return null;
    var d=await r.json();
    var min = (o==='landscape')?1600:1000;
    var p=(d.photos||[]).filter(function(x){ return x.width>=min && x.height>=min; });
    if(!p.length) p=d.photos||[];
    if(!p.length) return null;
    var pick=p[0];
    var u=(o==='landscape')?(pick.src.large2x||pick.src.original):(pick.src.portrait||pick.src.large2x||pick.src.large);
    if(u) cacheSet(key,u);
    return u;
  }catch(e){ return null; }
}
// static slots (categories, products, split)
document.querySelectorAll('img[data-q]').forEach(function(el){
  pexels(el.dataset.q, el.dataset.o, +el.dataset.top||undefined).then(function(u){ if(u){ el.loading='lazy'; el.onerror=function(){el.remove();}; el.src=u; }});
});

var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var G = window.gsap;

/* ---- HERO photo slider (home only; guarded) ---- */
if(document.querySelector('.hero-media')){
var SLIDES=[
  {q:'fitness woman workout gym portrait', h:'Get intense in Everflow™', p:'Fast-drying technical fabric keeps you focused on your hottest, spiciest moves.'},
  {q:'woman trail running nature mountains', h:'Built to go the distance', p:'Lightweight, breathable support engineered for every mile.'},
  {q:'woman yoga pose fitness studio', h:'Find your flow', p:'Buttery-soft, four-way stretch fabric that moves exactly how you do.'}
];
var media=document.querySelector('.hero-media'),
    heroH1=document.querySelector('.hero h1'), heroP=document.querySelector('.hero p'),
    dots=[].slice.call(document.querySelectorAll('.dot')), layers=[], cur=0, timer=null;

SLIDES.forEach(function(s,i){
  var d=document.createElement('div'); d.className='slide'+(i===0?' first':''); media.appendChild(d); layers.push(d);
  pexels(s.q,'landscape',1).then(function(u){
    if(u){ var img=new Image(); img.src=u; img.alt=''; d.appendChild(img); }
    else { d.style.background='linear-gradient(155deg,#4c3a29,#8a6c48)'; }
  });
});

function goTo(idx){
  idx=(idx+SLIDES.length)%SLIDES.length; if(idx===cur) return;
  var prev=layers[cur], next=layers[idx]; cur=idx;
  dots.forEach(function(d,i){ d.classList.toggle('on', i===cur); });
  if(G && !reduce){
    G.to(prev,{autoAlpha:0,duration:.8,ease:'power2.inOut'});
    G.to(next,{autoAlpha:1,duration:.8,ease:'power2.inOut'});
    G.timeline()
      .to([heroH1,heroP],{autoAlpha:0,y:-12,duration:.3,ease:'power2.in'})
      .add(function(){ heroH1.textContent=SLIDES[cur].h; heroP.textContent=SLIDES[cur].p; })
      .fromTo([heroH1,heroP],{y:16,autoAlpha:0},{y:0,autoAlpha:1,duration:.5,stagger:.06,ease:'power3.out'});
  } else {
    layers.forEach(function(l,i){ l.style.opacity = (i===cur?1:0); });
    heroH1.textContent=SLIDES[cur].h; heroP.textContent=SLIDES[cur].p;
  }
}
function auto(){ if(reduce) return; clearInterval(timer); timer=setInterval(function(){ goTo(cur+1); },6000); }
document.querySelectorAll('.arrow')[0].addEventListener('click',function(){ goTo(cur-1); auto(); });
document.querySelectorAll('.arrow')[1].addEventListener('click',function(){ goTo(cur+1); auto(); });
dots.forEach(function(d,i){ d.addEventListener('click',function(){ goTo(i); auto(); }); });
auto();
}

/* ---- GSAP: entrance, scroll reveals, hover micro-interactions ---- */
if(G){
  G.registerPlugin(window.ScrollTrigger);
  var mm=G.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', function(){
    // Base reveal (every project): opacity 0->1, y -15->0, duration .8s, delay .45s, power3.out, once.
    G.from('.hero-inner > *',{y:-15,autoAlpha:0,duration:.8,delay:.45,ease:'power3.out',stagger:.12});
    G.utils.toArray('[data-reveal]').forEach(function(el){
      G.from(el,{y:-15,autoAlpha:0,duration:.8,delay:.45,ease:'power3.out',
        scrollTrigger:{trigger:el,start:'top 86%',once:true}});
    });

    // Hover helper: timeline play/reverse (best practice — build once)
    function hov(el, build){ var tl=G.timeline({paused:true}); build(tl); el.addEventListener('mouseenter',function(){tl.play();}); el.addEventListener('mouseleave',function(){tl.reverse();}); }

    // Buttons: NO hop. Smooth background (CSS) + gentle arrow glide only — no vertical/scale jump.
    // Hover transition duration is hardcoded to 350ms (.35s) across every element.
    G.utils.toArray('.btn').forEach(function(b){ var a=b.querySelector('.arw');
      if(a) hov(b,function(tl){ tl.to(a,{x:6,duration:.35,ease:'power2.out'},0); }); });
    G.utils.toArray('.mainnav a').forEach(function(l){ var u=l.querySelector('.u'); if(!u)return;
      hov(l,function(tl){ tl.fromTo(u,{scaleX:0,transformOrigin:'left'},{scaleX:1,duration:.35,ease:'power3.out'},0); }); });
    G.utils.toArray('.sec-head .link').forEach(function(l){ var u=l.querySelector('.u');
      hov(l,function(tl){ tl.fromTo(u,{scaleX:1,transformOrigin:'right'},{scaleX:0,duration:.35,ease:'power2.inOut'},0); }); });
    G.utils.toArray('.card').forEach(function(c){ var f=c.querySelector('.fill'), h=c.querySelector('h4');
      hov(c,function(tl){ if(f) tl.to(f,{scale:1.06,duration:.35,ease:'power2.out'},0); if(h) tl.to(h,{color:'#d51f34',duration:.35},0); }); });
    G.utils.toArray('.cat').forEach(function(c){ var img=c.querySelector('img'), cta=c.querySelector('.cta');
      hov(c,function(tl){ if(img) tl.to(img,{scale:1.07,duration:.35,ease:'power2.out'},0); if(cta) tl.to(cta,{paddingRight:14,duration:.35,ease:'power2.out'},0); }); });
    G.utils.toArray('.split').forEach(function(s){ var img=s.querySelector('.media img');
      hov(s,function(tl){ if(img) tl.to(img,{scale:1.05,duration:.35,ease:'power2.out'},0); }); });
    G.utils.toArray('.icons a').forEach(function(i){ hov(i,function(tl){ tl.to(i,{scale:1.12,duration:.35,ease:'power2.out'},0); }); });
    G.utils.toArray('.fav').forEach(function(f){ hov(f,function(tl){ tl.to(f,{scale:1.15,color:'#d51f34',duration:.35,ease:'power2.out'},0); }); });
    G.utils.toArray('.sw').forEach(function(s){ hov(s,function(tl){ tl.to(s,{scale:1.25,duration:.35,ease:'power2.out'},0); }); });
    G.utils.toArray('.val').forEach(function(v){ var ic=v.querySelector('.vic');
      hov(v,function(tl){ tl.to(ic,{backgroundColor:'#0d0d0f',color:'#fff',duration:.35,ease:'power2.out'},0); }); });
    G.utils.toArray('.fcol a').forEach(function(a){ hov(a,function(tl){ tl.to(a,{x:4,color:'#ffffff',duration:.35,ease:'power2.out'},0); }); });
    G.utils.toArray('.fsoc a').forEach(function(a){ hov(a,function(tl){ tl.to(a,{backgroundColor:'#d51f34',borderColor:'#d51f34',duration:.35,ease:'power2.out'},0); }); });
    G.utils.toArray('.arrow').forEach(function(a){ hov(a,function(tl){ tl.to(a,{scale:1.08,duration:.35,ease:'power2.out'},0); }); });
    G.utils.toArray('.brand').forEach(function(b){ var m=b.querySelector('.mark');
      hov(b,function(tl){ tl.to(m,{rotate:360,duration:.35,ease:'power2.inOut'},0); }); });
  });
}

/* ---- Shop interactivity: wishlist, swatches, working cart ---- */
(function(){
  function pop(el){ if(G && !reduce){ G.fromTo(el,{scale:.75},{scale:1,duration:.45,ease:'back.out(3)'}); } }

  // Wishlist toggle
  document.querySelectorAll('.fav').forEach(function(f){
    f.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation();
      f.classList.toggle('on'); pop(f);
    });
  });

  // Colour swatches — one selected per card (first by default)
  document.querySelectorAll('.card').forEach(function(card){
    var sws=[].slice.call(card.querySelectorAll('.sw')); if(!sws.length) return;
    sws[0].classList.add('on');
    sws.forEach(function(s){ s.addEventListener('click',function(e){ e.stopPropagation();
      sws.forEach(function(x){ x.classList.remove('on'); }); s.classList.add('on'); pop(s);
    }); });
  });

  // Cart
  var cart=[],
      badge=document.querySelector('.cart-count'),
      drawer=document.getElementById('cartDrawer'),
      overlay=document.getElementById('cartOverlay'),
      itemsEl=document.getElementById('cartItems'),
      subEl=document.getElementById('cartSub'),
      ccEl=document.getElementById('cartCount');
  function money(n){ return '$'+n.toFixed(0); }
  function priceOf(card){ var pe=card.querySelector('.price .now')||card.querySelector('.price');
    var m=pe.textContent.match(/\$(\d+)/); return m?parseInt(m[1],10):0; }
  function colorOf(card){ var s=card.querySelector('.sw.on')||card.querySelector('.sw'); return s?s.style.background:'#000'; }
  function render(){
    var n=cart.length;
    ccEl.textContent=n; badge.textContent=n; badge.classList.toggle('hide',n===0);
    if(!n){ itemsEl.innerHTML='<div class="cart-empty">Your bag is empty.</div>'; subEl.textContent='$0'; return; }
    var html='', sub=0;
    cart.forEach(function(it,i){ sub+=it.price;
      html+='<div class="ci"><span class="sw-dot" style="background:'+it.color+'"></span>'+
        '<div class="ci-main"><h5>'+it.name+'</h5><div class="ci-meta">Size M · Qty 1</div>'+
        '<div class="ci-row"><button class="rm" type="button" data-i="'+i+'">Remove</button>'+
        '<span class="ci-price">'+money(it.price)+'</span></div></div></div>';
    });
    itemsEl.innerHTML=html; subEl.textContent=money(sub);
    itemsEl.querySelectorAll('.rm').forEach(function(b){ b.addEventListener('click',function(){ cart.splice(+b.dataset.i,1); render(); }); });
  }
  function openCart(){ overlay.classList.add('open'); drawer.classList.add('open'); }
  function closeCart(){ overlay.classList.remove('open'); drawer.classList.remove('open'); }

  document.querySelectorAll('.card .add').forEach(function(btn){
    btn.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation();
      var card=btn.closest('.card');
      cart.push({name:card.querySelector('h4').textContent, price:priceOf(card), color:colorOf(card)});
      render(); pop(badge); openCart();
    });
  });
  document.getElementById('bagBtn').addEventListener('click',function(e){ e.preventDefault(); openCart(); });
  document.getElementById('cartClose').addEventListener('click',closeCart);
  overlay.addEventListener('click',closeCart);
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') closeCart(); });
  render();
})();
