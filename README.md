# Mandala Quest: Chronicles of the Living Valley

A GPS-only heritage game prototype for Patan Durbar Square and the Boudhanath kora. There are no QR codes: monuments unlock from where you stand.

Live at **https://mandala-quest.sagunpradhan.com.np**

## How it plays

- **Patan Durbar Square (Cluster A).** Nine monuments, each with an oriented bounding box. Once a second the game runs a ray-casting point-in-polygon test. Stay inside a box for 5 seconds at walking pace (≤ 2.0 m/s) to unlock its lore card. Leaving the box for up to 2 seconds (GPS drift) keeps the timer.
- **Barometric gate.** Manga Hiti and Tusa Hiti are sunken water spouts. They unlock only after you go about 3 m down: the simulated barometer has to read +0.30 hPa above street level (864.40 hPa at 1,320 m, −0.1007 hPa per metre).
- **Boudhanath kora (Cluster B).** A ring geofence 20–58 m from the stupa, split into 12 sectors of 30°. The game adds up your clockwise angle while you walk inside the ring. +360° earns *Mandala Kora Master*. At −90° (counter-clockwise) it shows an etiquette warning.
- **Live Jatra (moving geofence).** Turn on *Live Jatra* above the Patan map and the Rato Machhindranath (Bungadyah) chariot sets off from Mangal Bazar along Hakha Marg toward Sundhara at 0.4 m/s, with the smaller Minnath chariot ahead. Stay inside its 15 m circle and match its velocity (within 0.3 m/s) for 6 seconds. You earn the seasonal *Chariot Puller of Bungadyah (2027 Barha Barsa)* badge, and for 3 minutes, everything you earn counts 3×.
- **Progress.** Punya XP and five ranks (Yatri → Mandala Ratna), Kala Tokens, five badges, two riddles, and DANAM-style lore cards. Progress is saved in the browser.
- **Lore cards.** Each unlocked card has a record (ID, date in CE and Nepal Sambat, patron, typology, restoration), a *1970 vs 2026* drag slider, and an Inspector with numbered hotspots for the key carvings. The drawings are made for the prototype in the style of 1970s survey sheets; they are not archival reproductions.
- **Kala shop.** Click the Kala counter to spend tokens on a cafe voucher, a metalcraft workshop pass, or a simulated donation to the Manga Hiti guthi (which earns *Living Guthi Patron*). All are samples: nothing is redeemable and no money moves.

## Map layers (Patan)

- **Newa Parchment Blueprint:** building footprints, the brick plaza, the palace wing and streets from OpenStreetMap (`src/osm-patan.js`, regenerated with `node scripts/osm-patan.mjs`), with a drawing of each monument inside its geofence.
- **OpenStreetMap:** standard OSM tiles at zoom 19.
- **Satellite:** Esri World Imagery at zoom 19. Esri's imagery here sits a few metres west of OpenStreetMap, so the boxes look slightly shifted on it.

All layers use the same projection as the geofences. Map data © OpenStreetMap contributors (ODbL).

## Testing in a browser

- **Virtual Walker:** hold the d-pad buttons, use the arrow keys or WASD, or tap the map to walk there. The speed slider goes past 2.0 m/s so you can see the walking-pace check pause the timer. The altitude slider runs from −4.0 m to +10.0 m.
- **Live GPS:** uses `navigator.geolocation.watchPosition`. Browsers can't read a phone's barometer, so altitude stays on the slider.

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
- Three boxes were moved onto their OpenStreetMap positions, keeping their size: Mul Chowk (was ~80 m west), Sundari Chowk / Tusa Hiti (~61 m west) and Manga Hiti (~14 m north, which left the real spout outside the box). The original values are in comments in `src/engine.js`. The other six matched OSM within about 5 m.
