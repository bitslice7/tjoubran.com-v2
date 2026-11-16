# Transit finder checks

These compare `js/transit-engine.js` with Skyfield (SGP4 plus the JPL DE421 ephemeris).
They are not part of the site and nothing here is loaded by a page.

    cd tests/transits
    npm install
    pip install skyfield skyfield-data sgp4
    DUT1=-0.4843018 node run_engine.mjs      # writes engine_out.json
    python3 crosscheck.py engine_out.json    # re-observes every event with Skyfield
    node vendor_check.mjs                    # same events from the files the browser loads
    node frequency.mjs                       # how often each kind of event comes up

The test uses a 2008 ISS element set, so it checks the geometry, not a live forecast.
`DUT1` is UT1 minus UTC for that date. The page leaves it at zero, which moves the
ground track by tens of metres today.

Last run: ISS position within 1.3 m of Skyfield, Moon direction within 0.7 arcsec,
and every predicted centreline point within 11 m on the ground.

## How the engine works

1. SGP4 gives the ISS position, which is rotated into the Earth-fixed frame.
2. The Moon and Sun are computed in the same frame.
3. The centreline is where the line from the Moon through the ISS meets the ground.
   A transit is listed when that line passes within the travel distance.
4. For each one: time, nearest centreline point, strip width, crossing duration,
   Moon altitude and phase, Sun altitude, and whether the ISS is in sunlight or in
   Earth's shadow.
