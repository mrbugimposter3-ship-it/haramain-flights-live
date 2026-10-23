"""Build site/quran/NNN.json (one file per surah) for the "Today's ayah & outfit" card.
Text is fetched from api.alquran.cloud, never typed by hand:
  Arabic: quran-uthmani (Tanzil Uthmani)   English: en.pickthall (Marmaduke Pickthall, 1930, public domain)
alquran.cloud prepends the basmala to ayah 1 of every surah except 1 and 9; it is not part of that ayah, so it is
removed here (only that exact leading prefix, taken from 1:1 itself). Run: python3 collector/gen_ayah_data.py"""
import json, os, urllib.request
OUT = os.path.join(os.path.dirname(__file__), '..', 'site', 'quran')
def get(ed):
    with urllib.request.urlopen(f'https://api.alquran.cloud/v1/quran/{ed}', timeout=180) as r:
        return json.load(r)['data']['surahs']
ar, en = get('quran-uthmani'), get('en.pickthall')
basm = ar[0]['ayahs'][0]['text'].lstrip('\ufeff')
os.makedirs(OUT, exist_ok=True)
idx = []
for sa, se in zip(ar, en):
    n = sa['number']; A = [a['text'].lstrip('\ufeff') for a in sa['ayahs']]; E = [a['text'] for a in se['ayahs']]
    assert len(A) == len(E) and n == se['number']
    if n not in (1, 9) and A[0].startswith(basm):
        A[0] = A[0][len(basm):].strip()
    json.dump({'s': n, 'name': sa['name'], 'en_name': sa['englishName'], 'ar': A, 'en': E,
               'src': 'api.alquran.cloud quran-uthmani + en.pickthall'}, open(os.path.join(OUT, f'{n:03d}.json'), 'w'),
              ensure_ascii=False, separators=(',', ':'))
    idx.append(len(A))
assert sum(idx) == 6236
json.dump({'ayahs': idx}, open(os.path.join(OUT, 'index.json'), 'w'), separators=(',', ':'))
print('ok', sum(idx))
