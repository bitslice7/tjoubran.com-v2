// How often does each kind of event come up? Propagates one element set for a year.
// Positions that far out are not real predictions, but the mix of geometries is representative.
import * as satellite from 'satellite.js';
import * as Astronomy from 'astronomy-engine';
import '../../js/transit-engine.js';
const { createTransitEngine } = globalThis.TransitEngine;
const L1 = '1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927';
const L2 = '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537';
const engine = createTransitEngine({ satellite, Astronomy });
const { satrec } = engine.loadSatellite(L1, L2);
const startMs = Date.UTC(2008, 8, 20, 13);
for (const d of [0, 90, 180, 270, 365]) {
  const p = engine.issEcef(satrec, startMs + d * 86400e3);
  console.log(`day ${d}: ISS radius ${p ? Math.hypot(...p).toFixed(0) : 'none'} km`);
}
const DAYS = 365;
const res = await engine.findTransits({ line1: L1, line2: L2, lat: 42.2626, lon: -71.8023, elevM: 150, startMs, days: DAYS, maxDistKm: 250, minMoonAltDeg: 15 });
const kind = (e) => e.sunAltDeg > -0.833 ? 'daytime' : e.lighting === 'sunlit' ? 'sunlit ISS, dark sky' : e.lighting === 'penumbra' ? 'partial shadow' : 'silhouette';
for (const R of [50, 100, 250]) {
  const tally = {};
  for (const e of res.events.filter((e) => e.distKm <= R)) tally[kind(e)] = (tally[kind(e)] || 0) + 1;
  console.log(`within ${R} km, Moon >= 15 deg, ${DAYS} days:`, JSON.stringify(tally));
}
const prime = res.events.filter((e) => kind(e) === 'sunlit ISS, dark sky');
for (const e of prime) console.log('  prime:', new Date(e.timeMs).toISOString(), `${e.distKm.toFixed(0)} km`, `sun ${e.sunAltDeg.toFixed(1)}`, `moon ${e.moonAltDeg.toFixed(0)}° ${(e.moonLitFraction*100).toFixed(0)}%`, e.sky);
