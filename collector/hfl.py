"""Haramain & Al-Aqsa flights: shared library (sources, geometry, prayer windows, shard store).
Only free, keyless, public endpoints; polite rate limits."""
import os, re, csv, json, math, time, threading, datetime as dt, concurrent.futures as cf
from zoneinfo import ZoneInfo
import requests
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF, DATA = os.path.join(ROOT, 'ref'), os.path.join(ROOT, 'data')
UA = {'User-Agent': 'haramain-flights-live/1.0 (+https://github.com/mrbugimposter3-ship-it/haramain-flights-live)'}
UTC = dt.timezone.utc
# ---------- reference data
AP, ICAO = {}, {}
for r in csv.DictReader(open(os.path.join(REF, 'airports.csv'), encoding='utf-8')):
    AP[r['iata']] = (float(r['lat']), float(r['lon']), r['municipality'], r['country'], r['name'], r['icao'])
    if r['icao']: ICAO.setdefault(r['icao'], r['iata'])
ICAO2IATA = json.load(open(os.path.join(REF, 'airlines_icao_iata.json')))
_C = list(csv.DictReader(open(os.path.join(REF, 'cities15000.csv'), encoding='utf-8')))
CITIES = [(c['name'], c['asciiname'], float(c['lat']), float(c['lon']), c['cc'], int(c['population'] or 0)) for c in _C]
ORIGINS = {'JED': ('Makkah', 'Jeddah KAIA (serves Makkah)', 'Makkah', 'Asia/Riyadh'),
           'MED': ('Madinah', 'Madinah Prince Mohammad bin Abdulaziz', 'Madinah', 'Asia/Riyadh'),
           'TLV': ('Al-Aqsa', 'Tel Aviv Ben Gurion (nearest major airport to Jerusalem)', 'Jerusalem', 'Asia/Jerusalem'),
           'AMM': ('Al-Aqsa', 'Amman Queen Alia (nearby gateway for Al-Aqsa)', 'Jerusalem', 'Asia/Amman')}
MOSQUE = {'Makkah': (21.4225, 39.8262, 'Masjid al-Haram'), 'Madinah': (24.4672, 39.6112, 'Masjid an-Nabawi'), 'Al-Aqsa': (31.7761, 35.2358, 'Al-Aqsa Mosque')}
PLACES = {'Makkah': (21.4225, 39.8262, 4, 'Asia/Riyadh', 'Umm al-Qura (Aladhan method 4)'),
          'Madinah': (24.4672, 39.6112, 4, 'Asia/Riyadh', 'Umm al-Qura (Aladhan method 4)'),
          'Jerusalem': (31.7761, 35.2358, 23, 'Asia/Jerusalem', 'Jordan Ministry of Awqaf (Aladhan method 23), at Al-Aqsa')}
PR = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']
METRO = {k: ('London', 'GB') for k in ['LHR', 'LGW', 'STN', 'LTN', 'LCY', 'SEN']}
SEATS = {'A320': 180, 'A20N': 186, 'A321': 220, 'A21N': 220, 'A319': 144, 'A332': 290, 'A333': 300, 'A339': 300, 'A359': 320, 'A35K': 360, 'A388': 500,
         'A343': 280, 'A346': 330, 'B738': 175, 'B38M': 175, 'B737': 140, 'B739': 180, 'B39M': 180, 'B752': 200, 'B763': 250, 'B772': 330, 'B77W': 380,
         'B77L': 320, 'B788': 250, 'B789': 290, 'B78X': 320, 'B744': 400, 'B748': 410, 'E190': 100, 'E195': 120, 'E75L': 76, 'E170': 72, 'A223': 140,
         'BCS3': 140, 'BCS1': 120, 'AT76': 70, 'AT75': 70, 'A310': 220, 'MD11': 290, 'B733': 140, 'B734': 160, 'B735': 120, 'CRJ9': 90, 'DH8D': 78}
def gc_km(a, b, c, d):
    p1, p2 = math.radians(a), math.radians(c); dl = math.radians(d - b)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(min(1, h)))
def bearing(a, b, c, d):
    p1, p2, dl = math.radians(a), math.radians(c), math.radians(d - b)
    return (math.degrees(math.atan2(math.sin(dl) * math.cos(p2), math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl))) + 360) % 360
_CITY = {}
def city_of(lat, lon, name=None):
    k = (round(lat, 3), round(lon, 3), name)
    if k in _CITY: return _CITY[k]
    cand = sorted(((gc_km(lat, lon, c[2], c[3]), c) for c in CITIES if abs(c[2] - lat) < 2 and abs(c[3] - lon) < 3), key=lambda x: x[0])[:300]
    if not cand: cand = sorted(((gc_km(lat, lon, c[2], c[3]), c) for c in CITIES), key=lambda x: x[0])[:5]
    res = None
    if name:
        nl = str(name).lower()
        ex = [c for d, c in cand if d < 80 and nl in (c[0].lower(), c[1].lower())]
        if not ex: ex = [c for d, c in cand if d < 80 and (c[1].lower() in nl or nl in c[1].lower())]
        if ex: c = max(ex, key=lambda c: c[5]); res = (c[0], c[4])
    if not res:
        near = [c for d, c in cand if d < 40]; c = max(near, key=lambda c: c[5]) if near else cand[0][1]; res = (c[0], c[4])
    _CITY[k] = res; return res
def dest_city(code, d_lat, d_lon, dest_name=''):
    if code in METRO: return METRO[code]
    hints = [h for h in [(dest_name or '').split(' - ')[0].strip().title(), AP.get(code, (0, 0, ''))[2]] if h]
    for h in hints:
        n = city_of(d_lat, d_lon, h)
        if h.lower() in n[0].lower() or n[0].lower() in h.lower(): return n
    return city_of(d_lat, d_lon, hints[-1] if hints else None)
def flight_iata(cs):
    m = re.fullmatch(r'([A-Z]{3})(\d{1,4})([A-Z]{0,2})', (cs or '').strip())
    if m and m.group(1) in ICAO2IATA: return ICAO2IATA[m.group(1)] + str(int(m.group(2))) + m.group(3)
    return None
# ---------- prayer times (cached in data/prayer_times.json)
PT_FILE = os.path.join(DATA, 'prayer_times.json'); _pt = json.load(open(PT_FILE)) if os.path.exists(PT_FILE) else {}; _ptl = threading.RLock()
def ptimes(place, date):
    k = f'{place}|{date.isoformat()}'
    with _ptl:
        if k not in _pt:
            la, lo, m, tz, _ = PLACES[place]
            for a in range(3):
                try:
                    t = requests.get(f'https://api.aladhan.com/v1/timings/{date:%d-%m-%Y}', params=dict(latitude=la, longitude=lo, method=m, timezonestring=tz), headers=UA, timeout=30).json()['data']['timings']; break
                except Exception:
                    time.sleep(3); t = None
            if t is None: raise RuntimeError('aladhan unavailable')
            z = ZoneInfo(tz); _pt[k] = {p: dt.datetime.combine(date, dt.time(*map(int, t[p][:5].split(':'))), z).isoformat() for p in PR}
        return {p: dt.datetime.fromisoformat(v) for p, v in _pt[k].items()}
def save_ptimes():
    with _ptl: json.dump(_pt, open(PT_FILE, 'w'), separators=(',', ':'), sort_keys=True)
def window(place, when):
    p = ptimes(place, when.astimezone(ZoneInfo(PLACES[place][3])).date())
    for k in PR:
        if when <= p[k]: return 'up to ' + k
    return 'after Isha'
# ---------- shard store
COLS = ['fkey', 'dep_date', 'callsign_icao', 'flight_iata', 'airline', 'origin', 'origin_label', 'holy_site', 'origin_city', 'o_lat', 'o_lon',
        'dest', 'dest_city', 'dest_country', 'd_lat', 'd_lon', 'dlat', 'dlon', 'km', 'dlat_mod27', 'dlon_mod27', 'km_mod27',
        'm_dlat', 'm_dlon', 'm_km', 'm_dlat_mod27', 'm_dlon_mod27', 'm_km_mod27', 'aircraft_type', 'seats_est', 'seats_basis',
        'sched_dep_local', 'dep_local', 'dep_utc', 'prayer_window', 'data_type', 'status', 'sources', 'first_seen_utc', 'last_seen_utc',
        'sightings', 'op_key', 'is_codeshare']
NUM = {'o_lat', 'o_lon', 'd_lat', 'd_lon', 'dlat', 'dlon', 'km', 'dlat_mod27', 'dlon_mod27', 'km_mod27', 'm_dlat', 'm_dlon', 'm_km', 'm_dlat_mod27', 'm_dlon_mod27', 'm_km_mod27'}
INT = {'seats_est', 'sightings', 'is_codeshare'}
SHARDS = os.path.join(DATA, 'flights')
def _conv(k, v):
    if v in ('', None): return None
    if k in NUM: return float(v)
    if k in INT: return int(float(v))
    return v
def load_shard(date):
    p = os.path.join(SHARDS, f'{date}.csv')
    if not os.path.exists(p): return {}
    return {(r['fkey'], r['dep_date']): {k: _conv(k, r.get(k)) for k in COLS} for r in csv.DictReader(open(p, encoding='utf-8'))}
def save_shard(date, rows):
    os.makedirs(SHARDS, exist_ok=True)
    with open(os.path.join(SHARDS, f'{date}.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, COLS, lineterminator='\n'); w.writeheader()
        for k in sorted(rows): w.writerow({c: ('' if rows[k][c] is None else rows[k][c]) for c in COLS})
def all_dates(): return sorted(f[:-4] for f in os.listdir(SHARDS) if f.endswith('.csv')) if os.path.isdir(SHARDS) else []
# ---------- row construction and merge
def build(f, now_iso):
    o = f['origin']; holy, label, place, tz = ORIGINS[o]; tzi = ZoneInfo(tz)
    o_lat, o_lon = AP[o][:2]; ml, mo, _ = MOSQUE[holy]
    dc = dest_city(f['dest'], f['d_lat'], f['d_lon'], f.get('dest_name') or '')
    oc = city_of(o_lat, o_lon, {'JED': 'Jeddah', 'MED': 'Medina', 'TLV': 'Tel Aviv', 'AMM': 'Amman'}[o])
    dlat, dlon = f['d_lat'] - o_lat, f['d_lon'] - o_lon; km = gc_km(o_lat, o_lon, f['d_lat'], f['d_lon'])
    mdl, mdo = f['d_lat'] - ml, f['d_lon'] - mo; mkm = gc_km(ml, mo, f['d_lat'], f['d_lon'])
    dep = f['dep_utc']; sched = f.get('sched_utc'); seats = SEATS.get(f.get('aircraft_type') or '')
    return dict(fkey=f.get('flight_iata') or f['callsign'], dep_date=dep.astimezone(tzi).date().isoformat(),
                callsign_icao=f['callsign'] if 'board' not in f['data_type'] else None, flight_iata=f.get('flight_iata'), airline=f.get('airline') or None,
                origin=o, origin_label=label, holy_site=holy, origin_city=oc[0], o_lat=o_lat, o_lon=o_lon, dest=f['dest'], dest_city=dc[0], dest_country=dc[1],
                d_lat=f['d_lat'], d_lon=f['d_lon'], dlat=round(dlat, 4), dlon=round(dlon, 4), km=round(km, 1),
                dlat_mod27=round(dlat % 27, 4), dlon_mod27=round(dlon % 27, 4), km_mod27=round(km % 27, 1),
                m_dlat=round(mdl, 4), m_dlon=round(mdo, 4), m_km=round(mkm, 1), m_dlat_mod27=round(mdl % 27, 4), m_dlon_mod27=round(mdo % 27, 4), m_km_mod27=round(mkm % 27, 1),
                aircraft_type=f.get('aircraft_type') or None, seats_est=seats, seats_basis='aircraft type (ADS-B)' if seats else None,
                sched_dep_local=sched.astimezone(tzi).strftime('%Y-%m-%d %H:%M') if sched else None, dep_local=dep.astimezone(tzi).strftime('%Y-%m-%d %H:%M'),
                dep_utc=dep.astimezone(UTC).strftime('%Y-%m-%d %H:%M'), prayer_window=window(place, dep), data_type=f['data_type'], status=f.get('status'),
                sources=f['source'], first_seen_utc=now_iso, last_seen_utc=now_iso, sightings=1,
                op_key=f"{o}|{f['dest']}|{sched.astimezone(UTC).strftime('%Y-%m-%dT%H:%M')}" if sched else None, is_codeshare=0)
def merge(old, r):
    if old is None: return r
    new = dict(old); new['last_seen_utc'] = r['last_seen_utc']; new['sightings'] = (old['sightings'] or 1) + 1
    srcs = set(filter(None, (old['sources'] or '').split(' | '))) | {r['sources']}; new['sources'] = ' | '.join(sorted(srcs)); allsrc = new['sources']
    if 'board' in r['data_type']:
        for k in ['dep_local', 'dep_utc', 'sched_dep_local', 'prayer_window', 'status', 'op_key', 'airline']:
            if r[k]: new[k] = r[k]
    else:
        for k in ['callsign_icao', 'aircraft_type', 'seats_est', 'seats_basis']:
            if r[k]: new[k] = r[k]
        if 'board' not in (old['sources'] or ''): new['prayer_window'] = r['prayer_window']
    a, b = old['data_type'], r['data_type']; adsb = 'ADS-B' in allsrc; board = 'board' in allsrc
    if 'cancel' in b: new['data_type'] = b
    elif adsb and board: new['data_type'] = 'observed (ADS-B + airport board)'
    elif adsb: new['data_type'] = a if a.startswith('observed') and 'ADS-B' in a else b
    elif 'departed' in a and 'scheduled' in b: new['data_type'] = a
    else: new['data_type'] = b
    # keep shards stable: if nothing but the 'seen' counters changed, keep the old row (less git churn)
    if all(new[k] == old[k] for k in new if k not in ('last_seen_utc', 'sightings')): return old
    return new
def postprocess(rows):
    seen = {}
    for k in sorted(rows, key=lambda k: (rows[k]['first_seen_utc'] or '', k)):
        r = rows[k]; r['is_codeshare'] = 0
        if r['op_key']:
            if r['op_key'] in seen and seen[r['op_key']] != r['fkey']: r['is_codeshare'] = 1
            else: seen[r['op_key']] = r['fkey']
    types = {r['fkey']: r['seats_est'] for r in rows.values() if r['seats_basis'] == 'aircraft type (ADS-B)'}
    for r in rows.values():
        if not r['seats_est'] and r['fkey'] in types: r['seats_est'] = types[r['fkey']]; r['seats_basis'] = 'type seen by ADS-B on same flight number (other day)'
