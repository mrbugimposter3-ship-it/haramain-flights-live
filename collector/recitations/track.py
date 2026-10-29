#!/usr/bin/env python3
"""Recited ayat per prayer (Makkah, Madinah, optional Al-Aqsa) -> data/recitations.json + data/last_recited.json.

Runs on GitHub's servers from .github/workflows/recitations.yml with no AI agent: yt-dlp lists and downloads each
prayer's public YouTube recording, transcribe.py runs the tarteel-ai/whisper-base-ar-quran speech model on CPU, and
qmatch.py matches the text to ayat by letters. Adapted from HelpOutBoran-Videos' box tracker
(/workspace/haramain_data/track_all_prayers.py); output schema is unchanged.

The done-list (data/recitations_done.json, keyed by video id) is committed so a video is never transcribed twice.
This script never runs git; the workflow commits. Output files are only rewritten when their content changes
(ignoring updated_utc). Audio is downloaded to a temp dir and deleted right after.

Usage: track.py [--days 3] [--max-videos 6] [--with-aqsa] [--export-only]
       track.py --reprocess VIDEO_ID --out-dir DIR   (scratch test: download + transcribe one video, touches nothing in data/)"""
import os, re, sys, json, time, shutil, tempfile, subprocess, datetime, argparse
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE); import qmatch
DONE = f'{ROOT}/data/recitations_done.json'
PY = sys.executable; YTDLP = [sys.executable, '-m', 'yt_dlp']
MIN_CONF = 60
SOURCES = [
    dict(key='haramain', url='https://www.youtube.com/@haramain_recordings/videos', n=60),
    # Al Quds Al Salam: daily Al-Aqsa prayer streams. Opt-in (--with-aqsa): far-field audio, mostly low confidence, 10-45 min CPU each.
    dict(key='aqsa', url='https://www.youtube.com/channel/UCNt-JieowDFWRJkp2D-RTlA/streams', n=25, optin=True),
]
MOSQUE_NAME = dict(makkah='Masjid al-Haram', madinah='Masjid an-Nabawi', aqsa='Al-Masjid al-Aqsa')
ORDER = dict(fajr=0, dhuhr=1, jumuah=1, asr=2, maghrib=3, isha=4, taraweeh=5, tahajjud=6)
SILENT = {'dhuhr', 'asr'}
MON = {m: i for i, m in enumerate('jan feb mar apr may jun jul aug sep oct nov dec'.split(), 1)}
BLOCKED = re.compile(r"confirm you.?re not a bot|sign in to confirm|HTTP Error 403|HTTP Error 429|Forbidden|not available on this app|po.?token", re.I)
def now_utc(): return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def load(p, d):
    try: return json.load(open(p, encoding='utf-8'))
    except Exception: return d
def save(p, o):
    json.dump(o, open(p + '.tmp', 'w', encoding='utf-8'), ensure_ascii=False, indent=1); open(p + '.tmp', 'a').write('\n'); os.replace(p + '.tmp', p)

def ytdlp_base():
    # yt-dlp needs a JavaScript runtime for YouTube; GitHub runners ship node (deno is used when present)
    js = ['--js-runtimes', 'deno'] if shutil.which('deno') else (['--js-runtimes', 'node'] if shutil.which('node') else [])
    return YTDLP + js

def parse(src, title, dur):
    """-> dict(mosque, prayer, date, imam) or None (skip)."""
    t = title.strip()
    if src == 'haramain':
        m = re.match(r"(\d+)\w*\s+([A-Za-z]{3})\w*\s+(\d{4})\s+(Makkah|Makka|Madeenah|Madinah|Madina)\w*\s+(.*)", t, re.I)
        if not m: return None
        rest = m[5]
        if re.search(r"adhaa?n|azaan|iqaamah|khutbah|khutba|du'?aa?\b|dua\b|janaazah|janazah|lecture|dars", rest, re.I) and not re.search(r"salaah|salah", rest, re.I): return None
        pm = re.match(r"['’‘`]?(fajr|dhuhr|zuhr|asr|maghrib|isha|jumu\S*|taraaweeh|taraweeh|tahajjud|qiyaam\S*)\s*(.*)", rest, re.I)
        if not pm: return None
        p = pm[1].lower(); p = {'zuhr': 'dhuhr', 'taraaweeh': 'taraweeh'}.get(p, p)
        if p.startswith('jumu'): p = 'jumuah'
        if p.startswith('qiyaam'): p = 'tahajjud'
        imam = re.sub(r"^(salaah|salah)\s*", '', pm[2], flags=re.I).strip() or None
        try: d = datetime.date(int(m[3]), MON[m[2].lower()], int(m[1]))
        except (KeyError, ValueError): return None
        mosque = 'makkah' if m[4].lower().startswith('mak') else 'madinah'
    else:
        m = re.search(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", t)
        if not m or 'صلاة' not in t: return None
        P = [('الفجر', 'fajr'), ('الظهر', 'dhuhr'), ('العصر', 'asr'), ('المغرب', 'maghrib'), ('التراويح', 'taraweeh'), ('العشاء', 'isha'), ('الجمعة', 'jumuah'), ('التهجد', 'tahajjud'), ('القيام', 'tahajjud')]
        p = next((v for k, v in P if 'صلاة ' + k in t or 'صلاة' + k in t or (k in t and v in ('taraweeh', 'jumuah'))), None)
        if not p or re.search(r'عيد|الجنازة|جنازة', t): return None
        try: d = datetime.date(int(m[3]), int(m[2]), int(m[1]))
        except ValueError: return None
        mosque = 'aqsa'; imam = None
    if p not in SILENT and dur and dur < 300: return None   # short clip
    return dict(mosque=mosque, prayer=p, date=d.isoformat(), imam=imam)

def listing(src, days):
    today = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=3)).date()   # Makkah time
    r = None
    for attempt in range(3):
        r = subprocess.run(ytdlp_base() + ['--flat-playlist', '--playlist-end', str(src['n']), '--print', '%(id)s\t%(duration)s\t%(live_status)s\t%(title)s', src['url']],
                           capture_output=True, text=True, timeout=300)
        if r.stdout.strip(): break
        log(f"  listing {src['key']} attempt {attempt + 1} empty: {r.stderr.strip()[-300:]}"); time.sleep(10 * (attempt + 1))
    out = []
    for line in r.stdout.splitlines():
        vid, dur, live, title = (line.split('\t', 3) + ['', '', ''])[:4]
        if live in ('is_live', 'is_upcoming', 'post_live'): continue
        info = parse(src['key'], title, float(dur) if dur not in ('NA', '', 'None') else 0)
        if not info or (today - datetime.date.fromisoformat(info['date'])).days > days: continue
        out.append(dict(video=vid, title=title, duration=dur, source=src['key'], **info))
    log(f"  listing {src['key']}: {len(r.stdout.splitlines())} uploads, {len(out)} prayers in window")
    return out

HARAMAIN_FEED = 'https://www.blogger.com/feeds/2770201362269837489/posts/default?alt=json&max-results=150'   # haramain.info (same Haramain Recordings team)
_MIRROR = None
def mirror_map():
    """{youtube_id: mp3_url} from haramain.info's public Blogger feed. Each post embeds the YouTube video and links the same
    recording as a 128 kbps MP3 on mirrors.quranicaudio.com, which (unlike YouTube) does not block GitHub's servers."""
    global _MIRROR
    if _MIRROR is None:
        _MIRROR = {}
        import urllib.request
        for attempt in range(3):
            try:
                req = urllib.request.Request(HARAMAIN_FEED, headers={'User-Agent': 'haramain-flights-live recitations (+github actions)'})
                feed = json.load(urllib.request.urlopen(req, timeout=60))
                for e in feed.get('feed', {}).get('entry', []):
                    html = e.get('content', {}).get('$t', '')
                    yt = re.search(r'youtube\.com/embed/([\w-]{11})', html); mp3 = re.search(r'(https?://[^"\'\s<>]+\.mp3)', html)
                    if yt and mp3: _MIRROR[yt[1]] = mp3[1]
                break
            except Exception as ex:
                log(f'  haramain.info feed attempt {attempt + 1} failed: {ex}'); time.sleep(10)
        log(f'  haramain.info feed: {len(_MIRROR)} recordings with an MP3 mirror')
    return _MIRROR

def download_mirror(vid, tmp):
    url = mirror_map().get(vid)
    if not url: return None
    import urllib.request
    dst = os.path.join(tmp, 'a.mp3')
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'haramain-flights-live recitations (+github actions)'})
            with urllib.request.urlopen(req, timeout=300) as r, open(dst, 'wb') as fh: shutil.copyfileobj(r, fh)
            if os.path.getsize(dst) > 100000: return dst
        except Exception as ex:
            log(f'  mirror download attempt {attempt + 1} failed: {ex}'); time.sleep(10 * (attempt + 1))
    return None

YOUTUBE_BLOCKED = False
def download(vid, tmp):
    """haramain.info MP3 mirror first (works from GitHub's servers). Otherwise YouTube: DASH audio first, then HLS audio-only 233/234 (the box tracker's 403 fallback), then the same via the
    web_safari client (serves HLS). Two rounds with a pause. Returns (path, format_label)."""
    attempts = [('dash', ['-f', 'bestaudio[abr<=80]/bestaudio/worstaudio']),
                ('hls', ['-f', '233/234/bestaudio[protocol^=m3u8]']),
                ('hls-safari', ['-f', '233/234/bestaudio[protocol^=m3u8]/bestaudio', '--extractor-args', 'youtube:player_client=web_safari'])]
    global YOUTUBE_BLOCKED
    a = download_mirror(vid, tmp)
    if a: return a, 'haramain.info-mp3'
    if YOUTUBE_BLOCKED: raise RuntimeError('download failed: not on the haramain.info MP3 mirror yet, and YouTube is blocking this runner')
    errs = []
    for rnd in range(2):
        for label, fmt in attempts:
            for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
            try:
                subprocess.run(ytdlp_base() + ['-q', '--no-progress', '--no-playlist', '--retries', '5', '--fragment-retries', '10', '--extractor-retries', '3',
                                               *fmt, '-o', f'{tmp}/a.%(ext)s', '--', vid], check=True, timeout=1800, capture_output=True, text=True)
                files = [f for f in os.listdir(tmp) if not f.endswith('.part')]
                if files: return os.path.join(tmp, files[0]), label
                errs.append(f'{label}: no file')
            except subprocess.CalledProcessError as ex:
                e = (ex.stderr or '').strip().splitlines(); e = e[-1] if e else f'exit {ex.returncode}'
                errs.append(f'{label}: {e}'); log(f'  download {label} failed: {e[:200]}')
            except subprocess.TimeoutExpired:
                errs.append(f'{label}: timeout'); log(f'  download {label} timed out')
        if all(BLOCKED.search(e) for e in errs): break   # bot wall: retrying from the same IP does not help
        if rnd == 0: time.sleep(20)
    if errs and all(BLOCKED.search(e) for e in errs): YOUTUBE_BLOCKED = True
    raise RuntimeError('download failed (not on the haramain.info MP3 mirror yet; YouTube: ' + ' | '.join(errs[-3:]) + ')')

def identify(vid, title, ident_dir):
    """Return (ident dict, download format); reuses an ident file in ident_dir, otherwise downloads + transcribes."""
    p = f'{ident_dir}/ident_{vid}.json'
    d = load(p, {})
    if d.get('windows'): return d, 'cached'
    tmp = tempfile.mkdtemp(prefix='recit_')
    try:
        t0 = time.time(); a, fmt = download(vid, tmp); dl = round(time.time() - t0)
        log(f'  downloaded via {fmt} in {dl}s ({os.path.getsize(a) / 1e6:.1f} MB)')
        t1 = time.time()
        r = subprocess.run([PY, f'{HERE}/transcribe.py', vid, a, title, ident_dir], timeout=7200, capture_output=True, text=True,
                           env=dict(os.environ, TOKENIZERS_PARALLELISM='false'))
        if r.returncode: raise RuntimeError('transcribe failed: ' + (r.stderr.strip().splitlines() or ['?'])[-1][:250])
        log(f'  transcribed in {round(time.time() - t1)}s ({r.stdout.strip()})')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)   # audio never kept
    return load(p, {}), fmt

def analyse(ident):
    W = [dict(t=w['t'], m=qmatch.match(w.get('text', ''))) for w in ident['windows']]
    rk, conf = qmatch.summarize(qmatch.segment(W))
    kept = [r for r in rk if r['confidence'] >= MIN_CONF]
    return kept, (round(sum(r['confidence'] for r in kept) / len(kept)) if kept else conf)

def entry(rec):
    e = dict(mosque=rec['mosque'], mosque_name=MOSQUE_NAME[rec['mosque']], prayer=rec['prayer'], date=rec['date'], imam=rec.get('imam'))
    if rec.get('silent'):
        e.update(silent=True, note='Recited silently; no ayat to show.')
    else:
        R = rec['rakahs']; f = R[0]
        same = [r for r in R if r['surah'] == f['surah']]
        e.update(surah=f['surah'], surah_name=f['surah_name'], ayah_from=min(r['ayah_from'] for r in same), ayah_to=max(r['ayah_to'] for r in same),
                 rakahs=[{k: r[k] for k in ('rakah', 'surah', 'surah_name', 'ayah_from', 'ayah_to', 'ref')} for r in R],
                 summary=' · '.join(r['ref'] for r in R), confidence=rec['confidence'])
    e.update(source_video=f"https://www.youtube.com/watch?v={rec['video']}", source_title=rec['title'], identified_utc=rec.get('identified_utc'))
    return e

def export(done, out_dir):
    """Write recitations.json + last_recited.json into out_dir if their content (ignoring updated_utc) changed. Returns True if written."""
    best = {}
    for rec in done.values():
        if rec.get('status') not in ('ok', 'silent'): continue
        k = (rec['mosque'], rec['prayer'])
        if k not in best or (rec['date'], rec.get('identified_utc') or '') > (best[k]['date'], best[k].get('identified_utc') or ''): best[k] = rec
    now = now_utc()
    mosques = {m: {} for m in ('makkah', 'madinah', 'aqsa')}
    for (m, p), rec in sorted(best.items(), key=lambda kv: ORDER.get(kv[0][1], 9)): mosques[m][p] = entry(rec)
    rec_out = dict(schema_version=1, updated_utc=now,
        note=('Ayat identified privately from each prayer\'s YouTube recording (Haramain Recordings for Makkah/Madinah, Al Quds Al Salam for Al-Aqsa) '
              'with a Quran ASR model; not a live feed. Each prayer holds its latest identified recitation. Dhuhr and Asr are silent. '
              f'Entries below confidence {MIN_CONF} are left out; a missing prayer means no data yet.'),
        sources=dict(makkah='https://www.youtube.com/@haramain_recordings', madinah='https://www.youtube.com/@haramain_recordings',
                     aqsa='https://www.youtube.com/channel/UCNt-JieowDFWRJkp2D-RTlA'),
        mosques=mosques)
    loud = [e for m in mosques.values() for e in m.values() if not e.get('silent')]
    key = lambda e: (e['date'], ORDER.get(e['prayer'], 9))
    last_m = {}
    for e in loud:
        if e['mosque'] not in last_m or key(e) > key(last_m[e['mosque']]): last_m[e['mosque']] = e
    compat = lambda e: {**{k: v for k, v in e.items() if k not in ('rakahs', 'summary')}, 'prayer': e['prayer'].capitalize(), 'rakahs': [r['ref'] for r in e['rakahs']]}
    last_out = dict(updated_utc=now, note='Latest identified recitation per mosque (any prayer). Full per-prayer data: data/recitations.json.',
                    latest=compat(max(loud, key=key)) if loud else None, mosques={m: compat(e) for m, e in last_m.items()})
    os.makedirs(out_dir, exist_ok=True)
    strip = lambda o: json.dumps({k: v for k, v in o.items() if k != 'updated_utc'}, sort_keys=True, ensure_ascii=False)
    changed = False
    for name, obj in (('recitations.json', rec_out), ('last_recited.json', last_out)):
        p = f'{out_dir}/{name}'
        if strip(load(p, {})) != strip(obj):
            with open(p, 'w', encoding='utf-8') as fh: json.dump(obj, fh, ensure_ascii=False, indent=2); fh.write('\n')
            changed = True
    log('export:', 'files updated' if changed else 'unchanged')
    return changed

def gh_output(**kv):
    p = os.environ.get('GITHUB_OUTPUT')
    if p:
        with open(p, 'a') as fh:
            for k, v in kv.items(): fh.write(f'{k}={v}\n')

def reprocess(vid, out_dir):
    """Scratch test: download + transcribe + match one video into out_dir. Never touches data/."""
    os.makedirs(out_dir, exist_ok=True)
    title = ''
    r = subprocess.run(ytdlp_base() + ['--skip-download', '--print', '%(title)s\t%(duration)s', '--', vid], capture_output=True, text=True, timeout=300)
    if r.stdout.strip(): title = r.stdout.strip().split('\t')[0]
    info = parse('haramain', title, 900) or {}
    t0 = time.time(); ident, fmt = identify(vid, title, out_dir)
    rk, conf = analyse(ident)
    res = dict(video=vid, title=title, **info, download_format=fmt, seconds=round(time.time() - t0), windows=len(ident.get('windows', [])),
               status='ok' if rk else 'low_confidence', rakahs=rk, confidence=conf, identified_utc=now_utc())
    save(f'{out_dir}/reprocess_{vid}.json', res)
    log('reprocess result:', json.dumps({k: v for k, v in res.items() if k != 'rakahs'}, ensure_ascii=False), [r['ref'] for r in rk])
    gh_output(changed='false', processed=1, ok=int(bool(rk)), errors=0)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--days', type=int, default=3); ap.add_argument('--max-videos', type=int, default=4)
    ap.add_argument('--time-budget', type=float, default=32, help='minutes: no new transcription starts after this (GitHub runners take ~5-10 min per prayer)')
    ap.add_argument('--export-only', action='store_true'); ap.add_argument('--with-aqsa', action='store_true')
    ap.add_argument('--reprocess', default=''); ap.add_argument('--out-dir', default=f'{ROOT}/data')
    ap.add_argument('--ident-dir', default=os.environ.get('RUNNER_TEMP') or tempfile.gettempdir()); a = ap.parse_args()
    if a.reprocess: return reprocess(a.reprocess.strip(), a.out_dir)
    T0 = time.time(); done = load(DONE, {})
    processed = ok = errors = 0
    if not a.export_only:
        items = []
        for s in SOURCES:
            if s.get('optin') and not a.with_aqsa: continue
            try: items += listing(s, a.days)
            except Exception as ex: log('listing failed', s['key'], ex)
        for it in items:
            if it['video'] not in done: done[it['video']] = dict(it, status='pending', listed_utc=now_utc())
        save(DONE, done)
        optin = set() if a.with_aqsa else {x['key'] for x in SOURCES if x.get('optin')}
        todo = sorted([r for r in done.values() if r['status'] == 'pending' and r.get('source') not in optin],
                      key=lambda r: (r['date'], ORDER.get(r['prayer'], 9)), reverse=True)
        log(f'{len(todo)} pending (max {a.max_videos} transcriptions this run)')
        for rec in todo:
            if rec['prayer'] in SILENT:
                rec.update(status='silent', silent=True); save(DONE, done); continue
            if processed >= a.max_videos: break
            if (time.time() - T0) / 60 > a.time_budget: log(f'time budget of {a.time_budget:.0f} min reached; the rest waits for the next run'); break
            rec.setdefault('listed_utc', now_utc())
            t0 = time.time(); log('identify', rec['video'], rec['title'])
            processed += 1
            try:
                ident, fmt = identify(rec['video'], rec['title'], a.ident_dir)
                rk, conf = analyse(ident)
                rec.update(rakahs=rk, confidence=conf, seconds=round(time.time() - t0), identified_utc=now_utc(),
                           status='ok' if rk else 'low_confidence', runner='github-actions', download_format=fmt)
                rec.pop('last_error', None); ok += bool(rk)
                log(' ->', rec['status'], [r['ref'] for r in rk], conf, f"{rec['seconds']}s")
            except Exception as ex:
                errors += 1
                rec['errors'] = rec.get('errors', 0) + 1; rec['last_error'] = str(ex)[:300]
                # the MP3 mirror can lag the YouTube upload by some hours: only give up after 3 failures AND 24 h
                age_h = (time.time() - datetime.datetime.strptime(rec.get('listed_utc', '2000-01-01T00:00:00Z'), '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc).timestamp()) / 3600
                if rec['errors'] >= 3 and age_h >= 24: rec['status'] = 'error'
                processed -= 'download failed' in str(ex)   # a download that never started costs no CPU time
                log(' !! failed', str(ex)[:300])
            save(DONE, done)
    changed = export(done, a.out_dir)
    gh_output(changed=str(changed).lower(), processed=processed, ok=ok, errors=errors)
    log(f'done: processed {processed}, ok {ok}, errors {errors}, recitation files changed: {changed}')

if __name__ == '__main__': main()
