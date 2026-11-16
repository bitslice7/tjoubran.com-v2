// Runs the engine on a historical ISS element set and writes events + sample vectors as JSON.
import fs from 'node:fs';
import * as satellite from 'satellite.js';
import * as Astronomy from 'astronomy-engine';
import '../../js/transit-engine.js';
const { createTransitEngine, geodeticToEcef } = globalThis.TransitEngine;

const L1 = '1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927';
const L2 = '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537';
const obs = { lat: 42.2626, lon: -71.8023, elevM: 150 };
const startMs = Date.UTC(2008, 8, 20, 13, 0, 0);

const DUT1 = Number(process.env.DUT1 || 0);
const engine = createTransitEngine({ satellite, Astronomy, ut1MinusUtcSec: DUT1 });
const t0 = performance.now();
const res = await engine.findTransits({ line1: L1, line2: L2, ...obs, startMs, days: 30, maxDistKm: 250, minMoonAltDeg: 5 });
const elapsed = performance.now() - t0;

// Raw vectors at a few arbitrary times for a frame-by-frame comparison
const { satrec } = engine.loadSatellite(L1, L2);
const samples = [];
for (let k = 0; k < 12; k++) {
  const ms = startMs + k * 7.3 * 3600e3 + 12345;
  samples.push({ ms, iss: engine.issEcef(satrec, ms), moon: engine.bodyEcef('Moon', ms), sun: engine.bodyEcef('Sun', ms) });
}
const O = geodeticToEcef(obs.lat, obs.lon, obs.elevM / 1000);
fs.writeFileSync(new URL('./engine_out.json', import.meta.url), JSON.stringify({ L1, L2, obs, O, DUT1, events: res.events, samples }, null, 1));
console.log(`passes checked: ${res.passesChecked}, events: ${res.events.length}, search time: ${elapsed.toFixed(0)} ms`);
for (const e of res.events) {
  console.log(new Date(e.timeMs).toISOString(), `d=${e.distKm.toFixed(1)}km`, `moonAlt=${e.moonAltDeg.toFixed(1)}`, `range=${e.rangeKm.toFixed(0)}km`,
    `dur=${e.durationSec.toFixed(2)}s`, `width=${e.pathWidthKm.toFixed(1)}km`, `sunAlt=${e.sunAltDeg.toFixed(1)}`, e.sky, e.lighting,
    `lit=${(e.moonLitFraction*100).toFixed(0)}%`, `homeSep=${e.home.sepDeg.toFixed(3)}°`);
}
