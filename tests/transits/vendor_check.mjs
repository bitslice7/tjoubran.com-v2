// Load the exact browser files (vendored bundles + engine) in a bare VM and confirm they give the same events.
import fs from 'node:fs';
import vm from 'node:vm';
const ctx = vm.createContext({ console, performance, Date, Math });
ctx.globalThis = ctx; ctx.window = ctx; ctx.self = ctx;
for (const f of ['../../js/vendor/satellite.min.js', '../../js/vendor/astronomy.min.js', '../../js/transit-engine.js']) {
  vm.runInContext(fs.readFileSync(new URL(f, import.meta.url), 'utf8'), ctx, { filename: f });
}
const out = await vm.runInContext(`(async () => {
  const engine = TransitEngine.createTransitEngine({ satellite, Astronomy });
  const r = await engine.findTransits({
    line1: '1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927',
    line2: '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537',
    lat: 42.2626, lon: -71.8023, elevM: 150, startMs: Date.UTC(2008, 8, 20, 13), days: 30, maxDistKm: 250, minMoonAltDeg: 5 });
  return JSON.stringify(r.events.map(e => [new Date(e.timeMs).toISOString(), +e.distKm.toFixed(2)]));
})()`, ctx);
console.log(out);
