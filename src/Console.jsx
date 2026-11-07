/**
 * The handheld: shell and buttons, the game screen (a camera that follows the player over the
 * pixel overworld), the HUD, the typewriter text box, and the START menu pages.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BADGES, BOUDHA, CHARIOT, DWELL_SECONDS, KORA_GOAL, MONUMENTS, RANKS, ROUTE_LENGTH, SECTOR_NAMES, Z_GATE,
  chariotAt, chariotDistance, distanceMeters,
} from './engine.js';
import { PROJ, monumentBox } from './view.js';
import { PPM, renderBoudha, renderPatan } from './pixel/raster.js';
import { ChariotSprite, Crowd, Trainer } from './pixel/sprites.jsx';
import { Droplets, Flag, HeartHandshake, Landmark, RotateCw } from 'lucide-react';

const VIEW_W = { patan: 46, boudha: 58 }; // metres across the screen when following the player
export const LAYER_NAMES = { pixel: 'PIXEL', osm: 'OSM', satellite: 'SATELLITE' };
export const AREA_NAMES = { patan: 'PATAN DURBAR SQ.', boudha: 'BOUDHANATH KORA' };

// ---------------------------------------------------------------- tiles (OSM / satellite)

const TILE_Z = 19;
export const TILE_SOURCES = {
  osm: { url: (x, y) => `https://tile.openstreetmap.org/${TILE_Z}/${x}/${y}.png`, credit: '© OpenStreetMap contributors', href: 'https://www.openstreetmap.org/copyright' },
  satellite: {
    url: (x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${TILE_Z}/${y}/${x}`,
    credit: 'Imagery © Esri, Maxar, Earthstar Geographics',
    href: 'https://www.esri.com/',
  },
};
const tileX = (lon) => ((lon + 180) / 360) * 2 ** TILE_Z;
const tileY = (lat) => ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** TILE_Z;
const tileLon = (x) => (x / 2 ** TILE_Z) * 360 - 180;
const tileLat = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** TILE_Z))) * 180) / Math.PI;

const TileLayer = memo(function TileLayer({ cluster, source }) {
  const P = PROJ[cluster];
  const nw = P.from(0, 0);
  const se = P.from(P.w, P.h);
  const src = TILE_SOURCES[source];
  const tiles = [];
  for (let x = Math.floor(tileX(nw.lon)); x <= Math.floor(tileX(se.lon)); x++) {
    for (let y = Math.floor(tileY(nw.lat)); y <= Math.floor(tileY(se.lat)); y++) {
      const [x0, y0] = P.to({ lat: tileLat(y), lon: tileLon(x) });
      const [x1, y1] = P.to({ lat: tileLat(y + 1), lon: tileLon(x + 1) });
      tiles.push(<image key={`${x}-${y}`} href={src.url(x, y)} x={x0} y={y0} width={x1 - x0 + 0.05} height={y1 - y0 + 0.05} preserveAspectRatio="none" />);
    }
  }
  return (
    <svg viewBox={`0 0 ${P.w} ${P.h}`} className="absolute inset-0 h-full w-full">
      <rect width={P.w} height={P.h} fill={source === 'satellite' ? '#2a2620' : '#f2efe9'} />
      {tiles}
    </svg>
  );
});

// ---------------------------------------------------------------- screen

const ART = {};
function artFor(cluster) {
  if (!ART[cluster]) ART[cluster] = cluster === 'patan' ? renderPatan() : renderBoudha();
  return ART[cluster];
}

function annularSector(cx, cy, r0, r1, a0, a1) {
  const pt = (r, a) => {
    const t = (a * Math.PI) / 180;
    return `${(cx + r * Math.sin(t)).toFixed(3)} ${(cy - r * Math.cos(t)).toFixed(3)}`;
  };
  return `M ${pt(r1, a0)} A ${r1} ${r1} 0 0 1 ${pt(r1, a1)} L ${pt(r0, a1)} A ${r0} ${r0} 0 0 0 ${pt(r0, a0)} Z`;
}

export function Screen(props) {
  const { cluster, layer, zoomOut, player, bearing, moving, step, accuracy, target, onTap, children } = props;
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 480, h: 320 });
  useLayoutEffect(() => {
    const el = ref.current;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const P = PROJ[cluster];
  const art = useMemo(() => (layer === 'pixel' ? artFor(cluster) : null), [cluster, layer]);
  const pxy = player ? P.to(player) : null;
  const inMap = pxy && pxy[0] >= 0 && pxy[0] <= P.w && pxy[1] >= 0 && pxy[1] <= P.h;

  // Camera: follow the player, stay inside the map; SELECT shows the whole area.
  let s;
  let cx;
  let cy;
  if (zoomOut || !inMap) {
    s = Math.min(size.w / P.w, size.h / P.h);
    cx = P.w / 2;
    cy = P.h / 2;
  } else {
    s = size.w / VIEW_W[cluster];
    const vw = size.w / s;
    const vh = size.h / s;
    cx = vw >= P.w ? P.w / 2 : Math.min(P.w - vw / 2, Math.max(vw / 2, pxy[0]));
    cy = vh >= P.h ? P.h / 2 : Math.min(P.h - vh / 2, Math.max(vh / 2, pxy[1]));
  }
  const tx = size.w / 2 - cx * s;
  const ty = size.h / 2 - cy * s;

  const tap = (e) => {
    if (!onTap || e.target.closest('[data-ui]')) return;
    const r = ref.current.getBoundingClientRect();
    onTap(P.from((e.clientX - r.left - tx) / s, (e.clientY - r.top - ty) / s));
  };

  return (
    <div ref={ref} className={`relative h-full w-full touch-none select-none overflow-hidden bg-[#1b1f2f] ${onTap ? 'cursor-crosshair' : ''}`} onPointerDown={tap}>
      <div className="absolute left-0 top-0 origin-top-left will-change-transform" style={{ width: P.w * s, height: P.h * s, transform: `translate3d(${tx}px, ${ty}px, 0)` }}>
        {art ? <img src={art} alt="" draggable="false" className="pixelated absolute inset-0 h-full w-full" /> : <TileLayer cluster={cluster} source={layer} />}
        <svg viewBox={`0 0 ${P.w} ${P.h}`} className="absolute inset-0 h-full w-full overflow-visible">
          {cluster === 'patan' ? <PatanOverlay {...props} pxy={pxy} /> : <BoudhaOverlay {...props} />}
          {target ? <TargetMark xy={P.to(target)} /> : null}
          {inMap && accuracy ? <circle cx={pxy[0]} cy={pxy[1]} r={accuracy} fill="#4fa6c9" fillOpacity="0.15" stroke="#9fd8f2" strokeWidth="0.25" /> : null}
          {inMap && !props.chariotInFront ? <Trainer x={pxy[0]} y={pxy[1]} bearing={bearing} step={step} moving={moving} px={zoomOut ? 0.4 : 0.3} /> : null}
          {cluster === 'patan' && props.jatra != null ? <ChariotGroup t={props.jatra} live={props.chariotLive} to={P.to} /> : null}
          {inMap && props.chariotInFront ? <Trainer x={pxy[0]} y={pxy[1]} bearing={bearing} step={step} moving={moving} px={zoomOut ? 0.4 : 0.3} /> : null}
        </svg>
      </div>
      {children}
    </div>
  );
}

function TargetMark({ xy: [x, y] }) {
  return (
    <g shapeRendering="crispEdges" pointerEvents="none">
      {[[-1, -1], [1, 1], [-1, 1], [1, -1]].map(([a, b], i) => (
        <rect key={i} x={x + a * 0.6 - 0.25} y={y + b * 0.6 - 0.25} width="0.5" height="0.5" fill="#fff" stroke="#c4322a" strokeWidth="0.1" />
      ))}
    </g>
  );
}

function PatanOverlay({ dwell, progress, pxy, zoomOut, layer }) {
  const P = PROJ.patan;
  return (
    <g>
      {MONUMENTS.map((m) => {
        const b = monumentBox(m, P.to);
        const st = dwell[m.id];
        const open = !!progress.unlocked[m.id];
        const [cx, cy] = P.to(m.centroid);
        const near = pxy && Math.hypot(pxy[0] - cx, pxy[1] - cy) < 22;
        const warn = st?.status === 'too-fast' || st?.status === 'need-descent';
        const prog = st && !open ? st.t / DWELL_SECONDS : 0;
        return (
          <g key={m.id} pointerEvents="none">
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              fill={open ? '#f6d77a' : warn ? '#c4322a' : 'none'}
              fillOpacity={open ? 0.12 : 0.15}
              stroke={open ? '#f6d77a' : warn ? '#ff8a6a' : st?.inside ? '#fff' : layer === 'pixel' ? '#ffffff' : '#fff3d6'}
              strokeOpacity={open || st?.inside ? 1 : 0.55}
              strokeWidth={open ? 0.35 : 0.25}
              strokeDasharray={open ? undefined : '0.9 0.6'}
              className={st?.status === 'dwelling' ? 'mq-dwelling' : undefined}
            />
            {open ? <text x={b.x + b.w - 0.4} y={b.y + 1.6} textAnchor="end" fontSize="1.8" fill="#f6d77a" stroke="#3a2410" strokeWidth="0.35" paintOrder="stroke">★</text> : null}
            {prog > 0 ? (
              <g transform={`rotate(-90 ${cx} ${cy})`}>
                <circle cx={cx} cy={cy} r="2.4" fill="#14100c" fillOpacity="0.55" />
                <circle cx={cx} cy={cy} r="2.4" fill="none" stroke={warn ? '#ff8a6a' : '#f6d77a'} strokeWidth="0.6" pathLength="100" strokeDasharray={`${prog * 100} 100`} />
              </g>
            ) : null}
            {zoomOut || near ? (
              <text x={cx} y={b.y - 0.6} textAnchor="middle" fontSize={zoomOut ? 2.6 : 1.5} fontFamily="'Pixelify Sans', sans-serif" fontWeight="700" fill="#fff" stroke="#1b1f2f" strokeWidth={zoomOut ? 0.6 : 0.4} paintOrder="stroke">
                {m.id === 'LAL1220' ? 'SUNDARI CHOWK' : m.id === 'LAL1270' ? 'TALEJU (N)' : m.name.replace(' Temple', '').toUpperCase()}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function ChariotGroup({ t, live, to }) {
  const sB = chariotDistance(t);
  const b = chariotAt(sB);
  const m = sB + CHARIOT.minnathLead <= ROUTE_LENGTH ? chariotAt(sB + CHARIOT.minnathLead) : null;
  const [bx, by] = to(b.pos);
  const route = CHARIOT.route.map((p) => to(p).map((v) => v.toFixed(2)).join(',')).join(' ');
  return (
    <g pointerEvents="none">
      <polyline points={route} fill="none" stroke="#c4322a" strokeWidth="0.35" strokeDasharray="1.2 0.9" strokeOpacity="0.7" />
      <circle cx={bx} cy={by} r={CHARIOT.radius} fill="#f6d77a" fillOpacity={live?.inPace ? 0.2 : 0.08} stroke="#f6d77a" strokeWidth="0.35" />
      <circle cx={bx} cy={by} r={CHARIOT.radius} fill="none" stroke="#fff3d6" strokeWidth="0.3" className="mq-fence" />
      {m ? <ChariotSprite x={to(m.pos)[0]} y={to(m.pos)[1]} scale={0.6} /> : null}
      <Crowd x={bx} y={by} bearing={b.bearing} t={t} />
      <ChariotSprite x={bx} y={by} />
    </g>
  );
}

function BoudhaOverlay({ progress, koraLive, zoomOut }) {
  const c = BOUDHA.halfSpan;
  const step = 360 / BOUDHA.sectors;
  const theta = progress.kora.theta;
  const frac = Math.min(1, Math.abs(theta) / KORA_GOAL);
  return (
    <g pointerEvents="none">
      {Array.from({ length: BOUDHA.sectors }, (_, i) => {
        const cur = koraLive?.inRing && koraLive.sector === i;
        return (
          <path
            key={i}
            d={annularSector(c, c, BOUDHA.rMin + 0.3, BOUDHA.rMax, i * step + 0.3, (i + 1) * step - 0.3)}
            fill={progress.kora.visited[i] ? '#67d38a' : 'none'}
            fillOpacity="0.22"
            stroke={cur ? '#f6d77a' : '#ffffff'}
            strokeOpacity={cur ? 1 : 0.35}
            strokeWidth={cur ? 0.5 : 0.2}
          />
        );
      })}
      <circle cx={c} cy={c} r={BOUDHA.rWalk} fill="none" stroke="#7a6342" strokeWidth="0.3" strokeDasharray="1.2 1" />
      {SECTOR_NAMES.map((n, i) => {
        const a = ((i + 0.5) * step * Math.PI) / 180;
        return (
          <text key={n} x={c + 55 * Math.sin(a)} y={c - 55 * Math.cos(a) + 0.7} textAnchor="middle" fontSize={zoomOut ? 2.6 : 2} fontFamily="'Pixelify Sans', sans-serif" fontWeight="700" fill="#fff" stroke="#1b1f2f" strokeWidth="0.4" paintOrder="stroke">
            {n}
          </text>
        );
      })}
      <circle cx={c} cy={c} r="64.5" fill="none" stroke="#1b1f2f" strokeOpacity="0.25" strokeWidth="1.2" />
      {frac > 0 ? (
        <circle
          cx={c}
          cy={c}
          r="64.5"
          fill="none"
          stroke={theta >= 0 ? '#f6d77a' : '#ff6a4a'}
          strokeWidth="1.2"
          pathLength="100"
          strokeDasharray={`${frac * 100} 100`}
          transform={`rotate(-90 ${c} ${c})${theta < 0 ? ` translate(0 ${2 * c}) scale(1 -1)` : ''}`}
        />
      ) : null}
    </g>
  );
}

// ---------------------------------------------------------------- HUD + text box

export function Hud({ cluster, score, festivalLeft, dz, pressure, zOpen, status }) {
  const { rank, nextRank, xp, kala } = score;
  const pct = nextRank ? ((xp - rank.xp) / (nextRank.xp - rank.xp)) * 100 : 100;
  return (
    <div data-ui className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
      <div className="flex flex-col items-start gap-1.5">
        <span className="gb-plate">{AREA_NAMES[cluster]}</span>
        {status ? (
          <span className={`gb-plate ${status.tone === 'warn' ? '!text-[#c4322a]' : status.tone === 'good' ? '!text-[#2f8a4a]' : ''}`}>
            {status.title}
            {status.bar != null ? (
              <span className="ml-2 inline-flex h-2 w-14 overflow-hidden rounded-sm border border-[#1b1f2f] bg-[#d9d4c0] align-middle">
                <span className="h-full bg-[#2f8a4a]" style={{ width: `${status.bar * 100}%` }} />
              </span>
            ) : null}
            {status.detail ? <span className="ml-2 opacity-80">{status.detail}</span> : null}
          </span>
        ) : null}
        {dz !== 0 ? (
          <span className={`gb-plate ${zOpen ? '!text-[#1f6fa0]' : ''}`}>
            {dz < 0 ? '▼' : '▲'} {Math.abs(dz).toFixed(1)} m · {pressure.toFixed(2)} hPa
          </span>
        ) : null}
      </div>
      <div className="gb-plate flex min-w-[9.5rem] flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span>T{rank.tier} {rank.name.toUpperCase()}</span>
          <span className="text-[#b07a10]">◎{kala}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px]">PU</span>
          <span className="h-2 flex-1 overflow-hidden rounded-sm border border-[#1b1f2f] bg-[#d9d4c0]">
            <span className="block h-full bg-[#e0a020]" style={{ width: `${pct}%` }} />
          </span>
        </div>
        {festivalLeft > 0 ? (
          <span className="text-[#c4322a]">
            3× PUNYA {Math.floor(festivalLeft / 60)}:{String(festivalLeft % 60).padStart(2, '0')}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Classic text box: types the message out, ▼ when done. A advances. */
export function TextBox({ message, onNext }) {
  const [shown, setShown] = useState(0);
  const text = message?.text || '';
  useEffect(() => {
    setShown(0);
    if (!message) return undefined;
    const id = setInterval(() => setShown((n) => (n >= text.length ? n : n + 1)), 22);
    return () => clearInterval(id);
  }, [message, text.length]);
  const done = shown >= text.length;
  useEffect(() => {
    if (!message || !done) return undefined;
    const id = setTimeout(onNext, message.hold || 3800);
    return () => clearTimeout(id);
  }, [message, done, onNext]);
  if (!message) return null;
  return (
    <button
      type="button"
      data-ui
      onClick={() => (done ? onNext() : setShown(text.length))}
      className="gb-box absolute inset-x-2 bottom-2 min-h-[4.4rem] whitespace-pre-line px-4 py-2.5 text-left text-[15px] leading-snug sm:text-base"
      aria-live="polite"
    >
      {text.slice(0, shown)}
      {done ? <span className="gb-blink absolute bottom-1.5 right-3 text-[#c4322a]">▼</span> : null}
    </button>
  );
}

// ---------------------------------------------------------------- START menu

export const MENU = ['DEX', 'BADGES', 'BAG', 'TRAVEL', 'JATRA', 'MAP', 'RESET', 'EXIT'];

export function StartMenu({ index, onPick, cluster, jatra, layer }) {
  const label = {
    TRAVEL: `TRAVEL → ${cluster === 'patan' ? 'BOUDHA' : 'PATAN'}`,
    JATRA: `JATRA ${jatra ? 'ON' : 'OFF'}`,
    MAP: `MAP: ${LAYER_NAMES[layer]}`,
  };
  return (
    <div data-ui className="gb-box absolute right-2 top-2 w-44 py-2 text-sm">
      {MENU.map((m, i) => (
        <button key={m} type="button" onClick={() => onPick(i)} className="flex w-full items-center gap-1 px-3 py-1 text-left hover:bg-[#ecebdf]">
          <span className="w-3 text-[#c4322a]">{i === index ? '▶' : ''}</span>
          {label[m] || m}
        </button>
      ))}
    </div>
  );
}

export function DexPage({ index, progress, player, onOpen, onClose }) {
  const items = [...MONUMENTS.map((m) => ({ id: m.id, name: m.name, open: !!progress.unlocked[m.id], pos: m.centroid })), { id: 'boudha', name: 'Boudhanath Stupa', open: progress.kora.visited.some(Boolean), pos: BOUDHA.center }];
  const listRef = useRef(null);
  useEffect(() => {
    listRef.current?.children[index]?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  return (
    <div data-ui className="absolute inset-0 flex flex-col bg-[#c4322a] p-2">
      <div className="flex items-center justify-between px-1 pb-1.5 text-white">
        <span className="font-display text-[10px]">LORE DEX</span>
        <span className="font-display text-[10px]">
          {items.filter((i) => i.open).length}/{items.length}
        </span>
      </div>
      <div ref={listRef} className="gb-box flex-1 overflow-y-auto py-1">
        {items.map((it, i) => (
          <button key={it.id} type="button" onClick={() => onOpen(it.id)} className={`flex w-full items-center gap-2 px-3 py-1 text-left text-sm ${i === index ? 'bg-[#f6e7b0]' : 'hover:bg-[#ecebdf]'}`}>
            <span className="w-3 text-[#c4322a]">{i === index ? '▶' : ''}</span>
            <span className="w-14 font-mono text-[11px] text-[#5a5f7a]">{it.id === 'boudha' ? 'KTM' : it.id}</span>
            <span className="flex-1 truncate">{it.open ? it.name : '- - - - -'}</span>
            <span className="text-[11px] text-[#5a5f7a]">{player ? `${Math.round(distanceMeters(player, it.pos))}m` : ''}</span>
            <span>{it.open ? '★' : '·'}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={onClose} className="mt-1.5 self-end px-2 font-display text-[9px] text-white">
        B: BACK
      </button>
    </div>
  );
}

const BADGE_GLYPH = { hiti: Droplets, sthapati: Landmark, kora: RotateCw, chariot: Flag, guthi: HeartHandshake };

export function BadgePage({ score, progress, onClose }) {
  return (
    <div data-ui className="absolute inset-0 flex flex-col bg-[#2b3a67] p-2">
      <div className="flex items-center justify-between px-1 pb-1.5 text-white">
        <span className="font-display text-[10px]">BADGE CASE</span>
        <span className="font-display text-[10px]">
          {score.badges.length}/{BADGES.length}
        </span>
      </div>
      <div className="gb-box flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-5 gap-1.5">
          {BADGES.map((b) => {
            const on = score.badges.includes(b.id);
            return (
              <div key={b.id} title={`${b.name}: ${b.how}`} className={`grid aspect-square place-items-center rounded-full border-4 ${on ? 'border-[#e0a020] bg-[#fff2c4] text-[#c4322a]' : 'border-[#c9c6b8] bg-[#ecebdf] text-[#a9a69a]'}`}>
                {(() => {
                  const G = BADGE_GLYPH[b.id];
                  return <G size={20} strokeWidth={2.5} aria-hidden />;
                })()}
              </div>
            );
          })}
        </div>
        <ul className="mt-2 space-y-1 text-[13px] leading-snug">
          {BADGES.map((b) => (
            <li key={b.id}>
              <span className={score.badges.includes(b.id) ? 'font-bold text-[#2f8a4a]' : 'font-bold'}>{score.badges.includes(b.id) ? '★ ' : '☆ '}{b.name}</span>
              <span className="text-[#5a5f7a]"> — {b.id === 'kora' && !score.badges.includes('kora') ? `${Math.max(0, Math.round(progress.kora.theta))}/360°. ` : ''}{b.how}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 grid grid-cols-5 gap-1 text-center text-[10px]">
          {RANKS.map((r) => (
            <div key={r.tier} className={`rounded border-2 px-0.5 py-1 ${r.tier === score.rank.tier ? 'border-[#e0a020] bg-[#fff2c4]' : 'border-[#c9c6b8]'}`}>
              <div>T{r.tier}</div>
              <div className="truncate font-bold">{r.name}</div>
              <div className="text-[#5a5f7a]">{r.xp}</div>
            </div>
          ))}
        </div>
      </div>
      <button type="button" onClick={onClose} className="mt-1.5 self-end px-2 font-display text-[9px] text-white">
        B: BACK
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- shell + buttons

function HoldButton({ onDown, onUp, className, label, children, title }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title || label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      onContextMenu={(e) => e.preventDefault()}
      className={`touch-none select-none ${className}`}
    >
      {children}
    </button>
  );
}

function DPad({ press, release }) {
  const btn = (dir, cls, glyph) => (
    <HoldButton label={`D-pad ${dir}`} title={`${dir} (arrow keys / WASD)`} onDown={() => press(dir)} onUp={() => release(dir)} className={`gb-dpad ${cls}`}>
      <span className="text-[10px] text-[#8a8fa8]">{glyph}</span>
    </HoldButton>
  );
  return (
    <div className="grid size-32 grid-cols-3 grid-rows-3 sm:size-36">
      <span />
      {btn('up', 'rounded-t-md', '▲')}
      <span />
      {btn('left', 'rounded-l-md', '◀')}
      <span className="bg-[#2a2c38]" />
      {btn('right', 'rounded-r-md', '▶')}
      <span />
      {btn('down', 'rounded-b-md', '▼')}
      <span />
    </div>
  );
}

export function Shell({ screen, press, release }) {
  const round = (name, key, cls) => (
    <div className="flex flex-col items-center gap-1">
      <HoldButton label={`${name} button (${key})`} onDown={() => press(name.toLowerCase())} onUp={() => release(name.toLowerCase())} className={`gb-round ${cls}`}>
        {name}
      </HoldButton>
      <span className="font-display text-[7px] text-white/60">{key}</span>
    </div>
  );
  const pill = (name, key) => (
    <div className="flex flex-col items-center gap-3">
      <HoldButton label={`${name} (${key})`} title={`${name} (${key})`} onDown={() => press(name.toLowerCase())} onUp={() => release(name.toLowerCase())} className="gb-pill" />
      <span className="font-display text-[7px] tracking-wider text-white/80">{name}</span>
    </div>
  );
  const shoulder = (name, key, side) => (
    <HoldButton
      label={`${name} shoulder (${key}): ${name === 'L' ? 'walk down' : 'walk up'}`}
      onDown={() => press(name.toLowerCase())}
      onUp={() => release(name.toLowerCase())}
      className={`gb-shoulder ${side}`}
    >
      {name} <span className="text-[8px] opacity-70">{name === 'L' ? '▼' : '▲'}</span>
    </HoldButton>
  );
  return (
    <div className="gb-shell relative mx-auto w-full max-w-[980px] px-3 pb-5 pt-7 sm:px-6">
      {shoulder('L', 'Q', 'left-6')}
      {shoulder('R', 'E', 'right-6')}
      <div className="grid items-center gap-4 md:grid-cols-[auto_minmax(0,1fr)_auto]">
        <div className="order-2 hidden justify-center md:order-1 md:flex">
          <DPad press={press} release={release} />
        </div>
        <div className="order-1 md:order-2">
          <div className="gb-bezel">
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <span className="size-2 rounded-full bg-[#5fe08a] shadow-[0_0_6px_#5fe08a]" aria-hidden />
              <span className="font-display text-[7px] tracking-widest text-[#9aa0c0]">MANDALA QUEST · LIVING VALLEY</span>
            </div>
            <div className="aspect-[4/3] w-full overflow-hidden rounded-sm bg-black sm:aspect-[3/2]">{screen}</div>
          </div>
        </div>
        <div className="order-3 hidden flex-col items-center gap-5 md:flex">
          <div className="flex items-end gap-3">
            <div className="translate-y-4">{round('B', 'Z · run', 'bg-[#6b2c8a]')}</div>
            {round('A', 'X', 'bg-[#6b2c8a]')}
          </div>
        </div>
        {/* phone layout: controls under the screen */}
        <div className="order-2 flex items-center justify-between px-1 md:hidden">
          <DPad press={press} release={release} />
          <div className="flex items-end gap-3">
            <div className="translate-y-4">{round('B', 'run', 'bg-[#6b2c8a]')}</div>
            {round('A', '', 'bg-[#6b2c8a]')}
          </div>
        </div>
      </div>
      <div className="mt-3 flex justify-center gap-8">
        {pill('SELECT', 'Shift')}
        {pill('START', 'Enter')}
      </div>
    </div>
  );
}

export { PPM };
