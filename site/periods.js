/* Running ayah modes for the current Hijri month (Umm al-Qura), Gregorian month and astronomical season (Northern Hemisphere),
   all on Saudi (Asia/Riyadh) dates, like the daily card. Hijri logic from Juz Daily's cal.js (Intl islamic-umalqura, tabular fallback);
   season instants from Juz Daily's astro.js (Meeus ch.27 + VSOP87 refinement). Data: data/daycounts.json (built by collector/build.py).
   Works in the browser (window.HFLP) and in Node (require) for collector/looks_missing.js. */
(function(root){'use strict';
const HM_AR=['محرّم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوّال','ذو القعدة','ذو الحجّة'];
const HM_EN=['Muharram','Safar','Rabi al-Awwal','Rabi al-Akhir','Jumada al-Ula','Jumada al-Akhirah','Rajab','Shaban','Ramadan','Shawwal','Dhu al-Qadah','Dhu al-Hijjah'];
const GM_AR=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const GM_EN=['January','February','March','April','May','June','July','August','September','October','November','December'];
const SE=[['Spring','الربيع','🌸','March equinox'],['Summer','الصيف','☀️','June solstice'],['Autumn','الخريف','🍂','September equinox'],['Winter','الشتاء','❄️','December solstice']];
const AR=n=>String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);
const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const ksaDate=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(t);
let HF=null,UQ=false;
function hParts(dt){const r={};HF.formatToParts(dt).forEach(p=>{if(p.type==='year'||p.type==='month'||p.type==='day')r[p.type[0]]=parseInt(p.value,10)});return r}
try{HF=new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn',{timeZone:'UTC',day:'numeric',month:'numeric',year:'numeric'});
 const c=hParts(new Date(Date.UTC(2026,9,22,12)));UQ=c.y===1448&&c.m===5&&c.d===11}catch(e){UQ=false}
function tabular(y,m,d){let l=Date.UTC(y,m,d)/864e5+2440588-1948440+10632;const n=Math.floor((l-1)/10631);l=l-10631*n+354;
 const j=Math.floor((10985-l)/5316)*Math.floor(50*l/17719)+Math.floor(l/5670)*Math.floor(43*l/15238);l=l-Math.floor((30-j)/15)*Math.floor(17719*j/50)-Math.floor(j/16)*Math.floor(15238*j/43)+29;
 const mm=Math.floor(24*l/709);return{y:30*n+j-30,m:mm,d:l-Math.floor(709*mm/24)}}
function hijri(iso){const [y,m,d]=iso.split('-').map(Number);return UQ?hParts(new Date(Date.UTC(y,m-1,d,12))):tabular(y,m-1,d)}
// periods(todayISO, ASTRO) -> [{id,start,end,name,nameAr,icon,...}], end = today (inclusive)
function periods(t,AS){const h=hijri(t),hs=addDays(t,-(h.d-1)),[y,m]=t.split('-').map(Number),out=[];
 out.push({id:'hijri',icon:'🌙',start:hs,end:t,name:`${HM_EN[h.m-1]} ${h.y} AH`,nameAr:`${HM_AR[h.m-1]} ${AR(h.y)}هـ`,kindEn:'Hijri month to date',kindAr:'الشهر الهجري حتى اليوم',
  basis:UQ?'Umm al-Qura calendar':'tabular Islamic calendar (this device has no Umm al-Qura; may differ by 1–2 days)'});
 out.push({id:'greg',icon:'📅',start:t.slice(0,8)+'01',end:t,name:`${GM_EN[m-1]} ${y}`,nameAr:`${GM_AR[m-1]} ${AR(y)}`,kindEn:'Gregorian month to date',kindAr:'الشهر الميلادي حتى اليوم',basis:'Gregorian calendar'});
 if(AS){let best=null;const now=new Date(t+'T23:59:59+03:00');
  for(let yy=y-1;yy<=y;yy++)for(let i=0;i<4;i++){const at=AS.season(yy,i);if(at<=now&&(!best||at>best.at))best={at,i,yy}}
  const s=SE[best.i],yl=best.i===3?`${best.yy}–${String(best.yy+1).slice(2)}`:String(best.yy),ylA=best.i===3?`${AR(best.yy)}–${AR(String(best.yy+1).slice(2))}`:AR(best.yy);
  out.push({id:'season',icon:s[2],start:ksaDate(best.at),end:t,name:`${s[0]} ${yl}`,nameAr:`${s[1]} ${ylA}`,kindEn:'Season to date',kindAr:'الفصل حتى اليوم',
   basis:`astronomical season, Northern Hemisphere: ${s[3]} ${best.at.toISOString().slice(0,16).replace('T',' ')} UTC (Meeus + VSOP87)`})}
 return out}
// Sum day counts over [start,end]; mode with ties -> smallest value (same as the daily card)
function modes(DC,start,end){const A=new Map(),K=new Map();let n=0,first=null,last=null;
 Object.keys(DC.days).sort().forEach(d=>{if(d<start||d>end)return;const x=DC.days[d];n+=x.n;first=first||d;last=d;
  for(const v in x.a)A.set(+v,(A.get(+v)||0)+x.a[v]);for(const v in x.k)K.set(+v,(K.get(+v)||0)+x.k[v])});
 const mode=M=>{let b=null,c=-1;[...M].sort((p,q)=>p[0]-q[0]).forEach(([v,m])=>{if(m>c){c=m;b=v}});return b};
 if(!n)return null;return{a:mode(A),k:mode(K),n,first,last}}
// The daily card's rule: today's flights; if fewer than 3, the last 7 days
function dayModes(DC,t){let m=modes(DC,t,t),scope='today (all three mosques)';if(!m||m.n<3){m=modes(DC,addDays(t,-6),t);scope='last 7 days'}return m&&Object.assign(m,{scope,date:t})}
const surahAyah=(a,k,counts)=>{const s=((27*a+k)%114)+1,c=counts[s-1];return{surah:s,ayah:((a*k+a+k)%c)+1,count:c}};
const api={periods,modes,dayModes,surahAyah,hijri,addDays,ksaDate,AR,UQ:()=>UQ};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HFLP=api})(typeof self!=='undefined'?self:this);
