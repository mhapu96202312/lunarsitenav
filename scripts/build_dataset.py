#!/usr/bin/env python3
"""Build js/data.js for LunarSiteNav.

1. JPL Horizons API: hourly apparent azimuth/elevation of the Sun (10) and Earth (399) seen from each
   landing site (CENTER = coord@301, geodetic), for 3 months from the build date. No atmosphere on the Moon,
   so no refraction; Horizons elevation is relative to the local horizontal plane (a flat, smooth horizon).
2. NASA LRO LOLA gridded topography (LDEM_16, 16 pixels/degree, ~1.9 km) from the PDS Geosciences Node:
   terrain horizon elevation angle for every 1 degree of azimuth, marching out 200 km along great circles
   and including lunar curvature.
3. Visibility = body elevation above the terrain horizon at its azimuth.

Requires numpy. Code written with SI assistance (Claude, Anthropic) and reviewed by the team.
"""
import json, math, subprocess, urllib.parse, pathlib, datetime
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
DEM_URL = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_16.img"
R = 1737.4  # km, LOLA reference radius
PPD = 16

SITES = json.loads((ROOT / "data" / "sites.json").read_text())["sites"]


def curl(url):
    return subprocess.run(["curl", "-s", "-L", "-m", "180", url], capture_output=True, text=True, check=True).stdout


def load_dem():
    f = RAW / "ldem_16.img"
    if not f.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        subprocess.run(["curl", "-s", "-L", "-o", str(f), DEM_URL], check=True)
    return np.fromfile(f, dtype="<i2").reshape(2880, 5760).astype(np.float32) * 0.5 / 1000.0  # km above 1737.4


def sample(dem, lat, lon):
    """Bilinear sample; lat/lon in degrees (arrays ok), lon 0..360 east."""
    lon = np.mod(lon, 360.0)
    y = (90.0 - lat) * PPD - 0.5
    x = lon * PPD - 0.5
    y = np.clip(y, 0, dem.shape[0] - 1.001)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    fx = x - x0; fy = y - y0
    x1 = (x0 + 1) % dem.shape[1]; x0 = x0 % dem.shape[1]
    y1 = np.minimum(y0 + 1, dem.shape[0] - 1)
    return (dem[y0, x0] * (1 - fx) * (1 - fy) + dem[y0, x1] * fx * (1 - fy) + dem[y1, x0] * (1 - fx) * fy + dem[y1, x1] * fx * fy)


def horizon(dem, lat0, lon0, mast_m=2.0):
    la0, lo0 = math.radians(lat0), math.radians(lon0)
    h0 = float(sample(dem, np.array([lat0]), np.array([lon0 % 360]))[0]) + mast_m / 1000.0
    d = np.arange(1.0, 200.5, 1.0)          # km
    dl = d / R                               # angular distance (rad)
    out = []
    for az in range(360):
        th = math.radians(az)
        lat = np.arcsin(math.sin(la0) * np.cos(dl) + math.cos(la0) * np.sin(dl) * math.cos(th))
        lon = lo0 + np.arctan2(math.sin(th) * np.sin(dl) * math.cos(la0), np.cos(dl) - math.sin(la0) * np.sin(lat))
        h = sample(dem, np.degrees(lat), np.degrees(lon))
        ang = np.degrees(np.arctan2((R + h) * np.cos(dl) - (R + h0), (R + h) * np.sin(dl)))
        out.append(round(float(ang.max()), 2))
    return h0 * 1000.0, out


def horizons(body, lat, lon, start, stop):
    q = {"format": "json", "COMMAND": f"'{body}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'OBSERVER'",
         "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'", "SITE_COORD": f"'{lon % 360:.4f},{lat:.4f},0'",
         "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'", "STEP_SIZE": "'1h'", "QUANTITIES": "'4'", "ANG_FORMAT": "'DEG'",
         "CSV_FORMAT": "'YES'"}
    r = json.loads(curl("https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q)))["result"]
    block = r[r.index("$$SOE") + 5: r.index("$$EOE")].strip().splitlines()
    az, el = [], []
    for line in block:
        p = [x.strip() for x in line.split(",")]
        az.append(round(float(p[-3]), 1)); el.append(round(float(p[-2]), 2))
    t0 = block[0].split(",")[0].strip()
    return t0, az, el


def main():
    dem = load_dem()
    start = datetime.date.today()
    stop = start + datetime.timedelta(days=92)
    out = []
    for s in SITES:
        h0, hz = horizon(dem, s["lat"], s["lon"])
        t0, saz, sel = horizons("10", s["lat"], s["lon"], start.isoformat(), stop.isoformat())
        _, eaz, eel = horizons("399", s["lat"], s["lon"], start.isoformat(), stop.isoformat())
        sun = [int(e > hz[int(round(a)) % 360]) for a, e in zip(saz, sel)]
        earth = [int(e > hz[int(round(a)) % 360]) for a, e in zip(eaz, eel)]
        print(f"{s['key']:10s} elev {h0:7.0f} m  max horizon {max(hz):5.2f} deg  sunlit {100*sum(sun)/len(sun):5.1f}%  earth {100*sum(earth)/len(earth):5.1f}%")
        out.append({**s, "elev_m": round(h0), "horizon": hz, "t0": t0, "step_h": 1, "sun_az": saz, "sun_el": sel, "earth_az": eaz, "earth_el": eel})
    meta = {"generated_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            "horizons": "JPL Horizons API, observer = coord@301 geodetic, quantities 4 (apparent az/el), 1 h step",
            "dem": "LRO LOLA LDEM_16 (16 ppd) from the PDS Geosciences Node; horizon to 200 km, 1 deg azimuth, 2 m mast",
            "period": [start.isoformat(), stop.isoformat()]}
    (ROOT / "data" / "site_ephemeris.json").write_text(json.dumps({"meta": meta, "sites": out}))
    (ROOT / "js" / "data.js").write_text("window.LN=" + json.dumps({"meta": meta, "sites": out}) + ";\n")
    print("wrote js/data.js")


if __name__ == "__main__":
    main()
