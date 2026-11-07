/**
 * Pixel sprites drawn as SVG rects with crisp edges, in map metres.
 * The player is an original trekker in a dhaka topi with a backpack.
 */
import { memo } from 'react';

const PAL = {
  k: '#2b1d1a', // outline
  t: '#efe6cf', // topi
  p: '#c4322a', // topi pattern
  h: '#3a2418', // hair
  s: '#e8b48c', // skin
  e: '#2b1d1a', // eye
  j: '#c8352b', // jacket
  J: '#8f2320',
  b: '#5b7c3a', // backpack
  B: '#3f5a27',
  n: '#3b5a9a', // trousers
  o: '#4a3426', // shoes
};

const HEAD = ['....kkkk....', '...kptptk...', '..kttpttpk..'];
const BODY = {
  down: [
    '..khhhhhhk..',
    '..khsssshk..',
    '..ksessesk..',
    '..kssssssk..',
    '...kssssk...',
    '..kjjjjjjk..',
    '.kjjJjjJjjk.',
    '.ksjjjjjjsk.',
    '.kkjjjjjjkk.',
    '..knnnnnnk..',
  ],
  up: [
    '..khhhhhhk..',
    '..khhhhhhk..',
    '..khhhhhhk..',
    '..khhhhhhk..',
    '...khhhhk...',
    '..kbbbbbbk..',
    '.kjbBBBBbjk.',
    '.ksbBBBBbsk.',
    '.kkbbbbbbkk.',
    '..knnnnnnk..',
  ],
  left: [
    '..khhhhhhk..',
    '..kshhhhhk..',
    '..kesshhhk..',
    '..ksssshhk..',
    '...ksssk....',
    '...kjjjbbk..',
    '..kjjjjbBk..',
    '..ksjjjbBk..',
    '..kkjjjbbk..',
    '...knnnnk...',
  ],
};
const LEGS = {
  front: [
    ['..knnnnnnk..', '..knk..knk..', '..kok..kok..'],
    ['..knnnnnnk..', '..knk..kok..', '..kok.......'],
    ['..knnnnnnk..', '..kok..knk..', '.......kok..'],
  ],
  side: [
    ['...knnnnk...', '...knkknk...', '...kokkok...'],
    ['...knnnnk...', '..knk..knk..', '.kok....kok.'],
    ['...knnnnk...', '...knkknk...', '...kokkok...'],
  ],
};

function grid(dir, frame) {
  const side = dir === 'left' || dir === 'right';
  const rows = [...HEAD, ...BODY[side ? 'left' : dir], ...LEGS[side ? 'side' : 'front'][frame]];
  return dir === 'right' ? rows.map((r) => [...r].reverse().join('')) : rows;
}

/** Rects for a character grid, merging runs of the same colour on each row. */
function Pixels({ rows, x, y, px, palette }) {
  const out = [];
  rows.forEach((row, j) => {
    let i = 0;
    while (i < row.length) {
      const ch = row[i];
      let k = i + 1;
      while (k < row.length && row[k] === ch) k++;
      if (ch !== '.') out.push(<rect key={`${j}-${i}`} x={x + i * px} y={y + j * px} width={(k - i) * px + 0.01} height={px + 0.01} fill={palette[ch]} />);
      i = k;
    }
  });
  return <g shapeRendering="crispEdges">{out}</g>;
}

export const dirOf = (bearing) => (bearing >= 315 || bearing < 45 ? 'up' : bearing < 135 ? 'right' : bearing < 225 ? 'down' : 'left');

/** The trekker, feet at (x, y). `px` is one sprite pixel in metres. */
export const Trainer = memo(function Trainer({ x, y, bearing, step, moving, px = 0.3 }) {
  const rows = grid(dirOf(bearing), moving ? (step % 2) + 1 : 0);
  const w = 12 * px;
  const h = rows.length * px;
  return (
    <g>
      <ellipse cx={x} cy={y} rx={w * 0.38} ry={px * 1.3} fill="#000" fillOpacity="0.28" />
      <Pixels rows={rows} x={x - w / 2} y={y - h + px * 0.5} px={px} palette={PAL} />
    </g>
  );
});

/**
 * Bungadyah's chariot (Rato Machhindranath), front three-quarter view: big wheels painted with
 * eyes, a timber base, the shrine, and the tall tower of green foliage with red bands.
 */
export function ChariotSprite({ x, y, scale = 1 }) {
  const p = 0.33 * scale;
  const W = 22;
  const rows = [];
  const H = 46;
  for (let j = 0; j < H; j++) rows.push(Array(W).fill('.'));
  const set = (i, j, c) => j >= 0 && j < H && i >= 0 && i < W && (rows[j][i] = c);
  const cx = W / 2;
  // tower: a tall cone of foliage with red bands, gold finial on top
  for (let j = 0; j < 30; j++) {
    const half = Math.max(1, Math.round(1 + (j / 30) * 6.5));
    for (let i = -half; i < half; i++) {
      const edge = i === -half || i === half - 1;
      set(cx + i, 3 + j, edge ? 'k' : j % 6 === 3 ? 'r' : (i + j) % 3 === 0 ? 'G' : 'g');
    }
  }
  set(cx - 1, 0, 'y');
  set(cx, 0, 'y');
  set(cx - 1, 1, 'y');
  set(cx, 1, 'Y');
  set(cx - 1, 2, 'k');
  set(cx, 2, 'k');
  // shrine box
  for (let j = 33; j < 38; j++) for (let i = -7; i < 7; i++) set(cx + i, j, j === 33 ? 'y' : i === -7 || i === 6 ? 'k' : 'r');
  // timber base
  for (let j = 38; j < 41; j++) for (let i = -10; i < 10; i++) set(cx + i, j, j === 40 ? 'k' : 'w');
  // wheels with Bhairav eyes
  for (const wx of [-8, 5]) {
    for (let j = 0; j < 5; j++) for (let i = 0; i < 4; i++) set(cx + wx + i, 41 + j, i === 0 || i === 3 || j === 0 || j === 4 ? 'k' : 'd');
    set(cx + wx + 1, 43, 'W');
    set(cx + wx + 2, 43, 'W');
  }
  const pal = { k: '#2b1a10', g: '#3f7a3a', G: '#5f9a4a', r: '#c4322a', y: '#e3a93f', Y: '#f6d77a', w: '#8a5a2b', d: '#3a2a1a', W: '#f4ead7' };
  const w = W * p;
  const h = H * p;
  return (
    <g>
      <ellipse cx={x} cy={y} rx={w * 0.5} ry={p * 2.5} fill="#000" fillOpacity="0.3" />
      <Pixels rows={rows.map((r) => r.join(''))} x={x - w / 2} y={y - h + p} px={p} palette={pal} />
    </g>
  );
}

/** Pullers on the ropes, walking ahead of the chariot. */
export function Crowd({ x, y, bearing, t }) {
  const colors = ['#c4322a', '#e3a93f', '#f4ead7', '#4f6fa6', '#3aa35a'];
  const people = [];
  const rad = (bearing * Math.PI) / 180;
  const ux = Math.sin(rad);
  const uy = -Math.cos(rad);
  for (let i = 0; i < 14; i++) {
    const along = 6 + (i % 7) * 1.5;
    const side = (i < 7 ? -1 : 1) * 1.1;
    const bob = (Math.floor(t * 2) + i) % 2 ? 0.15 : 0;
    const px = x + ux * along - uy * side;
    const py = y + uy * along + ux * side - bob;
    people.push(
      <g key={i} shapeRendering="crispEdges">
        <rect x={px - 0.3} y={py - 1.5} width="0.6" height="0.6" fill="#e8b48c" />
        <rect x={px - 0.35} y={py - 0.9} width="0.7" height="0.9" fill={colors[i % colors.length]} />
      </g>,
    );
  }
  const rope = `M${x + ux * 3} ${y + uy * 3} L${x + ux * 16} ${y + uy * 16}`;
  return (
    <g>
      <path d={rope} stroke="#c9a46a" strokeWidth="0.25" />
      {people}
    </g>
  );
}
