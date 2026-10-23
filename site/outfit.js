'use strict';
/* 👕 Today's ayah & outfit · آية اليوم ولباسها
   Ayah: number pattern from today's flight modes (same a, k as the number-pattern surah), NOT tafsir and NOT the live recitation.
   Outfit: Letter Wardrobe by Rufus (HelpOutBoran-Videos), wardrobe.js + wardrobe-data.js copied unchanged from
   Quran Recorder (github.com/mrbugimposter3-ship-it/quran-recorder @6bac659, docs/), original /workspace/letter-wardrobe/outfit.py.
   Per-ayah first/middle/last letters (quran/NNN.json "lw") were computed with that same code over Quran Recorder's text,
   so both apps show the identical outfit for the same ayah. Shopping search wording = LetterWardrobe.searchQuery. */
// Affiliate settings: leave empty until confirmed. Each is appended only when set.
const SHOP_CONFIG={amazonTag:'',   // Amazon Associates tag, e.g. 'name-20' -> &tag=name-20
 temuCode:'',                       // extra Temu query string, appended verbatim, e.g. 'refer_share_id=XXXX'
 macysId:''};                       // extra Macy's query string, appended verbatim, e.g. 'cm_mmc=XXXX'
let OUTFIT_KEY=null,QIDX=null;const QCACHE={};
async function qjson(n){if(!QCACHE[n])QCACHE[n]=fetch('quran/'+n+'.json').then(r=>{if(!r.ok)throw new Error(r.status);return r.json()});return QCACHE[n]}
// a = mode of floor(dlat mod 27), k = mode of floor(km mod 27), from the MOSQUE, over ALL three sites' flights on today's date (KSA),
// codeshares and cancellations excluded; if fewer than 3 flights, the last 7 days. Ties -> smallest value.
function dayModes(){const t=todayKSA(),base=ALL.filter(r=>!r.is_codeshare&&kind(r)!=='cancelled');
 const mode=v=>{const c=new Map();v.forEach(x=>c.set(x,(c.get(x)||0)+1));let b=null,n=-1;[...c].sort((x,y)=>x[0]-y[0]).forEach(([x,m])=>{if(m>n){n=m;b=x}});return b};
 let rows=base.filter(r=>r.dep_date===t),scope='today (all three mosques)';
 if(rows.length<3){rows=base.filter(r=>r.dep_date<=t&&r.dep_date>addDays(t,-7));scope='last 7 days'}
 const A=rows.map(r=>Math.floor(r.m_dlat_mod27)).filter(Number.isFinite),K=rows.map(r=>Math.floor(r.m_km_mod27)).filter(Number.isFinite);
 if(!A.length||!K.length)return null;return{a:mode(A),k:mode(K),n:rows.length,scope,date:t}}
// Rebuild the same spec object LetterWardrobe.outfitFor() makes, from the stored [top, middle, bottom, words, letters].
function lwSpec(L){const W=LetterWardrobe,D=W.data,by={};D.letters.forEach(r=>by[r.order]=r);
 const g=o=>{const r=by[o];return{letter:r.letter,name:r.name,order:o,property:r.property,colour:r.colour}};const cls=by[L[1]].strength.class;
 const s={schema:D.schema,view:'back',base:{skin:'skin',hair:D.hair[L[3]%D.hair.length]},top:g(L[0]),bottom:g(L[2]),
  outerwear:Object.assign(g(L[1]),{style:D.cut[cls],strength:cls}),stats:{letters:L[4],words:L[3]}};s.id=W.outfitId(s);return s}
function avatarSVG(spec){const W=LetterWardrobe,{W:w,H:h}=W.data,px=W.renderPixels(spec);let r='';
 for(let y=0;y<h;y++)for(let x=0;x<w;){const c=px[y*w+x];if(!c){x++;continue}let e=x;while(e<w&&px[y*w+e]===c)e++;r+=`<rect x="${x}" y="${y}" width="${e-x}" height="1" fill="${c}"/>`;x=e}
 return `<svg class="ofav" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" role="img" aria-label="Pixel figure seen from behind wearing the outfit (no face)">${r}</svg>`}
function shopLinks(q){const e=encodeURIComponent(q),slug=q.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),C=SHOP_CONFIG;
 return[['Amazon.ca','https://www.amazon.ca/s?k='+e+(C.amazonTag?'&tag='+encodeURIComponent(C.amazonTag):'')],
  ['Temu','https://www.temu.com/search_result.html?search_key='+e+(C.temuCode?'&'+C.temuCode:'')],
  ["Macy's",'https://www.macys.com/shop/search?keyword='+e+(C.macysId?'&'+C.macysId:'')]]}
async function renderOutfit(){const el=document.getElementById('outfit');if(!el||!ALL||!window.LetterWardrobe)return;
 const m=dayModes();if(!m){el.innerHTML='<div class="ofcard"><div class="small">Not enough flights yet · لا رحلات كافية بعد</div></div>';return}
 try{QIDX=QIDX||await qjson('index');const surah=((27*m.a+m.k)%114)+1,cnt=QIDX.ayahs[surah-1],ayah=((m.a*m.k+m.a+m.k)%cnt)+1;
  const key=[m.date,surah,ayah,m.n].join('|');if(key===OUTFIT_KEY)return;
  const d=await qjson(String(surah).padStart(3,'0')),spec=lwSpec(d.lw[ayah-1]),o=spec.outerwear,S=SURAHS[surah-1];
  const part=(lab,ar,slot,x,extra)=>`<li><span class="ofsw" style="background:${x.colour}"></span><b>${lab}</b> <span class="ar">${ar}</span>: ${esc(LetterWardrobe.searchQuery(spec,slot))} <span class="small">(letter <span class="ar">${x.letter}</span> ${esc(x.name)})</span></li>`;
  const slots=[['Top','قميص','top'],['Outer','لباس خارجي','outerwear'],['Bottom','سروال','bottom']];
  el.innerHTML=`<div class="ofcard"><div class="oft">👕 Today's ayah &amp; outfit · <span class="ar">آية اليوم ولباسها</span></div>
  <div class="ofayah"><div class="sname"><span class="snum">${surah}:${ayah}</span> <span class="ar">سورة ${S[0]}</span> <span>${S[1]}</span></div>
   <div class="ofar" lang="ar" dir="rtl">${esc(d.ar[ayah-1])} ﴿${arNum(ayah)}﴾</div>
   <div class="ofen">${esc(d.en[ayah-1])} <span class="small">— Pickthall</span></div>
   <div class="note">🔢 Number pattern for fun from today's flights — not tafsir, not the live recitation · <span class="ar">نمط أرقام للتسلية — ليس تفسيرًا</span></div>
   <div class="small">${m.n} flights (${esc(m.scope)}): most common dlat mod 27 = a = ${m.a}, km mod 27 = k = ${m.k}.<br>
    surah = ((27×a + k) mod 114) + 1 = ((27×${m.a} + ${m.k}) mod 114) + 1 = <b>${surah}</b> · ayah = ((a×k + a + k) mod ${cnt} ayahs) + 1 = ((${m.a}×${m.k} + ${m.a} + ${m.k}) mod ${cnt}) + 1 = <b>${ayah}</b></div></div>
  <div class="ofwear">${avatarSVG(spec)}<div><div class="klist-t">Outfit · <span class="ar">اللباس</span></div><ul class="ofparts">
   ${slots.map(([lab,ar,slot])=>part(lab,ar,slot,spec[slot])).join('')}</ul>
   <div class="small">From the ayah's letter sounds (Letter Wardrobe: first letter → top, middle → outer, bottom → last letter). Same outfit as Quran Recorder’s 🔤 Letters mode (outfit id ${spec.id}). It says nothing about the ayah's meaning. Figure seen from behind, no face.</div></div></div>
  <div class="ofshop"><div class="ofshop-h">🛍️ <span class="ar">روابط تسوق</span> · Shopping links (may be affiliate links)</div>
   <div class="small">For grown-ups. Store searches only, no product photos; pick loose, modest cuts. Not part of the ayah.</div><ul>
   ${slots.map(([lab,ar,slot])=>{const q=LetterWardrobe.searchQuery(spec,slot);return `<li><b>${lab}</b> “${esc(q)}”: ${shopLinks(q).map(([n,u])=>`<a href="${esc(u)}" target="_blank" rel="noopener sponsored">${n}</a>`).join(' · ')}</li>`}).join('')}</ul></div></div>`;
  OUTFIT_KEY=key}catch(e){el.innerHTML='<div class="ofcard"><div class="small">Could not load today\'s ayah: '+esc(e.message)+'</div></div>'}}
