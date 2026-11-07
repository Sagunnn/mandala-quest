# Mandala Quest: Chronicles of the Living Valley

A GPS-only heritage game prototype for Patan Durbar Square and the Boudhanath kora. There are no QR codes: monuments unlock from where you stand.

Live at **https://mandala-quest.sagunpradhan.com.np**

## How it plays

- **Patan Durbar Square (Cluster A).** Nine monuments, each with an oriented bounding box. Once a second the game runs a ray-casting point-in-polygon test. Stay inside a box for 5 seconds at walking pace (≤ 2.0 m/s) to unlock its lore card. Leaving the box for up to 2 seconds (GPS drift) keeps the timer.
- **Barometric gate.** Manga Hiti and Tusa Hiti are sunken water spouts. They unlock only after you go about 3 m down: the simulated barometer has to read +0.30 hPa above street level (864.40 hPa at 1,320 m, −0.1007 hPa per metre).
- **Boudhanath kora (Cluster B).** A ring geofence 20–58 m from the stupa, split into 12 sectors of 30°. The game adds up your clockwise angle while you walk inside the ring. +360° earns *Mandala Kora Master*. At −90° (counter-clockwise) it shows an etiquette warning.
- **Live Jatra (moving geofence).** Choose START → JATRA and the Rato Machhindranath (Bungadyah) chariot sets off from Mangal Bazar along Hakha Marg toward Sundhara at 0.4 m/s, with the smaller Minnath chariot ahead. Stay inside its 15 m circle and match its velocity (within 0.3 m/s) for 6 seconds. You earn the seasonal *Chariot Puller of Bungadyah (2027 Barha Barsa)* badge, and for 3 minutes, everything you earn counts 3×.
- **Progress.** Punya XP and five ranks (Yatri → Mandala Ratna), Kala Tokens, five badges, two riddles, and DANAM-style lore cards. Progress is saved in the browser.
- **Lore cards.** Each unlocked card has a record (ID, date in CE and Nepal Sambat, patron, typology, restoration), a *1970 vs 2026* drag slider, and an Inspector with numbered hotspots for the key carvings. The drawings are made for the prototype in the style of 1970s survey sheets; they are not archival reproductions.
- **Kala shop.** START → BAG spends tokens on a cafe voucher, a metalcraft workshop pass, or a simulated donation to the Manga Hiti guthi (which earns *Living Guthi Patron*). All are samples: nothing is redeemable and no money moves.

## The handheld

The game runs on an original pixel-art handheld console. The Patan overworld is drawn from OpenStreetMap footprints (`src/pixel/raster.js`): the brick plaza, the palace wing, houses with tiled and tin roofs, trees in the palace garden, and a pixel sprite for every monument. Boudhanath is drawn around the stupa. The camera follows your trekker.

| Button | Keyboard | Does |
| --- | --- | --- |
| D-pad | Arrows / WASD | Walk (or move the menu cursor) |
| A | X | Read the monument you are in, advance text, or fall in step with the chariot |
| B | Z | Hold to run (3 m/s, too fast for timers), back out of menus |
| L / R | Q / E | Walk down / up: the barometric altitude (−4.0 to +10.0 m) |
| START | Enter | Menu: DEX, BADGES, BAG (Kala shop), TRAVEL, JATRA, MAP layer, RESET |
| SELECT | Shift | Area map (whole square) |

You can also tap the map to walk there. The field notebook beside the console has the position source (Virtual Walker or Live GPS), the walking-pace slider, the barometer slider, live telemetry and the engine log.

Live GPS uses `navigator.geolocation.watchPosition`. Browsers can't read a phone's barometer, so altitude stays on L/R and the slider.

## Map layers (START → MAP)

- **Pixel:** the overworld drawn from OpenStreetMap data (`src/osm-patan.js`, regenerated with `node scripts/osm-patan.mjs`).
- **OpenStreetMap:** standard OSM tiles at zoom 19.
- **Satellite:** Esri World Imagery at zoom 19. Esri's imagery here sits a few metres west of OpenStreetMap, so the boxes look slightly shifted on it.

All layers use the same projection as the geofences, in both areas. Map data © OpenStreetMap contributors (ODbL).

## Develop

```sh
npm install
npm run dev     # local server
npm test        # engine tests (geometry, dwell, z-gate, kora, scoring)
npm run build   # production build in dist/
```

The game rules and dataset are in `src/engine.js` (plain JS, tested in Node). The interface is `src/App.jsx`.

Pushing to `main` builds the site and publishes it to GitHub Pages (`.github/workflows/deploy.yml`). `public/CNAME` sets the custom domain.

## Dataset notes

- Char Narayan's box in the brief repeated its first corner as the fourth (`[85.324814, 27.673361]`), which makes a triangle. The game uses `[85.324814, 27.673479]`, which completes the rectangle like the other boxes.
- Two boxes were moved onto their OpenStreetMap positions, keeping their size: Mul Chowk (was ~80 m west) and Sundari Chowk / Tusa Hiti (~61 m west). The original values are in comments in `src/engine.js`. Manga Hiti stays where the brief put it: the basin north of Keshav Narayan Chowk, as on the published site plan (OSM's point for it sits inside the palace wing). The other six matched OSM within about 5 m.
