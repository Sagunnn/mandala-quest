/**
 * Mandala Quest game engine: the monument dataset and the GPS-only rules.
 * No React here, so `npm test` can run it in plain Node.
 *
 * Coordinates: points are { lat, lon }. Polygons (OBBs) are [lon, lat] pairs, as in GeoJSON.
 */

// ---------------------------------------------------------------- rules

export const TICK_MS = 1000; // geofences are checked once a second (1 Hz)
export const DWELL_SECONDS = 5; // seconds inside a monument before it unlocks (15 s in the field)
export const MAX_WALK_SPEED = 2.0; // m/s; faster than this is not on foot, so the timer pauses
export const EXIT_GRACE_TICKS = 2; // a GPS fix may jump out for 2 ticks before the timer resets

export const BARO = { aslMeters: 1320, baselineHpa: 864.4, hpaPerMeter: -0.1007 };
export const Z_GATE = { depthMeters: -3.0, shiftHpa: 0.3 };
export const ALTITUDE_RANGE = { min: -4.0, max: 10.0 };

/** Pressure (hPa) at `dz` metres above or below street level in Patan (1,320 m ASL). */
export function pressureHpa(dz) {
  return BARO.baselineHpa + BARO.hpaPerMeter * dz;
}

/** True once the barometer reads at least +0.30 hPa above street level (about 3 m down the steps). */
export function zGatePassed(dz) {
  return pressureHpa(dz) - BARO.baselineHpa >= Z_GATE.shiftHpa - 1e-9;
}

// ---------------------------------------------------------------- geometry

/** Metres per degree of latitude and longitude at `lat` (WGS84 series). */
export function metersPerDegree(lat) {
  const p = (lat * Math.PI) / 180;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p),
    lon: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p),
  };
}

/** East/north offset in metres of `p` from `origin` (flat-earth; fine under a few km). */
export function toLocal(origin, p) {
  const m = metersPerDegree(origin.lat);
  return { e: (p.lon - origin.lon) * m.lon, n: (p.lat - origin.lat) * m.lat };
}

export function fromLocal(origin, e, n) {
  const m = metersPerDegree(origin.lat);
  return { lat: origin.lat + n / m.lat, lon: origin.lon + e / m.lon };
}

export function distanceMeters(a, b) {
  const { e, n } = toLocal(a, b);
  return Math.hypot(e, n);
}

/** Compass bearing from `from` to `to`, 0–360°, clockwise from north. */
export function bearingDeg(from, to) {
  const { e, n } = toLocal(from, to);
  return ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360;
}

/** Signed smallest turn from bearing a to bearing b, in (-180, 180]. Positive = clockwise. */
export function angleDelta(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Jordan curve ray casting: cast a ray east from the point and count edge crossings.
 * Odd = inside. `point` and `poly` are [lon, lat].
 */
export function pointInPolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------- Cluster A: Patan Durbar Square

export const PATAN = {
  id: 'patan',
  name: 'Patan Durbar Square',
  city: 'Lalitpur',
  bounds: { latMin: 27.6725, latMax: 27.674, lonMin: 85.3242, lonMax: 85.3257 },
  center: { lat: 27.67325, lon: 85.32495 },
  start: { lat: 27.6735, lon: 85.325 },
};

const riddleMatch = (patterns) => (answer) => {
  const s = answer.toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]/g, ' ').replace(/\s+/g, ' ').trim();
  return patterns.some((p) => p.test(s));
};

export const MONUMENTS = [
  {
    id: 'LAL1340',
    name: 'Krishna Mandir',
    nepali: 'कृष्ण मन्दिर',
    kind: 'shikhara',
    typeLabel: 'Shikhara Temple',
    centroid: { lat: 27.67362, lon: 85.32495 },
    obb: [[85.324889, 27.673566], [85.325011, 27.673566], [85.325011, 27.673674], [85.324889, 27.673674]],
    riddle: {
      question: 'How many gilded pinnacles (gajurs) crown this 17th-century stone Shikhara temple?',
      answer: '21',
      check: riddleMatch([/^21$/, /^twenty ?one$/, /^21 (gajurs?|pinnacles?)$/]),
      hint: 'Count the main spire and the small spires on each tier around it.',
    },
    lore: {
      era: '1637 CE',
      patron: 'King Siddhi Narasimha Malla',
      body: [
        'Legend says Krishna and Radha appeared to King Siddhi Narasimha Malla in a dream, and he raised this temple on the spot where they stood.',
        'It is built entirely of stone in the North Indian Shikhara style, unusual in a valley of brick pagodas. Friezes along the first and second floors carve scenes from the Mahabharata and the Ramayana, with captions in old Newari.',
        'A gilded Garuda, Vishnu’s mount, kneels on a pillar facing the temple. Each year on Krishna Janmashtami, devotees fill the square through the night.',
      ],
    },
  },
  {
    id: 'LAL1350',
    name: 'Vishwanath Temple',
    nepali: 'विश्वनाथ मन्दिर',
    kind: 'pagoda',
    typeLabel: 'Pagoda Temple',
    centroid: { lat: 27.67372, lon: 85.3251 },
    obb: [[85.325044, 27.67367], [85.325156, 27.67367], [85.325156, 27.67377], [85.325044, 27.67377]],
    riddle: {
      question: 'Which monolithic stone animals guard the western entrance steps?',
      answer: 'Two Elephants',
      check: riddleMatch([/elephants?/, /hatti/, /हात्ती/]),
      hint: 'They are the largest animals in Nepal’s forests, and each carries a rider.',
    },
    lore: {
      era: '1627 CE',
      patron: 'King Siddhi Narasimha Malla',
      body: [
        'A two-tiered pagoda to Shiva as Vishwanath, Lord of the Universe. A large Shiva linga stands in the sanctum, and Shiva’s bull Nandi faces the temple from across the steps.',
        'The temple partly collapsed in the monsoon of 1990 and was rebuilt. It was badly damaged again in the 2015 Gorkha earthquake and restored by local craftspeople.',
      ],
    },
  },
  {
    id: 'LAL1380',
    name: 'Bhimsen Temple',
    nepali: 'भीमसेन मन्दिर',
    kind: 'pagoda',
    typeLabel: 'Pagoda Temple',
    centroid: { lat: 27.67387, lon: 85.32523 },
    obb: [[85.325159, 27.673825], [85.325301, 27.673825], [85.325301, 27.673915], [85.325159, 27.673915]],
    lore: {
      era: '17th century',
      patron: 'Rebuilt by King Srinivasa Malla',
      body: [
        'Bhimsen, the strongman of the Mahabharata, is worshipped by the Newar merchant community as the god of trade and business.',
        'The three-tiered pagoda carries a gilded balcony across its front. It has been rebuilt after fire and earthquake several times, including after the 1934 Nepal–Bihar earthquake.',
      ],
    },
  },
  {
    id: 'LAL1320',
    name: 'Char Narayan',
    altName: 'Jagannarayan',
    nepali: 'चार नारायण',
    kind: 'pagoda',
    typeLabel: 'Pagoda Temple',
    centroid: { lat: 27.67342, lon: 85.32488 },
    // The brief's fourth corner repeated the first ([85.324814, 27.673361]), which makes a triangle
    // with the centroid on its edge. The NW corner is [85.324814, 27.673479], as in the other boxes.
    obb: [[85.324814, 27.673361], [85.324946, 27.673361], [85.324946, 27.673479], [85.324814, 27.673479]],
    lore: {
      era: '1566 CE',
      patron: 'Purandar Singh',
      body: [
        'Dedicated to Narayan (Vishnu), this two-tiered brick pagoda is counted among the oldest standing temples in the square.',
        'Its roof struts are carved with Vishnu’s avatars and with small erotic scenes, a common feature of Newar temples. Stone lions guard the plinth.',
      ],
    },
  },
  {
    id: 'LAL1330',
    name: 'Keshav Narayan Chowk',
    nepali: 'केशव नारायण चोक',
    kind: 'courtyard',
    typeLabel: 'Royal Courtyard',
    centroid: { lat: 27.67339, lon: 85.32532 },
    obb: [[85.325178, 27.673264], [85.325462, 27.673264], [85.325462, 27.673516], [85.325178, 27.673516]],
    lore: {
      era: 'Completed 1734 CE',
      patron: 'Malla kings of Patan',
      body: [
        'The northern courtyard of the royal palace, entered through the Golden Gate (Sun Dhoka) with the Golden Window above it.',
        'Restored in the 1990s with Austrian support, it has housed the Patan Museum since 1997, one of the finest collections of Nepalese bronze and religious art.',
      ],
    },
  },
  {
    id: 'LAL1270',
    name: 'Taleju Temple North',
    nepali: 'तलेजु मन्दिर',
    kind: 'pagoda',
    typeLabel: 'Sanctum Viewpoint',
    centroid: { lat: 27.67321, lon: 85.32523 },
    obb: [[85.325169, 27.673156], [85.325291, 27.673156], [85.325291, 27.673264], [85.325169, 27.673264]],
    lore: {
      era: '1640 CE',
      patron: 'King Siddhi Narasimha Malla',
      body: [
        'Taleju Bhawani was the royal goddess of the Malla kings. Her tall temple rises over the palace wing, and it was rebuilt after the 1934 earthquake brought it down.',
        'The sanctum is reserved for its priests. This geofence is a viewpoint outside: the game never sends players inside.',
      ],
    },
  },
  {
    id: 'LAL1260',
    name: 'Mul Chowk',
    nepali: 'मूल चोक',
    kind: 'courtyard',
    typeLabel: 'Royal Courtyard',
    centroid: { lat: 27.67318, lon: 85.32447 },
    obb: [[85.324338, 27.673063], [85.324602, 27.673063], [85.324602, 27.673297], [85.324338, 27.673297]],
    lore: {
      era: '1660s CE',
      patron: 'Siddhi Narasimha and Srinivasa Malla',
      body: [
        'The largest and oldest courtyard of the palace, built for royal rituals. A small gilded shrine, the Bidya Mandir, stands at its centre.',
        'Bronze figures of the river goddesses Ganga, on a makara, and Yamuna, on a tortoise, flank the golden door to the shrine of Taleju.',
      ],
    },
  },
  {
    id: 'LAL1220',
    name: 'Sundari Chowk & Tusa Hiti',
    nepali: 'सुन्दरी चोक र तुषा हिटी',
    kind: 'hiti',
    typeLabel: 'Royal Courtyard + Sunken Bath',
    centroid: { lat: 27.6727, lon: 85.32452 },
    obb: [[85.324409, 27.672601], [85.324631, 27.672601], [85.324631, 27.672799], [85.324409, 27.672799]],
    zGate: true,
    lore: {
      era: '1647 CE',
      patron: 'King Siddhi Narasimha Malla',
      body: [
        'The southern courtyard of the palace hides Tusa Hiti, the king’s private sunken bath. Its walls are lined with carved stone deities, and water runs from a gilded spout.',
        'The king bathed here before worship. Walk down into the bath to unlock it: the barometer must read +0.30 hPa (about 3 m below the courtyard).',
      ],
    },
  },
  {
    id: 'LAL1360',
    name: 'Manga Hiti',
    nepali: 'मंगः हिटी',
    kind: 'hiti',
    typeLabel: 'Sunken Stone Spout',
    centroid: { lat: 27.67365, lon: 85.32551 },
    obb: [[85.325439, 27.673587], [85.325581, 27.673587], [85.325581, 27.673713], [85.325439, 27.673713]],
    zGate: true,
    lore: {
      era: '570 CE',
      patron: 'Licchavi period',
      body: [
        'One of the oldest working water spouts in the Kathmandu Valley. Its three spouts are carved as makaras, the crocodile-like water creatures of Hindu myth.',
        'Hitis are fed by underground channels from ponds and aquifers, a water system that has served Patan for 1,400 years. Neighbours still fill their water jars here every morning.',
        'Walk down the stone steps: the barometer must read +0.30 hPa (about 3 m below the street) to unlock.',
      ],
    },
  },
];

// ---------------------------------------------------------------- Cluster B: Boudhanath kora

export const BOUDHA = {
  id: 'boudha',
  name: 'Boudhanath Stupa',
  center: { lat: 27.721389, lon: 85.361944 },
  rMin: 20,
  rMax: 58,
  rWalk: 48,
  sectors: 12,
  halfSpan: 75, // the map shows 75 m each way from the centre
  lore: {
    id: 'KTM-BOUDHA',
    era: 'Founded c. 5th–6th century CE; rebuilt many times',
    body: [
      'One of the largest stupas in the world and a centre of Tibetan Buddhism in Nepal, part of the Kathmandu Valley World Heritage Site since 1979.',
      'The eyes of the Buddha look out from the square harmika in all four directions. Thirteen tiers above them stand for the steps to enlightenment.',
      'The 2015 earthquake cracked the spire. It was taken down and rebuilt with gifts from the community, and reopened in November 2016.',
      'Pilgrims walk the kora clockwise, keeping the stupa on their right and turning prayer wheels as they go.',
    ],
  },
};

export const SECTOR_NAMES = ['N', 'NNE', 'ENE', 'E', 'ESE', 'SSE', 'S', 'SSW', 'WSW', 'W', 'WNW', 'NNW'];
export const BOUDHA_START = fromLocal(BOUDHA.center, 0, -66); // south gate, just outside the ring
export const KORA_GOAL = 360;
export const KORA_WARN = -90;
const KORA_REARM = -45; // after a warning, walk back past -45° before it can warn again

// ---------------------------------------------------------------- dwell engine

/**
 * One 1 Hz step of the monument geofences.
 * dwell: { [id]: { t, out, inside, status } } from the last step.
 * Returns the next dwell map, the ids that unlocked on this step, and status changes for the log.
 * Status: idle | dwelling | too-fast | grace | need-descent | unlocked.
 */
export function stepDwell(dwell, { pos, speed, dz, dt, unlocked }) {
  const next = {};
  const newly = [];
  const changes = [];
  const point = [pos.lon, pos.lat];
  for (const m of MONUMENTS) {
    const prev = dwell[m.id] || { t: 0, out: 0, inside: false, status: 'idle' };
    const inside = pointInPolygon(point, m.obb);
    let { t, out } = prev;
    let status;
    if (unlocked[m.id]) {
      next[m.id] = { t: DWELL_SECONDS, out: 0, inside, status: 'unlocked' };
      continue;
    }
    if (inside) {
      out = 0;
      if (speed > MAX_WALK_SPEED) {
        status = 'too-fast';
      } else {
        t = Math.min(DWELL_SECONDS, t + dt);
        status = 'dwelling';
      }
      if (t >= DWELL_SECONDS) {
        if (m.zGate && !zGatePassed(dz)) {
          status = 'need-descent';
        } else {
          status = 'unlocked';
          newly.push(m.id);
        }
      }
    } else {
      out = t > 0 ? out + 1 : 0;
      if (t > 0 && out <= EXIT_GRACE_TICKS) {
        status = 'grace';
      } else {
        t = 0;
        out = 0;
        status = 'idle';
      }
    }
    if (status !== prev.status || inside !== prev.inside) changes.push({ id: m.id, from: prev.status, to: status, inside });
    next[m.id] = { t, out, inside, status };
  }
  return { dwell: next, newly, changes };
}

// ---------------------------------------------------------------- kora engine

export function initialKora() {
  return { theta: 0, visited: Array(BOUDHA.sectors).fill(false), master: false, warned: false };
}

/**
 * One 1 Hz step of the Boudhanath kora.
 * Adds the turn since the last step to theta (clockwise positive) while the player is on foot inside
 * the 20–58 m ring. Leaving the ring forgets the last bearing, so cutting across or circling outside
 * the ring never counts.
 */
export function stepKora(kora, last, { pos, speed }) {
  const { e, n } = toLocal(BOUDHA.center, pos);
  const r = Math.hypot(e, n);
  const bearing = ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360;
  const inRing = r >= BOUDHA.rMin && r <= BOUDHA.rMax;
  const sector = Math.floor(bearing / (360 / BOUDHA.sectors)) % BOUDHA.sectors;
  const live = { r, bearing, inRing, sector, tooFast: inRing && speed > MAX_WALK_SPEED, lastBearing: null };
  const events = [];
  if (!inRing) return { kora, live, events };
  live.lastBearing = bearing;
  if (live.tooFast) return { kora, live, events };

  let { theta, visited, master, warned } = kora;
  if (last?.lastBearing != null) theta += angleDelta(last.lastBearing, bearing);
  if (!visited[sector]) {
    visited = visited.map((v, i) => v || i === sector);
    events.push({ type: 'sector', sector });
  }
  if (!master && theta >= KORA_GOAL) {
    master = true;
    events.push({ type: 'master' });
  }
  if (!warned && theta <= KORA_WARN) {
    warned = true;
    events.push({ type: 'etiquette' });
  } else if (warned && theta > KORA_REARM) {
    warned = false;
  }
  return { kora: { theta, visited, master, warned }, live, events };
}

// ---------------------------------------------------------------- scoring

export const XP = { unlock: 100, zGateBonus: 50, riddle: 75, sector: 10, koraMaster: 300 };
export const KALA = { unlock: 10, riddle: 15, sector: 2, koraMaster: 50, badge: 25 };

export const RANKS = [
  { tier: 1, name: 'Yatri', nepali: 'यात्री', meaning: 'Traveller', xp: 0 },
  { tier: 2, name: 'Tirthayatri', nepali: 'तीर्थयात्री', meaning: 'Pilgrim', xp: 200 },
  { tier: 3, name: 'Shilpi', nepali: 'शिल्पी', meaning: 'Artisan', xp: 500 },
  { tier: 4, name: 'Guthiyar', nepali: 'गुठियार', meaning: 'Guthi keeper', xp: 900 },
  { tier: 5, name: 'Mandala Ratna', nepali: 'मण्डल रत्न', meaning: 'Jewel of the Mandala', xp: 1400 },
];

export const BADGES = [
  {
    id: 'hiti',
    name: 'Hiti Hydrologist',
    how: 'Descend into both sunken water spouts: Manga Hiti and Tusa Hiti.',
    needs: ['LAL1360', 'LAL1220'],
  },
  {
    id: 'sthapati',
    name: 'Sthapati of Shikhara & Pagoda',
    how: 'Unlock the stone Shikhara and all three pagoda temples.',
    needs: ['LAL1340', 'LAL1350', 'LAL1380', 'LAL1320'],
  },
  { id: 'kora', name: 'Mandala Kora Master', how: 'Walk one full clockwise kora (+360°) around Boudhanath.', kora: true },
];

export function initialProgress() {
  return { unlocked: {}, riddles: {}, kora: initialKora() };
}

export function computeScore(progress) {
  let xp = 0;
  let kala = 0;
  for (const m of MONUMENTS) {
    if (progress.unlocked[m.id]) {
      xp += XP.unlock + (m.zGate ? XP.zGateBonus : 0);
      kala += KALA.unlock;
    }
    if (progress.riddles[m.id]) {
      xp += XP.riddle;
      kala += KALA.riddle;
    }
  }
  const sectors = progress.kora.visited.filter(Boolean).length;
  xp += sectors * XP.sector;
  kala += sectors * KALA.sector;
  if (progress.kora.master) {
    xp += XP.koraMaster;
    kala += KALA.koraMaster;
  }
  const badges = BADGES.filter((b) => (b.kora ? progress.kora.master : b.needs.every((id) => progress.unlocked[id]))).map((b) => b.id);
  kala += badges.length * KALA.badge;
  const rank = [...RANKS].reverse().find((r) => xp >= r.xp);
  const nextRank = RANKS.find((r) => r.xp > xp) || null;
  return { xp, kala, badges, rank, nextRank };
}

export const MAX_XP =
  MONUMENTS.reduce((s, m) => s + XP.unlock + (m.zGate ? XP.zGateBonus : 0) + (m.riddle ? XP.riddle : 0), 0) +
  BOUDHA.sectors * XP.sector +
  XP.koraMaster;
