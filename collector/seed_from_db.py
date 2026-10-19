"""One-off: import the box collector's live.db (table flights2) into data/flights shards."""
import sys, os, sqlite3, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import hfl
c = sqlite3.connect(sys.argv[1]); c.row_factory = sqlite3.Row
by = collections.defaultdict(dict)
for r in c.execute('SELECT * FROM flights2'):
    r = dict(r); row = {k: r.get(k) for k in hfl.COLS}; by[row['dep_date']][(row['fkey'], row['dep_date'])] = row
for d, rows in by.items():
    cur = hfl.load_shard(d)
    for k, v in rows.items(): cur[k] = hfl.merge(cur.get(k), v) if k in cur else v
    hfl.save_shard(d, cur)
print({d: len(v) for d, v in sorted(by.items())})
