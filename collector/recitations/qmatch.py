"""Span-aware char-trigram matcher + rakah segmenter for Whisper windows (private identification only)."""
import os, json, re, collections
NAMES = "Al-Fatihah Al-Baqarah Aal-Imran An-Nisa Al-Maidah Al-Anam Al-Araf Al-Anfal At-Tawbah Yunus Hud Yusuf Ar-Rad Ibrahim Al-Hijr An-Nahl Al-Isra Al-Kahf Maryam Ta-Ha Al-Anbiya Al-Hajj Al-Muminun An-Nur Al-Furqan Ash-Shuara An-Naml Al-Qasas Al-Ankabut Ar-Rum Luqman As-Sajdah Al-Ahzab Saba Fatir Ya-Sin As-Saffat Sad Az-Zumar Ghafir Fussilat Ash-Shura Az-Zukhruf Ad-Dukhan Al-Jathiyah Al-Ahqaf Muhammad Al-Fath Al-Hujurat Qaf Adh-Dhariyat At-Tur An-Najm Al-Qamar Ar-Rahman Al-Waqiah Al-Hadid Al-Mujadilah Al-Hashr Al-Mumtahanah As-Saff Al-Jumuah Al-Munafiqun At-Taghabun At-Talaq At-Tahrim Al-Mulk Al-Qalam Al-Haqqah Al-Maarij Nuh Al-Jinn Al-Muzzammil Al-Muddaththir Al-Qiyamah Al-Insan Al-Mursalat An-Naba An-Naziat Abasa At-Takwir Al-Infitar Al-Mutaffifin Al-Inshiqaq Al-Buruj At-Tariq Al-Ala Al-Ghashiyah Al-Fajr Al-Balad Ash-Shams Al-Layl Ad-Duha Ash-Sharh At-Tin Al-Alaq Al-Qadr Al-Bayyinah Az-Zalzalah Al-Adiyat Al-Qariah At-Takathur Al-Asr Al-Humazah Al-Fil Quraysh Al-Maun Al-Kawthar Al-Kafirun An-Nasr Al-Masad Al-Ikhlas Al-Falaq An-Nas".split()
def nz(s):
    s = re.sub('[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]', '', s)
    for a, b in (('ٱ','ا'),('أ','ا'),('إ','ا'),('آ','ا'),('ى','ي'),('ة','ه'),('ؤ','و'),('ئ','ي'),('ء','')): s = s.replace(a, b)
    return re.sub('[^\u0621-\u064A]', '', s)
Q = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'quran_text.json'), encoding='utf-8'))
BAS = nz('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ')
idx = collections.defaultdict(set); refs = []; pos = {}; grams = []; NA = {}
for s, L in Q.items():
    s = int(s); NA[s] = len(L)
    for i, t in enumerate(L):
        n = nz(t)
        if i == 0 and s not in (1, 9) and n.startswith(BAS): n = n[len(BAS):]
        k = len(refs); refs.append((s, i+1)); pos[(s, i+1)] = k
        G = {n[j:j+3] for j in range(len(n)-2)}; grams.append(G)
        for x in G: idx[x].add(k)
NOISE = {nz(w) for w in ['لااله الاالله','لاالهالاالله','لاحولولاقوهالابالله','اشهدانمحمدارسولالله','محمدارسولالله','ورحمهالله','السلامعليكم','اللهالاكبر','اللهاكبر','سمعاللهلمنحمده','ربناولكالحمد','السلامعليكمورحمهالله','اشهدانلااللهالاالله','حيعليالصلاه','حيعليالفلاح','قدقامتالصلاه','استووا','امين']}
def match(text):
    """Best (score, surah, a_from, a_to) for one window, or None. score = % of hypothesis trigrams found in the span."""
    h = nz(re.sub(r'<\|[^|]*\|>', '', text))
    h = re.sub(r'(?:الله)*(?:ال)?[اع]كب[ار]+(?:الله)*', '', h)   # takbir incl. ASR variants and trailing/leading 'الله'
    for w in NOISE: h = h.replace(w, '')
    g = {h[j:j+3] for j in range(len(h)-2)}
    if len(g) < 8: return None
    sc = collections.Counter()
    for x in g:
        if len(idx[x]) < 800:
            for k in idx[x]: sc[k] += 1
    best = None
    for k, _ in sc.most_common(25):
        s, a = refs[k]
        for lo in range(max(1, a-3), a+1):
            for hi in range(a, min(NA[s], lo+4)+1):
                U = set().union(*(grams[pos[(s, x)]] for x in range(lo, hi+1)))
                v = 100*len(g & U)/len(g) - 8*(hi-lo)   # penalty per extra ayah (prevents chance-gram span creep)
                if best is None or v > best[0]: best = (v, s, lo, hi)
    if best is None: return None
    # shrink edges that add < 12 points of coverage (chance grams from takbir/dhikr)
    cov = lambda s_, lo, hi: 100*len(g & set().union(*(grams[pos[(s_, x)]] for x in range(lo, hi+1))))/len(g)
    v, s, lo, hi = best; full = cov(s, lo, hi)
    while hi > lo and cov(s, lo, hi-1) >= full - 12: hi -= 1
    while hi > lo and cov(s, lo+1, hi) >= full - 12: lo += 1
    best = (cov(s, lo, hi), s, lo, hi)
    return [round(best[0]), best[1], best[2], best[3], len(g)]
STRONG, WEAK = 55, 45
def segment(windows):
    """windows: list of {t, m:[score,s,lo,hi,ngrams] or None}. Returns list (per loud rakah) of surah runs."""
    W = windows
    fat = [i for i, w in enumerate(W) if w['m'] and w['m'][1] == 1 and w['m'][0] >= 50 and w['m'][4] >= 12]
    blocks = []
    for i in fat:
        if blocks and i - blocks[-1][1] <= 3: blocks[-1][1] = i
        else: blocks.append([i, i])
    starts = [b[1] + 1 for b in blocks] or [0]
    ends = [b[0] for b in blocks[1:]] + [len(W)]
    rakahs = []
    for st, en in zip(starts, ends):
        q = [(i, W[i]['m']) for i in range(st, en) if W[i]['m'] and W[i]['m'][1] != 1 and W[i]['m'][0] >= WEAK and W[i]['m'][4] >= 12]
        # surahs supported by >=2 strong windows, or one strong window covering a whole short surah
        cnt = {}
        for i, m in q:
            if m[0] >= STRONG: cnt.setdefault(m[1], []).append(m)
        ok = {s for s, L in cnt.items() if len(L) >= 2 or any(m[2] == 1 and m[3] == NA[s] and m[4] >= 15 and m[0] >= 70 for m in L)}
        q = [(i, m) for i, m in q if m[1] in ok]
        if not q: continue
        # temporal cluster: first cluster that starts near the Fatiha; gaps of <=4 windows (60 s)
        if blocks and q[0][0] - st > 8: continue
        cl = [q[0]]
        for i, m in q[1:]:
            if i - cl[-1][0] <= 4: cl.append((i, m))
            else: break
        runs = []
        for i, m in cl:
            if runs and runs[-1]['s'] == m[1]: runs[-1]['w'].append(m)
            elif runs and any(r['s'] == m[1] for r in runs): continue   # stray revisit
            else: runs.append(dict(s=m[1], w=[m]))
        chain = []
        for r in runs:
            # drop ayah outliers: keep windows whose lo is within 6 of the running median
            # longest chain of windows (in time order) whose ayat move forward plausibly
            w = r['w']; n = len(w); best = [1]*n; prev = [-1]*n
            for j in range(n):
                for i in range(j):
                    if w[i][3] - 3 <= w[j][2] <= w[i][3] + 8 and best[i] + 1 > best[j]: best[j] = best[i] + 1; prev[j] = i
            j = max(range(n), key=lambda k: best[k]); keep = []
            while j >= 0: keep.append(w[j]); j = prev[j]
            r['w'] = keep[::-1]
            st_ = [m for m in r['w'] if m[0] >= STRONG]
            if len(st_) >= 2 or any(m[2] == 1 and m[3] == NA[r['s']] and m[4] >= 15 and m[0] >= 70 for m in st_): chain.append(r)
        if chain: rakahs.append(chain)
        if not blocks: break
    return rakahs
def summarize(rakahs):
    out = []; confs = []
    for n, chain in enumerate(rakahs, 1):
        for r in chain:
            ws = [m for m in r['w'] if m[0] >= STRONG]
            lo = min(m[2] for m in ws); hi = max(m[3] for m in ws)
            conf = round(sum(m[0] for m in r['w']) / len(r['w']))
            out.append(dict(rakah=n, surah=r['s'], surah_name=NAMES[r['s']-1], ayah_from=lo, ayah_to=hi,
                            ref=f"{r['s']}:{lo}-{hi}" if hi > lo else f"{r['s']}:{lo}", windows=len(r['w']), confidence=conf))
            confs.append(conf)
    return out, (round(sum(confs)/len(confs)) if confs else 0)
