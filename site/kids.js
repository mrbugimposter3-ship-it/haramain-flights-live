'use strict';
// Kid-friendly top section: one big card per mosque, with planes, next prayer and a surah box.
const KSITES=[
 {site:'Makkah',place:'Makkah',key:'makkah',icon:'🕋',en:'Makkah',ar:'مكة المكرمة',mosque:'Masjid al-Haram',mar:'المسجد الحرام',aps:'JED',color:'#f59e0b',
  live:{url:'https://www.youtube.com/user/SaudiQuranTv/live',en:'Watch official live (KSA Quran TV)',ar:'البث الرسمي المباشر'}},
 {site:'Madinah',place:'Madinah',key:'madinah',icon:'🕌',en:'Madinah',ar:'المدينة المنورة',mosque:'Masjid an-Nabawi',mar:'المسجد النبوي',aps:'MED',color:'#10b981',
  live:{url:'https://www.youtube.com/user/SaudiSunnahTv/live',en:'Watch official live (KSA Sunnah TV)',ar:'البث الرسمي المباشر'}},
 {site:'Al-Aqsa',place:'Jerusalem',key:'aqsa',icon:'🕌',en:'Al-Aqsa',ar:'القدس',mosque:'Al-Aqsa Mosque',mar:'المسجد الأقصى',aps:'TLV · AMM',color:'#6366f1',live:null}];
const PAR={Fajr:'الفجر',Dhuhr:'الظهر',Asr:'العصر',Maghrib:'المغرب',Isha:'العشاء'};
const flag=cc=>/^[A-Z]{2}$/.test(cc||'')?String.fromCodePoint(...[...cc].map(c=>127397+c.charCodeAt(0))):'🌍';
const arNum=n=>String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);
let RECITED=null,RECS=null;
async function getJSON(name){for(const u of['https://raw.githubusercontent.com/mrbugimposter3-ship-it/haramain-flights-live/main/data/'+name,'data/'+name]){
  try{const r=await fetch(u+'?t='+Date.now(),{cache:'no-store'});if(r.ok)return await r.json()}catch(e){}}return null}
async function loadRecited(){[RECS,RECITED]=await Promise.all([getJSON('recitations.json'),getJSON('last_recited.json')])}
const PORDER={fajr:0,dhuhr:1,jumuah:1,"jumu'ah":1,asr:2,maghrib:3,isha:4};   // cap() turns 'jumuah' into "Jumu'ah", so both spellings must rank as Dhuhr's slot
const cap=p=>{p=String(p||'').toLowerCase();return p==='jumuah'?"Jumu'ah":p.charAt(0).toUpperCase()+p.slice(1)};
const MPAT={makkah:/makk|mecca|makka|haram/i,madinah:/madin|medin|nabaw/i,aqsa:/aqsa|quds|jerus/i};
// One entry, any of the shapes the two files use -> {prayer,surah,from,to,date,imam,rakahs,url,silent} or null
function norm(e,key,pkey){if(!e||typeof e!=='object')return null;const prayer=cap(e.prayer||pkey||'');const date=String(e.date||'').slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;const url=e.source_video||e.source_url||e.url||e.video;
 const base={_key:key||'',mname:[key,e.mosque,e.mosque_name,e.site].filter(Boolean).join(' '),prayer,date,imam:e.imam||'',url:typeof url==='string'&&/^https:\/\//.test(url)?url:null};
 if(e.silent)return Object.assign(base,{silent:true});
 const s=parseInt(e.surah??e.surah_number,10);let a=e.ayah_from??e.from,b=e.ayah_to??e.to;
 if((a==null||b==null)&&typeof e.ayah_range==='string'){const m=e.ayah_range.match(/(\d+)\D+(\d+)/);if(m){a=m[1];b=m[2]}}
 if(!(s>=1&&s<=114))return null;
 const rk=Array.isArray(e.rakahs)?e.rakahs.map(r=>typeof r==='string'?r:(r&&r.ref)||'').filter(Boolean):[];
 return Object.assign(base,{surah:s,from:parseInt(a,10)||null,to:parseInt(b,10)||null,rakahs:rk})}
function entriesOf(js){const out=[];if(!js||typeof js!=='object')return out;
 const take=(e,key)=>{if(!e||typeof e!=='object')return;
  if(e.prayer||e.surah||e.silent)return out.push(norm(e,key));             // a single entry
  for(const [pk,v] of Object.entries(e))if(v&&typeof v==='object'&&!Array.isArray(v))out.push(norm(v,key,pk))};   // {fajr:{..},isha:{..}}
 if(Array.isArray(js))js.forEach(e=>take(e));else if(js.mosques){const m=js.mosques;if(Array.isArray(m))m.forEach(e=>take(e));else Object.entries(m).forEach(([k,v])=>Array.isArray(v)?v.forEach(e=>take(e,k)):take(v,k))}
 else take(js);return out.filter(Boolean)}
function forMosque(list,k){return list.filter(e=>MPAT[k].test(e.mname)&&!(k==='makkah'&&/nabaw|madin/i.test(e.mname)))}
const newest=l=>l.slice().sort((x,y)=>x.date<y.date?1:x.date>y.date?-1:(PORDER[y.prayer.toLowerCase()]??9)-(PORDER[x.prayer.toLowerCase()]??9))[0]||null;
// Back-compat helper (last_recited.json only)
function recitedFor(k){return newest(forMosque(entriesOf(RECITED),k).filter(e=>!e.silent))}
// Number-pattern surah (for fun). Flights for this site on its local "today": the current prayer window if it has >= 3 flights, else the whole day,
// else the last 7 days. a = mode of floor(dlat mod 27), k = mode of floor(km mod 27), both measured from the MOSQUE; ties -> smallest value.
// surah = ((27*a + k) mod 114) + 1  -> always 1..114 (a=k=0 gives 1).
function patternSurah(ks,today,win){const base=ALL.filter(r=>r.holy_site===ks.site&&!r.is_codeshare&&kind(r)!=='cancelled');
 const mode=vals=>{const c=new Map();vals.forEach(v=>c.set(v,(c.get(v)||0)+1));let best=null,n=-1;[...c].sort((x,y)=>x[0]-y[0]).forEach(([v,m])=>{if(m>n){n=m;best=v}});return best};
 let rows=base.filter(r=>r.dep_date===today&&r.prayer_window===win),scope=`today, ${win}`;
 if(rows.length<3){rows=base.filter(r=>r.dep_date===today);scope='today, all windows'}
 if(rows.length<3){rows=base.filter(r=>r.dep_date<=today&&r.dep_date>addDays(today,-7));scope='last 7 days'}
 const A=rows.map(r=>Math.floor(r.m_dlat_mod27)).filter(Number.isFinite),K=rows.map(r=>Math.floor(r.m_km_mod27)).filter(Number.isFinite);
 if(!A.length||!K.length)return null;const a=mode(A),k=mode(K);return{a,k,n:rows.length,scope,surah:((27*a+k)%114)+1}}
function surahLine(n){const s=SURAHS[n-1];return `<div class="sname"><span class="snum">${n}</span> <span class="ar">سورة ${s[0]}</span> <span>${s[1]}</span></div>`}
function realBox(r,src){const p=r.prayer||'Fajr';const pa=PAR[p]||(p==="Jumu'ah"?'الجمعة':p);
 return `<div class="rbox real"><div class="rtitle">📖 Last recited at ${esc(p)} · <span class="ar">آخر ما قُرئ في صلاة ${esc(pa)}</span></div>${surahLine(r.surah)}
  ${r.from?`<div class="ayat">Ayat ${r.from}${r.to&&r.to!==r.from?'–'+r.to:''} · <span class="ar">الآيات ${arNum(r.from)}${r.to&&r.to!==r.from?'–'+arNum(r.to):''}</span></div>`:''}
  ${r.rakahs.length?`<div class="small">Rakahs: ${r.rakahs.map(esc).join(' · ')}</div>`:''}
  <div class="small">📅 ${esc(r.date)}${r.imam?' · 🎙️ '+esc(r.imam):''}</div>
  ${r.url?`<a class="pill" href="${esc(r.url)}" target="_blank" rel="noopener">▶️ Watch that prayer · شاهد الصلاة</a>`:''}
  <div class="note">From the recording of that prayer — not live · <span class="ar">من تسجيل الصلاة، ليس بثًّا مباشرًا</span></div></div>`}
function prayerChips(list,today){const by={};list.forEach(e=>{const k=e.prayer.toLowerCase();if(!by[k]||by[k].date<e.date)by[k]=e});
 const chip=(p)=>{const k=p.toLowerCase(),ar=PAR[p];
  if(k==='dhuhr'||k==='asr')return `<div class="chip silent"><b>${p}</b> <span class="ar">${ar}</span><div>🤫 silent prayer<br><span class="ar">صلاة سرّية</span></div></div>`;
  const e=by[k];if(!e||e.silent||e.date<addDays(today,-3))return `<div class="chip none"><b>${p}</b> <span class="ar">${ar}</span><div>🔊 no data yet<br><span class="ar">لا بيانات بعد</span></div></div>`;
  const s=SURAHS[e.surah-1];return `<div class="chip loud"><b>${p}</b> <span class="ar">${ar}</span><div>🔊 ${e.surah}:${e.from||''}${e.to&&e.to!==e.from?'–'+e.to:''}<br><span class="ar">${s[0]}</span> · ${s[1]}</div><div class="tiny">${esc(e.date.slice(5))}${e.url?` · <a href="${esc(e.url)}" target="_blank" rel="noopener">▶️</a>`:''}</div></div>`};
 return `<div class="chips">${['Fajr','Dhuhr','Asr','Maghrib','Isha'].map(chip).join('')}</div>`}
// Safeguard: the recitation feed (data/recitations.json, written by a separate job) can skip runs. If the next LOUD prayer after the
// shown one (Fajr, Jumu'ah on Fridays, Maghrib, Isha; Dhuhr and Asr are silent) began more than FEED_GRACE ago in the mosque's own
// time zone, the shown entry is no longer the latest prayer: say so instead of presenting it as current.
const FEED_GRACE=90*60e3;
function feedStale(ks,r){const P_=PRAY&&PRAY[ks.place];if(!P_||!r||!r.date)return null;const tz=P_.tz,now=new Date();
 const fri=d=>new Date(d+'T12:00:00Z').getUTCDay()===5,at=(d,k)=>{const x=P_.days[d];return x&&x[k]?new Date(x[k]):null};
 const key=/^jumu'?ah$/i.test(String(r.prayer))?'Dhuhr':cap(r.prayer),t0=at(r.date,key);if(!t0)return null;
 let nx=null;for(const d of [r.date,addDays(r.date,1),addDays(r.date,2)]){for(const k of ['Fajr','Dhuhr','Maghrib','Isha']){if(k==='Dhuhr'&&!fri(d))continue;
   const t=at(d,k);if(t&&t>t0){nx={k:k==='Dhuhr'?"Jumu'ah":k,t};break}}if(nx)break}
 if(!nx||now-nx.t<FEED_GRACE)return null;
 const u=(RECS&&RECS.updated_utc)||(RECITED&&RECITED.updated_utc),ut=u?new Date(u):null;
 const f=x=>x.toLocaleString('en-GB',{timeZone:tz,weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
 return{upd:ut&&!isNaN(ut)?f(ut)+' ('+(tz==='Asia/Riyadh'?'Saudi':'local')+' time)':'unknown',next:nx.k+' '+f(nx.t)}}
function reciteBox(ks,st){const today=st?st.d:todayKSA();const fresh=e=>e&&e.date>=addDays(today,-3);let h='';
 const recs=forMosque(entriesOf(RECS),ks.key),loud=recs.filter(e=>!e.silent);
 const r1=newest(loud),r2=ks.key!=='aqsa'?recitedFor(ks.key):null;
 const real=fresh(r1)?r1:fresh(r2)?r2:null;
 if(real){h=realBox(real);const st2=feedStale(ks,real);if(st2)h=h.replace('<div class="note">',`<div class="feedstale">🕒 Feed last updated ${esc(st2.upd)} · waiting for update (${esc(st2.next)} should have a recording by now) · <span class="ar">بانتظار التحديث</span></div><div class="note">`)}
 else{const p=patternSurah(ks,today,st?st.win:'');const old=r1||r2;
  h=`<div class="rbox fun"><div class="rtitle">🔢 Number-pattern surah · <span class="ar">سورة من نمط الأرقام</span></div>${p?surahLine(p.surah):'<div class="small">Not enough flights yet</div>'}
  <div class="note">Number pattern for fun — not the live recitation · <span class="ar">نمط أرقام للتسلية — ليست التلاوة المباشرة</span></div>
  ${p?`<div class="small">${p.n} flights (${esc(p.scope)}): most common dlat mod 27 = ${p.a}, km mod 27 = ${p.k} → (27×${p.a} + ${p.k}) mod 114 + 1 = ${p.surah}</div>`:''}
  ${old?`<div class="small">Last real recitation data is from ${esc(old.date)}, too old to show.</div>`:''}</div>`}
 const silentNow=st&&(st.cur==='after Dhuhr'||st.cur==='after Asr');
 if(silentNow)h+=`<div class="silentnow">🤫 Now it is ${st.cur==='after Dhuhr'?'Dhuhr':'Asr'} time: a <b>silent prayer</b>, the imam reads quietly · <span class="ar">صلاة سرّية، يقرأ الإمام في نفسه</span></div>`;
 h+=prayerChips(recs.length?recs:(r2?[r2]:[]),today);
 if(ks.live)h+=`<a class="pill live" href="${ks.live.url}" target="_blank" rel="noopener">📺 ${ks.live.en} · <span class="ar">${ks.live.ar}</span></a>`;
 return h}
function kidCard(ks){const st=PRAY&&PRAY[ks.place]?prayerState(ks.place):null,today=st?st.d:todayKSA(),now=new Date();
 const rows=ALL.filter(r=>r.holy_site===ks.site&&r.dep_date===today&&!r.is_codeshare&&kind(r)!=='cancelled');
 const hasTT=ALL.some(r=>r.holy_site===ks.site&&(r.sources||'').includes('board'));
 const flew=rows.filter(r=>kind(r)==='observed'),planned=rows.filter(r=>kind(r)==='scheduled');
 const utc=s=>new Date((s||'').replace(' ','T')+':00Z');
 const recent=flew.filter(r=>utc(r.dep_utc)<=now).sort((a,b)=>a.dep_utc<b.dep_utc?1:-1).slice(0,5);
 const next=planned.filter(r=>utc(r.dep_utc)>now).sort((a,b)=>a.dep_utc>b.dep_utc?1:-1).slice(0,3);
 const line=(r,ic)=>`<li><span class="fl">${flag(r.dest_country)}</span> <b>${esc(r.dest_city||r.dest)}</b> <span class="small">${esc(r.fkey)} · ${esc((r.dep_local||'').slice(11))}</span> ${ic}</li>`;
 return `<div class="kcard" style="--c:${ks.color}"><div class="khead"><span class="kicon">${ks.icon}</span><div><div class="kname">${ks.en} · <span class="ar">${ks.ar}</span></div>
  <div class="small">${ks.mosque} · <span class="ar">${ks.mar}</span> · ✈️ ${ks.aps}</div></div></div>
  <div class="kprayer">${st?`🕰️ Next prayer · <span class="ar">الصلاة القادمة</span><div class="kbig"><b>${st.nk}</b> <span class="ar">${PAR[st.nk]}</span> in <span class="cd" data-nt="${st.nt?st.nt.toISOString():''}">${st.nt?cd(st.nt-now):'?'}</span></div>`:'Prayer times loading…'}</div>
  <div class="kstats"><div class="kstat"><div class="knum">${flew.length}</div><div>✈️ flew today<br><span class="ar">طارت اليوم</span></div></div>
  ${hasTT?`<div class="kstat"><div class="knum">${planned.length}</div><div>🗓️ planned today<br><span class="ar">مجدولة اليوم</span></div></div>`
   :`<div class="kstat"><div class="knum">–</div><div>🗓️ no timetable here<br><span class="ar">لا يوجد جدول</span></div></div>`}</div>
  ${recent.length?`<div class="klist-t">Latest planes · <span class="ar">آخر الطائرات</span></div><ul class="klist">${recent.map(r=>line(r,'🛫')).join('')}</ul>`:''}
  ${next.length?`<div class="klist-t">Next planes · <span class="ar">الطائرات القادمة</span></div><ul class="klist">${next.map(r=>line(r,'⏳')).join('')}</ul>`:''}
  ${!recent.length&&!next.length?'<div class="small">No planes seen yet today · لا طائرات بعد</div>':''}
  ${reciteBox(ks,st)}</div>`}
function renderKids(){const el=document.getElementById('kids');if(!el||!ALL)return;const t=todayKSA();
 const today=ALL.filter(r=>r.dep_date===t&&!r.is_codeshare&&kind(r)!=='cancelled'),obs=today.filter(r=>kind(r)==='observed');
 const countries=new Set(today.map(r=>r.dest_country).filter(Boolean)).size;
 document.getElementById('hero').innerHTML=`<div class="hstat"><div class="knum">${obs.length}</div>✈️ planes flew today<br><span class="ar">طائرات طارت اليوم</span></div>
  <div class="hstat"><div class="knum">${today.length}</div>🧳 flew + planned<br><span class="ar">طارت + مجدولة</span></div>
  <div class="hstat"><div class="knum">${countries}</div>🌍 countries<br><span class="ar">دولة</span></div>`;
 el.innerHTML=KSITES.map(kidCard).join('')}
function tickKids(){document.querySelectorAll('#kids .cd[data-nt]').forEach(e=>{if(e.dataset.nt)e.textContent=cd(new Date(e.dataset.nt)-new Date())})}
