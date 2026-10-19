"""Flight sources (free, keyless, public). Each returns a list of raw flight dicts plus a status string."""
import os, re, json, time, threading, datetime as dt, concurrent.futures as cf
from zoneinfo import ZoneInfo
import requests
from hfl import AP, ICAO, ORIGINS, UA, UTC, DATA, gc_km, bearing, flight_iata
PTS = [(21.7, 39.2), (24.5, 39.7), (27, 34), (30, 32), (31.5, 36), (32, 35), (34, 36), (38, 30), (39, 35), (41, 29), (44, 22), (46, 14), (48, 8),
       (51.5, -0.5), (53.4, -2.3), (50, 2), (36, 10), (33, 0), (31, 15), (36, 25), (35, 33), (15, 38), (12, 45), (25, 51), (25, 56), (33, 44),
       (32, 53), (29, 61), (28, 68), (24, 72), (19, 74), (33, 73), (13, 78), (5, 101), (-6, 107), (24, 90), (40, 45), (38, 58), (52, 13),
       (49, 22), (55, 37), (41, -4), (45, 5), (42, 12), (40.5, -74), (43, 77), (30, 120), (47, 19)]
ADSB = {'adsb.fi': (lambda la, lo: f'https://opendata.adsb.fi/api/v2/lat/{la}/lon/{lo}/dist/250', 1.1),   # documented limit 1 req/s
        'adsb.lol': (lambda la, lo: f'https://api.adsb.lol/v2/point/{la}/{lo}/250', 1.5)}
def _scan(name, log):
    url, gap = ADSB[name]; out = {}; fails = consec = 0; s = requests.Session(); s.headers.update(UA)
    try: s.get(url(32, 35), timeout=(4, 10)).json()
    except Exception as e: log(f'{name}: health check failed ({type(e).__name__}), skipped'); return out
    for la, lo in PTS:
        if consec >= 4: log(f'{name}: 4 consecutive failures, stopped early'); break
        t0 = time.time()
        try: js = s.get(url(la, lo), timeout=(4, 10)).json(); consec = 0
        except Exception: js = None; fails += 1; consec += 1
        for a in (js or {}).get('ac') or (js or {}).get('aircraft') or []:
            if a.get('lat') is not None: a['_src'] = name; out[a['hex']] = a
        time.sleep(max(0, gap - (time.time() - t0)))
    log(f'{name}: {len(out)} aircraft, {fails} failed points'); return out
def _plausible(a):
    if a.get('track') is None: return False
    for code in ORIGINS:
        la, lo = AP[code][:2]; d = gc_km(la, lo, a['lat'], a['lon'])
        if d < 150: return True
        if d < 9500 and abs((bearing(la, lo, a['lat'], a['lon']) - a['track'] + 180) % 360 - 180) < 30: return True
    return False
RC_DIR = os.path.join(DATA, 'routes'); _rcl = threading.Lock()
def route_cache():
    c = {}
    if os.path.isdir(RC_DIR):
        for f in os.listdir(RC_DIR): c.update(json.load(open(os.path.join(RC_DIR, f))))
    return c
def save_route_cache(cache):
    os.makedirs(RC_DIR, exist_ok=True); by = {}
    for k, v in cache.items(): by.setdefault(k[:3] if re.fullmatch(r'[A-Z]{3}', k[:3]) else '_other', {})[k] = v
    for p, d in by.items():
        f = os.path.join(RC_DIR, p + '.json'); s = json.dumps(d, separators=(',', ':'), sort_keys=True)
        if not os.path.exists(f) or open(f).read() != s: open(f, 'w').write(s)
def _route(cs, cache):
    with _rcl:
        if cs in cache: return cache[cs]
    try:
        r = requests.get(f'https://api.adsbdb.com/v0/callsign/{cs}', headers=UA, timeout=(5, 10)).json()['response']
        fr = r['flightroute'] if isinstance(r, dict) else None
        v = None if not fr else {k: {x: fr[k][x] for x in ['iata_code', 'icao_code', 'latitude', 'longitude', 'municipality', 'country_name']} for k in ['origin', 'destination']}
    except Exception: return None
    with _rcl: cache[cs] = v
    time.sleep(0.15); return v
def adsb(now, log):
    with cf.ThreadPoolExecutor(len(ADSB)) as ex: res = list(ex.map(lambda n: _scan(n, log), ADSB))
    ac = {}
    for r in res:
        for h, a in r.items():
            if h in ac: ac[h]['_src'] += '+' + a['_src']
            else: ac[h] = a
    cands = [a for a in ac.values() if re.fullmatch(r'[A-Z]{3}\d{1,4}[A-Z]{0,2}', (a.get('flight') or '').strip()) and _plausible(a)]
    cache = route_cache()
    with cf.ThreadPoolExecutor(4) as ex: pairs = list(ex.map(lambda a: (a, _route(a['flight'].strip(), cache)), cands))
    save_route_cache(cache)
    out = []
    for a, r in pairs:
        if not r or r['origin']['iata_code'] not in ORIGINS or r['destination']['iata_code'] not in AP: continue
        o, d = r['origin'], r['destination']; cs = a['flight'].strip()
        flown = gc_km(o['latitude'], o['longitude'], a['lat'], a['lon']); gs = max(a.get('gs') or 450, 250)
        out.append(dict(callsign=cs, flight_iata=flight_iata(cs), origin=o['iata_code'], dest=d['iata_code'], dest_name=d['municipality'],
                        d_lat=AP[d['iata_code']][0], d_lon=AP[d['iata_code']][1], dep_utc=now - dt.timedelta(hours=flown / (gs * 1.852) + 0.4),
                        aircraft_type=a.get('t') or '', status='airborne', source=a['_src'] + ' (ADS-B) + adsbdb route', data_type='observed (ADS-B)'))
    log(f'ADS-B: {len(ac)} aircraft, {len(cands)} route candidates, {len(out)} from JED/MED/TLV/AMM'); return out
def _board_row(origin, fno, dest, dname, sched, upd, status, airline, source, now):
    cancelled = 'CANCEL' in status; departed = (not cancelled) and ('DEPART' in status or 'AIRBORNE' in status)
    dtype = 'cancelled (airport board)' if cancelled else ('observed (airport board: departed)' if departed else 'scheduled (airport board)')
    return dict(callsign=fno, flight_iata=fno, origin=origin, dest=dest, dest_name=dname, d_lat=AP[dest][0], d_lon=AP[dest][1], dep_utc=upd.astimezone(UTC),
                sched_utc=sched.astimezone(UTC), aircraft_type='', status=status or 'SCHEDULED', source=source, data_type=dtype, airline=airline)
def board_tlv(now, log):
    js = requests.get('https://data.gov.il/api/3/action/datastore_search', headers=UA, timeout=40,
                      params={'resource_id': 'e83f763b-b7d7-479e-b172-ae981ddc6de5', 'limit': 5000, 'filters': json.dumps({'CHAORD': 'D'})}).json()
    tz = ZoneInfo('Asia/Jerusalem'); out = []
    for r in js['result']['records']:
        if r['CHLOC1'] not in AP: continue
        sched = dt.datetime.fromisoformat(r['CHSTOL']).replace(tzinfo=tz); upd = dt.datetime.fromisoformat(r['CHPTOL']).replace(tzinfo=tz) if r['CHPTOL'] else sched
        fno = f"{r['CHOPER']}{int(r['CHFLTN']) if str(r['CHFLTN']).isdigit() else r['CHFLTN']}"
        out.append(_board_row('TLV', fno, r['CHLOC1'], r['CHLOC1T'] or r['CHLOC1D'], sched, upd, (r['CHRMINE'] or '').upper(), r['CHOPERD'],
                              'Israel Airports Authority board (data.gov.il open data)', now))
    log(f'TLV board: {len(out)} departures'); return out
def board_med(now, log):
    h = dict(UA, **{'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://www.tibahairports.com/en-EN/flight/departure-flights'})
    js = requests.get('https://www.tibahairports.com/Home/getCurrentFlights', params={'flightLeg': 'DEP'}, headers=h, timeout=40).json()
    tz = ZoneInfo('Asia/Riyadh'); out = []; p = lambda s: dt.datetime.strptime(s, '%d.%m.%Y %H:%M').replace(tzinfo=tz) if s else None
    for r in js['data']['flights']:
        dest = r['path']['destination']['destinationIata']
        if dest not in AP: continue
        sched = p(r['stad']); upd = p(r.get('atad')) or p(r.get('etad')) or sched
        out.append(_board_row('MED', f"{r['airlineIata']}{r['flightNumber']}", dest, r['path']['destination']['destinationEn'], sched, upd,
                              (r['remark']['remarkEn'] or '').upper(), r['airlineName'], 'Tibah Airports public departures board (MED)', now))
    log(f'MED board: {len(out)} departures'); return out
OS_FILE = os.path.join(DATA, 'opensky_state.json')
def opensky(now, log):
    """OpenSky anonymous 'departures by airport' for the previous UTC day (batch-processed overnight). Once per airport/day, retry at most every 3 h."""
    st = json.load(open(OS_FILE)) if os.path.exists(OS_FILE) else {}
    day = (now - dt.timedelta(days=1)).date(); b = int(dt.datetime.combine(day, dt.time(), UTC).timestamp()); out = []; cache = route_cache()
    for iata in ORIGINS:
        icao = AP[iata][5]; k = f'{iata}|{day}'; s = st.get(k, {})
        if s.get('ok') or (s.get('last_try') and now.timestamp() - s['last_try'] < 3 * 3600): continue
        s['last_try'] = now.timestamp(); st[k] = s
        try:
            r = requests.get('https://opensky-network.org/api/flights/departure', params={'airport': icao, 'begin': b, 'end': b + 86400}, headers=UA, timeout=40)
            s['http'] = r.status_code
            if r.status_code == 404: s['ok'] = True; s['n'] = 0; log(f'OpenSky {iata}: no departures for {day} (404)'); continue
            r.raise_for_status(); fl = r.json(); n = 0
            for f in fl:
                cs = (f.get('callsign') or '').strip(); dest = ICAO.get(f.get('estArrivalAirport') or '')
                rt = cache.get(cs)
                if not dest and rt and rt['origin']['iata_code'] == iata: dest = rt['destination']['iata_code']
                if not dest or dest not in AP or dest == iata or not cs: continue
                out.append(dict(callsign=cs, flight_iata=flight_iata(cs), origin=iata, dest=dest, dest_name='', d_lat=AP[dest][0], d_lon=AP[dest][1],
                                dep_utc=dt.datetime.fromtimestamp(f['firstSeen'], UTC), aircraft_type='', status='departed (OpenSky)',
                                source='OpenSky Network departures (ADS-B, previous day)', data_type='observed (ADS-B)')); n += 1
            s['ok'] = True; s['n'] = n; log(f'OpenSky {iata}: {len(fl)} departures for {day}, {n} usable')
        except Exception as e:
            s['err'] = f'{type(e).__name__}: {str(e)[:120]}'; log(f'OpenSky {iata}: failed ({s["err"]})')
        time.sleep(2)
    json.dump(st, open(OS_FILE, 'w'), indent=0, sort_keys=True); return out
def probe_boards(log):
    """JED and AMM airport websites: plain public GET only, to see whether they answer from this network. No bypass attempts; not parsed."""
    res = {}
    for name, url in [('JED kaia.sa', 'https://www.kaia.sa/'), ('AMM qaiairport.com', 'https://www.qaiairport.com/en/flights/departures')]:
        try: res[name] = requests.get(url, headers=UA, timeout=20).status_code
        except Exception as e: res[name] = type(e).__name__
    log(f'board probes: {res}'); return res
