#!/usr/bin/env python3
"""One collection run: pull every source, merge into daily shards data/flights/YYYY-MM-DD.csv (dedup by flight number + local departure date)."""
import os, sys, json, time, datetime as dt, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hfl, sources as S
def main():
    t0 = time.time(); now = dt.datetime.now(hfl.UTC); now_iso = now.isoformat(timespec='seconds'); logs = []
    log = lambda m: (logs.append(m), print(m, flush=True))
    raw = []; status = {}
    for name, fn in [('tlv_board', S.board_tlv), ('med_board', S.board_med), ('adsb', S.adsb), ('opensky', S.opensky)]:
        try: got = fn(now, log); raw += got; status[name] = {'ok': True, 'rows': len(got)}
        except Exception as e: status[name] = {'ok': False, 'error': f'{type(e).__name__}: {str(e)[:150]}'}; log(f'{name} failed: {e}')
    try: status['board_probes'] = S.probe_boards(log)
    except Exception as e: status['board_probes'] = str(e)
    built = []
    for f in raw:
        try: built.append(hfl.build(f, now_iso))
        except Exception as e: log(f'row failed {f.get("callsign")}: {type(e).__name__} {e}')
    dates = sorted({r['dep_date'] for r in built}); shards = {d: hfl.load_shard(d) for d in dates}
    allrows = {}
    for d in dates: allrows.update(shards[d])
    new = 0
    for r in built:
        k = (r['fkey'], r['dep_date']); new += k not in allrows; allrows[k] = hfl.merge(allrows.get(k), r)
    hfl.postprocess(allrows)
    for d in dates: hfl.save_shard(d, {k: v for k, v in allrows.items() if k[1] == d})
    hfl.save_ptimes()
    run = dict(ts_utc=now_iso, seconds=round(time.time() - t0, 1), raw_rows=len(raw), new_flights=new, sources=status, log=logs[-20:])
    os.makedirs(os.path.join(hfl.DATA, 'runs'), exist_ok=True)
    with open(os.path.join(hfl.DATA, 'runs', now.strftime('%Y-%m-%d') + '.jsonl'), 'a') as f: f.write(json.dumps(run, separators=(',', ':')) + '\n')
    print(f'done: {len(raw)} raw, {new} new, {time.time()-t0:.0f}s', flush=True)
if __name__ == '__main__': main()
