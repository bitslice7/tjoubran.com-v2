// Page logic for transits.html: form -> orbit data -> search -> result cards + map.
// The maths lives in transit-engine.js; this file only talks to the page.

document.addEventListener('DOMContentLoaded', () => {
  const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE';
  const TLE_KEEP_MS = 2 * 3600e3; // CelesTrak refreshes every couple of hours; don't ask more often
  const SUNSET_DEG = -0.833;      // Sun's upper limb on the horizon, with refraction

  const $ = (id) => document.getElementById(id);
  const form = $('transit-form');
  const fields = {
    lat: $('f-lat'), lon: $('f-lon'), elev: $('f-elev'), from: $('f-from'),
    days: $('f-days'), dist: $('f-dist'), alt: $('f-alt'), light: $('f-light'), tle: $('f-tle'),
  };
  const searchBtn = $('search-btn');
  const locateBtn = $('locate-btn');
  const statusEl = $('transit-status');
  const orbitEl = $('orbit-status');
  const layoutEl = $('transit-layout');
  const listEl = $('transit-results');

  const engine = TransitEngine.createTransitEngine({ satellite, Astronomy });
  let state = null;   // { events, tle, params } from the last search
  let selected = null;
  let map = null, mapLayers = null;

  // Small helpers ------------------------------------------------------
  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const compass = (deg) => COMPASS[Math.round(deg / 22.5) % 16];
  const pad = (n) => String(n).padStart(2, '0');
  const localDateValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 1 });
  const zoneFmt = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' });
  const zoneName = (d) => (zoneFmt.formatToParts(d).find((p) => p.type === 'timeZoneName') || {}).value || '';
  const utcTime = (ms) => `${new Date(ms).toISOString().slice(11, 21)} UTC`;

  function setStatus(message, isError = false) {
    statusEl.classList.toggle('is-error', isError);
    statusEl.replaceChildren(...[].concat(message));
  }

  // What the frame will look like, from the light on the sky and on the station
  function shot(event) {
    if (event.sunAltDeg > SUNSET_DEG) {
      return { label: 'Daytime', className: 'is-weak', note: 'Pale Moon in a bright sky, low contrast.' };
    }
    const when = event.sky === 'Night' ? 'Night' : event.evening ? 'Dusk' : 'Dawn';
    if (event.lighting === 'sunlit') {
      return { label: `${when} · sunlit ISS`, className: 'is-prime', note: 'Station in sunlight on a dark sky: lit, with detail.' };
    }
    if (event.lighting === 'penumbra') {
      return { label: `${when} · ISS fading`, className: '', note: "Station at the edge of Earth's shadow, so it will be dim." };
    }
    const note = event.moonLitFraction < 0.5
      ? "Station in Earth's shadow. The centre of the disc is unlit, so it only shows where it crosses the lit part."
      : "Station in Earth's shadow: a black silhouette on the lit Moon.";
    return { label: `${when} · silhouette`, className: '', note };
  }

  function passesLight(event, mode) {
    if (mode === 'all') return true;
    const dark = event.sunAltDeg <= SUNSET_DEG;
    return mode === 'dark' ? dark : dark && event.lighting === 'sunlit';
  }

  function confidence(ageDays) {
    const age = Math.abs(ageDays);
    const days = `${age.toFixed(1)} days old at the crossing`;
    if (age <= 2) return [`Good: ${days}`, 'Run it again a few hours ahead to confirm.'];
    if (age <= 7) return [`Fair: ${days}`, 'Expect the path to move by a few km. Run it again the day before.'];
    return [`Rough: ${days}`, 'Treat this as a heads-up and run it again closer to the date.'];
  }

  // Orbit data ---------------------------------------------------------
  async function getOrbitData() {
    const typed = fields.tle.value.trim();
    if (typed) return { ...TransitEngine.parseTle(typed), source: 'entered by hand' };

    const saved = store.get('transit-tle');
    if (saved && Date.now() - saved.fetchedMs < TLE_KEEP_MS) {
      return { ...TransitEngine.parseTle(saved.text), source: 'CelesTrak' };
    }
    try {
      const response = await fetch(TLE_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const tle = TransitEngine.parseTle(text);
      store.set('transit-tle', { text, fetchedMs: Date.now() });
      return { ...tle, source: 'CelesTrak' };
    } catch (error) {
      if (saved) return { ...TransitEngine.parseTle(saved.text), source: 'CelesTrak (saved copy, could not refresh)' };
      throw error;
    }
  }

  // Search -------------------------------------------------------------
  function readParams() {
    const num = (field) => (field.value.trim() === '' ? NaN : Number(field.value));
    const params = {
      lat: num(fields.lat), lon: num(fields.lon), elevM: num(fields.elev) || 0,
      days: Number(fields.days.value), dist: num(fields.dist), alt: num(fields.alt),
    };
    if (!(Math.abs(params.lat) <= 90) || !(Math.abs(params.lon) <= 180)) {
      throw new Error('Enter a latitude between -90 and 90 and a longitude between -180 and 180, or use your location.');
    }
    if (!(params.dist >= 1 && params.dist <= 400)) throw new Error('Travel distance should be between 1 and 400 km.');
    if (!(params.alt >= 0 && params.alt <= 80)) throw new Error('Moon altitude should be between 0 and 80 degrees.');
    const today = localDateValue(new Date());
    const from = fields.from.value || today;
    params.startMs = from === today ? Date.now() : new Date(`${from}T00:00:00`).getTime();
    return params;
  }

  async function search() {
    let params;
    try { params = readParams(); } catch (error) { setStatus(error.message, true); return; }
    store.set('transit-form', {
      lat: fields.lat.value, lon: fields.lon.value, elev: fields.elev.value,
      days: fields.days.value, dist: fields.dist.value, alt: fields.alt.value, light: fields.light.value,
    });

    searchBtn.disabled = true;
    layoutEl.hidden = true;
    setStatus('Getting the current orbit…');
    try {
      let tle;
      try {
        tle = await getOrbitData();
      } catch (error) {
        $('tle-manual').open = true;
        orbitEl.textContent = '';
        setStatus(fields.tle.value.trim()
          ? error.message
          : 'Could not get orbit data from CelesTrak. Open the link below, copy the two lines into the box, and search again.', true);
        return;
      }

      const { epochMs } = engine.loadSatellite(tle.line1, tle.line2);
      const gapDays = (params.startMs - epochMs) / 86400e3;
      orbitEl.textContent = `Orbit data: ${tle.source}, measured ${dateFmt.format(new Date(epochMs))} ${utcTime(epochMs).slice(0, 5)} UTC.`
        + (Math.abs(gapDays) > 21 ? ` That is ${Math.round(Math.abs(gapDays))} days from your start date, so treat everything below as rough.` : '');

      const result = await engine.findTransits({
        line1: tle.line1, line2: tle.line2,
        lat: params.lat, lon: params.lon, elevM: params.elevM,
        startMs: params.startMs, days: params.days, maxDistKm: params.dist, minMoonAltDeg: params.alt,
      }, (fraction) => {
        setStatus(`Searching ${params.days} days of passes… ${Math.round(fraction * 100)}%`);
        return new Promise((resolve) => setTimeout(resolve)); // let the page repaint
      });

      state = { events: result.events, tle, params };
      selected = null;
      render();
    } catch (error) {
      console.error(error);
      setStatus(`Something went wrong: ${error.message}`, true);
    } finally {
      searchBtn.disabled = false;
    }
  }

  // Results ------------------------------------------------------------
  function render() {
    if (!state) return;
    const { events, params } = state;
    const mode = fields.light.value;
    const shown = events.filter((event) => passesLight(event, mode));
    const hidden = events.length - shown.length;
    const span = `within ${params.dist} km over ${params.days} days`;
    const plural = (n) => `${n} transit${n === 1 ? '' : 's'}`;

    const message = [];
    if (!events.length) {
      message.push(`No transits ${span} with the Moon at least ${params.alt}° up. Try a longer window or a wider travel distance.`);
    } else {
      message.push(shown.length ? `${plural(shown.length)} ${span}. ` : `Nothing ${span} in that light. `);
      if (hidden) {
        const showAll = el('button', 'link-btn', `Show the ${hidden} at other times`);
        showAll.type = 'button';
        showAll.addEventListener('click', () => { fields.light.value = 'all'; render(); });
        message.push(showAll);
      }
    }
    setStatus(message);

    listEl.replaceChildren(...shown.map(card));
    layoutEl.hidden = shown.length === 0;
    if (!shown.includes(selected)) selected = shown[0] || null;
    markSelected();
    if (shown.length) drawMap(shown);
  }

  function fact(term, main, detail) {
    const row = el('div');
    row.append(el('dt', '', term));
    const dd = el('dd', '', main);
    if (detail) dd.append(el('small', '', detail));
    row.append(dd);
    return row;
  }

  function card(event) {
    const when = new Date(event.timeMs);
    const kind = shot(event);
    const item = el('li', 'transit-card');
    item.dataset.time = event.timeMs;

    const head = el('div', 'transit-card-head');
    const stamp = el('div', 'transit-when');
    stamp.append(el('span', 'transit-date', dateFmt.format(when)));
    const time = el('span', 'transit-time', `${timeFmt.format(when)} `);
    time.append(el('small', '', zoneName(when)));
    stamp.append(time, el('span', 'transit-utc', utcTime(event.timeMs)));
    head.append(stamp, el('span', `transit-badge ${kind.className}`, kind.label));

    const facts = el('dl', 'transit-facts');
    const sunSide = event.sunAltDeg < 0 ? 'below' : 'above';
    const [trust, trustHint] = confidence(event.tleAgeDays);
    const home = event.home;
    facts.append(
      fact('Centreline', `${event.distKm.toFixed(1)} km ${compass(event.bearingDeg)} of you`,
        `Strip ${event.pathWidthKm.toFixed(1)} km wide · nearest point ${event.lat.toFixed(4)}, ${event.lon.toFixed(4)}`),
      fact('Moon', `${event.moonAltDeg.toFixed(0)}° up in the ${compass(event.moonAzDeg)}`,
        `${Math.round(event.moonLitFraction * 100)}% lit, ${event.moonWaxing ? 'waxing' : 'waning'}`),
      fact('Crossing', `${event.durationSec.toFixed(2)} s`,
        `ISS ${Math.round(event.rangeKm)} km away, ${Math.round(event.issArcsec)}″ across (the Moon is ${Math.round(event.moonRadiusDeg * 7200)}″)`),
      fact('Light', `Sun ${Math.abs(event.sunAltDeg).toFixed(1)}° ${sunSide} the horizon · ISS ${event.lighting === 'penumbra' ? 'in partial shadow' : event.lighting}`,
        `${event.sky}. ${kind.note}`),
      fact('From your spot', home.transits
        ? `Crosses the Moon, ${home.sepDeg.toFixed(2)}° off centre`
        : `Misses the Moon's edge by ${(home.sepDeg - home.moonRadiusDeg).toFixed(2)}°`,
        home.transits ? 'You can stay put, though the centreline gives the longest crossing.' : 'You need to travel to the strip for this one.'),
      fact('Orbit data', trust, trustHint),
    );

    const foot = el('div', 'transit-card-foot');
    const show = el('button', 'button', 'Show on map');
    show.type = 'button';
    show.addEventListener('click', () => {
      selected = event;
      markSelected();
      drawMap(state.events.filter((e) => passesLight(e, fields.light.value)));
      if (window.matchMedia('(max-width: 900px)').matches) $('transit-map').scrollIntoView({ block: 'center' });
    });
    const link = el('a', '', 'Open the nearest point in OpenStreetMap');
    link.href = `https://www.openstreetmap.org/?mlat=${event.lat.toFixed(5)}&mlon=${event.lon.toFixed(5)}#map=13/${event.lat.toFixed(5)}/${event.lon.toFixed(5)}`;
    link.target = '_blank';
    link.rel = 'noopener';
    foot.append(show, link);

    item.append(head, facts, foot);
    return item;
  }

  function markSelected() {
    for (const item of listEl.children) {
      item.classList.toggle('is-selected', !!selected && Number(item.dataset.time) === selected.timeMs);
    }
  }

  // Map ----------------------------------------------------------------
  function drawMap(shown) {
    const { params, tle } = state;
    if (!map) {
      map = L.map('transit-map', { scrollWheelZoom: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
      mapLayers = L.layerGroup().addTo(map);
    }
    map.invalidateSize();
    mapLayers.clearLayers();

    const you = [params.lat, params.lon];
    const reach = L.circle(you, { radius: params.dist * 1000, color: '#fff', weight: 1, dashArray: '4 6', fill: false, interactive: false });
    mapLayers.addLayer(reach);

    for (const event of shown) {
      if (!event.track) {
        event.track = engine.track(tle.line1, tle.line2, event, params.elevM / 1000, params.dist + 25);
      }
      const active = event === selected;
      const { center, left, right } = event.track;
      mapLayers.addLayer(L.polygon(left.concat(right.slice().reverse()), {
        stroke: false, fillColor: '#fff', fillOpacity: active ? 0.3 : 0.1, interactive: false,
      }));
      const line = L.polyline(center, { color: '#fff', weight: active ? 2.5 : 1, opacity: active ? 1 : 0.5 });
      line.on('click', () => { selected = event; markSelected(); drawMap(shown); });
      mapLayers.addLayer(line);
      if (active) {
        mapLayers.addLayer(L.polyline([you, [event.lat, event.lon]], { color: '#fff', weight: 1, dashArray: '2 6', interactive: false }));
        mapLayers.addLayer(L.circleMarker([event.lat, event.lon], { radius: 5, color: '#000', weight: 1, fillColor: '#fff', fillOpacity: 1 })
          .bindTooltip(timeFmt.format(new Date(event.timeMs)), { permanent: true, direction: 'top', offset: [0, -6] }));
      }
    }
    mapLayers.addLayer(L.circleMarker(you, { radius: 6, color: '#fff', weight: 2, fillColor: '#000', fillOpacity: 1 }).bindTooltip('You'));

    if (selected) map.fitBounds(L.latLngBounds([you, [selected.lat, selected.lon]]).pad(0.6), { maxZoom: 12 });
    else map.fitBounds(reach.getBounds());
  }

  // Wiring -------------------------------------------------------------
  form.addEventListener('submit', (event) => { event.preventDefault(); search(); });
  fields.light.addEventListener('change', render);

  locateBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      setStatus('This browser will not share a location. Enter coordinates instead.', true);
      return;
    }
    locateBtn.disabled = true;
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude, altitude } = position.coords;
      fields.lat.value = latitude.toFixed(5);
      fields.lon.value = longitude.toFixed(5);
      if (altitude !== null && Number.isFinite(altitude)) fields.elev.value = Math.round(altitude);
      locateBtn.disabled = false;
    }, () => {
      setStatus('Could not get your location. Enter coordinates instead.', true);
      locateBtn.disabled = false;
    }, { enableHighAccuracy: true, timeout: 15000 });
  });

  // Start from the last search's settings
  const remembered = store.get('transit-form');
  if (remembered) {
    for (const key of ['lat', 'lon', 'elev', 'days', 'dist', 'alt', 'light']) {
      if (remembered[key] !== undefined && remembered[key] !== '') fields[key].value = remembered[key];
    }
  }
  fields.from.value = localDateValue(new Date());
});
