/**
 * Drawings for Mandala Quest.
 * - Map glyphs: top-down plans drawn inside each monument's box (units are metres on the map).
 * - Elevations: side views for the lore card's "Then & now" slider and Inspector
 *   (viewBox 0 0 200 150, ground at y = 140).
 */

// ---------------------------------------------------------------- map glyphs (top-down)

const STONE = ['#ddd0ae', '#cdbb92', '#bea97b'];
const ROOF = ['#7f2f1b', '#953a22', '#a8492b', '#b85a36'];
const GOLD = '#d9a336';
const GOLD_DARK = '#8a5d14';

/** 21 pinnacles in plan: 1 central spire, 8 around it, 12 on the outer ring. */
function ShikharaPlan({ cx, cy, s }) {
  const ringA = [];
  const a = s * 0.2;
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]) ringA.push([cx + dx * a, cy + dy * a]);
  const ringB = [];
  const b = s * 0.31;
  for (const t of [-1, -1 / 3, 1 / 3, 1]) {
    ringB.push([cx + t * b, cy - b], [cx + t * b, cy + b]);
  }
  for (const t of [-1 / 3, 1 / 3]) ringB.push([cx - b, cy + t * b], [cx + b, cy + t * b]);
  return (
    <g>
      {[0.98, 0.82, 0.66].map((f, i) => (
        <rect key={f} x={cx - (s * f) / 2} y={cy - (s * f) / 2} width={s * f} height={s * f} fill={STONE[i]} stroke="#7c6640" strokeWidth="0.15" />
      ))}
      {/* steps on the east side, toward the Garuda pillar */}
      {[0, 1, 2].map((i) => (
        <line key={i} x1={cx + s * 0.49 - i * 0.5} y1={cy - s * 0.12} x2={cx + s * 0.49 - i * 0.5} y2={cy + s * 0.12} stroke="#7c6640" strokeWidth="0.12" />
      ))}
      {ringB.map(([x, y], i) => (
        <circle key={`b${i}`} cx={x} cy={y} r={s * 0.04} fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.1" />
      ))}
      {ringA.map(([x, y], i) => (
        <circle key={`a${i}`} cx={x} cy={y} r={s * 0.05} fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.1" />
      ))}
      <circle cx={cx} cy={cy} r={s * 0.13} fill="#c9b07a" stroke="#7c6640" strokeWidth="0.15" />
      {Array.from({ length: 8 }, (_, i) => {
        const t = (i * Math.PI) / 4;
        return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(t) * s * 0.13} y2={cy + Math.sin(t) * s * 0.13} stroke="#7c6640" strokeWidth="0.1" />;
      })}
      <circle cx={cx} cy={cy} r={s * 0.055} fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.12" />
    </g>
  );
}

/** Tiered Newa pagoda in plan: nested roofs with hip lines, strut ticks under the lowest eave. */
function PagodaPlan({ cx, cy, s, tiers, door = 'w' }) {
  const roofs = Array.from({ length: tiers }, (_, i) => s * 0.43 * (1 - i * (0.62 / tiers)));
  const r0 = roofs[0];
  const struts = [];
  for (let i = -3; i <= 3; i++) {
    const t = (i / 3.4) * r0;
    struts.push([cx + t, cy - r0, 0, -1], [cx + t, cy + r0, 0, 1], [cx - r0, cy + t, -1, 0], [cx + r0, cy + t, 1, 0]);
  }
  const doorSide = { w: [cx - s * 0.48, cy, -1, 0], e: [cx + s * 0.48, cy, 1, 0], s: [cx, cy + s * 0.48, 0, 1], n: [cx, cy - s * 0.48, 0, -1] }[door];
  return (
    <g>
      <rect x={cx - s * 0.49} y={cy - s * 0.49} width={s * 0.98} height={s * 0.98} fill={STONE[0]} stroke="#7c6640" strokeWidth="0.15" />
      <rect x={cx - s * 0.46} y={cy - s * 0.46} width={s * 0.92} height={s * 0.92} fill="none" stroke="#7c6640" strokeWidth="0.1" strokeDasharray="0.4 0.3" />
      {/* entrance steps */}
      {[0, 1, 2].map((i) => {
        const [x, y, dx, dy] = doorSide;
        const ox = x - dx * i * 0.45;
        const oy = y - dy * i * 0.45;
        return dx ? (
          <line key={i} x1={ox} y1={oy - s * 0.1} x2={ox} y2={oy + s * 0.1} stroke="#7c6640" strokeWidth="0.12" />
        ) : (
          <line key={i} x1={ox - s * 0.1} y1={oy} x2={ox + s * 0.1} y2={oy} stroke="#7c6640" strokeWidth="0.12" />
        );
      })}
      {struts.map(([x, y, dx, dy], i) => (
        <line key={i} x1={x} y1={y} x2={x + dx * 0.7} y2={y + dy * 0.7} stroke="#5a2a14" strokeWidth="0.18" />
      ))}
      {roofs.map((r, i) => (
        <g key={i}>
          <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={ROOF[Math.min(i, ROOF.length - 1)]} stroke="#4a1d0e" strokeWidth="0.15" />
          <path d={`M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx + r} ${cy - r}L${cx - r} ${cy + r}`} stroke="#4a1d0e" strokeOpacity="0.45" strokeWidth="0.12" />
        </g>
      ))}
      <circle cx={cx} cy={cy} r={s * 0.05} fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.12" />
    </g>
  );
}

/** Sunken stepped basin: concentric rings going down to the water, makara spouts on the north wall. */
export function HitiPlan({ cx, cy, w, h, spouts = 3 }) {
  const rings = 5;
  const blues = ['#cfc3a3', '#bdb08e', '#a9a283', '#7fa3a8', '#4f8ea8'];
  const innerTop = cy - (h / 2) * (1 - (rings - 1) * 0.16);
  const innerW = w * (1 - (rings - 1) * 0.16);
  return (
    <g>
      {Array.from({ length: rings }, (_, i) => {
        const f = 1 - i * 0.16;
        return <rect key={i} x={cx - (w * f) / 2} y={cy - (h * f) / 2} width={w * f} height={h * f} rx={0.4} fill={blues[i]} stroke="#5e5134" strokeWidth="0.12" />;
      })}
      {Array.from({ length: spouts }, (_, i) => {
        const x = cx + (spouts === 1 ? 0 : (i / (spouts - 1) - 0.5) * innerW * 0.6);
        return (
          <g key={i}>
            <path d={`M${x - 0.5} ${innerTop - 0.2} q0.5 1.4 0 1.9 q-0.6 -0.2 -0.2 -0.8 q0.4 -0.5 0.9 -1.1 z`} fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.1" />
            <line x1={x} y1={innerTop + 1.6} x2={x} y2={innerTop + 2.8} stroke="#e8f6ff" strokeWidth="0.18" strokeDasharray="0.3 0.25" />
          </g>
        );
      })}
    </g>
  );
}

function CourtyardPlan({ x, y, w, h, center }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="url(#herringbone)" stroke="#8c6d3e" strokeWidth="0.15" />
      {center === 'pagoda' ? <PagodaPlan cx={x + w / 2} cy={y + h / 2} s={Math.min(w, h) * 0.3} tiers={2} door="w" /> : null}
      {center === 'gilded' ? (
        <g>
          <rect x={x + w / 2 - 1.6} y={y + h / 2 - 1.6} width="3.2" height="3.2" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.15" />
          <rect x={x + w / 2 - 0.8} y={y + h / 2 - 0.8} width="1.6" height="1.6" fill="#f3cd7e" />
        </g>
      ) : null}
    </g>
  );
}

const PAGODA_TIERS = { LAL1350: 2, LAL1380: 3, LAL1320: 2, LAL1270: 3 };
const PAGODA_DOOR = { LAL1350: 'w', LAL1380: 'e', LAL1320: 'e', LAL1270: 'w' };

/** The illustration inside a monument's box. `box` is { x, y, w, h } in map metres. */
export function MonumentGlyph({ m, box, project }) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const s = Math.min(box.w, box.h);
  if (m.kind === 'shikhara') return <ShikharaPlan cx={cx} cy={cy} s={s} />;
  if (m.kind === 'pagoda') return <PagodaPlan cx={cx} cy={cy} s={s} tiers={PAGODA_TIERS[m.id] || 2} door={PAGODA_DOOR[m.id]} />;
  if (m.id === 'LAL1330') return <CourtyardPlan {...box} center="pagoda" />;
  if (m.id === 'LAL1260') return <CourtyardPlan {...box} center="gilded" />;
  if (m.id === 'LAL1220') {
    // Sundari Chowk: paved courtyard with Tusa Hiti sunk in its middle (one gilded spout)
    const [tx, ty] = project({ lat: 27.672722, lon: 85.325134 });
    return (
      <g>
        <CourtyardPlan {...box} />
        <HitiPlan cx={tx} cy={ty} w={box.w * 0.5} h={box.h * 0.5} spouts={1} />
      </g>
    );
  }
  if (m.id === 'LAL1360') return <HitiPlan cx={cx} cy={cy} w={box.w * 0.92} h={box.h * 0.92} spouts={3} />;
  return null;
}

// ---------------------------------------------------------------- landmark icons (map)

export function GarudaPillar({ x, y }) {
  return (
    <g>
      <circle cx={x} cy={y} r="1.3" fill={STONE[1]} stroke="#5e5134" strokeWidth="0.15" />
      {/* kneeling Garuda: wings and head, facing west to the temple */}
      <path d={`M${x + 0.7} ${y} q-0.7 -1 -1.4 -0.4 q0.4 0.4 0.2 0.4 q0.2 0 -0.2 0.4 q0.7 0.6 1.4 -0.4z`} fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.08" />
      <circle cx={x - 0.6} cy={y} r="0.28" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.06" />
    </g>
  );
}

export function Column({ x, y }) {
  return (
    <g>
      <circle cx={x} cy={y} r="1.1" fill={STONE[2]} stroke="#5e5134" strokeWidth="0.15" />
      <circle cx={x} cy={y} r="0.5" fill={GOLD} />
    </g>
  );
}

export function BellIcon({ x, y }) {
  return (
    <g>
      <rect x={x - 2} y={y - 2} width="4" height="4" fill={STONE[0]} stroke="#5e5134" strokeWidth="0.15" />
      <path d={`M${x - 1.2} ${y + 1} q0 -2.2 1.2 -2.3 q1.2 0.1 1.2 2.3 z`} fill="#8f6a2a" stroke="#4a3412" strokeWidth="0.12" />
      <circle cx={x} cy={y + 1.25} r="0.3" fill="#4a3412" />
    </g>
  );
}

export function GoldenDoor({ x, y }) {
  return (
    <g>
      <rect x={x - 1.6} y={y - 2.2} width="3.2" height="4.4" rx="0.3" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.2" />
      <path d={`M${x - 1} ${y + 2.2}V${y - 0.4}q1 -1.4 2 0V${y + 2.2}`} fill="#7a4a12" />
    </g>
  );
}

export function Statue({ x, y }) {
  return <circle cx={x} cy={y} r="0.7" fill="#9c7a3a" stroke="#4a3412" strokeWidth="0.12" />;
}

// ---------------------------------------------------------------- chariots (map, top-down)

/**
 * Bungadyah (Rato Machhindranath) chariot from above, pointing north before rotation:
 * a timber base on four big wheels painted with Bhairav's eyes, the tall tower of green foliage,
 * and the long front beam the pullers' ropes tie to.
 */
export function ChariotGlyph({ x, y, bearing, scale = 1, small = false }) {
  const k = scale;
  const wheel = (wx, wy) => (
    <g key={`${wx}${wy}`}>
      <rect x={wx - 0.45 * k} y={wy - 1.2 * k} width={0.9 * k} height={2.4 * k} rx={0.3 * k} fill="#2b1a10" />
      <circle cx={wx} cy={wy - 0.45 * k} r={0.22 * k} fill="#f4ead7" />
      <circle cx={wx} cy={wy + 0.45 * k} r={0.22 * k} fill="#f4ead7" />
    </g>
  );
  return (
    <g transform={`translate(${x} ${y}) rotate(${bearing})`}>
      {/* front beam (dhuri) and ropes */}
      <path d={`M0 ${-3 * k} L${-0.5 * k} ${-9 * k} M0 ${-3 * k} L${0.5 * k} ${-9 * k}`} stroke="#6b4423" strokeWidth={0.35 * k} />
      {!small ? <path d={`M${-0.5 * k} ${-9 * k} q-1.2 -2.5 -0.8 -6 M${0.5 * k} ${-9 * k} q1.2 -2.5 0.8 -6`} fill="none" stroke="#c9a46a" strokeWidth={0.18} strokeDasharray="0.5 0.3" /> : null}
      {[-1, 1].map((sx) => [-1, 1].map((sy) => wheel(sx * 2.3 * k, sy * 2.2 * k)))}
      <rect x={-2.2 * k} y={-3.2 * k} width={4.4 * k} height={6.4 * k} rx={0.4 * k} fill="#8b2a1a" stroke="#4a140b" strokeWidth={0.2} />
      <circle r={2 * k} fill="#3f7a3a" stroke="#1f4a1d" strokeWidth={0.2} />
      <circle r={1.3 * k} fill="#5f9a4a" />
      {Array.from({ length: 6 }, (_, i) => {
        const t = (i * Math.PI) / 3;
        return <line key={i} x1={0} y1={0} x2={Math.cos(t) * 2 * k} y2={Math.sin(t) * 2 * k} stroke="#c4322a" strokeWidth={0.25 * k} />;
      })}
      <circle r={0.45 * k} fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.1} />
    </g>
  );
}

/** Puller crowd: small dots ahead of the chariot along its heading. */
export function Crowd({ x, y, bearing, seed = 0 }) {
  const dots = [];
  for (let i = 0; i < 18; i++) {
    const along = 10 + (i % 6) * 1.6 + ((i * 37 + seed) % 7) * 0.15;
    const side = (Math.floor(i / 6) - 1) * 1.3 + (((i * 53 + seed) % 5) - 2) * 0.15;
    dots.push(<circle key={i} cx={side} cy={-along} r="0.45" fill={['#c4532f', '#e3a93f', '#f4ead7', '#4f6fa6'][i % 4]} />);
  }
  return <g transform={`translate(${x} ${y}) rotate(${bearing})`}>{dots}</g>;
}

// ---------------------------------------------------------------- elevations (lore card)

/**
 * Colours for the two eras. "ink" imitates a 1970s measured survey sheet (line work on paper);
 * "today" is a coloured rendering of the building as it stands now.
 */
function palette(mode) {
  if (mode === 'ink') {
    return { paper: '#f1ead8', ink: '#2f4a6b', brick: 'none', roof: 'none', stone: 'none', gold: 'none', wood: 'none', water: 'none', green: 'none', sky: '#f1ead8', hatch: true, white: 'none' };
  }
  return { paper: '#f6efe0', ink: '#3a2a1c', brick: '#a8492b', roof: '#6f2a17', stone: '#cdbb92', gold: '#d9a336', wood: '#5a3418', water: '#4f8ea8', green: '#5f8f4a', sky: '#dbe8ee', hatch: false, white: '#fbf8f0' };
}

function Hatch({ c }) {
  return (
    <defs>
      <pattern id="ink-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="3" stroke={c.ink} strokeWidth="0.35" strokeOpacity="0.55" />
      </pattern>
    </defs>
  );
}

const fillOr = (c, key) => (c.hatch ? (key === 'roof' || key === 'wood' ? 'url(#ink-hatch)' : 'none') : c[key]);

function Plinth({ c, widths = [150, 130, 112], y = 140, h = 6 }) {
  return widths.map((w, i) => (
    <rect key={w} x={100 - w / 2} y={y - h * (i + 1)} width={w} height={h} fill={fillOr(c, 'stone')} stroke={c.ink} strokeWidth="0.6" />
  ));
}

function ShikharaElevation({ c }) {
  const arcade = (y, w, h, n) => {
    const x0 = 100 - w / 2;
    const step = w / n;
    return (
      <g>
        <rect x={x0} y={y} width={w} height={h} fill={fillOr(c, 'stone')} stroke={c.ink} strokeWidth="0.6" />
        {Array.from({ length: n }, (_, i) => (
          <path key={i} d={`M${x0 + i * step + 2} ${y + h} V${y + 6} q${step / 2 - 2} -5 ${step - 4} 0 V${y + h}`} fill={c.hatch ? 'none' : '#6b5a3e'} stroke={c.ink} strokeWidth="0.5" />
        ))}
      </g>
    );
  };
  const spire = (x, base, w, h) => (
    <g key={`${x}-${base}`}>
      <path d={`M${x - w / 2} ${base} Q${x - w / 2} ${base - h * 0.6} ${x} ${base - h} Q${x + w / 2} ${base - h * 0.6} ${x + w / 2} ${base} Z`} fill={fillOr(c, 'stone')} stroke={c.ink} strokeWidth="0.6" />
      <circle cx={x} cy={base - h - 1.2} r="1.2" fill={c.hatch ? 'none' : c.gold} stroke={c.ink} strokeWidth="0.4" />
    </g>
  );
  return (
    <g>
      <Plinth c={c} widths={[140, 122, 106]} h={5} />
      {arcade(97, 96, 28, 5)}
      <rect x="50" y="93" width="100" height="4" fill={c.hatch ? 'url(#ink-hatch)' : '#b9a37a'} stroke={c.ink} strokeWidth="0.5" />
      {arcade(71, 84, 22, 5)}
      <rect x="56" y="67" width="88" height="4" fill={c.hatch ? 'url(#ink-hatch)' : '#b9a37a'} stroke={c.ink} strokeWidth="0.5" />
      {[62, 76, 124, 138].map((x) => spire(x, 67, 10, 16))}
      {spire(100, 67, 30, 56)}
      {/* Garuda pillar, east of the steps */}
      <rect x="176" y="96" width="5" height="44" fill={fillOr(c, 'stone')} stroke={c.ink} strokeWidth="0.6" />
      <path d="M172 96 q6.5 -12 13 0 z" fill={c.hatch ? 'none' : c.gold} stroke={c.ink} strokeWidth="0.5" />
    </g>
  );
}

function PagodaElevation({ c, tiers, guardians }) {
  const roofs = [];
  let eave = 86;
  let width = 132;
  let drum = 62;
  for (let i = 0; i < tiers; i++) {
    const top = eave - 16;
    const topW = width * 0.48;
    roofs.push(
      <g key={i}>
        {/* struts under the eave */}
        {Array.from({ length: 7 }, (_, k) => {
          const x = 100 - drum / 2 + (k * drum) / 6;
          const dir = x < 100 ? -1 : 1;
          return <line key={k} x1={x} y1={eave + 12} x2={x + dir * (width / 2 - drum / 2) * 0.55} y2={eave + 1} stroke={c.hatch ? c.ink : c.wood} strokeWidth="1.1" />;
        })}
        <path d={`M${100 - width / 2} ${eave} L${100 - topW / 2} ${top} H${100 + topW / 2} L${100 + width / 2} ${eave} Z`} fill={fillOr(c, 'roof')} stroke={c.ink} strokeWidth="0.6" />
        <path d={`M${100 - width / 2} ${eave} q4 3 8 0 q4 3 8 0`} fill="none" stroke={c.ink} strokeWidth="0.4" />
      </g>,
    );
    if (i < tiers - 1) {
      const nextDrum = drum * 0.66;
      roofs.push(<rect key={`d${i}`} x={100 - nextDrum / 2} y={top - 12} width={nextDrum} height={12} fill={fillOr(c, 'brick')} stroke={c.ink} strokeWidth="0.6" />);
      drum = nextDrum;
    }
    eave = top - 12;
    width *= 0.68;
  }
  const peak = eave + 12;
  const animal = (x, flip) => (
    <g transform={`translate(${x} 124) scale(${flip ? -1 : 1} 1)`}>
      {guardians === 'elephants' ? (
        <path d="M-7 0 q0 -9 8 -9 q6 0 6 6 v3 h-2 v-4 q-1 4 -4 4 v-1 h-3 v1 h-3 z M7 -3 q3 1 3 5" fill={fillOr(c, 'stone')} stroke={c.ink} strokeWidth="0.5" />
      ) : (
        <path d="M-6 0 q0 -7 5 -8 q2 -4 6 -1 q1 4 -1 6 v3 h-2 v-2 h-5 v2 z" fill={fillOr(c, 'stone')} stroke={c.ink} strokeWidth="0.5" />
      )}
    </g>
  );
  return (
    <g>
      <Plinth c={c} widths={[150, 130, 112]} h={6} />
      <rect x="69" y="86" width="62" height="36" fill={fillOr(c, 'brick')} stroke={c.ink} strokeWidth="0.6" />
      <rect x="92" y="100" width="16" height="22" fill={c.hatch ? 'none' : c.wood} stroke={c.ink} strokeWidth="0.5" />
      <path d="M86 100 q14 -12 28 0" fill={c.hatch ? 'none' : c.gold} stroke={c.ink} strokeWidth="0.5" />
      <rect x="74" y="92" width="10" height="8" fill="none" stroke={c.ink} strokeWidth="0.4" />
      <rect x="116" y="92" width="10" height="8" fill="none" stroke={c.ink} strokeWidth="0.4" />
      {roofs}
      <path d={`M98 ${peak} V${peak - 8} h4 V${peak} Z`} fill={c.hatch ? 'none' : c.gold} stroke={c.ink} strokeWidth="0.4" />
      <circle cx="100" cy={peak - 10} r="2" fill={c.hatch ? 'none' : c.gold} stroke={c.ink} strokeWidth="0.4" />
      {guardians ? (
        <>
          {animal(78, false)}
          {animal(122, true)}
        </>
      ) : null}
    </g>
  );
}

function CourtyardElevation({ c, variant }) {
  return (
    <g>
      <rect x="8" y="48" width="184" height="92" fill={fillOr(c, 'brick')} stroke={c.ink} strokeWidth="0.6" />
      <path d="M0 50 L14 36 H186 L200 50 Z" fill={fillOr(c, 'roof')} stroke={c.ink} strokeWidth="0.6" />
      {[0, 1].map((row) =>
        Array.from({ length: 7 }, (_, i) => {
          const x = 18 + i * 25;
          const y = 58 + row * 30;
          if (i === 3 && row === 0 && variant === 'keshav') return null;
          return (
            <g key={`${row}-${i}`}>
              <rect x={x} y={y} width="14" height="16" fill={c.hatch ? 'none' : c.wood} stroke={c.ink} strokeWidth="0.5" />
              <path d={`M${x} ${y + 4} h14 M${x} ${y + 8} h14 M${x} ${y + 12} h14 M${x + 7} ${y} v16`} stroke={c.hatch ? c.ink : '#2a170a'} strokeWidth="0.3" />
            </g>
          );
        }),
      )}
      {/* central door */}
      <rect x="88" y="112" width="24" height="28" fill={c.hatch ? 'none' : variant === 'keshav' || variant === 'mul' ? c.gold : c.wood} stroke={c.ink} strokeWidth="0.6" />
      <path d="M84 112 q16 -14 32 0" fill={c.hatch ? 'none' : c.gold} stroke={c.ink} strokeWidth="0.5" />
      {variant === 'keshav' ? <rect x="90" y="56" width="20" height="20" fill={c.hatch ? 'none' : c.gold} stroke={c.ink} strokeWidth="0.6" /> : null}
      {variant === 'mul' ? (
        <>
          <path d="M70 140 v-18 q4 -6 8 0 v18 z" fill={c.hatch ? 'none' : '#9c7a3a'} stroke={c.ink} strokeWidth="0.5" />
          <path d="M122 140 v-18 q4 -6 8 0 v18 z" fill={c.hatch ? 'none' : '#9c7a3a'} stroke={c.ink} strokeWidth="0.5" />
        </>
      ) : null}
    </g>
  );
}

function HitiElevation({ c, spouts, mandap }) {
  const steps = [];
  for (let i = 0; i < 8; i++) steps.push(<rect key={i} x={14 + i * 8} y={60 + i * 7.5} width={8} height={140 - 60 - i * 7.5} fill={fillOr(c, 'stone')} stroke={c.ink} strokeWidth="0.5" />);
  return (
    <g>
      <rect x="0" y="0" width="200" height="60" fill={c.sky} />
      <line x1="0" y1="60" x2="200" y2="60" stroke={c.ink} strokeWidth="0.8" />
      {steps}
      <rect x="150" y="60" width="44" height="80" fill={fillOr(c, 'stone')} stroke={c.ink} strokeWidth="0.6" />
      <rect x="78" y="126" width="72" height="14" fill={c.hatch ? 'none' : c.water} stroke={c.ink} strokeWidth="0.5" />
      {Array.from({ length: spouts }, (_, i) => {
        const y = spouts === 1 ? 104 : 96 + i * 8;
        const x = 150;
        return (
          <g key={i}>
            <path d={`M${x} ${y - 3} q-9 0 -11 4 q3 1 6 -1 q2 2 5 2 z`} fill={c.hatch ? 'none' : c.gold} stroke={c.ink} strokeWidth="0.5" />
            <path d={`M${x - 11} ${y + 1} q-2 8 -1 ${126 - y - 1}`} fill="none" stroke={c.hatch ? c.ink : '#9ad0e6'} strokeWidth="0.8" strokeDasharray="1.5 1" />
          </g>
        );
      })}
      {Array.from({ length: 3 }, (_, i) => <rect key={i} x={156 + i * 12} y="70" width="8" height="12" fill="none" stroke={c.ink} strokeWidth="0.4" />)}
      {mandap ? (
        <g>
          <rect x="158" y="40" width="34" height="20" fill="none" stroke={c.ink} strokeWidth="0.6" />
          {[160, 172, 184].map((x) => <line key={x} x1={x + 3} y1="44" x2={x + 3} y2="60" stroke={c.ink} strokeWidth="0.6" />)}
          <path d="M152 42 L164 28 H186 L198 42 Z" fill={fillOr(c, 'roof')} stroke={c.ink} strokeWidth="0.6" />
        </g>
      ) : null}
      <g fontSize="6" fill={c.ink} fontFamily="ui-monospace, monospace">
        <path d="M6 60 V126" stroke={c.ink} strokeWidth="0.4" markerEnd="none" />
        <text x="2" y="96" transform="rotate(-90 4 96)">−3 m</text>
      </g>
    </g>
  );
}

function StupaElevation({ c }) {
  return (
    <g>
      <Plinth c={c} widths={[196, 176, 156]} h={7} />
      <path d="M40 119 a60 52 0 0 1 120 0 z" fill={c.hatch ? 'none' : c.white} stroke={c.ink} strokeWidth="0.6" />
      <rect x="86" y="58" width="28" height="12" fill={c.hatch ? 'none' : c.gold} stroke={c.ink} strokeWidth="0.6" />
      <path d="M90 64 q3 -3 6 0 q-3 2 -6 0 M104 64 q3 -3 6 0 q-3 2 -6 0" fill={c.hatch ? 'none' : '#1d3d6b'} stroke={c.ink} strokeWidth="0.4" />
      <path d="M98 67 q2 -2 2 0" fill="none" stroke={c.ink} strokeWidth="0.4" />
      {Array.from({ length: 13 }, (_, i) => {
        const w = 22 - i * 1.3;
        return <rect key={i} x={100 - w / 2} y={56 - (i + 1) * 3.3} width={w} height="3.3" fill={c.hatch ? 'none' : c.gold} stroke={c.ink} strokeWidth="0.35" />;
      })}
      <path d="M92 13 q8 -8 16 0 z" fill={c.hatch ? 'none' : c.gold} stroke={c.ink} strokeWidth="0.5" />
      <path d="M100 6 L10 70 M100 6 L190 70" stroke={c.hatch ? c.ink : '#c4532f'} strokeWidth="0.4" strokeDasharray="3 2" />
      {Array.from({ length: 16 }, (_, i) => <rect key={i} x={24 + i * 9.6} y="124" width="5" height="9" rx="1" fill={c.hatch ? 'none' : '#b8862d'} stroke={c.ink} strokeWidth="0.35" />)}
    </g>
  );
}

const ELEVATIONS = {
  LAL1340: (c) => <ShikharaElevation c={c} />,
  LAL1350: (c) => <PagodaElevation c={c} tiers={2} guardians="elephants" />,
  LAL1380: (c) => <PagodaElevation c={c} tiers={3} />,
  LAL1320: (c) => <PagodaElevation c={c} tiers={2} guardians="lions" />,
  LAL1270: (c) => <PagodaElevation c={c} tiers={3} />,
  LAL1330: (c) => <CourtyardElevation c={c} variant="keshav" />,
  LAL1260: (c) => <CourtyardElevation c={c} variant="mul" />,
  LAL1220: (c) => <HitiElevation c={c} spouts={1} />,
  LAL1360: (c) => <HitiElevation c={c} spouts={3} mandap />,
  boudha: (c) => <StupaElevation c={c} />,
};

/** Side elevation of a monument. mode: 'ink' (1970s survey style) or 'today'. */
export function Elevation({ id, mode, children, className = '' }) {
  const c = palette(mode);
  const draw = ELEVATIONS[id];
  return (
    <svg viewBox="0 0 200 150" className={className} role="img" aria-label={mode === 'ink' ? 'Survey-style line drawing' : 'Coloured drawing of the building today'}>
      {c.hatch ? <Hatch c={c} /> : null}
      <rect width="200" height="150" fill={c.paper} />
      {c.hatch ? (
        <g stroke={c.ink} strokeOpacity="0.08" strokeWidth="0.3">
          {Array.from({ length: 20 }, (_, i) => <line key={i} x1={i * 10} y1="0" x2={i * 10} y2="150" />)}
          {Array.from({ length: 15 }, (_, i) => <line key={`h${i}`} x1="0" y1={i * 10} x2="200" y2={i * 10} />)}
        </g>
      ) : null}
      <line x1="0" y1="140" x2="200" y2="140" stroke={c.ink} strokeWidth="0.8" />
      {draw ? draw(c) : null}
      {children}
    </svg>
  );
}
