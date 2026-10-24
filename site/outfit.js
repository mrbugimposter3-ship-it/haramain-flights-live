'use strict';
/* 👕 Today's ayah & outfit · آية اليوم ولباسها
   Ayah: number pattern from today's flight modes (same a, k as the number-pattern surah), NOT tafsir and NOT the live recitation.
   Month / Hijri month / season cards: periods.js + astro.js (from Juz Daily) over data/daycounts.json.
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
// Photo-realistic look (AI-generated model seen from behind, no face) per outfit id: looks/<id>.jpg, listed in looks/index.json
// (so a missing image never triggers a 404). Missing ones fall back to the pixel figure. Refresh: node collector/looks_missing.js
let LOOKS=null;
async function looksIndex(){if(!LOOKS)LOOKS=fetch('looks/index.json?t='+Date.now()).then(r=>r.ok?r.json():{ids:[]}).then(j=>new Set(j.ids||[])).catch(()=>new Set());return LOOKS}
function lookHTML(spec,looks){const svg=avatarSVG(spec);if(!looks.has(spec.id))return `<div class="oflook">${svg}</div>`;
 return `<figure class="oflook"><img class="ofphoto" src="looks/${spec.id}.jpg" width="576" height="768" alt="AI-generated model seen from behind wearing the outfit (no face)">
  <figcaption class="small">AI-generated model, not a real person · <span class="ar">صورة مولّدة بالذكاء الاصطناعي</span></figcaption>${svg.replace('class="ofav"','class="ofav ofmini"')}</figure>`}
// One card: title, optional period line, modes m={a,k,n,scope}
async function cardHTML(c,m,looks){const surah=((27*m.a+m.k)%114)+1,cnt=QIDX.ayahs[surah-1],ayah=((m.a*m.k+m.a+m.k)%cnt)+1;
  const d=await qjson(String(surah).padStart(3,'0')),spec=lwSpec(d.lw[ayah-1]),S=SURAHS[surah-1];
  const part=(lab,ar,slot,x)=>`<li><span class="ofsw" style="background:${x.colour}"></span><b>${lab}</b> <span class="ar">${ar}</span>: ${esc(LetterWardrobe.searchQuery(spec,slot))} <span class="small">(letter <span class="ar">${x.letter}</span> ${esc(x.name)})</span></li>`;
  const slots=[['Top','قميص','top'],['Outer','لباس خارجي','outerwear'],['Bottom','سروال','bottom']];
  return {surah,ayah,id:spec.id,html:`<div class="ofcard ${c.cls||''}"><div class="oft">${c.title}</div>${c.period||''}
  <div class="ofayah"><div class="sname"><span class="snum">${surah}:${ayah}</span> <span class="ar">سورة ${S[0]}</span> <span>${S[1]}</span></div>
   <div class="ofar" lang="ar" dir="rtl">${esc(d.ar[ayah-1])} ﴿${arNum(ayah)}﴾</div>
   <div class="ofen">${esc(d.en[ayah-1])} <span class="small">— Pickthall</span></div>
   <div class="note">🔢 Number pattern for fun from ${c.from} — not tafsir, not the live recitation · <span class="ar">نمط أرقام للتسلية — ليس تفسيرًا</span></div>
   <div class="small">${m.n} flights (${esc(m.scope)}): most common dlat mod 27 = a = ${m.a}, km mod 27 = k = ${m.k}.<br>
    surah = ((27×a + k) mod 114) + 1 = ((27×${m.a} + ${m.k}) mod 114) + 1 = <b>${surah}</b> · ayah = ((a×k + a + k) mod ${cnt} ayahs) + 1 = ((${m.a}×${m.k} + ${m.a} + ${m.k}) mod ${cnt}) + 1 = <b>${ayah}</b></div>${c.same||''}</div>
  <div class="ofwear">${lookHTML(spec,looks)}<div><div class="klist-t">Outfit · <span class="ar">اللباس</span></div><ul class="ofparts">
   ${slots.map(([lab,ar,slot])=>part(lab,ar,slot,spec[slot])).join('')}</ul>
   <div class="small">From the ayah's letter sounds (Letter Wardrobe: first letter → top, middle → outer, bottom → last letter). Same outfit as Quran Recorder’s 🔤 Letters mode (outfit id ${spec.id}). It says nothing about the ayah's meaning. Figure seen from behind, no face.</div></div></div>
  <div class="ofshop"><div class="ofshop-h">🛍️ <span class="ar">روابط تسوق</span> · Shopping links (may be affiliate links)</div>
   <div class="small">For grown-ups. Store searches only, no product photos; pick loose, modest cuts. Not part of the ayah.</div><ul>
   ${slots.map(([lab,ar,slot])=>{const q=LetterWardrobe.searchQuery(spec,slot);return `<li><b>${lab}</b> “${esc(q)}”: ${shopLinks(q).map(([n,u])=>`<a href="${esc(u)}" target="_blank" rel="noopener sponsored">${n}</a>`).join(' · ')}</li>`}).join('')}</ul></div></div>`}}
async function renderOutfit(){const el=document.getElementById('outfit');if(!el||!ALL||!window.LetterWardrobe)return;
 const m=dayModes();if(!m){el.innerHTML='<div class="ofcard"><div class="small">Not enough flights yet · لا رحلات كافية بعد</div></div>';return}
 try{QIDX=QIDX||await qjson('index');const looks=await looksIndex();const key=[m.date,m.a,m.k,m.n,looks.size].join('|');if(key===OUTFIT_KEY)return;
  const r=await cardHTML({title:`👕 Today's ayah &amp; outfit · <span class="ar">آية اليوم ولباسها</span>`,from:"today's flights"},m,looks);
  el.innerHTML=r.html;OUTFIT_KEY=key}catch(e){el.innerHTML='<div class="ofcard"><div class="small">Could not load today\'s ayah: '+esc(e.message)+'</div></div>'}
 renderPeriods()}
// 🌙 📅 🍂 Running modes over ALL stored flights in the current Hijri month, Gregorian month and season (Saudi dates, up to today)
let PER_KEY=null;
async function renderPeriods(){const el=document.getElementById('periods');if(!el||!window.HFLP||!window.ASTRO)return;
 try{const P=HFLP,DC=await fetch('data/daycounts.json?t='+Date.now()).then(r=>{if(!r.ok)throw new Error('daycounts '+r.status);return r.json()});
  QIDX=QIDX||await qjson('index');const looks=await looksIndex(),t=todayKSA(),ps=P.periods(t,ASTRO);
  const key=t+'|'+DC.generated_utc+'|'+looks.size;if(key===PER_KEY)return;const out=[],seen={};
  for(const p of ps){const m=P.modes(DC,p.start,p.end);if(!m){out.push(`<div class="ofcard ofper"><div class="oft">${p.icon} ${esc(p.kindEn)} · ${esc(p.name)}</div><div class="small">No flights stored for this period yet.</div></div>`);continue}
   m.scope=`${p.kindEn}, all three mosques`;const fmtD=x=>new Date(x+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
   const partial=m.first>p.start,sig=m.a+'|'+m.k+'|'+m.n;
   const period=`<div class="ofperiod"><span class="ar ofpn">${p.nameAr}</span> · <b>${esc(p.name)}</b><br><span class="small">${esc(p.kindAr)} · ${esc(p.kindEn)}: ${fmtD(p.start)} → ${fmtD(p.end)} (Saudi time) · ${esc(p.basis)}</span>
    ${partial?`<div class="ofbased">Based on ${m.n} flights since ${fmtD(m.first)} (flight history starts there; period began ${fmtD(p.start)}) · <span class="ar">بناءً على ${arNum(m.n)} رحلة</span></div>`:`<div class="ofbased">Based on ${m.n} flights · <span class="ar">بناءً على ${arNum(m.n)} رحلة</span></div>`}</div>`;
   const same=seen[sig]?`<div class="small ofsame">Same flights as the ${esc(seen[sig])} card so far, so same a, k and ayah; they split apart when a new month or season starts.</div>`:'';seen[sig]=seen[sig]||p.kindEn.toLowerCase();
   out.push((await cardHTML({cls:'ofper',title:`${p.icon} ${esc(p.kindEn)} ayah &amp; outfit · <span class="ar">آية ${esc(p.kindAr.replace(' حتى اليوم',''))} ولباسها</span>`,period,from:`this period's flights`,same},m,looks)).html)}
  el.innerHTML=out.join('');PER_KEY=key}catch(e){el.innerHTML='<div class="ofcard"><div class="small">Could not load the month and season cards: '+esc(e.message)+'</div></div>'}}
