"""Independent check of the JS engine using Skyfield (SGP4 + JPL DE421)."""
import json, sys, warnings
import numpy as np
warnings.filterwarnings("ignore")
from skyfield.api import Loader, EarthSatellite, wgs84
from skyfield.framelib import itrs
from skyfield_data import get_skyfield_data_path

load = Loader(get_skyfield_data_path())
ts = load.timescale(builtin=False)
eph = load("de421.bsp")
earth, moon, sun = eph["earth"], eph["moon"], eph["sun"]

d = json.load(open(sys.argv[1]))
sat = EarthSatellite(d["L1"], d["L2"], "ISS", ts)
ARCSEC = 206264.806

from datetime import datetime, timezone, timedelta
def t_of(ms):
    # Unix milliseconds -> UTC calendar time (Unix time has no leap seconds, so go via the calendar)
    dt = datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(milliseconds=ms)
    return ts.utc(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second + dt.microsecond / 1e6)

def ang(a, b):
    a = np.asarray(a); b = np.asarray(b)
    return np.arctan2(np.linalg.norm(np.cross(a, b)), np.dot(a, b))

print("== Raw vectors in the Earth-fixed frame (engine vs Skyfield) ==")
worst = {"iss_km": 0, "moon_arcsec": 0, "sun_arcsec": 0}
for s in d["samples"]:
    t = t_of(s["ms"])
    iss = sat.at(t).frame_xyz(itrs).km
    m = (moon - earth).at(t).frame_xyz(itrs).km
    su = (sun - earth).at(t).frame_xyz(itrs).km
    worst["iss_km"] = max(worst["iss_km"], np.linalg.norm(iss - np.array(s["iss"])))
    worst["moon_arcsec"] = max(worst["moon_arcsec"], ang(m, s["moon"]) * ARCSEC)
    worst["sun_arcsec"] = max(worst["sun_arcsec"], ang(su, s["sun"]) * ARCSEC)
print(f"  ISS position, worst difference : {worst['iss_km']*1000:.1f} m")
print(f"  Moon direction, worst          : {worst['moon_arcsec']:.2f} arcsec")
print(f"  Sun direction, worst           : {worst['sun_arcsec']:.2f} arcsec")

print("\n== Each predicted event, re-observed with Skyfield from the engine's centreline point ==")
print("  time (UTC)                 sep@centre  ground err  moonAlt e/s     sunAlt e/s      range e/s      lit e/s      dur e/s      homeSep e/s")
elev = d["obs"]["elevM"]
home = wgs84.latlon(d["obs"]["lat"], d["obs"]["lon"], elevation_m=elev)
maxsep = 0; maxground = 0
for e in d["events"]:
    t = t_of(e["timeMs"])
    site = wgs84.latlon(e["lat"], e["lon"], elevation_m=elev)
    def sep_at(place, tt):
        iss_v = (sat - place).at(tt).position.km
        moon_v = (moon - (earth + place)).at(tt).position.km
        return ang(iss_v, moon_v), np.linalg.norm(iss_v)
    sep, rng = sep_at(site, t)
    ground_err_m = sep * rng * 1000
    maxsep = max(maxsep, sep * ARCSEC); maxground = max(maxground, ground_err_m)
    m_alt = (moon - (earth + site)).at(t).altaz()[0].degrees
    s_alt = (sun - (earth + site)).at(t).altaz()[0].degrees
    lit = bool(sat.at(t).is_sunlit(eph))
    rate = (sep_at(site, t_of(e["timeMs"] + 250))[0] + sep_at(site, t_of(e["timeMs"] - 250))[0]) / 0.5
    dur = 2 * np.radians(e["moonRadiusDeg"]) / rate
    hsep = np.degrees(sep_at(home, t_of(e["home"]["timeMs"]))[0])
    iso = t.utc_strftime("%Y-%m-%d %H:%M:%S") + f".{int(e['timeMs'] % 1000):03d}"
    print(f"  {iso}  {sep*ARCSEC:7.2f}\"  {ground_err_m:7.1f} m  {e['moonAltDeg']:6.2f}/{m_alt:6.2f}  {e['sunAltDeg']:7.2f}/{s_alt:7.2f}  "
          f"{e['rangeKm']:7.1f}/{rng:7.1f}  {e['lighting'][:7]:>7}/{'sunlit' if lit else 'dark':<6}  {e['durationSec']:.3f}/{dur:.3f}  {e['home']['sepDeg']:.4f}/{hsep:.4f}")
print(f"\n  worst separation at a predicted centreline point: {maxsep:.2f} arcsec  (Moon radius is ~900 arcsec)")
print(f"  equivalent ground offset: {maxground:.0f} m")
