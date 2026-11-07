/**
 * Pixel-art overworld renderer. Draws each area once into a small image (PPM pixels per metre),
 * which the screen scales up with crisp pixels.
 *
 * Patan: OpenStreetMap footprints are scan-converted into a class grid, then textured in a
 * three-quarter view (roofs with a front wall below them), with drop shadows, trees and a pixel
 * sprite for every monument. Boudhanath is drawn procedurally around the stupa.
 */
import { BOUDHA, LANDMARKS, MONUMENTS } from '../engine.js';
import { OSM_FEATURES } from '../osm-patan.js';
import { PROJ, monumentBox } from '../view.js';

export const PPM = 3; // art pixels per metre

const C = { GROUND: 0, GRASS: 1, WATER: 2, PLINTH: 3, PLAZA: 4, STREET: 5, PATH: 6, COURT: 7, MON: 8, HOUSE: 9, TEMPLE: 10, PALACE: 11 };
const isBuilding = (c) => c >= C.HOUSE;
const KIND_CLASS = { green: C.GRASS, water: C.WATER, plinth: C.PLINTH, plaza: C.PLAZA, street: C.STREET, lane: C.STREET, path: C.PATH, house: C.HOUSE, temple: C.TEMPLE, palace: C.PALACE, column: C.PLINTH };
// The two Mani Mandapa pavilions beside Manga Hiti are mapped as plain buildings.
const PAVILIONS = new Set(['w328706342', 'w328706352']);

const hash = (x, y) => (((x * 73856093) ^ (y * 19349663) ^ ((x * y) >>> 0) * 83492791) >>> 0);

const rgbCache = new Map();
function rgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
  }
  return v;
}

function makeImage(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  const put = (x, y, hex, shade = 1) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const [r, g, b] = rgb(hex);
    const i = (y * w + x) * 4;
    data[i] = r * shade;
    data[i + 1] = g * shade;
    data[i + 2] = b * shade;
    data[i + 3] = 255;
  };
  const rect = (x, y, rw, rh, hex) => {
    for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) put(x + i, y + j, hex);
  };
  const frame = (x, y, rw, rh, hex) => {
    for (let i = 0; i < rw; i++) {
      put(x + i, y, hex);
      put(x + i, y + rh - 1, hex);
    }
    for (let j = 0; j < rh; j++) {
      put(x, y + j, hex);
      put(x + rw - 1, y + j, hex);
    }
  };
  return { w, h, data, put, rect, frame };
}

function toDataURL(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.w;
  canvas.height = img.h;
  canvas.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
  return canvas.toDataURL('image/png');
}

// ---------------------------------------------------------------- scan conversion

function fillRings(grid, rings, value, idv = 0) {
  const { w, h, cls, id } = grid;
  const edges = [];
  for (const r of rings) {
    for (let i = 0; i < r.length - 1; i++) {
      const [x1, y1] = r[i];
      const [x2, y2] = r[i + 1];
      if (y1 !== y2) edges.push([x1, y1, x2, y2]);
    }
  }
  if (!edges.length) return;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const e of edges) {
    ymin = Math.min(ymin, e[1], e[3]);
    ymax = Math.max(ymax, e[1], e[3]);
  }
  for (let y = Math.max(0, Math.floor(ymin)); y <= Math.min(h - 1, Math.ceil(ymax)); y++) {
    const yc = y + 0.5;
    const xs = [];
    for (const [x1, y1, x2, y2] of edges) {
      if (y1 <= yc !== y2 <= yc) xs.push(x1 + ((yc - y1) * (x2 - x1)) / (y2 - y1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(w - 1, Math.floor(xs[k + 1] - 0.5)); x++) {
        cls[y * w + x] = value;
        id[y * w + x] = idv;
      }
    }
  }
}

function thickLine(grid, pts, width, value) {
  const { w, h, cls } = grid;
  const r = width / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    for (let y = Math.max(0, Math.floor(Math.min(ay, by) - r)); y <= Math.min(h - 1, Math.ceil(Math.max(ay, by) + r)); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - r)); x <= Math.min(w - 1, Math.ceil(Math.max(ax, bx) + r)); x++) {
        const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / len2));
        const ex = ax + t * dx - (x + 0.5);
        const ey = ay + t * dy - (y + 0.5);
        if (ex * ex + ey * ey <= r * r) cls[y * w + x] = value;
      }
    }
  }
}

// ---------------------------------------------------------------- textures

function groundColor(c, x, y) {
  const n = hash(x, y);
  switch (c) {
    case C.GRASS:
      return n % 11 === 0 ? '#8fd16a' : n % 7 === 0 ? '#5f9e45' : (x + y) % 2 ? '#78bd58' : '#73b653';
    case C.WATER:
      return y % 5 === 0 && (x + (y >> 1)) % 7 < 3 ? '#9fd8f2' : '#4a9fd0';
    case C.PLINTH:
      return x % 4 === 0 || y % 4 === 0 ? '#bfae86' : '#d8caa4';
    case C.PLAZA:
    case C.COURT: {
      // basket-weave brick: 4x4 cells alternate between horizontal and vertical bricks
      const cell = ((x >> 2) + (y >> 2)) & 1;
      const u = cell ? x : y;
      const v = cell ? y : x;
      const mortar = u % 2 === 0 && v % 4 === 0;
      const joint = (u & 3) === 0;
      if (joint || mortar) return c === C.COURT ? '#e7c9a1' : '#d9a273';
      const dark = (hash(x >> 1, y >> 1) & 3) === 0;
      return c === C.COURT ? (dark ? '#cf946a' : '#dba67b') : dark ? '#a9542f' : '#bd6740';
    }
    case C.STREET:
      return y % 3 === 0 || (x + (y % 6 < 3 ? 0 : 3)) % 6 === 0 ? '#cfc3a6' : n % 13 === 0 ? '#d9cfb6' : '#e6dcc4';
    case C.PATH:
      return n % 9 === 0 ? '#cbbf9f' : '#ddd1b3';
    default:
      return n % 17 === 0 ? '#c9b48a' : n % 5 === 0 ? '#dcc8a0' : '#d6c29a';
  }
}

const HOUSE_ROOFS = ['#b5603d', '#a19c93', '#6f93bf', '#c98f4a', '#a14a3a', '#8f8a84', '#5f86b2'];
const HOUSE_WALLS = ['#eadcc0', '#d9b88f', '#c0704a', '#e6e1d6', '#b85f3f'];

function buildingColors(c, idv) {
  if (c === C.PALACE) return { roof: '#7a2c19', roofHi: '#9a3e24', wall: '#a8492b', window: '#3a1f10', tile: true };
  if (c === C.TEMPLE) return { roof: '#8f3a22', roofHi: '#b5532f', wall: '#a8492b', window: '#3a1f10', tile: true, gold: true };
  const roof = HOUSE_ROOFS[idv % HOUSE_ROOFS.length];
  return { roof, roofHi: null, wall: HOUSE_WALLS[(idv * 7) % HOUSE_WALLS.length], window: '#4a3a33', tile: roof === '#b5603d' || roof === '#a14a3a' };
}

/** Roofs on top, a front wall of a few pixels at the bottom edge, dark outlines, drop shadows. */
function paintGrid(img, grid) {
  const { w, h, cls, id } = grid;
  const down = new Int16Array(w * h).fill(-1);
  const up = new Int16Array(w * h).fill(-1);
  const same = (a, b) => isBuilding(cls[a]) && isBuilding(cls[b]) && id[a] === id[b];
  for (let x = 0; x < w; x++) {
    for (let y = h - 1; y >= 0; y--) {
      const i = y * w + x;
      if (!isBuilding(cls[i])) continue;
      down[i] = y + 1 < h && same(i, i + w) ? down[i + w] + 1 : 0;
    }
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      if (!isBuilding(cls[i])) continue;
      up[i] = y > 0 && same(i, i - w) ? up[i - w] + 1 : 0;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = cls[i];
      if (c === C.MON) continue;
      if (!isBuilding(c)) {
        let shade = 1;
        const b = (xx, yy) => xx >= 0 && yy >= 0 && isBuilding(cls[yy * w + xx]);
        if (b(x - 1, y - 1) || b(x, y - 1) || b(x - 1, y)) shade = 0.74;
        else if (b(x - 2, y - 2) || b(x - 1, y - 2) || b(x - 2, y - 1)) shade = 0.88;
        img.put(x, y, groundColor(c, x, y), shade);
        continue;
      }
      const col = buildingColors(c, id[i]);
      const total = up[i] + down[i] + 1;
      const wallH = Math.max(2, Math.min(6, Math.round(total * 0.3)));
      const edge =
        x === 0 || y === 0 || x === w - 1 || y === h - 1 || !same(i, i - 1) || !same(i, i + 1) || !same(i, i - w) || !same(i, i + w);
      if (edge) {
        img.put(x, y, '#2d1d16');
      } else if (down[i] < wallH) {
        const r = down[i];
        const win = c === C.PALACE ? x % 5 >= 1 && x % 5 <= 3 && r >= 1 && r <= wallH - 2 : x % 4 >= 1 && x % 4 <= 2 && r >= 1 && r <= 2;
        img.put(x, y, win ? col.window : col.wall, r === wallH - 1 ? 0.8 : 1);
      } else {
        const fromTop = up[i];
        let shade = 1;
        if (fromTop === 1 && col.roofHi) {
          img.put(x, y, col.roofHi);
          continue;
        }
        if (col.tile && fromTop % 2 === 0) shade = 0.86;
        if (!col.tile && hash(x, y) % 9 === 0) shade = 0.92;
        img.put(x, y, col.roof, shade);
      }
    }
  }
  // temple finials: a gold pixel pair at the top of each temple roof
  const tops = new Map();
  for (let i = 0; i < w * h; i++) {
    if (cls[i] !== C.TEMPLE) continue;
    const t = tops.get(id[i]) || { sx: 0, sy: 0, n: 0, miny: Infinity };
    t.sx += i % w;
    t.sy += Math.floor(i / w);
    t.n += 1;
    tops.set(id[i], t);
  }
  for (const t of tops.values()) {
    const cx = Math.round(t.sx / t.n);
    const cy = Math.round(t.sy / t.n) - 2;
    img.put(cx, cy, '#e3a93f');
    img.put(cx, cy - 1, '#f6d77a');
    img.put(cx + 1, cy, '#8a5d14');
  }
}

function tree(img, x, y) {
  const canopy = ['..kkk..', '.kgggk.', 'kggGggk', 'kgGGggk', 'kggggdk', '.kgddk.', '..ktk..'];
  const pal = { k: '#24401d', g: '#3f8a3a', G: '#68b85a', d: '#2f6b2c', t: '#6b4423' };
  canopy.forEach((row, j) => [...row].forEach((ch, i) => ch !== '.' && img.put(x + i - 3, y + j - 4, pal[ch])));
  img.put(x + 1, y + 3, '#2f5f2a', 0.7);
}

// ---------------------------------------------------------------- monument sprites (pixels)

const GOLD = '#e3a93f';
const GOLD_HI = '#f6d77a';
const GOLD_LO = '#8a5d14';

function plinth(img, x, y, w, h) {
  img.rect(x, y, w, h, '#d6c8a2');
  img.rect(x, y + h - 2, w, 2, '#b3a27a');
  img.frame(x, y, w, h, '#6e5c3c');
  img.frame(x + 1, y + 1, w - 2, h - 3, '#e8dcbc');
}

function pagoda(img, x, y, w, h, tiers) {
  plinth(img, x, y, w, h);
  const step = Math.max(2, Math.floor((Math.min(w, h) * 0.3) / tiers));
  for (let t = 0; t < tiers; t++) {
    const ins = 2 + t * step;
    const rx = x + ins;
    const ry = y + ins - t - 1;
    const rw = w - 2 * ins;
    const rh = h - 2 * ins - 1;
    if (rw < 3 || rh < 3) break;
    const roof = ['#8a3520', '#a8462a', '#c25a35', '#d06b40'][t] || '#d06b40';
    // shadow of this tier on the one below, then struts under the eave
    if (t > 0) for (let i = 0; i < rw + 1; i++) img.put(rx + i, ry + rh, '#3a160a');
    for (let i = 1; i < rw - 1; i += 2) img.put(rx + i, ry + rh + (t > 0 ? 1 : 0), '#4a2a14');
    img.rect(rx, ry, rw, rh, roof);
    for (let j = 2; j < rh - 1; j += 2) for (let i = 1; i < rw - 1; i++) img.put(rx + i, ry + j, roof, 0.86);
    for (let i = 0; i < rw; i++) {
      img.put(rx + i, ry, roof, 1.25);
      img.put(rx + i, ry + rh - 1, '#4f1f10');
    }
    for (let j = 0; j < rh; j++) {
      img.put(rx, ry + j, '#4f1f10');
      img.put(rx + rw - 1, ry + j, '#4f1f10');
    }
    img.put(rx, ry + rh - 1, GOLD);
    img.put(rx + rw - 1, ry + rh - 1, GOLD);
  }
  const cx = Math.round(x + w / 2) - 1;
  const top = y + 2 + (tiers - 1) * step - tiers;
  const cy = Math.round(y + h / 2) - tiers;
  img.rect(cx, Math.min(cy, top + 2), 2, 3, GOLD);
  img.put(cx, Math.min(cy, top + 2), GOLD_HI);
  img.put(cx + 1, Math.min(cy, top + 2) + 2, GOLD_LO);
}

function shikhara(img, x, y, w, h) {
  plinth(img, x, y, w, h);
  img.frame(x + 2, y + 2, w - 4, h - 4, '#a8956a');
  img.rect(x + 3, y + 3, w - 6, h - 6, '#cdb98d');
  const cx = x + w / 2;
  const cy = y + h / 2;
  const s = Math.min(w, h);
  const pin = (px, py, big) => {
    const X = Math.round(px) - 1;
    const Y = Math.round(py) - 1;
    img.rect(X, Y, big ? 3 : 2, big ? 3 : 2, GOLD);
    img.put(X, Y, GOLD_HI);
    img.put(X + (big ? 2 : 1), Y + (big ? 2 : 1), GOLD_LO);
  };
  const a = s * 0.2;
  const b = s * 0.32;
  // 12 on the outer ring, 8 around the spire, 1 central spire: 21 pinnacles
  for (const t of [-1, -1 / 3, 1 / 3, 1]) {
    pin(cx + t * b, cy - b);
    pin(cx + t * b, cy + b);
  }
  for (const t of [-1 / 3, 1 / 3]) {
    pin(cx - b, cy + t * b);
    pin(cx + b, cy + t * b);
  }
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]) pin(cx + dx * a, cy + dy * a);
  img.rect(Math.round(cx) - 3, Math.round(cy) - 3, 6, 6, '#b9a271');
  img.frame(Math.round(cx) - 3, Math.round(cy) - 3, 6, 6, '#6e5c3c');
  pin(cx, cy, true);
}

function court(img, x, y, w, h) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) img.put(x + i, y + j, groundColor(C.COURT, x + i, y + j), j < 2 ? 0.8 : 1);
}

function hiti(img, cx, cy, w, h, spouts) {
  const rings = ['#cbbd97', '#a99b74', '#c3b48c', '#968a68', '#b8aa82'];
  const x0 = Math.round(cx - w / 2);
  const y0 = Math.round(cy - h / 2);
  const k = Math.max(1, Math.floor(Math.min(w, h) / 12));
  rings.forEach((c, r) => {
    const ins = r * k;
    img.rect(x0 + ins, y0 + ins, w - 2 * ins, h - 2 * ins, c);
    img.rect(x0 + ins, y0 + ins, w - 2 * ins, 1, '#7a6b4c');
  });
  const ins = rings.length * k;
  const wx = x0 + ins;
  const wy = y0 + ins;
  const ww = w - 2 * ins;
  const wh = h - 2 * ins;
  for (let j = 0; j < wh; j++) for (let i = 0; i < ww; i++) img.put(wx + i, wy + j, (i + j * 2) % 7 === 0 && j % 3 === 1 ? '#9fd8f2' : '#3f8fc0');
  img.rect(wx, wy, ww, 1, '#2c6f98');
  for (let s = 0; s < spouts; s++) {
    const sx = Math.round(spouts === 1 ? wx + ww / 2 - 1 : wx + 1 + ((ww - 4) * s) / (spouts - 1));
    img.rect(sx, wy - 2, 2, 2, GOLD);
    img.put(sx, wy - 2, GOLD_HI);
    img.put(sx, wy, '#dff4ff');
    img.put(sx + 1, wy + 1, '#dff4ff');
  }
}

const TIERS = { LAL1350: 2, LAL1380: 3, LAL1320: 2, LAL1270: 3 };

function drawMonuments(img, to) {
  for (const m of MONUMENTS) {
    const b = monumentBox(m, to);
    const x = Math.round(b.x * PPM);
    const y = Math.round(b.y * PPM);
    const w = Math.round(b.w * PPM);
    const h = Math.round(b.h * PPM);
    if (m.kind === 'shikhara') shikhara(img, x, y, w, h);
    else if (m.kind === 'pagoda') pagoda(img, x, y, w, h, TIERS[m.id] || 2);
    else if (m.id === 'LAL1330') {
      court(img, x, y, w, h);
      const s = Math.round(Math.min(w, h) * 0.42);
      pagoda(img, Math.round(x + w / 2 - s / 2), Math.round(y + h / 2 - s / 2), s, s, 2);
    } else if (m.id === 'LAL1260') {
      court(img, x, y, w, h);
      const cx = Math.round(x + w / 2);
      const cy = Math.round(y + h / 2);
      img.rect(cx - 4, cy - 4, 8, 8, '#d6c8a2');
      img.frame(cx - 4, cy - 4, 8, 8, '#6e5c3c');
      img.rect(cx - 2, cy - 3, 4, 5, GOLD);
      img.rect(cx - 2, cy - 3, 4, 1, GOLD_HI);
    } else if (m.id === 'LAL1220') {
      court(img, x, y, w, h);
      const [tx, ty] = to(LANDMARKS.tusaHiti.pos);
      hiti(img, tx * PPM, ty * PPM, Math.round(w * 0.5), Math.round(h * 0.5), 1);
    } else if (m.id === 'LAL1360') {
      hiti(img, x + w / 2, y + h / 2, w, h, 3);
    }
  }
}

function drawLandmarks(img, to) {
  const at = (p) => to(p).map((v) => Math.round(v * PPM));
  const [gx, gy] = at(LANDMARKS.garuda.pos);
  img.rect(gx - 2, gy - 1, 4, 4, '#bea97b');
  img.frame(gx - 2, gy - 1, 4, 4, '#5e5134');
  img.rect(gx - 1, gy - 4, 2, 3, GOLD);
  img.put(gx - 1, gy - 4, GOLD_HI);
  const [cx, cy] = at(LANDMARKS.column.pos);
  img.rect(cx - 1, cy - 1, 3, 3, '#bea97b');
  img.rect(cx - 1, cy - 5, 2, 4, '#cdbb92');
  img.rect(cx - 1, cy - 7, 2, 2, GOLD);
  const [bx, by] = at(LANDMARKS.bell.pos);
  img.rect(bx - 5, by - 2, 10, 6, '#d6c8a2');
  img.rect(bx - 6, by - 6, 12, 4, '#7a2c19');
  img.rect(bx - 6, by - 6, 12, 1, '#9a3e24');
  img.put(bx - 5, by - 2, '#4a2a14');
  img.put(bx + 4, by - 2, '#4a2a14');
  img.rect(bx - 1, by - 1, 3, 3, '#8f6a2a');
  img.put(bx, by + 2, '#3a2a12');
  const [dx, dy] = at(LANDMARKS.goldenDoor.pos);
  img.rect(dx - 2, dy - 3, 4, 6, GOLD);
  img.frame(dx - 2, dy - 3, 4, 6, GOLD_LO);
  img.put(dx - 1, dy - 2, GOLD_HI);
  for (const s of [LANDMARKS.ganga.pos, LANDMARKS.yamuna.pos]) {
    const [sx, sy] = at(s);
    img.rect(sx - 1, sy - 2, 2, 3, '#9c7a3a');
    img.put(sx - 1, sy - 2, '#c9a35a');
  }
}

/** The Patan overworld as a PNG data URL. */
export function renderPatan() {
  const P = PROJ.patan;
  const w = Math.ceil(P.w * PPM);
  const h = Math.ceil(P.h * PPM);
  const grid = { w, h, cls: new Uint8Array(w * h), id: new Uint16Array(w * h) };
  const px = (ring) => ring.map(([lon, lat]) => P.to({ lat, lon }).map((v) => v * PPM));
  OSM_FEATURES.forEach((f, idx) => {
    let c = KIND_CLASS[f.kind];
    if (PAVILIONS.has(f.id)) c = C.TEMPLE;
    if (c == null) return;
    if (f.line) {
      thickLine(grid, px(f.line), (f.kind === 'street' ? 6 : f.kind === 'lane' ? 3.6 : 1.6) * PPM, c);
      return;
    }
    const rings = f.rings.map(px);
    fillRings(grid, rings, c, idx + 1);
    if (c === C.PALACE && rings.length > 1) fillRings(grid, rings.slice(1), C.COURT, 0);
  });
  for (const m of MONUMENTS) {
    const b = monumentBox(m, P.to);
    const box = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x, b.y]].map(([x, y]) => [x * PPM, y * PPM]);
    fillRings(grid, [box], C.MON, 0);
  }
  const img = makeImage(w, h);
  paintGrid(img, grid);
  for (let y = 4; y < h - 4; y += 9) {
    for (let x = 4; x < w - 4; x += 9) {
      const jx = x + (hash(x, y) % 4) - 2;
      const jy = y + (hash(y, x) % 4) - 2;
      let ok = true;
      for (let j = -3; j <= 3 && ok; j++) for (let i = -3; i <= 3 && ok; i++) if (grid.cls[(jy + j) * w + (jx + i)] !== C.GRASS) ok = false;
      if (ok) tree(img, jx, jy);
    }
  }
  drawMonuments(img, P.to);
  drawLandmarks(img, P.to);
  return toDataURL(img);
}

/** The Boudhanath overworld: plaza, kora walkway, the stupa with prayer flags, a ring of houses. */
export function renderBoudha() {
  const S = BOUDHA.halfSpan;
  const w = Math.ceil(S * 2 * PPM);
  const h = w;
  const img = makeImage(w, h);
  const grid = { w, h, cls: new Uint8Array(w * h), id: new Uint16Array(w * h) };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const e = (x + 0.5) / PPM - S;
      const n = S - (y + 0.5) / PPM;
      const r = Math.hypot(e, n);
      const a = ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360;
      if (r > 67) {
        const seg = Math.floor(a / 9);
        const gap = a % 9 < 0.9 || r > 67 + 9 + (seg % 3) * 2;
        if (!gap) {
          grid.cls[y * w + x] = C.HOUSE;
          grid.id[y * w + x] = seg + 1;
        } else grid.cls[y * w + x] = C.STREET;
      } else grid.cls[y * w + x] = r > 62 ? C.STREET : C.MON;
    }
  }
  paintGrid(img, grid);
  const flags = ['#3a6fd8', '#f4f4f4', '#d8392b', '#3aa35a', '#f2c230'];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const e = (x + 0.5) / PPM - S;
      const n = S - (y + 0.5) / PPM;
      const r = Math.hypot(e, n);
      if (r > 62) continue;
      const a = ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360;
      let c;
      let shade = 1;
      if (r > BOUDHA.rMin) {
        // kora walkway: warm stone in rings of slabs
        const ring = Math.floor(r * 0.9);
        const slab = Math.floor((a * r) / 40);
        c = (r * 0.9) % 1 < 0.12 || ((a * r) / 40) % 1 < 0.06 ? '#cbbd9e' : (ring + slab) % 3 === 0 ? '#e4d8bd' : '#ddd0b2';
        if (r < BOUDHA.rMin + 1.6) shade = 0.8; // shadow of the stupa wall
      } else if (r > 19) {
        c = Math.floor(a / 2.5) % 2 ? '#c4322a' : GOLD; // prayer wheels
      } else if (r > 17) {
        c = '#efeadf';
      } else if (r > 15.5) {
        c = '#d9d2c3';
      } else if (r > 13) {
        c = '#f3efe5';
      } else {
        const lit = (-e * 0.6 + n * 0.6) / 13;
        c = lit > 0.35 ? '#ffffff' : lit > -0.2 ? '#f4f2ea' : lit > -0.6 ? '#dedbd0' : '#c8c4b8';
      }
      const ae = Math.abs(e);
      const an = Math.abs(n);
      if (Math.max(ae, an) < 3.4) {
        c = Math.max(ae, an) > 3 ? GOLD_LO : GOLD;
        if (Math.max(ae, an) < 2.4) c = '#efc35a';
        if (Math.max(ae, an) < 1.5) c = GOLD;
        if (Math.max(ae, an) < 0.7) c = GOLD_HI;
        if (n < -2.2 && n > -3 && ae > 0.5 && ae < 1.9) c = '#1d3d6b'; // the eyes, facing south
      }
      img.put(x, y, c, shade);
    }
  }
  for (let k = 0; k < 8; k++) {
    const ang = (k * Math.PI) / 4 + Math.PI / 8;
    for (let d = 4; d < 19; d += 0.8) {
      const e = Math.sin(ang) * d;
      const n = Math.cos(ang) * d;
      img.put((e + S) * PPM, (S - n) * PPM, flags[Math.floor(d / 0.8) % flags.length]);
    }
  }
  return toDataURL(img);
}
