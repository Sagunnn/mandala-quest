/**
 * Elevation drawings for the lore cards: side views for the "1970 vs 2026" slider and the
 * Inspector (viewBox 0 0 200 150, ground at y = 140). The overworld map art is in pixel/raster.js.
 */

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
