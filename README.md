# Haramain & Al-Aqsa Flights Live

Live dashboard of departures from **Makkah (JED)**, **Madinah (MED)** and **Al-Aqsa** (TLV Ben Gurion, plus **AMM** Queen Alia as the nearby gateway), showing:
- the coordinate differences to each destination (dlat, dlon, great-circle km) from the airport **and** from the mosque, and each value **mod 27**
- prayer windows (Makkah and Madinah: Umm al-Qura; Al-Aqsa: Jordan Ministry of Awqaf, via Aladhan), with live countdowns
- current modes, the 7-day rolling average and rolling mode per prayer window, mod-27 histograms, top destinations, a great-circle map, and a filterable table with CSV export.

**Site:** https://mrbugimposter3-ship-it.github.io/haramain-flights-live/

## How it works
`.github/workflows/collect.yml` runs every 15 minutes (GitHub's scheduler can run late) and also on demand:
1. `collector/collect.py` pulls free, keyless, public sources:
   - ADS-B positions: [adsb.fi open data](https://adsb.fi) (1 request/s, 96 search circles of 250 nm, then repeat passes over the circles within 2,500 km of the airports while adsb.lol finishes) and [adsb.lol](https://adsb.lol) (ODbL; it allows 10 requests/min, so 48 circles paced at ~6.3 s and HTTP 429 `Retry-After` is honoured). Aircraft are deduplicated by ICAO hex (newest position kept).
   - Routes from [adsbdb.com](https://www.adsbdb.com), with [hexdb.io](https://hexdb.io) as a fallback when adsbdb has none (only simple A–B routes updated in the last 2 years, max 150 lookups/run). Both cached in `data/routes/`.
   - Tried and not used: airplanes.live (API asks projects to contact them first; HTTP 403), adsb.one (Cloudflare challenge, 403), adsb.lol `routeset` (returns nothing).
   - [OpenSky Network](https://opensky-network.org) anonymous "departures by airport" is tried once per airport per day. As of 19 Oct 2026 it returns HTTP 403 (needs an account), so it adds nothing yet.
   - Israel Airports Authority flight board, official open data on [data.gov.il](https://data.gov.il) (TLV)
   - Tibah Airports public departures board (MED)
   - JED (kaia.sa) and AMM (qaiairport.com) are only probed with a normal request. They refuse automated requests (HTTP 403) and are not bypassed.
2. Flights are deduplicated by flight number + local departure date into daily shards `data/flights/YYYY-MM-DD.csv`. Codeshares (same origin, destination and scheduled time) are flagged.
3. `collector/build.py` writes `site/data/*.json`. The static page (`site/`) computes everything client-side and is deployed to GitHub Pages.

## Kid view and the surah box
The top of the page is a kid-friendly view (big cards, Arabic + English): per mosque, planes that flew / are planned today, the latest planes with flags, the next prayer countdown, and a surah box.
- **"Last recited at …"**: the latest audible prayer (Fajr, Maghrib, Isha; Jumu'ah if present) with real surah, ayah range, date, imam and video link, from `data/recitations.json` (all three mosques, per prayer), else `data/last_recited.json`. Both are written by a separate job from each prayer's YouTube recording (Haramain Recordings; Al Quds Al Salam for Al-Aqsa). Not live. Shown if at most 3 days old. A row of prayer chips shows each audible prayer's latest ayat, and Dhuhr and Asr as "silent prayer 🤫" (during Dhuhr/Asr time a banner says so). The collector never edits these files (the workflow unstages them); `build.py` only copies them to the site, and the page also reads the newest copies straight from GitHub.
- **When neither file has a recent entry for a mosque: "Number-pattern surah"**, clearly labelled *number pattern for fun — not the live recitation*. Nobody publishes what is being recited live. Formula: take that site's flights (codeshares and cancellations excluded) for its local today in the current prayer window; if fewer than 3, the whole day; if still fewer than 3, the last 7 days. a = most common whole-number `dlat mod 27`, k = most common whole-number `km mod 27`, both from the mosque (ties go to the smaller value). **surah = ((27 × a + k) mod 114) + 1**, always 1–114. It changes as the data refreshes.
- Official live streams linked: Makkah [KSA Quran TV](https://www.youtube.com/user/SaudiQuranTv/live), Madinah [KSA Sunnah TV](https://www.youtube.com/user/SaudiSunnahTv/live). No audio is embedded.

## Labels (please read)
- **observed (ADS-B)**: seen in the air by community trackers. Departure time is estimated from distance flown (OpenSky gives first-seen time).
- **observed (airport board)**: the airport's board says departed. **scheduled**: published but not confirmed (timetable, not observed).
- **Seats are estimates** from aircraft type (only known for ADS-B-seen flights). Real passenger numbers aren't public.
- **Coverage is limited:** free trackers have few receivers inside Saudi Arabia, and JED/AMM have no board data.

Data credits: adsb.fi, adsb.lol, hexdb.io, Haramain Recordings (last recited ayat), OpenSky Network, adsbdb, Israel Airports Authority, Tibah Airports, OurAirports (public domain), OpenFlights (ODbL), GeoNames (CC-BY 4.0), Aladhan. Map tiles © OpenStreetMap contributors.
