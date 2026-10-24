#!/usr/bin/env python3
"""Build the static site's data: site/data/flights.json (recent window), meta.json (totals, runs, sources), prayer.json."""
import os, sys, json, collections, datetime as dt
from zoneinfo import ZoneInfo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import hfl
OUT = os.path.join(hfl.ROOT, 'site', 'data'); os.makedirs(OUT, exist_ok=True)
KEEP = ['fkey', 'dep_date', 'callsign_icao', 'airline', 'origin', 'holy_site', 'o_lat', 'o_lon', 'dest', 'dest_city', 'dest_country', 'd_lat', 'd_lon',
        'dlat', 'dlon', 'km', 'dlat_mod27', 'dlon_mod27', 'km_mod27', 'm_dlat', 'm_dlon', 'm_km', 'm_dlat_mod27', 'm_dlon_mod27', 'm_km_mod27',
        'aircraft_type', 'seats_est', 'seats_basis', 'sched_dep_local', 'dep_local', 'dep_utc', 'prayer_window', 'data_type', 'status', 'sources',
        'first_seen_utc', 'last_seen_utc', 'sightings', 'is_codeshare']
def kind(r):
    t = r['data_type'] or ''
    return 'observed' if t.startswith('observed') else 'scheduled' if t.startswith('scheduled') else 'cancelled'
def main():
    now = dt.datetime.now(hfl.UTC); today = now.astimezone(ZoneInfo('Asia/Riyadh')).date()
    lo, hi = (today - dt.timedelta(days=21)).isoformat(), (today + dt.timedelta(days=8)).isoformat()
    rows, totals, per_day = [], collections.Counter(), collections.defaultdict(collections.Counter)
    for d in hfl.all_dates():
        for r in hfl.load_shard(d).values():
            if not r['is_codeshare']:
                totals[kind(r)] += 1; per_day[d][f"{r['holy_site']}|{kind(r)}"] += 1
            if lo <= d <= hi: rows.append([r[k] for k in KEEP])
    # Per-day counts of floor(m_dlat_mod27) and floor(m_km_mod27) over ALL stored shards (codeshares and cancellations excluded, like the daily card),
    # so the site can take the month / Hijri month / season modes in the browser without shipping every flight: site/data/daycounts.json
    dc = {}
    for d in hfl.all_dates():
        if d < '2026-10-17': continue   # collection started 2026-10-17; older shards are strays
        A, K, n = collections.Counter(), collections.Counter(), 0
        for r in hfl.load_shard(d).values():
            if r['is_codeshare'] or kind(r) == 'cancelled': continue
            try: a, k = int(float(r['m_dlat_mod27']) // 1), int(float(r['m_km_mod27']) // 1)
            except (TypeError, ValueError): continue
            A[a] += 1; K[k] += 1; n += 1
        if n: dc[d] = {'n': n, 'a': dict(A), 'k': dict(K)}
    json.dump({'generated_utc': now.isoformat(timespec='seconds'), 'tz': 'Asia/Riyadh', 'days': dc}, open(os.path.join(OUT, 'daycounts.json'), 'w'), separators=(',', ':'))
    rows.sort(key=lambda x: (x[1], x[30] or ''))
    json.dump({'cols': KEEP, 'rows': rows}, open(os.path.join(OUT, 'flights.json'), 'w'), separators=(',', ':'), default=str)
    prayer = {}
    for place in hfl.PLACES:
        tz = ZoneInfo(hfl.PLACES[place][3]); d0 = now.astimezone(tz).date()
        prayer[place] = {'tz': hfl.PLACES[place][3], 'method': hfl.PLACES[place][4],
                         'days': {(d0 + dt.timedelta(n)).isoformat(): {k: v.isoformat() for k, v in hfl.ptimes(place, d0 + dt.timedelta(n)).items()} for n in range(-2, 9)}}
    hfl.save_ptimes(); json.dump(prayer, open(os.path.join(OUT, 'prayer.json'), 'w'), separators=(',', ':'))
    rd = os.path.join(hfl.DATA, 'runs'); files = sorted(os.listdir(rd)) if os.path.isdir(rd) else []
    runs = [json.loads(l) for f in files[-2:] for l in open(os.path.join(rd, f)) if l.strip()]
    first_run = json.loads(open(os.path.join(rd, files[0])).readline())['ts_utc'] if files else None
    meta = dict(generated_utc=now.isoformat(timespec='seconds'), last_run=runs[-1] if runs else None, recent_runs=[{k: r[k] for k in ('ts_utc', 'seconds', 'raw_rows', 'new_flights')} for r in runs[-20:]],
                first_collection_utc='2026-10-17T13:19:00+00:00', github_collection_since=first_run, totals=dict(totals), target=10000,
                per_day={d: dict(c) for d, c in sorted(per_day.items())}, window=[lo, hi], origins={k: {'site': v[0], 'label': v[1]} for k, v in hfl.ORIGINS.items()},
                mosques={k: v[:2] for k, v in hfl.MOSQUE.items()})
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), separators=(',', ':'), default=str)
    # Recitation data (data/recitations.json, data/last_recited.json) is written by a separate daily job; it is only copied here, never edited or deleted.
    for name in ('recitations.json', 'last_recited.json'):
        src = os.path.join(hfl.DATA, name)
        if os.path.exists(src):
            try: json.dump(json.load(open(src, encoding='utf-8')), open(os.path.join(OUT, name), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
            except Exception as e: print(name, 'not copied:', e)
    print('built', len(rows), 'rows;', dict(totals))
if __name__ == '__main__': main()
