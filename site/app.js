'use strict';
const W=['up to Fajr','up to Dhuhr','up to Asr','up to Maghrib','up to Isha','after Isha'];
const WCOL={'up to Fajr':'#60a5fa','up to Dhuhr':'#fbbf24','up to Asr':'#f97316','up to Maghrib':'#ef4444','up to Isha':'#a78bfa','after Isha':'#94a3b8'};
const SITES=[['Makkah','Makkah','JED'],['Madinah','Madinah','MED'],['Al-Aqsa','Jerusalem','TLV, AMM']];
const $=id=>document.getElementById(id);
let ALL=[],META=null,PRAY=null,FIL=[],charts={},map,mapLayer,sortKey=null,sortDir=1;
const fmt=(v,d=2)=>v==null||Number.isNaN(v)?'–':(typeof v==='number'?v.toFixed(d):v);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function localDate(tz,d=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
const todayKSA=()=>localDate('Asia/Riyadh');
function addDays(iso,n){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function kind(r){const t=r.data_type||'';return t.startsWith('observed')?'observed':t.startsWith('scheduled')?'scheduled':'cancelled'}
function P(){return $('ref').value==='mosque'?'m_':''}
function filtered(opts={}){const layer=$('layer').value,cs=$('cs').checked,site=$('site').value,orig=$('origin').value,date=opts.ignoreDate?'':$('date').value,dt=$('dtype').value,q=$('dest').value.trim().toLowerCase();
 return ALL.filter(r=>{if(r.is_codeshare&&!cs)return false;const k=kind(r);if(k==='cancelled')return false;if(layer==='observed'&&k!=='observed')return false;if(layer==='scheduled'&&k!=='scheduled')return false;
  if(site&&r.holy_site!==site)return false;if(orig&&r.origin!==orig)return false;if(date&&r.dep_date!==date)return false;if(dt&&!(r.data_type||'').startsWith(dt))return false;
  if(q&&![r.dest,r.dest_city,r.dest_country].some(x=>(x||'').toLowerCase().includes(q)))return false;return true})}
function modes(vals){vals=vals.filter(v=>v!==null&&v!==undefined&&v!=='');if(!vals.length)return{values:[],count:0,n:0};const c=new Map();vals.forEach(v=>c.set(v,(c.get(v)||0)+1));
 const top=Math.max(...c.values());const vs=[...c].filter(([,n])=>n===top).map(([k])=>k).sort((a,b)=>a>b?1:-1);return{values:vs,count:top,n:vals.length}}
const md=m=>!m.values.length?'–':`${esc(m.values.slice(0,5).join(', '))}${m.values.length>5?' …':''} <span class="muted">(${m.count}/${m.n})</span>`;
function agg(rows,ndays=1){const p=P(),mean=k=>rows.length?rows.reduce((s,r)=>s+r[p+k],0)/rows.length:null,seats=rows.filter(r=>r.seats_est).map(r=>r.seats_est);
 const o={flights:rows.length,perDay:rows.length/Math.max(ndays,1),seats:seats.reduce((a,b)=>a+b,0),seatsKnown:seats.length,mdlat:mean('dlat'),mdlon:mean('dlon'),mkm:mean('km')};
 o.seatsPerDay=o.seats/Math.max(ndays,1);for(const k of['dlat','dlon','km'])o['m'+k+'27']=o['m'+k]==null?null:((o['m'+k]%27)+27)%27;
 o.modes={city:modes(rows.map(r=>r.dest_city)),dlat:modes(rows.map(r=>Math.floor(r[p+'dlat_mod27']))),dlon:modes(rows.map(r=>Math.floor(r[p+'dlon_mod27']))),km:modes(rows.map(r=>Math.floor(r[p+'km_mod27'])))};return o}
// ---------- freshness & progress
function renderFresh(){if(!META)return;const t=new Date(META.last_run?META.last_run.ts_utc:META.generated_utc),mins=Math.round((Date.now()-t)/60000);
 const el=$('fresh');el.className='fresh'+(mins>75?' stale':'');
 el.innerHTML=`🔄 Updated ${mins<1?'just now':mins+' min ago'} · <span class="ar">آخر تحديث</span>${mins>75?' · ⚠️ Data is late: the collector may be delayed · <span class="ar">البيانات متأخرة</span>':''}`;el.title=`Last collection ${t.toLocaleString()} · page reloads data every 60 s`}
function renderProg(){const T=META.totals,tgt=META.target,obs=T.observed||0,sch=T.scheduled||0,pct=v=>Math.min(100,v/tgt*100).toFixed(1);
 const y=addDays(todayKSA(),-1),tom=addDays(todayKSA(),1),pd=META.per_day||{},sum=(d,k)=>Object.entries(pd[d]||{}).filter(([x])=>x.endsWith('|'+k)).reduce((s,[,v])=>s+v,0);
 const rate=Math.max(sum(y,'observed'),sum(tom,'scheduled')+sum(tom,'observed'));const left=v=>v>=tgt?0:(rate?((tgt-v)/rate).toFixed(1):'?');
 $('prog').innerHTML=`<div class="big">Progress to ${tgt.toLocaleString()} flights</div>
 <div>Observed: <b>${obs.toLocaleString()}</b> (${pct(obs)}%)</div><div class="bar"><div style="width:${pct(obs)}%;background:#3b82f6"></div></div>
 <div>Observed + scheduled: <b>${(obs+sch).toLocaleString()}</b> (${pct(obs+sch)}%)</div><div class="bar"><div style="width:${pct(obs+sch)}%;background:#10b981"></div></div>
 <div class="muted">≈ ${rate} new flights/day (the larger of: yesterday's observed (${sum(y,'observed')}) and tomorrow's board listings (${sum(tom,'scheduled')+sum(tom,'observed')})). At that rate: ~${left(obs)} days to ${tgt.toLocaleString()} observed, ~${left(obs+sch)} days to ${tgt.toLocaleString()} observed + scheduled. Codeshares and cancellations are not counted.</div>`}
// ---------- prayer
function prayerState(place){const P_=PRAY[place],tz=P_.tz,d=localDate(tz),now=new Date();const day=P_.days[d],next=P_.days[addDays(d,1)];if(!day)return null;
 const ks=['Fajr','Dhuhr','Asr','Maghrib','Isha'];const prev=ks.filter(k=>new Date(day[k])<=now);let nk=ks.find(k=>new Date(day[k])>now),nt;
 if(nk)nt=new Date(day[nk]);else{nk='Fajr';nt=next?new Date(next.Fajr):null}
 const win=ks.find(k=>now<=new Date(day[k]));return{d,tz,method:P_.method,cur:prev.length?'after '+prev[prev.length-1]:'before Fajr',win:win?'up to '+win:'after Isha',nk,nt,times:ks.map(k=>k+' '+new Date(day[k]).toLocaleTimeString('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit'})).join(' · ')}}
function cd(ms){if(ms<0)ms=0;const s=Math.floor(ms/1000);return `${Math.floor(s/3600)}h ${String(Math.floor(s%3600/60)).padStart(2,'0')}m ${String(s%60).padStart(2,'0')}s`}
function renderPrayer(){if(!PRAY)return;$('prayer').innerHTML=SITES.map(([site,place,aps])=>{const s=prayerState(place);if(!s)return `<div class="card">${site}: prayer times unavailable</div>`;
 return `<div class="card"><div class="muted">${site} (${aps}) · ${s.d} · ${s.tz}</div><div class="big">${s.cur}</div><div>Current departure window: <b style="color:${WCOL[s.win]}">${s.win}</b></div>
 <div>Next: <b>${s.nk}</b> in <span class="cd">${s.nt?cd(s.nt-new Date()):'?'}</span></div><div class="muted">${s.times}</div><div class="muted">${s.method}</div></div>`}).join('')}
// ---------- modes
function modeCard(title,o){return `<div class="card"><div class="muted">${title}</div><div class="big">${o.flights.toLocaleString()} flights</div>
 <div class="muted">${o.seats.toLocaleString()} est. seats (type known for ${o.seatsKnown} of ${o.flights})</div>
 <table class="mt"><tr><td>Destination city</td><td>${md(o.modes.city)}</td></tr><tr><td>dlat mod 27</td><td>${md(o.modes.dlat)}</td></tr><tr><td>dlon mod 27</td><td>${md(o.modes.dlon)}</td></tr>
 <tr><td>km mod 27</td><td>${md(o.modes.km)}</td></tr><tr><td>mean dlat / dlon / km</td><td>${fmt(o.mdlat)} / ${fmt(o.mdlon)} / ${fmt(o.mkm,0)}</td></tr></table></div>`}
function renderModes(){const base=filtered({ignoreDate:true}),t=todayKSA(),td=base.filter(r=>r.dep_date===t),l7=base.filter(r=>r.dep_date<=t&&r.dep_date>addDays(t,-7));
 const days=new Set(l7.map(r=>r.dep_date)).size;
 $('modes').innerHTML=modeCard(`Today (${t})`,agg(td))+modeCard(`Last 7 days (${days} day(s) with data)`,agg(l7,7))+SITES.map(([s])=>modeCard('Today: '+s,agg(td.filter(r=>r.holy_site===s)))).join('')}
// ---------- map
function gcPoints(a,b,n=48){const R=Math.PI/180,[la1,lo1,la2,lo2]=[a[0]*R,a[1]*R,b[0]*R,b[1]*R];const d=2*Math.asin(Math.sqrt(Math.sin((la2-la1)/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin((lo2-lo1)/2)**2));
 if(d===0)return[a,b];const pts=[];let prev=null;for(let i=0;i<=n;i++){const f=i/n,A=Math.sin((1-f)*d)/Math.sin(d),B=Math.sin(f*d)/Math.sin(d);
  const x=A*Math.cos(la1)*Math.cos(lo1)+B*Math.cos(la2)*Math.cos(lo2),y=A*Math.cos(la1)*Math.sin(lo1)+B*Math.cos(la2)*Math.sin(lo2),z=A*Math.sin(la1)+B*Math.sin(la2);
  let lon=Math.atan2(y,x)/R;const lat=Math.atan2(z,Math.sqrt(x*x+y*y))/R;if(prev!==null){while(lon-prev>180)lon-=360;while(lon-prev<-180)lon+=360}prev=lon;pts.push([lat,lon])}return pts}
function renderMap(){if(!window.L)return;if(!map){map=L.map('map',{worldCopyJump:true}).setView([30,30],3);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:8,attribution:'© OpenStreetMap contributors'}).addTo(map);mapLayer=L.layerGroup().addTo(map)}
 mapLayer.clearLayers();const ref=$('ref').value==='mosque',g=new Map();
 for(const r of FIL){const o=ref?META.mosques[r.holy_site]:[r.o_lat,r.o_lon],k=[o[0],o[1],r.dest,r.prayer_window].join('|');if(!g.has(k))g.set(k,{o,d:[r.d_lat,r.d_lon],w:r.prayer_window,n:0,city:r.dest_city,dest:r.dest,site:r.holy_site});g.get(k).n++}
 for(const x of g.values())L.polyline(gcPoints(x.o,x.d),{color:WCOL[x.w]||'#999',weight:Math.min(1+Math.log2(x.n+1),6),opacity:.7}).bindTooltip(`${x.site} → ${esc(x.city)} (${x.dest}) · ${x.w} · ${x.n} flight(s)`).addTo(mapLayer);
 const origins=ref?Object.entries(META.mosques).map(([k,v])=>[k,v]):Object.keys(META.origins).map(k=>[k,FIL.find(r=>r.origin===k)]).filter(x=>x[1]).map(([k,r])=>[k,[r.o_lat,r.o_lon]]);
 for(const [k,p] of origins)L.circleMarker(p,{radius:6,color:'#fff',fillColor:'#10b981',fillOpacity:1}).bindTooltip(k).addTo(mapLayer);
 $('maplegend').innerHTML=`${g.size} route lines from ${FIL.length} flights · lines start at the ${ref?'mosque':'airport'} · `+W.map(w=>`<span class="legend"><i style="background:${WCOL[w]}"></i>${w}</span>`).join('')}
// ---------- charts
function chart(id,cfg){cfg.options=Object.assign({responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{labels:{color:'#334155',boxWidth:12}},title:{display:true,text:cfg.title,color:'#1e40af'}},
 scales:{x:{ticks:{color:'#475569'}},y:{ticks:{color:'#475569'},beginAtZero:true}}},cfg.options||{});if(charts[id]){charts[id].data=cfg.data;charts[id].options=cfg.options;charts[id].update('none');return}charts[id]=new Chart($(id),cfg)}
function renderRolling(){const base=filtered({ignoreDate:true}),w=$('rwin').value||'ALL',t=todayKSA();const ds=[...new Set(base.map(r=>r.dep_date))].sort();if(!ds.length){$('rt').innerHTML='<tr><td>No data</td></tr>';return}
 const days=[];for(let d=ds[0];d<=ds[ds.length-1];d=addDays(d,1))days.push(d);const by={};base.forEach(r=>(by[r.dep_date]=by[r.dep_date]||[]).push(r));
 const rows=[];for(const d of days)for(const x of ['ALL',...W]){const f=r=>x==='ALL'||r.prayer_window===x;const span=days.filter(y=>y<=d&&y>addDays(d,-7));
  rows.push({d,x,future:d>t,day:agg((by[d]||[]).filter(f)),roll:agg(span.flatMap(y=>(by[y]||[]).filter(f)),span.length),n:span.length})}
 const rs=rows.filter(r=>r.x===w),L_=rs.map(r=>r.d);
 chart('c1',{type:'bar',title:`Flights per day: ${w}`,data:{labels:L_,datasets:[{label:'flights',data:rs.map(r=>r.day.flights),backgroundColor:rs.map(r=>r.future?'#047857':'#3b82f6')},{type:'line',label:'7-day rolling avg',data:rs.map(r=>r.roll.perDay),borderColor:'#ffd479'}]}});
 chart('c2',{type:'bar',title:`Estimated seats per day (known types only): ${w}`,data:{labels:L_,datasets:[{label:'est. seats',data:rs.map(r=>r.day.seats),backgroundColor:'#10b981'},{type:'line',label:'7-day rolling avg',data:rs.map(r=>r.roll.seatsPerDay),borderColor:'#ffd479'}]}});
 chart('c3',{type:'line',title:`Mean dlat / dlon / km mod 27: ${w}`,data:{labels:L_,datasets:[['mdlat27','dlat','#60a5fa'],['mdlon27','dlon','#f472b6'],['mkm27','km','#34d399']].flatMap(([k,n,c])=>[{label:n+' (day)',data:rs.map(r=>r.day[k]),borderColor:c},{label:n+' (7d)',data:rs.map(r=>r.roll[k]),borderColor:c,borderDash:[5,4]}])},options:{scales:{x:{ticks:{color:'#475569'}},y:{min:0,max:27,ticks:{color:'#475569'}}}}});
 const sel=$('date').value||(days.includes(t)?t:days[days.length-1]);const bw=W.map(x=>rows.find(r=>r.d===sel&&r.x===x));
 chart('c4',{type:'bar',title:`By prayer window on ${sel}: day vs 7-day avg`,data:{labels:W,datasets:[{label:'flights (day)',data:bw.map(r=>r?r.day.flights:0),backgroundColor:W.map(x=>WCOL[x])},{label:'7-day avg/day',data:bw.map(r=>r?r.roll.perDay:0),backgroundColor:'#ffd47999'}]}});
 const WO=['ALL',...W];let h='<tr><th>Date</th><th>Window</th><th>Flights</th><th>Est. seats</th><th>mean dlat</th><th>mean dlon</th><th>mean km</th><th>dlat%27</th><th>dlon%27</th><th>km%27</th><th>Mode city</th><th>Mode dlat%27</th><th>Mode dlon%27</th><th>Mode km%27</th><th>7d avg/day</th><th>7d seats/day</th><th>7d dlat%27</th><th>7d dlon%27</th><th>7d km%27</th><th>7d mode city</th><th>7d mode km%27</th><th>days in 7d</th></tr>';
 for(const r of rows.slice().sort((a,b)=>(a.d<b.d?1:a.d>b.d?-1:0)||WO.indexOf(a.x)-WO.indexOf(b.x))){if(w!=='ALL'&&r.x!==w&&r.x!=='ALL')continue;const a=r.day,o=r.roll;
  h+=`<tr${r.x==='ALL'?' class="grp"':''}><td>${r.d}${r.future?' <span class="muted">(scheduled)</span>':''}</td><td>${r.x}</td><td>${a.flights}</td><td>${a.seats}</td><td>${fmt(a.mdlat)}</td><td>${fmt(a.mdlon)}</td><td>${fmt(a.mkm,0)}</td><td>${fmt(a.mdlat27)}</td><td>${fmt(a.mdlon27)}</td><td>${fmt(a.mkm27)}</td>
  <td>${md(a.modes.city)}</td><td>${md(a.modes.dlat)}</td><td>${md(a.modes.dlon)}</td><td>${md(a.modes.km)}</td><td>${fmt(o.perDay)}</td><td>${fmt(o.seatsPerDay,0)}</td><td>${fmt(o.mdlat27)}</td><td>${fmt(o.mdlon27)}</td><td>${fmt(o.mkm27)}</td><td>${md(o.modes.city)}</td><td>${md(o.modes.km)}</td><td>${r.n}</td></tr>`}
 $('rt').innerHTML=h}
function renderHist(){const p=P(),labels=[...Array(27).keys()];for(const [id,k,c] of [['h1','dlat','#60a5fa'],['h2','dlon','#f472b6'],['h3','km','#34d399']]){const cnt=Array(27).fill(0);FIL.forEach(r=>{const v=Math.floor(r[p+k+'_mod27']);if(v>=0&&v<27)cnt[v]++});
 chart(id,{type:'bar',title:`${k} mod 27 (whole-number part) · ${FIL.length} flights`,data:{labels,datasets:[{label:'flights',data:cnt,backgroundColor:c}]}})}}
function renderTop(){const p=P(),g=new Map();for(const r of FIL){const k=r.dest;if(!g.has(k))g.set(k,{r,n:0,obs:0,seats:0,w:[]});const x=g.get(k);x.n++;if(kind(r)==='observed')x.obs++;x.seats+=r.seats_est||0;x.w.push(r.prayer_window)}
 const rows=[...g.values()].sort((a,b)=>b.n-a.n).slice(0,60);
 $('top').innerHTML='<tr><th>#</th><th>City</th><th>Airport</th><th>CC</th><th>Flights</th><th>Observed</th><th>Est. seats</th><th>Mode window</th><th>dlat</th><th>dlon</th><th>km</th><th>dlat%27</th><th>dlon%27</th><th>km%27</th></tr>'+
 rows.map((x,i)=>{const r=x.r;return `<tr><td>${i+1}</td><td>${uk(r.dest_city)}</td><td>${r.dest}</td><td>${r.dest_country||''}</td><td>${x.n}</td><td>${x.obs}</td><td>${x.seats||'–'}</td><td>${md(modes(x.w))}</td><td>${fmt(r[p+'dlat'],3)}</td><td>${fmt(r[p+'dlon'],3)}</td><td>${fmt(r[p+'km'],1)}</td><td>${fmt(r[p+'dlat_mod27'],3)}</td><td>${fmt(r[p+'dlon_mod27'],3)}</td><td>${fmt(r[p+'km_mod27'],1)}</td></tr>`}).join('')+
 (g.size>60?`<tr><td colspan="14" class="muted">${g.size-60} more destinations not shown</td></tr>`:'')+(rows.length&&META.origins&&$('site').value===''?'<tr><td colspan="14" class="muted">With all sites selected, differences are shown for the first origin seen for each destination. Pick a site or origin for exact values.</td></tr>':'')}
// ---------- table
const uk=c=>['London','Manchester'].includes(c)?`<span class="uk">${esc(c)}</span>`:esc(c);
const COLS=[['dep_date','Date'],['holy_site','Site'],['prayer_window','Prayer window'],['dep_local','Dep (local)'],['fkey','Flight'],['airline','Airline'],['aircraft_type','Type'],['origin','From'],['dest','To'],['dest_city','City'],['dest_country','CC'],
 ['dlat','dlat'],['dlon','dlon'],['km','km'],['dlat_mod27','dlat%27'],['dlon_mod27','dlon%27'],['km_mod27','km%27'],['m_dlat','dlat (mosque)'],['m_dlon','dlon (mosque)'],['m_km','km (mosque)'],['m_dlat_mod27','dlat%27 (m)'],['m_dlon_mod27','dlon%27 (m)'],['m_km_mod27','km%27 (m)'],
 ['seats_est','Seats (est.)'],['data_type','Data type'],['status','Status'],['is_codeshare','Codeshare'],['sources','Sources']];
function sortedRows(){let rows=FIL.slice();const g=$('grp').value==='1';if(!g&&sortKey)rows.sort((a,b)=>((a[sortKey]??'')>(b[sortKey]??'')?1:(a[sortKey]??'')<(b[sortKey]??'')?-1:0)*sortDir);
 if(g)rows.sort((a,b)=>(a.dep_date<b.dep_date?1:a.dep_date>b.dep_date?-1:0)||W.indexOf(a.prayer_window)-W.indexOf(b.prayer_window)||((a.dep_utc||'')>(b.dep_utc||'')?1:-1));return rows}
function renderTable(){const rows=sortedRows(),g=$('grp').value==='1',LIM=1500;const cnt={};if(g)rows.forEach(r=>{const k=r.dep_date+'|'+r.prayer_window;cnt[k]=cnt[k]||{n:0,s:0};cnt[k].n++;cnt[k].s+=r.seats_est||0});
 let h='<tr>'+COLS.map(([k,t])=>`<th data-k="${k}">${t}${sortKey===k?(sortDir>0?' ▲':' ▼'):''}</th>`).join('')+'</tr>',last='';
 for(const r of rows.slice(0,LIM)){const key=r.dep_date+'|'+r.prayer_window;if(g&&key!==last){h+=`<tr class="grp"><td colspan="${COLS.length}">${r.dep_date} · ${r.prayer_window} · ${cnt[key].n} flight(s) · ${cnt[key].s} est. seats (known types only)</td></tr>`;last=key}
  h+='<tr>'+COLS.map(([k])=>{const v=r[k];return `<td>${k==='dest_city'?uk(v):k==='prayer_window'?`<span style="color:${WCOL[v]}">${v}</span>`:(typeof v==='number'&&!['seats_est','is_codeshare'].includes(k)?fmt(v,k.endsWith('km')?1:3):esc(v??'–'))}</td>`}).join('')+'</tr>'}
 if(!rows.length)h+=`<tr><td colspan="${COLS.length}">No flights match.</td></tr>`;$('ft').innerHTML=h;$('ftot').textContent=`${rows.length.toLocaleString()} flights match${rows.length>LIM?` (showing the first ${LIM}; the CSV has all of them)`:''}`;
 $('ft').querySelectorAll('th').forEach(th=>th.onclick=()=>{const k=th.dataset.k;if(sortKey===k)sortDir*=-1;else{sortKey=k;sortDir=1}$('grp').value='0';renderTable()})}
function downloadCSV(){const rows=sortedRows(),keys=COLS.map(c=>c[0]).concat(['seats_basis','sched_dep_local','dep_utc','callsign_icao','first_seen_utc','last_seen_utc','sightings']);
 const q=v=>{v=v??'';v=String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};const csv=[keys.join(',')].concat(rows.map(r=>keys.map(k=>q(r[k])).join(','))).join('\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`haramain_aqsa_flights_${$('layer').value}_${new Date().toISOString().slice(0,16).replace(':','')}.csv`;a.click()}
// ---------- main
function renderAll(){FIL=filtered();renderModes();renderMap();renderRolling();renderHist();renderTop();renderTable();renderProg();renderFresh()}
async function load(){try{const v='?t='+Date.now();const [f,m,p]=await Promise.all(['flights','meta','prayer'].map(n=>fetch('data/'+n+'.json'+v).then(r=>r.json())));
 ALL=f.rows.map(a=>Object.fromEntries(f.cols.map((c,i)=>[c,a[i]])));META=m;PRAY=p;
 const cur=$('date').value,ds=[...new Set(ALL.map(r=>r.dep_date))].sort().reverse();$('date').innerHTML='<option value="">all</option>'+ds.map(d=>`<option${d===cur?' selected':''}>${d}</option>`).join('');
 if(!$('rwin').options.length)$('rwin').innerHTML=['ALL',...W].map(x=>`<option>${x}</option>`).join('');renderPrayer();renderAll();if(typeof loadRecited==='function'){await loadRecited();renderKids()}}catch(e){$('fresh').className='fresh stale';$('fresh').textContent='Could not load data: '+e}}
['layer','ref','site','origin','date','dtype','cs'].forEach(i=>$(i).addEventListener('change',renderAll));$('grp').addEventListener('change',renderTable);$('rwin').addEventListener('change',renderRolling);
$('dest').addEventListener('input',()=>{clearTimeout(window._t);window._t=setTimeout(renderAll,300)});$('csv').addEventListener('click',downloadCSV);
load();setInterval(load,60000);setInterval(()=>{renderPrayer();renderFresh();if(typeof tickKids==='function')tickKids()},1000);
