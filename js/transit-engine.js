// ISS lunar transit geometry.
//
// Everything is done in the Earth-fixed frame (ECEF, km):
//   ISS   TEME (SGP4 output) -> ECEF by rotating through GMST
//   Moon  J2000 equatorial -> equator of date -> ECEF by rotating through GAST
//   Sun   same path as the Moon
// The centreline is where the line Moon -> ISS, extended, hits the ground.
//
// Loads as a plain script and defines one global, TransitEngine. It has no
// dependencies of its own: createTransitEngine() is handed satellite.js and
// astronomy-engine, so the same file also runs in Node or a serverless worker.

(function (root) {
'use strict';

const DEG = Math.PI / 180;
const ARCSEC_PER_RAD = 206264.806;
const WGS84_A = 6378.137; // km, equatorial radius
const WGS84_F = 1 / 298.257223563;
const WGS84_B = WGS84_A * (1 - WGS84_F);
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const R_EARTH_MEAN = 6371.0088;
const R_MOON = 1737.4;
const R_SUN = 695700;
const ISS_SPAN_KM = 0.109; // truss length, end to end
const EARTH_SPIN = 7.2921150e-5; // rad/s

// Vectors are plain [x, y, z] arrays -----------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => scale(a, 1 / norm(a));
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
// Angle between two vectors; atan2 form stays accurate near zero.
const angleBetween = (a, b) => Math.atan2(norm(cross(a, b)), dot(a, b));

// Geodesy --------------------------------------------------------------
function geodeticToEcef(latDeg, lonDeg, hKm = 0) {
  const lat = latDeg * DEG, lon = lonDeg * DEG;
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  return [
    (N + hKm) * cosLat * Math.cos(lon),
    (N + hKm) * cosLat * Math.sin(lon),
    (N * (1 - WGS84_E2) + hKm) * sinLat,
  ];
}

function ecefToGeodetic(p) {
  const lon = Math.atan2(p[1], p[0]);
  const rho = Math.hypot(p[0], p[1]);
  let lat = Math.atan2(p[2], rho * (1 - WGS84_E2));
  let h = 0;
  for (let i = 0; i < 6; i++) {
    const sinLat = Math.sin(lat);
    const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    h = rho / Math.cos(lat) - N;
    lat = Math.atan2(p[2], rho * (1 - (WGS84_E2 * N) / (N + h)));
  }
  return { lat: lat / DEG, lon: lon / DEG, hKm: h };
}

// East / north / up unit vectors at a geodetic position.
function localFrame(latDeg, lonDeg) {
  const lat = latDeg * DEG, lon = lonDeg * DEG;
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon), cosLon = Math.cos(lon);
  return {
    east: [-sinLon, cosLon, 0],
    north: [-sinLat * cosLon, -sinLat * sinLon, cosLat],
    up: [cosLat * cosLon, cosLat * sinLon, sinLat],
  };
}

// Geometric altitude and azimuth (degrees, azimuth east of north). No refraction.
function altAz(observer, frame, target) {
  const v = sub(target, observer);
  const e = dot(v, frame.east), n = dot(v, frame.north), u = dot(v, frame.up);
  const az = Math.atan2(e, n) / DEG;
  return { alt: Math.atan2(u, Math.hypot(e, n)) / DEG, az: (az + 360) % 360 };
}

// First point where the ray origin + s*dir (s > 0) meets the ellipsoid raised by hKm.
function rayEllipsoid(origin, dir, hKm = 0) {
  const A = WGS84_A + hKm, B = WGS84_B + hKm;
  const o = [origin[0] / A, origin[1] / A, origin[2] / B];
  const d = [dir[0] / A, dir[1] / A, dir[2] / B];
  const dd = dot(d, d), od = dot(o, d);
  const disc = od * od - dd * (dot(o, o) - 1);
  if (disc < 0) return null;
  const s = (-od - Math.sqrt(disc)) / dd;
  return s > 0 ? add(origin, scale(dir, s)) : null;
}

function greatCircle(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * DEG, p2 = lat2 * DEG, dl = (lon2 - lon1) * DEG;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const distKm = 2 * R_EARTH_MEAN * Math.asin(Math.min(1, Math.sqrt(a)));
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return { distKm, bearingDeg: (Math.atan2(y, x) / DEG + 360) % 360 };
}

// Minimum of a single-dip function on [a, b] by golden-section search.
function minimize(f, a, b, tol) {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a);
  let fc = f(c), fd = f(d);
  while (b - a > tol) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  const x = (a + b) / 2;
  return { x, value: f(x) };
}

function parseTle(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const i = lines.findIndex((l) => /^1 /.test(l));
  if (i < 0 || !lines[i + 1] || !/^2 /.test(lines[i + 1])) {
    throw new Error('Could not find the two element lines (they start with "1 " and "2 ").');
  }
  return { name: i > 0 ? lines[i - 1] : 'ISS (ZARYA)', line1: lines[i], line2: lines[i + 1] };
}

function skyLabel(sunAltDeg) {
  if (sunAltDeg > -0.833) return 'Daylight';
  if (sunAltDeg > -6) return 'Civil twilight';
  if (sunAltDeg > -12) return 'Nautical twilight';
  if (sunAltDeg > -18) return 'Astronomical twilight';
  return 'Night';
}

// ut1MinusUtcSec: Earth-rotation correction (UT1 - UTC). It stays within 0.9 s by
// definition and moves the ground track by at most ~0.4 km, so 0 is a fine default.
function createTransitEngine({ satellite, Astronomy, ut1MinusUtcSec = 0 }) {
  const AU_KM = Astronomy.KM_PER_AU;
  const spin = EARTH_SPIN * ut1MinusUtcSec; // extra rotation angle, radians

  function loadSatellite(line1, line2) {
    const satrec = satellite.twoline2satrec(line1, line2);
    const epochMs = (satrec.jdsatepoch + (satrec.jdsatepochF || 0) - 2440587.5) * 86400e3;
    return { satrec, epochMs };
  }

  function issEcef(satrec, ms) {
    const date = new Date(ms);
    const pv = satellite.propagate(satrec, date);
    if (!pv || !pv.position) return null;
    const g = satellite.gstime(date) + spin;
    const c = Math.cos(g), s = Math.sin(g), p = pv.position;
    return [c * p.x + s * p.y, -s * p.x + c * p.y, p.z];
  }

  // Geocentric Moon or Sun in ECEF (km).
  function bodyEcef(body, ms) {
    const time = Astronomy.MakeTime(new Date(ms));
    const j2000 = body === 'Moon' ? Astronomy.GeoMoon(time) : Astronomy.GeoVector(body, time, true);
    const ofDate = Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(time), j2000);
    const gast = Astronomy.SiderealTime(time) * 15 * DEG + spin;
    const c = Math.cos(gast), s = Math.sin(gast);
    return [
      (c * ofDate.x + s * ofDate.y) * AU_KM,
      (-s * ofDate.x + c * ofDate.y) * AU_KM,
      ofDate.z * AU_KM,
    ];
  }

  // Ground point from which the ISS sits on the centre of the Moon at this instant.
  function centerlinePoint(satrec, ms, hKm) {
    const iss = issEcef(satrec, ms);
    if (!iss) return null;
    const moon = bodyEcef('Moon', ms);
    const ground = rayEllipsoid(iss, unit(sub(iss, moon)), hKm);
    return ground ? { ground, iss, moon } : null;
  }

  // Angle between the ISS and the centre of the Moon seen from a ground point (radians).
  function separation(satrec, ms, point) {
    const iss = issEcef(satrec, ms);
    if (!iss) return Infinity;
    return angleBetween(sub(iss, point), sub(bodyEcef('Moon', ms), point));
  }

  // Sunlit, penumbra or eclipsed, from the apparent discs of the Sun and Earth at the ISS.
  function issLighting(iss, sun) {
    const toSun = sub(sun, iss);
    const earthRadius = Math.asin(R_EARTH_MEAN / norm(iss));
    const sunRadius = Math.asin(R_SUN / norm(toSun));
    const apart = angleBetween(scale(iss, -1), toSun);
    if (apart < earthRadius - sunRadius) return 'eclipsed';
    if (apart < earthRadius + sunRadius) return 'penumbra';
    return 'sunlit';
  }

  function describe(satrec, epochMs, tMs, observer, hKm) {
    const here = centerlinePoint(satrec, tMs, hKm);
    if (!here) return null;
    const P = here.ground;
    const geo = ecefToGeodetic(P);
    const frame = localFrame(geo.lat, geo.lon);
    const moon = altAz(P, frame, here.moon);
    const rangeKm = norm(sub(here.iss, P));
    const moonRadiusDeg = Math.asin(R_MOON / norm(sub(here.moon, P))) / DEG;

    // Apparent speed of the ISS relative to the Moon, and how long the crossing takes
    const rateDegPerSec = (separation(satrec, tMs + 250, P) + separation(satrec, tMs - 250, P)) / DEG / 0.5;
    const durationSec = (2 * moonRadiusDeg) / rateDegPerSec;

    // Direction the centreline runs along the ground, and the width of the strip
    const before = centerlinePoint(satrec, tMs - 500, hKm) || here;
    const after = centerlinePoint(satrec, tMs + 500, hKm) || here;
    const step = sub(after.ground, before.ground);
    if (norm(step) < 1e-6) return null; // right at the Earth's limb: no usable path
    const along = unit(step);
    const across = unit(cross(frame.up, along));
    const probe = add(P, across); // 1 km to the side
    const miss = minimize((t) => separation(satrec, t, probe), tMs - 3000, tMs + 3000, 1).value / DEG;
    const halfWidthKm = moonRadiusDeg / miss;

    const sunVec = bodyEcef('Sun', tMs);
    const sun = altAz(P, frame, sunVec);
    const lighting = issLighting(here.iss, sunVec);
    const date = new Date(tMs);
    const moonLitFraction = Astronomy.Illumination('Moon', date).phase_fraction;
    const moonWaxing = Astronomy.MoonPhase(date) < 180;

    // What the observer sees without moving
    const O = observer.ecef;
    const home = minimize((t) => separation(satrec, t, O), tMs - 20000, tMs + 20000, 1);
    const homeMoon = bodyEcef('Moon', home.x);
    const homeRadiusDeg = Math.asin(R_MOON / norm(sub(homeMoon, O))) / DEG;
    const homeSepDeg = home.value / DEG;
    const gc = greatCircle(observer.lat, observer.lon, geo.lat, geo.lon);

    return {
      timeMs: Math.round(tMs),
      lat: geo.lat,
      lon: geo.lon,
      distKm: gc.distKm,
      bearingDeg: gc.bearingDeg,
      moonAltDeg: moon.alt,
      moonAzDeg: moon.az,
      moonRadiusDeg,
      moonLitFraction,
      moonWaxing,
      rangeKm,
      issArcsec: (ISS_SPAN_KM / rangeKm) * ARCSEC_PER_RAD,
      rateDegPerSec,
      durationSec,
      pathWidthKm: 2 * halfWidthKm,
      sunAltDeg: sun.alt,
      sunAzDeg: sun.az,
      sky: skyLabel(sun.alt),
      evening: sun.az > 180,
      lighting,
      home: {
        timeMs: Math.round(home.x),
        sepDeg: homeSepDeg,
        moonRadiusDeg: homeRadiusDeg,
        transits: homeSepDeg < homeRadiusDeg,
      },
      tleAgeDays: (tMs - epochMs) / 86400e3,
      _along: along,
      _across: across,
    };
  }

  // Centreline and both edges of the strip as [lat, lon] lists, for drawing on a map.
  function track(line1, line2, event, hKm, reachKm, stepMs = 200) {
    const { satrec } = loadSatellite(line1, line2);
    const half = event.pathWidthKm / 2;
    const start = geodeticToEcef(event.lat, event.lon, hKm);
    const out = { center: [], left: [], right: [] };
    const walk = (dir) => {
      const rows = [];
      for (let k = dir > 0 ? 0 : 1; k < 2000; k++) {
        const t = event.timeMs + dir * k * stepMs;
        const a = centerlinePoint(satrec, t, hKm);
        const b = centerlinePoint(satrec, t + stepMs, hKm);
        if (!a || !b) break;
        if (norm(sub(a.ground, start)) > reachKm) break;
        const g = ecefToGeodetic(a.ground);
        const across = unit(cross(localFrame(g.lat, g.lon).up, unit(sub(b.ground, a.ground))));
        const l = ecefToGeodetic(add(a.ground, scale(across, half)));
        const r = ecefToGeodetic(add(a.ground, scale(across, -half)));
        rows.push({ c: [g.lat, g.lon], l: [l.lat, l.lon], r: [r.lat, r.lon] });
      }
      return rows;
    };
    const rows = walk(-1).reverse().concat(walk(1));
    for (const row of rows) { out.center.push(row.c); out.left.push(row.l); out.right.push(row.r); }
    return out;
  }

  // Search a time window for transits whose centreline passes within maxDistKm.
  async function findTransits(options, onProgress) {
    const {
      line1, line2, lat, lon,
      elevM = 0, startMs, days = 14, maxDistKm = 100, minMoonAltDeg = 10,
    } = options;
    const { satrec, epochMs } = loadSatellite(line1, line2);
    const hKm = elevM / 1000;
    const observer = { lat, lon, ecef: geodeticToEcef(lat, lon, hKm) };
    const frame = localFrame(lat, lon);
    const endMs = startMs + days * 86400e3;

    // 1. Times when the ISS is near or above the observer's horizon
    const COARSE = 15000;
    const passes = [];
    let passStart = null;
    for (let t = startMs; t <= endMs; t += COARSE) {
      const iss = issEcef(satrec, t);
      const up = iss && altAz(observer.ecef, frame, iss).alt > -5;
      if (up && passStart === null) passStart = t - COARSE;
      if (!up && passStart !== null) { passes.push([passStart, t]); passStart = null; }
    }
    if (passStart !== null) passes.push([passStart, endMs]);

    // 2. In each pass, how close does the centreline come?
    const events = [];
    for (let i = 0; i < passes.length; i++) {
      const [t0, t1] = passes[i];
      if (onProgress && i % 8 === 0) await onProgress(i / passes.length);
      const moonAtMid = altAz(observer.ecef, frame, bodyEcef('Moon', (t0 + t1) / 2)).alt;
      if (moonAtMid < minMoonAltDeg - 8) continue;

      const distance = (t) => {
        const c = centerlinePoint(satrec, t, hKm);
        return c ? norm(sub(c.ground, observer.ecef)) : Infinity;
      };
      let bestT = null, bestD = Infinity;
      for (let t = t0; t <= t1; t += 1000) {
        const d = distance(t);
        if (d < bestD) { bestD = d; bestT = t; }
      }
      if (bestT === null || bestD > maxDistKm + 30) continue;
      const closest = minimize(distance, bestT - 1000, bestT + 1000, 0.5);
      if (closest.value > maxDistKm) continue;

      const event = describe(satrec, epochMs, closest.x, observer, hKm);
      if (event && event.moonAltDeg >= minMoonAltDeg) events.push(event);
    }
    if (onProgress) await onProgress(1);
    return { events, passesChecked: passes.length, epochMs };
  }

  return {
    findTransits, track, loadSatellite,
    // exposed for tests
    issEcef, bodyEcef, centerlinePoint, separation, issLighting,
  };
}

root.TransitEngine = {
  createTransitEngine, parseTle, skyLabel,
  geodeticToEcef, ecefToGeodetic, localFrame, altAz, rayEllipsoid, greatCircle,
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
