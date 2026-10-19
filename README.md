# Haramain & Al-Aqsa Flights Live

Live dashboard of departures from **Makkah (JED)**, **Madinah (MED)** and **Al-Aqsa** (TLV Ben Gurion, plus **AMM** Queen Alia as the nearby gateway), showing:
- the coordinate differences to each destination (dlat, dlon, great-circle km) from the airport **and** from the mosque, and each value **mod 27**
- prayer windows (Makkah and Madinah: Umm al-Qura; Al-Aqsa: Jordan Ministry of Awqaf, via Aladhan), with live countdowns
- current modes, the 7-day rolling average and rolling mode per prayer window, mod-27 histograms, top destinations, a great-circle map, and a filterable table with CSV export.

**Site:** https://mrbugimposter3-ship-it.github.io/haramain-flights-live/

## How it works
`.github/workflows/collect.yml` runs every 15 minutes (GitHub's scheduler can run late) and also on demand:
1. `collector/collect.py` pulls free, keyless, public sources:
   - ADS-B positions: [adsb.fi open data](https://adsb.fi) (1 request/s) and [adsb.lol](https://adsb.lol) (ODbL), with routes from [adsbdb.com](https://www.adsbdb.com) (cached in `data/routes/`)
   - [OpenSky Network](https://opensky-network.org) anonymous "departures by airport" for the previous day (once per airport per day)
   - Israel Airports Authority flight board, official open data on [data.gov.il](https://data.gov.il) (TLV)
   - Tibah Airports public departures board (MED)
   - JED (kaia.sa) and AMM (qaiairport.com) are only probed with a normal request. They refuse automated requests (HTTP 403) and are not bypassed.
2. Flights are deduplicated by flight number + local departure date into daily shards `data/flights/YYYY-MM-DD.csv`. Codeshares (same origin, destination and scheduled time) are flagged.
3. `collector/build.py` writes `site/data/*.json`. The static page (`site/`) computes everything client-side and is deployed to GitHub Pages.

## Labels (please read)
- **observed (ADS-B)**: seen in the air by community trackers. Departure time is estimated from distance flown (OpenSky gives first-seen time).
- **observed (airport board)**: the airport's board says departed. **scheduled**: published but not confirmed (timetable, not observed).
- **Seats are estimates** from aircraft type (only known for ADS-B-seen flights). Real passenger numbers aren't public.
- **Coverage is limited:** free trackers have few receivers inside Saudi Arabia, and JED/AMM have no board data.

Data credits: adsb.fi, adsb.lol, OpenSky Network, adsbdb, Israel Airports Authority, Tibah Airports, OurAirports (public domain), OpenFlights (ODbL), GeoNames (CC-BY 4.0), Aladhan. Map tiles © OpenStreetMap contributors.
