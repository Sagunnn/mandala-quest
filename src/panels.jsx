/** Panels shared by the game: lore cards, the Kala shop and the field notebook. */
import { useEffect, useRef, useState } from 'react';
import {
  Check, Coins, FileText, Footprints, Hammer, HeartHandshake, History, Lock, Satellite, ScanSearch, ScrollText, Ticket, Timer,
  TriangleAlert, X, RotateCw, Gauge, Mountain, Droplets, LockOpen,
} from 'lucide-react';
import {
  BARO, BOUDHA, CHARIOT, DWELL_SECONDS, KORA_GOAL, MAX_WALK_SPEED, MONUMENTS, SECTOR_NAMES, SHOP_ITEMS, XP, Z_GATE, ALTITUDE_RANGE,
  distanceMeters,
} from './engine.js';
import { Elevation } from './art.jsx';
import { ARCHIVE, nepalSambat } from './archive.js';

const BY_ID = Object.fromEntries(MONUMENTS.map((m) => [m.id, m]));

export function Panel({ children, className = '' }) {
  return <div className={`rounded-2xl border border-line bg-panel p-4 ${className}`}>{children}</div>;
}

export function PanelTitle({ icon: Icon, children, right }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted">
        <Icon size={15} className="text-gold" aria-hidden />
        {children}
      </h2>
      {right}
    </div>
  );
}

export function ModeSwitch({ mode, onChange }) {
  const opts = [
    { id: 'sim', label: 'Virtual Walker', icon: Footprints },
    { id: 'live', label: 'Live GPS', icon: Satellite },
  ];
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink p-1" role="radiogroup" aria-label="Position source">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={mode === o.id}
          onClick={() => onChange(o.id)}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${mode === o.id ? 'bg-gold text-ink' : 'text-muted hover:text-text'}`}
        >
          <o.icon size={16} aria-hidden />
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function GpsStatus({ gps, onRetry }) {
  const f = gps.fix;
  return (
    <div className="mt-4 space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <span className={`size-2.5 rounded-full ${gps.status === 'live' ? 'bg-jade' : gps.status === 'waiting' ? 'animate-pulse bg-gold' : 'bg-brick'}`} aria-hidden />
        <span className="font-semibold">
          {gps.status === 'live' ? 'Receiving GPS' : gps.status === 'waiting' ? 'Asking for location…' : 'GPS off'}
        </span>
        {gps.status !== 'waiting' ? (
          <button type="button" onClick={onRetry} className="ml-auto rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-text">
            {gps.status === 'live' ? 'Restart' : 'Try again'}
          </button>
        ) : null}
      </div>
      {gps.error ? <p className="rounded-lg border border-brick/60 bg-brick/10 p-2 text-xs text-[#f0b49a]">{gps.error}</p> : null}
      {f ? (
        <p className="text-xs text-muted">
          Accuracy ±{Math.round(f.accuracy)} m{f.accuracy > 10 ? ' — boxes here are about 12 m wide, so a weak fix may miss them.' : '.'}
        </p>
      ) : null}
      <p className="text-xs text-faint">Uses navigator.geolocation.watchPosition with high accuracy. Speed comes from the fix, or from the distance between fixes.</p>
    </div>
  );
}

export function AltitudeControl({ dz, setDz, pressure, zOpen, live }) {
  const shift = pressure - BARO.baselineHpa;
  return (
    <div className="mt-4 border-t border-line pt-4">
      <label className="flex items-baseline justify-between text-xs text-muted" htmlFor="alt">
        <span className="flex items-center gap-1.5">
          <Mountain size={14} className="text-gold" aria-hidden /> Barometric altitude {live ? '(simulated)' : ''}
        </span>
        <span className="font-mono text-sm text-text">{signed(dz)} m</span>
      </label>
      <input id="alt" type="range" min={ALTITUDE_RANGE.min * 10} max={ALTITUDE_RANGE.max * 10} step="1" value={Math.round(dz * 10)} onChange={(e) => setDz(Number(e.target.value) / 10)} aria-valuetext={`${dz.toFixed(1)} metres`} className="mt-2 w-full" />
      <div className="relative h-4 text-[10px] text-faint">
        <span className="absolute left-0 text-water">▲ hiti −3.0</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${(-ALTITUDE_RANGE.min / (ALTITUDE_RANGE.max - ALTITUDE_RANGE.min)) * 100}%` }}>
          street
        </span>
        <span className="absolute right-0">+10.0</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-text">{pressure.toFixed(2)} hPa</span>
        <span className={`font-mono ${shift >= 0 ? 'text-water' : 'text-muted'}`}>({signed(shift, 2)})</span>
        <span className={`ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 ${zOpen ? 'bg-water/20 text-water' : 'bg-raised text-muted'}`}>
          {zOpen ? <LockOpen size={12} aria-hidden /> : <Lock size={12} aria-hidden />}
          Z-gate {zOpen ? 'open' : `needs +${Z_GATE.shiftHpa.toFixed(2)} hPa`}
        </span>
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => setDz(-3.5)} className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-text">
          <Droplets size={12} aria-hidden /> Down the hiti steps
        </button>
        <button type="button" onClick={() => setDz(0)} className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-text">
          Street level
        </button>
      </div>
      {live ? <p className="mt-2 text-[11px] text-faint">Browsers can’t read a phone’s barometer, so altitude stays on this slider in live mode too.</p> : null}
    </div>
  );
}

export function Telemetry({ tick, player, speed, dz, pressure, cluster, insideId, dwell, koraLive, chariotLive }) {
  const rows = [
    ['Lat', player ? player.lat.toFixed(6) : '—'],
    ['Lon', player ? player.lon.toFixed(6) : '—'],
    ['Speed', `${fmt(speed, 2)} m/s`],
    ['Altitude', `${(BARO.aslMeters + dz).toFixed(1)} m ASL`],
    ['Pressure', `${pressure.toFixed(2)} hPa`],
  ];
  if (cluster === 'patan') {
    const st = insideId ? dwell[insideId] : null;
    rows.push(['PIP', insideId ? `inside ${insideId}` : 'outside all']);
    rows.push(['Dwell', st && st.status !== 'unlocked' ? `${fmt(st.t, 0)}/${DWELL_SECONDS} s · ${STATUS_LABEL[st.status]}` : '—']);
    if (chariotLive) {
      rows.push(['Chariot', `${fmt(chariotLive.distance, 1)} m · ${chariotLive.inside ? 'inside' : 'outside'} ${CHARIOT.radius} m`]);
      rows.push(['Pace Δv', `${fmt(chariotLive.rel, 2)} m/s (≤ ${CHARIOT.paceTolerance})`]);
    }
  } else {
    rows.push(['Radius', koraLive ? `${fmt(koraLive.r, 1)} m` : '—']);
    rows.push(['Bearing', koraLive ? `${fmt(koraLive.bearing, 0)}°` : '—']);
  }
  return (
    <Panel>
      <PanelTitle
        icon={Timer}
        right={
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span key={tick} className="mq-tick inline-block size-2 rounded-full bg-jade" aria-hidden />1 Hz
          </span>
        }
      >
        Telemetry
      </PanelTitle>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="truncate text-right font-mono">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export function StatusPill({ status, unlocked }) {
  const s = unlocked ? 'unlocked' : status || 'idle';
  const cls = {
    idle: 'bg-raised text-muted',
    dwelling: 'bg-gold/20 text-gold-soft',
    grace: 'bg-raised text-muted',
    'too-fast': 'bg-brick/20 text-[#f0a080]',
    'need-descent': 'bg-water/20 text-water',
    unlocked: 'bg-jade/20 text-jade',
  }[s];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{STATUS_LABEL[s]}</span>;
}

export function KoraPanel({ kora, koraLive, speed, onOpen }) {
  const count = kora.visited.filter(Boolean).length;
  const pct = Math.max(0, Math.min(1, kora.theta / KORA_GOAL));
  return (
    <Panel>
      <PanelTitle icon={RotateCw} right={<button type="button" onClick={onOpen} className="text-xs text-gold hover:underline">Lore card</button>}>
        Kora engine
      </PanelTitle>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">Cumulative clockwise angle θ<sub>CW</sub></span>
        <span className={`font-mono text-2xl font-semibold ${kora.theta < 0 ? 'text-[#f0a080]' : 'text-gold-soft'}`}>{signed(kora.theta, 1)}°</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-gradient-to-r from-brick to-gold transition-[width] duration-700" style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-faint">
        <span>0°</span>
        <span>{kora.master ? `Kora complete · ${Math.floor(kora.theta / 360)} lap${Math.floor(kora.theta / 360) === 1 ? '' : 's'}` : `${Math.max(0, KORA_GOAL - kora.theta).toFixed(0)}° to go`}</span>
        <span>+360°</span>
      </div>

      <div className="mt-4 text-xs text-muted">
        Sectors visited: <span className="font-mono text-text">{count}/12</span>
      </div>
      <div className="mt-2 grid grid-cols-6 gap-1.5">
        {SECTOR_NAMES.map((n, i) => (
          <span
            key={n}
            className={`rounded-md py-1 text-center font-mono text-[11px] ${kora.visited[i] ? 'bg-jade/25 text-jade' : 'bg-raised text-faint'} ${koraLive?.inRing && koraLive.sector === i ? 'ring-1 ring-brick' : ''}`}
          >
            {n}
          </span>
        ))}
      </div>

      <ul className="mt-4 space-y-1.5 text-xs text-muted">
        <li className="flex gap-2">
          <Check size={14} className="mt-0.5 shrink-0 text-gold" aria-hidden />
          Ring geofence {BOUDHA.rMin}–{BOUDHA.rMax} m from the centroid. The walkway is {BOUDHA.rWalk} m out ({(2 * Math.PI * BOUDHA.rWalk).toFixed(1)} m around).
        </li>
        <li className="flex gap-2">
          <Check size={14} className="mt-0.5 shrink-0 text-gold" aria-hidden />
          The angle counts only inside the ring at ≤ {MAX_WALK_SPEED.toFixed(1)} m/s{koraLive?.tooFast ? ` (you are at ${fmt(speed)} m/s)` : ''}.
        </li>
        <li className="flex gap-2">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-brick" aria-hidden />
          At −90° (counter-clockwise) you get an etiquette warning.
        </li>
      </ul>
    </Panel>
  );
}

export function EventLog({ log }) {
  const tone = { good: 'text-jade', warn: 'text-[#f0a080]', info: 'text-gold-soft', muted: 'text-muted' };
  return (
    <Panel>
      <PanelTitle icon={ScrollText}>Engine log</PanelTitle>
      {log.length ? (
        <ol className="max-h-48 space-y-1 overflow-y-auto pr-1 text-xs" aria-live="polite">
          {log.map((e) => (
            <li key={e.key} className="flex gap-3">
              <span className="shrink-0 font-mono text-faint">{e.t}</span>
              <span className={tone[e.tone]}>{e.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted">Nothing yet. Walk into a monument’s outline and stand still for {DWELL_SECONDS} seconds.</p>
      )}
    </Panel>
  );
}

export const CARD_TABS = [
  { id: 'record', label: 'Record', icon: FileText },
  { id: 'compare', label: '1970 vs 2026', icon: History },
  { id: 'inspect', label: 'Inspector', icon: ScanSearch },
];

export function LoreCard({ id, progress, player, canWalk, onWalk, onSolve, onClose }) {
  const isBoudha = id === 'boudha';
  const m = isBoudha ? null : BY_ID[id];
  const open = isBoudha ? progress.kora.visited.some(Boolean) : !!progress.unlocked[id];
  const lore = isBoudha ? BOUDHA.lore : m.lore;
  const rec = ARCHIVE[id];
  const dist = player ? distanceMeters(player, isBoudha ? BOUDHA.center : m.centroid) : null;
  const [tab, setTab] = useState('record');
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // The app redraws every second, so focus moves to the card only when it opens.
  // Doing it on every redraw pulled the cursor out of the riddle box mid-typing.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  const facts = [
    ['DANAM ID', isBoudha ? lore.id : m.id],
    ['Built', [rec.built.label, nepalSambat(rec.built.ce)].filter(Boolean).join(' · ')],
    ['Patron', isBoudha ? '—' : lore.patron],
    ['Typology', rec.typology],
    ['Restoration', rec.restoration || 'Not recorded in this prototype'],
  ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-0 sm:place-items-center sm:p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="lore-title" className="mq-in max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-gold/40 bg-panel outline-none sm:max-w-2xl sm:rounded-3xl">
        <div className="relative border-b border-line bg-gradient-to-br from-[#3a2614] to-panel px-5 pb-4 pt-5">
          <button type="button" onClick={onClose} className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-muted hover:bg-ink hover:text-text" aria-label="Close">
            <X size={18} />
          </button>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full border border-gold/50 px-2 py-0.5 font-mono text-gold-soft">DANAM · {isBoudha ? lore.id : m.id}</span>
            <span className="text-muted">{isBoudha ? 'Stupa · Kora circuit' : m.typeLabel}</span>
          </div>
          <h2 id="lore-title" className="mt-3 pr-8 font-display text-sm leading-relaxed">
            {isBoudha ? BOUDHA.name : m.name}
          </h2>
          <p className="text-sm text-muted">
            {isBoudha ? 'बौद्धनाथ स्तूप' : m.nepali}
            {m?.altName ? ` · also ${m.altName}` : ''}
          </p>
          <p className="mt-2 text-xs text-gold-soft">
            {lore.era}
            {lore.patron ? ` · ${lore.patron}` : ''}
          </p>
          {open ? (
            <div className="mt-4 flex gap-1 rounded-xl bg-ink/60 p-1" role="tablist">
              {CARD_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${tab === t.id ? 'bg-gold text-ink' : 'text-muted hover:text-text'}`}
                >
                  <t.icon size={14} aria-hidden />
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-3 px-5 py-4 text-sm leading-relaxed">
          {!open ? (
            <div className="rounded-xl border border-dashed border-line bg-ink/40 p-4">
              <p className="flex items-center gap-2 font-semibold">
                <Lock size={16} className="text-gold" aria-hidden /> Card locked
              </p>
              <p className="mt-1 text-muted">
                {isBoudha
                  ? `Step onto the kora ring (${BOUDHA.rMin}–${BOUDHA.rMax} m from the stupa) to unlock this card.`
                  : `Stand inside this monument’s outline for ${DWELL_SECONDS} seconds at walking pace (≤ ${MAX_WALK_SPEED.toFixed(1)} m/s).`}
                {m?.zGate ? ` Then descend to ${Z_GATE.depthMeters.toFixed(1)} m: the barometer has to read +${Z_GATE.shiftHpa.toFixed(2)} hPa.` : ''}
              </p>
              {dist != null ? <p className="mt-2 font-mono text-xs text-faint">{fmtDist(dist)} away</p> : null}
              {canWalk && m ? (
                <button type="button" onClick={() => onWalk(m)} className="mt-3 flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-ink">
                  <Footprints size={15} aria-hidden /> Walk there
                </button>
              ) : null}
            </div>
          ) : tab === 'record' ? (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-line bg-ink/40 p-3 text-xs">
                {facts.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd className={k === 'DANAM ID' ? 'font-mono text-gold-soft' : ''}>{v}</dd>
                  </div>
                ))}
              </dl>
              {lore.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {m?.riddle ? <Riddle m={m} solved={!!progress.riddles[m.id]} onSolve={onSolve} /> : null}
            </>
          ) : tab === 'compare' ? (
            <ThenAndNow id={id} restoration={rec.restoration} />
          ) : (
            <Inspector id={id} items={rec.inspector} solved={!m?.riddle || !!progress.riddles[m.id]} />
          )}
        </div>
      </div>
    </div>
  );
}

export function ThenAndNow({ id, restoration }) {
  const [split, setSplit] = useState(50);
  const boxRef = useRef(null);
  const dragging = useRef(false);
  const fromPointer = (e) => {
    const r = boxRef.current.getBoundingClientRect();
    setSplit(Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))));
  };
  return (
    <div>
      <div
        ref={boxRef}
        className="relative aspect-[4/3] w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-xl border border-line"
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => {
          dragging.current = false;
        }}
      >
        <Elevation id={id} mode="today" className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
          <Elevation id={id} mode="ink" className="h-full w-full" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-gold" style={{ left: `${split}%` }}>
          <span className="absolute top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gold text-[11px] font-bold text-ink shadow">⇆</span>
        </div>
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-[#2f4a6b] px-1.5 py-0.5 text-[10px] font-semibold text-white">c. 1970 survey</span>
        <span className="pointer-events-none absolute right-2 top-2 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] font-semibold text-gold-soft">2026</span>
      </div>
      <input type="range" min="0" max="100" value={split} onChange={(e) => setSplit(Number(e.target.value))} aria-label="Compare the 1970s drawing with today" className="mt-2 w-full" />
      <p className="mt-1 text-xs text-muted">{restoration || 'No restoration record for this building in the prototype.'}</p>
      <p className="mt-2 text-[11px] text-faint">
        Both drawings were made for this prototype. The left one imitates the line style of 1970s survey work such as Wolfgang Korn’s and Carl Pruscha’s. It is not a reproduction of their
        archival sheets.
      </p>
    </div>
  );
}

export function Inspector({ id, items, solved }) {
  const [sel, setSel] = useState(items[0]?.id);
  const hidden = (i) => i.spoiler && !solved;
  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-line">
        <Elevation id={id} mode="today" className="h-full w-full" />
        {items.map((i, n) => (
          <button
            key={i.id}
            type="button"
            onClick={() => setSel(i.id)}
            aria-label={hidden(i) ? 'Hidden until the riddle is solved' : i.label}
            className={`absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-xs font-bold shadow transition-transform hover:scale-110 ${sel === i.id ? 'border-white bg-brick text-white' : 'border-ink bg-gold text-ink'}`}
            style={{ left: `${(i.x / 200) * 100}%`, top: `${(i.y / 150) * 100}%` }}
          >
            {n + 1}
          </button>
        ))}
      </div>
      <ol className="mt-3 space-y-1.5">
        {items.map((i, n) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => setSel(i.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${sel === i.id ? 'border-gold/70 bg-gold/10' : 'border-line hover:bg-raised'}`}
            >
              <span className="text-xs font-semibold text-gold-soft">
                {n + 1}. {hidden(i) ? 'Locked detail' : i.label}
              </span>
              {sel === i.id ? <span className="mt-0.5 block text-sm">{hidden(i) ? 'Solve this monument’s riddle to reveal this carving.' : i.text}</span> : null}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const SHOP_ICON = { cafe: Ticket, workshop: Hammer, donation: HeartHandshake };

export function ShopDrawer({ score, progress, onBuy, onClose }) {
  const [pay, setPay] = useState(null); // donation intent shown before confirming
  const [ref] = useState(() => `MQ-INT-${Date.now().toString(36).toUpperCase()}`);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-labelledby="shop-title" className="mq-in flex h-full w-full max-w-md flex-col border-l border-gold/40 bg-panel">
        <div className="border-b border-line bg-gradient-to-br from-[#3a2614] to-panel px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="shop-title" className="font-display text-xs leading-relaxed">Lalitpur Heritage Rewards & Guthi Drawer</h2>
              <p className="mt-1 text-xs text-muted">Spend the Kala Tokens you earn at monuments.</p>
            </div>
            <button type="button" onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-ink hover:text-text" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Coins size={18} className="text-gold" aria-hidden />
            <span className="font-mono text-lg font-semibold">{score.kala}</span>
            <span className="text-muted">Kala available</span>
            <span className="ml-auto text-xs text-faint">
              {score.kalaEarned} earned · {score.spent} spent
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <p className="rounded-lg border border-brick/50 bg-brick/10 px-3 py-2 text-xs text-[#f0c0a8]">
            Prototype. These rewards are samples: vouchers are not redeemable at any business, and the donation is simulated. No money moves.
          </p>

          {SHOP_ITEMS.map((item) => {
            const Icon = SHOP_ICON[item.id];
            const owned = progress.shop[item.id];
            const short = score.kala < item.cost;
            return (
              <div key={item.id} className={`rounded-2xl border p-4 ${owned ? 'border-gold/60 bg-gold/5' : 'border-line bg-ink/40'}`}>
                <div className="flex gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-raised text-gold">
                    <Icon size={20} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{item.name}</div>
                    <div className="text-xs text-muted">{item.detail}</div>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-semibold text-gold-soft">{item.cost}</span>
                </div>

                {owned ? (
                  item.kind === 'voucher' ? (
                    <div className="relative mt-3 overflow-hidden rounded-xl border border-dashed border-gold/60 bg-[#2a1d12] p-3">
                      <span className="pointer-events-none absolute -right-3 top-3 rotate-12 rounded bg-brick px-6 py-0.5 text-[10px] font-bold tracking-widest text-white">DEMO</span>
                      <div className="text-[10px] uppercase tracking-wider text-muted">Voucher code</div>
                      <div className="font-mono text-base font-semibold tracking-wider text-gold-soft">{owned.code}</div>
                      <div className="mt-1 text-[11px] text-faint">Sample only · not redeemable · issued {new Date(owned.ts).toLocaleDateString()}</div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-jade/50 bg-jade/10 p-3 text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-jade">
                        <Check size={14} aria-hidden /> Simulated donation recorded
                      </div>
                      <div className="mt-1 font-mono text-faint">
                        {owned.wallet} · {owned.code}
                      </div>
                      <div className="mt-1 text-muted">Badge unlocked: Living Guthi Patron</div>
                    </div>
                  )
                ) : item.kind === 'donation' && pay ? (
                  <div className="mt-3 rounded-xl border border-line bg-panel p-3 text-xs">
                    <div className="font-semibold">Simulated payment intent</div>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                      <dt className="text-muted">Payee</dt>
                      <dd>Manga Hiti Water Conservation Guthi (sample)</dd>
                      <dt className="text-muted">Amount</dt>
                      <dd className="font-mono">{item.cost} Kala</dd>
                      <dt className="text-muted">Purpose</dt>
                      <dd>Hiti channel upkeep</dd>
                      <dt className="text-muted">Reference</dt>
                      <dd className="font-mono">{ref}</dd>
                    </dl>
                    <p className="mt-2 text-faint">Nothing is sent to eSewa or Khalti. In a real build, this step would hand off to the wallet app.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {['eSewa', 'Khalti'].map((w) => (
                        <button key={w} type="button" onClick={() => onBuy(item.id, { wallet: `Simulated ${w}` }) && setPay(null)} className="rounded-lg bg-gold px-3 py-1.5 font-semibold text-ink">
                          Simulate {w}
                        </button>
                      ))}
                      <button type="button" onClick={() => setPay(null)} className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-text">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={short}
                    onClick={() => (item.kind === 'donation' ? setPay(true) : onBuy(item.id))}
                    className="mt-3 w-full rounded-lg bg-gold px-3 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:bg-raised disabled:text-faint"
                  >
                    {short ? `Need ${item.cost - score.kala} more Kala` : item.kind === 'donation' ? `Donate ${item.cost} Kala` : `Get for ${item.cost} Kala`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

export function Riddle({ m, solved, onSolve }) {
  const [answer, setAnswer] = useState('');
  const [wrong, setWrong] = useState(0);
  const [shake, setShake] = useState(0);
  if (solved) {
    return (
      <div className="rounded-xl border border-jade/50 bg-jade/10 p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-jade">Riddle solved</p>
        <p className="mt-1 text-muted">{m.riddle.question}</p>
        <p className="mt-1 font-semibold text-jade">{m.riddle.answer}</p>
      </div>
    );
  }
  const submit = (e) => {
    e.preventDefault();
    if (!answer.trim()) return;
    if (!onSolve(m.id, answer)) {
      setWrong((w) => w + 1);
      setShake((s) => s + 1);
    }
  };
  return (
    <form onSubmit={submit} className="rounded-xl border border-gold/40 bg-ink/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gold">Riddle · +{XP.riddle} Punya</p>
      <p className="mt-1">{m.riddle.question}</p>
      <div key={shake} className={`mt-3 flex gap-2 ${shake ? 'mq-shake' : ''}`}>
        <input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Your answer"
          aria-label="Riddle answer"
          className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-base outline-none focus:border-gold sm:text-sm"
        />
        <button type="submit" className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink">
          Answer
        </button>
      </div>
      {wrong ? <p className="mt-2 text-xs text-[#f0a080]">Not quite.{wrong >= 2 ? ` Hint: ${m.riddle.hint}` : ' Look again.'}</p> : null}
    </form>
  );
}

export const STATUS_LABEL = {
  idle: 'Locked',
  dwelling: 'Dwelling',
  'too-fast': 'Too fast',
  grace: 'Signal drift',
  'need-descent': 'Descend',
  unlocked: 'Unlocked',
};

export const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');

export const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export const signed = (n, d = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;
