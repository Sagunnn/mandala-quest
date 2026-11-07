import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUp, ArrowUpLeft, ArrowUpRight,
  Award, BookOpen, Check, CircleStop, Coins, Droplets, FileText, Flag, Footprints, Gauge, Hammer, HeartHandshake,
  History, Landmark, Layers, Lock, LockOpen, MapPin, Mountain, RefreshCw, RotateCcw, RotateCw, Satellite,
  ScanSearch, ScrollText, Sparkles, Store, Ticket, Timer, TriangleAlert, X, Zap,
} from 'lucide-react';
import {
  ALTITUDE_RANGE, BADGES, BARO, BOUDHA, BOUDHA_START, DWELL_SECONDS, EXIT_GRACE_TICKS, KALA, KORA_GOAL,
  MAX_WALK_SPEED, MONUMENTS, PATAN, RANKS, SECTOR_NAMES, TICK_MS, XP, Z_GATE, computeScore, distanceMeters,
  fromLocal, initialProgress, metersPerDegree, pressureHpa, stepDwell, stepKora, toLocal, zGatePassed,
  CHARIOT, FESTIVAL, LANDMARKS, ROUTE_LENGTH, SHOP_ITEMS, chariotAt, chariotDistance, festivalBonus, normalizeProgress, stepChariot,
} from './engine.js';
import { BellIcon, ChariotGlyph, Column, Crowd, Elevation, GarudaPillar, GoldenDoor, MonumentGlyph, Statue } from './art.jsx';
import { ARCHIVE, nepalSambat } from './archive.js';
import { OSM_ATTRIBUTION, OSM_FEATURES } from './osm-patan.js';

const STORAGE_KEY = 'mandala-quest-v1';
const TRAIL_LENGTH = 90;
const BY_ID = Object.fromEntries(MONUMENTS.map((m) => [m.id, m]));
const KIND_STYLE = {
  shikhara: { fill: '#c9b48a', stroke: '#7c6640' },
  pagoda: { fill: '#c4532f', stroke: '#7a2e17' },
  courtyard: { fill: '#d9bf8f', stroke: '#8c6d3e' },
  hiti: { fill: '#4fa6c9', stroke: '#1f5d78' },
};
const STATUS_LABEL = {
  idle: 'Locked',
  dwelling: 'Dwelling',
  'too-fast': 'Too fast',
  grace: 'Signal drift',
  'need-descent': 'Descend',
  unlocked: 'Unlocked',
};

// ---------------------------------------------------------------- storage

function loadProgress() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s?.unlocked && s.riddles && s.kora?.visited?.length === BOUDHA.sectors) return normalizeProgress(s);
  } catch {
    /* private window or blocked storage: start fresh */
  }
  return initialProgress();
}

function saveProgress(p) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* progress just won't survive a reload */
  }
}

// ---------------------------------------------------------------- map projections (metres)

const PATAN_M = metersPerDegree(PATAN.center.lat);
const PATAN_W = (PATAN.bounds.lonMax - PATAN.bounds.lonMin) * PATAN_M.lon;
const PATAN_H = (PATAN.bounds.latMax - PATAN.bounds.latMin) * PATAN_M.lat;

const PROJ = {
  patan: {
    w: PATAN_W,
    h: PATAN_H,
    to: (p) => [(p.lon - PATAN.bounds.lonMin) * PATAN_M.lon, (PATAN.bounds.latMax - p.lat) * PATAN_M.lat],
    from: (x, y) => ({ lon: PATAN.bounds.lonMin + x / PATAN_M.lon, lat: PATAN.bounds.latMax - y / PATAN_M.lat }),
  },
  boudha: {
    w: BOUDHA.halfSpan * 2,
    h: BOUDHA.halfSpan * 2,
    to: (p) => {
      const { e, n } = toLocal(BOUDHA.center, p);
      return [BOUDHA.halfSpan + e, BOUDHA.halfSpan - n];
    },
    from: (x, y) => fromLocal(BOUDHA.center, x - BOUDHA.halfSpan, BOUDHA.halfSpan - y),
  },
};

function clampToMap(cluster, pos) {
  const P = PROJ[cluster];
  const [x, y] = P.to(pos);
  const m = 1;
  return P.from(Math.min(P.w - m, Math.max(m, x)), Math.min(P.h - m, Math.max(m, y)));
}

const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const signed = (n, d = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;
const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Polygon points string for an SVG <polygon>. */
const polyPoints = (obb, to) => obb.map(([lon, lat]) => to({ lat, lon }).join(',')).join(' ');

/** SVG path for a ring slice between radii r0–r1 and compass bearings a0–a1 (degrees). */
function annularSector(cx, cy, r0, r1, a0, a1) {
  const pt = (r, a) => {
    const t = (a * Math.PI) / 180;
    return `${(cx + r * Math.sin(t)).toFixed(3)} ${(cy - r * Math.cos(t)).toFixed(3)}`;
  };
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${pt(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${pt(r1, a1)} L ${pt(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${pt(r0, a0)} Z`;
}

// ---------------------------------------------------------------- app

export default function App() {
  const [cluster, setCluster] = useState('patan');
  const [mode, setMode] = useState('sim');
  const [walkSpeed, setWalkSpeed] = useState(1.4);
  const [dz, setDz] = useState(0);
  const [simPos, setSimPosState] = useState({ patan: PATAN.start, boudha: BOUDHA_START });
  const [heading, setHeading] = useState({ patan: 0, boudha: 90 });
  const [target, setTarget] = useState(null); // { cluster, pos }
  const [dpad, setDpad] = useState(null); // [east, north] unit vector while a pad button is held
  const [trail, setTrail] = useState({ patan: [], boudha: [] });
  const [gps, setGps] = useState({ status: 'off', fix: null, error: null });
  const [progress, setProgress] = useState(loadProgress);
  const [dwell, setDwell] = useState({});
  const [koraLive, setKoraLive] = useState(null);
  const [speeds, setSpeeds] = useState({ patan: 0, boudha: 0 });
  const [tick, setTick] = useState(0);
  const [log, setLog] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [card, setCard] = useState(null); // monument id or 'boudha'
  const [etiquette, setEtiquette] = useState(false);
  const [layer, setLayer] = useState(() => {
    try {
      return localStorage.getItem('mandala-quest-layer') || 'blueprint';
    } catch {
      return 'blueprint';
    }
  });
  const [jatra, setJatra] = useState(false);
  const [jatraNow, setJatraNow] = useState(0); // seconds since the chariot set off
  const [chariotLive, setChariotLive] = useState(null);
  const [shopOpen, setShopOpen] = useState(false);
  const jatraStartRef = useRef(0);
  const chariotHoldRef = useRef({ t: 0, miss: 0 });

  const simPosRef = useRef(simPos);
  const keysRef = useRef(new Set());
  const watchRef = useRef(null);
  const lastTickRef = useRef({ time: 0, pos: {} });
  const state = useRef({});
  state.current = { cluster, mode, walkSpeed, dz, target, dpad, gps, progress, dwell, koraLive, card, jatra, chariotLive, shopOpen };

  const setSimPos = useCallback((c, pos) => {
    simPosRef.current = { ...simPosRef.current, [c]: pos };
    setSimPosState(simPosRef.current);
  }, []);

  const posFor = useCallback(
    (c, s = state.current) => (s.mode === 'live' ? s.gps.fix : simPosRef.current[c]),
    [],
  );

  const score = useMemo(() => computeScore(progress), [progress]);

  const pushLog = useCallback((entries) => {
    if (!entries.length) return;
    const t = clock();
    setLog((l) => [...entries.map((e) => ({ ...e, t, key: Math.random() })).reverse(), ...l].slice(0, 40));
  }, []);

  const toast = useCallback((t) => {
    const key = Math.random();
    setToasts((ts) => [...ts, { ...t, key }].slice(-4));
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.key !== key)), t.ms || 4200);
  }, []);

  useEffect(() => saveProgress(progress), [progress]);

  // Rank-ups and badges, announced when they change (not on page load).
  const prevScore = useRef(score);
  useEffect(() => {
    const prev = prevScore.current;
    prevScore.current = score;
    if (score.rank.tier > prev.rank.tier) {
      toast({ kind: 'rank', title: `Rank up · Tier ${score.rank.tier} ${score.rank.name}`, body: `${score.rank.nepali} — ${score.rank.meaning}`, ms: 5500 });
    }
    for (const id of score.badges) {
      if (!prev.badges.includes(id)) {
        const b = BADGES.find((x) => x.id === id);
        toast({ kind: 'badge', title: `Badge earned · ${b.name}`, body: b.reward ? `+${KALA.badge} Kala Tokens` : 'Thank you for keeping the hiti flowing', ms: 5500 });
      }
    }
  }, [score, toast]);

  // ------------------------------------------------ 1 Hz geofence engine

  useEffect(() => {
    lastTickRef.current = { time: performance.now(), pos: {} };
    const id = setInterval(() => {
      const s = state.current;
      const now = performance.now();
      const dt = Math.min(1.5, Math.max(0.2, (now - lastTickRef.current.time) / 1000));
      const last = lastTickRef.current.pos;
      const sp = {};
      const pos = {};
      const vel = {};
      for (const c of ['patan', 'boudha']) {
        pos[c] = posFor(c, s);
        if (!pos[c]) continue;
        if (s.mode === 'live') sp[c] = s.gps.fix?.speed ?? 0;
        // The walker never goes faster than its slider; this drops frame-timing jitter around 2.0 m/s.
        else sp[c] = last[c] ? Math.min(s.walkSpeed, distanceMeters(last[c], pos[c]) / dt) : 0;
        const d = last[c] ? toLocal(last[c], pos[c]) : { e: 0, n: 0 };
        vel[c] = { e: d.e / dt, n: d.n / dt };
      }
      lastTickRef.current = { time: now, pos };
      setSpeeds({ patan: sp.patan ?? 0, boudha: sp.boudha ?? 0 });
      setTick((t) => t + 1);
      if (s.mode === 'sim') {
        setTrail((tr) => ({
          patan: [...tr.patan, pos.patan].slice(-TRAIL_LENGTH),
          boudha: [...tr.boudha, pos.boudha].slice(-TRAIL_LENGTH),
        }));
      } else if (pos.patan) {
        setTrail((tr) => ({ patan: [...tr.patan, pos.patan].slice(-TRAIL_LENGTH), boudha: [...tr.boudha, pos.patan].slice(-TRAIL_LENGTH) }));
      }
      if (!pos.patan) return;

      const entries = [];
      let next = s.progress;
      let earnedXp = 0;

      // Cluster A: point-in-polygon + dwell + barometric gate
      const d = stepDwell(s.dwell, { pos: pos.patan, speed: sp.patan, dz: s.dz, dt, unlocked: s.progress.unlocked });
      for (const ch of d.changes) entries.push(dwellLogEntry(ch, sp.patan));
      setDwell(d.dwell);
      if (d.newly.length) {
        const unlocked = { ...next.unlocked };
        for (const mid of d.newly) unlocked[mid] = Date.now();
        next = { ...next, unlocked };
        for (const mid of d.newly) {
          const m = BY_ID[mid];
          const xp = XP.unlock + (m.zGate ? XP.zGateBonus : 0);
          earnedXp += xp;
          const boost = festivalBonus(s.progress, xp) ? ` (${FESTIVAL.multiplier}× festival)` : '';
          toast({ kind: 'unlock', title: `Unlocked · ${m.name}`, body: `+${xp + festivalBonus(s.progress, xp)} Punya${boost} · +${KALA.unlock} Kala${m.riddle ? ' · riddle waiting' : ''}` });
        }
        if (!s.card) setCard(d.newly[0]);
      }

      // Cluster B: kora angle
      const k = stepKora(next.kora, s.koraLive, { pos: pos.boudha, speed: sp.boudha });
      const wasIn = s.koraLive?.inRing;
      if (k.live.inRing && !wasIn) entries.push({ tone: 'info', text: `Entered the kora ring (${fmt(k.live.r, 0)} m from the stupa)` });
      if (!k.live.inRing && wasIn) entries.push({ tone: 'muted', text: 'Left the kora ring: angle tracking paused' });
      if (k.live.tooFast && !s.koraLive?.tooFast) entries.push({ tone: 'warn', text: `Kora: ${fmt(sp.boudha)} m/s is faster than walking, so the angle is not counted` });
      for (const ev of k.events) {
        if (ev.type === 'sector') {
          earnedXp += XP.sector;
          entries.push({ tone: 'good', text: `Kora sector ${SECTOR_NAMES[ev.sector]} visited (+${XP.sector} Punya, +${KALA.sector} Kala)` });
        }
        if (ev.type === 'master') {
          earnedXp += XP.koraMaster;
          entries.push({ tone: 'good', text: 'Kora complete: +360° clockwise' });
          toast({ kind: 'unlock', title: 'Kora complete · +360°', body: `+${XP.koraMaster} Punya · +${KALA.koraMaster} Kala`, ms: 5500 });
        }
        if (ev.type === 'etiquette') {
          entries.push({ tone: 'warn', text: 'Etiquette: 90° counter-clockwise. Walk the kora with the stupa on your right.' });
          setEtiquette(true);
        }
      }
      setKoraLive(k.live);
      if (k.kora !== next.kora) next = { ...next, kora: k.kora };

      // Festival multiplier: XP earned while it runs counts 3x
      const bonus = festivalBonus(s.progress, earnedXp);
      if (bonus) {
        next = { ...next, bonusXp: (next.bonusXp || 0) + bonus };
        entries.push({ tone: 'good', text: `Festival ${FESTIVAL.multiplier}×: +${bonus} bonus Punya` });
      }

      // Live Jatra: the moving chariot geofence
      if (s.jatra) {
        const ch = chariotAt(chariotDistance((now - jatraStartRef.current) / 1000));
        const r = stepChariot(chariotHoldRef.current, { pos: pos.patan, vel: vel.patan, chariot: ch, dt });
        chariotHoldRef.current = r.hold;
        const prevC = s.chariotLive;
        if (r.inside && !prevC?.inside) entries.push({ tone: 'info', text: `Inside the chariot’s ${CHARIOT.radius} m circle: walk with it at ${CHARIOT.speed} m/s` });
        if (!r.inside && prevC?.inside) entries.push({ tone: 'muted', text: 'Left the chariot’s circle' });
        if (r.inPace && !prevC?.inPace) entries.push({ tone: 'info', text: 'In pace with Bungadyah: keep pulling' });
        if (r.done) {
          const first = !next.chariot;
          next = { ...next, chariot: next.chariot || Date.now(), festivalUntil: Date.now() + FESTIVAL.seconds * 1000 };
          entries.push({ tone: 'good', text: `You pulled with Bungadyah for ${CHARIOT.holdSeconds} s: ${FESTIVAL.multiplier}× Punya for ${FESTIVAL.seconds / 60} minutes` });
          toast({ kind: 'rank', title: first ? 'Chariot Puller of Bungadyah' : 'Festival multiplier renewed', body: `${FESTIVAL.multiplier}× Punya for the next ${FESTIVAL.seconds / 60} minutes`, ms: 6000 });
        }
        setChariotLive({ inside: r.inside, inPace: r.inPace, distance: r.distance, rel: r.rel, t: r.done ? CHARIOT.holdSeconds : r.hold.t });
      }
      if (next !== s.progress) setProgress(next);
      pushLog(entries);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [posFor, pushLog, toast]);

  // Moves the chariots on screen between the 1 Hz engine steps.
  useEffect(() => {
    if (!jatra) return undefined;
    const id = setInterval(() => setJatraNow((performance.now() - jatraStartRef.current) / 1000), 200);
    return () => clearInterval(id);
  }, [jatra]);

  useEffect(() => {
    try {
      localStorage.setItem('mandala-quest-layer', layer);
    } catch {
      /* the layer choice just won't be remembered */
    }
  }, [layer]);

  const toggleJatra = () => {
    if (jatra) {
      setJatra(false);
      setChariotLive(null);
      pushLog([{ tone: 'muted', text: 'Live Jatra ended' }]);
      return;
    }
    jatraStartRef.current = performance.now();
    chariotHoldRef.current = { t: 0, miss: 0 };
    setJatraNow(0);
    setJatra(true);
    setCluster('patan');
    pushLog([{ tone: 'info', text: `Live Jatra: Bungadyah sets off from Mangal Bazar toward Sundhara at ${CHARIOT.speed} m/s, with Minnath ahead` }]);
  };

  // ------------------------------------------------ virtual walker movement (every frame)

  useEffect(() => {
    if (mode !== 'sim') return undefined;
    let raf;
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = state.current;
      const c = s.cluster;
      const pos = simPosRef.current[c];
      const keys = keysRef.current;
      let vec = s.dpad;
      if (!vec && keys.size) {
        const e = (keys.has('e') ? 1 : 0) - (keys.has('w') ? 1 : 0);
        const n = (keys.has('n') ? 1 : 0) - (keys.has('s') ? 1 : 0);
        const len = Math.hypot(e, n);
        if (len) vec = [e / len, n / len];
      }
      const step = s.walkSpeed * dt;
      let de = 0;
      let dn = 0;
      if (vec) {
        de = vec[0] * step;
        dn = vec[1] * step;
      } else if (s.target?.cluster === c) {
        const { e, n } = toLocal(pos, s.target.pos);
        const dist = Math.hypot(e, n);
        if (dist <= step) {
          de = e;
          dn = n;
          setTarget(null);
        } else {
          de = (e / dist) * step;
          dn = (n / dist) * step;
        }
      }
      if (de || dn) {
        setSimPos(c, clampToMap(c, fromLocal(pos, de, dn)));
        const h = ((Math.atan2(de, dn) * 180) / Math.PI + 360) % 360;
        setHeading((hd) => (Math.abs(hd[c] - h) < 0.5 ? hd : { ...hd, [c]: h }));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [mode, setSimPos]);

  // Arrow keys / WASD
  useEffect(() => {
    const map = { ArrowUp: 'n', KeyW: 'n', ArrowDown: 's', KeyS: 's', ArrowLeft: 'w', KeyA: 'w', ArrowRight: 'e', KeyD: 'e' };
    const typing = (e) => e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]');
    const down = (e) => {
      const dir = map[e.code];
      if (!dir || typing(e) || state.current.card || state.current.mode !== 'sim') return;
      e.preventDefault();
      keysRef.current.add(dir);
      setTarget(null);
    };
    const up = (e) => {
      const dir = map[e.code];
      if (dir) keysRef.current.delete(dir);
    };
    const clear = () => keysRef.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  // ------------------------------------------------ live browser geolocation

  const stopGps = useCallback(() => {
    if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current);
    watchRef.current = null;
  }, []);

  const startGps = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGps({ status: 'error', fix: null, error: 'This browser has no geolocation.' });
      return;
    }
    if (!window.isSecureContext) {
      setGps({ status: 'error', fix: null, error: 'Location needs a secure (https) page.' });
      return;
    }
    stopGps();
    setGps((g) => ({ ...g, status: 'waiting', error: null }));
    let prev = null;
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const fix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, ts: p.timestamp };
        const dtFix = prev ? (fix.ts - prev.ts) / 1000 : 0;
        const derived = prev && dtFix > 0 ? distanceMeters(prev, fix) / dtFix : 0;
        fix.speed = Number.isFinite(p.coords.speed) && p.coords.speed != null ? p.coords.speed : derived;
        fix.heading = Number.isFinite(p.coords.heading) && p.coords.heading != null ? p.coords.heading : prev && derived > 0.3 ? bearing(prev, fix) : prev?.heading ?? 0;
        prev = fix;
        setGps({ status: 'live', fix, error: null });
      },
      (err) => {
        const msg = { 1: 'Location permission was denied. Allow it in the browser’s site settings.', 2: 'No position available. Try near a window or outdoors.', 3: 'Timed out waiting for a GPS fix.' }[err.code] || err.message;
        setGps((g) => ({ ...g, status: g.fix ? 'live' : 'error', error: msg }));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }, [stopGps]);

  useEffect(() => stopGps, [stopGps]);

  const switchMode = (m) => {
    if (m === mode) return;
    setMode(m);
    setDwell({});
    setKoraLive(null);
    setTarget(null);
    setTrail({ patan: [], boudha: [] });
    lastTickRef.current = { time: performance.now(), pos: {} };
    if (m === 'live') startGps();
    else {
      stopGps();
      setGps({ status: 'off', fix: null, error: null });
    }
  };

  // ------------------------------------------------ actions

  const walkTo = (c, pos) => {
    if (mode !== 'sim') return;
    if (c !== cluster) setCluster(c);
    setTarget({ cluster: c, pos: clampToMap(c, pos) });
  };

  const solveRiddle = (id, answer) => {
    const m = BY_ID[id];
    if (!m?.riddle || !m.riddle.check(answer)) return false;
    const bonus = festivalBonus(progress, XP.riddle);
    setProgress((p) => ({ ...p, riddles: { ...p.riddles, [id]: Date.now() }, bonusXp: (p.bonusXp || 0) + bonus }));
    toast({ kind: 'unlock', title: `Riddle solved · ${m.name}`, body: `+${XP.riddle + bonus} Punya${bonus ? ` (${FESTIVAL.multiplier}× festival)` : ''} · +${KALA.riddle} Kala` });
    pushLog([{ tone: 'good', text: `Riddle solved at ${m.name}: “${m.riddle.answer}”` }]);
    return true;
  };

  const buy = (itemId, extra = {}) => {
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item || progress.shop[itemId] || score.kala < item.cost) return null;
    const code = `MQ-DEMO-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Date.now().toString(36).slice(-3).toUpperCase()}`;
    const record = { ts: Date.now(), code, ...extra };
    setProgress((p) => ({ ...p, shop: { ...p.shop, [itemId]: record } }));
    pushLog([{ tone: 'good', text: `Kala shop: ${item.name} (−${item.cost} Kala)` }]);
    return record;
  };

  const resetAll = () => {
    if (!window.confirm('Reset all progress, XP, tokens and badges?')) return;
    const fresh = initialProgress();
    prevScore.current = computeScore(fresh);
    setProgress(fresh);
    setDwell({});
    setKoraLive(null);
    setEtiquette(false);
    setTarget(null);
    setSimPos('patan', PATAN.start);
    setSimPos('boudha', BOUDHA_START);
    setTrail({ patan: [], boudha: [] });
    setDz(0);
    setJatra(false);
    setChariotLive(null);
    setLog([]);
    lastTickRef.current = { time: performance.now(), pos: {} };
  };

  // ------------------------------------------------ derived view state

  const player = posFor(cluster, { mode, gps });
  const speed = speeds[cluster];
  const pressure = pressureHpa(dz);
  const zOpen = zGatePassed(dz);
  const insideId = MONUMENTS.find((m) => dwell[m.id]?.inside)?.id;
  const farFromSite = mode === 'live' && player
    ? distanceMeters(player, cluster === 'patan' ? PATAN.center : BOUDHA.center)
    : 0;

  return (
    <div className="min-h-dvh pb-10">
      <Hud score={score} onReset={resetAll} onShop={() => setShopOpen(true)} festivalUntil={progress.festivalUntil} tick={tick} />

      <main className="mx-auto max-w-[1400px] px-4 pt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 space-y-4">
          <ClusterTabs cluster={cluster} setCluster={setCluster} progress={progress} />

          <div className={`overflow-hidden rounded-2xl border border-line ${cluster === 'patan' ? 'bg-[#e9dbbb]' : 'bg-[#e6d7b5]'}`}>
            {cluster === 'patan' ? <MapToolbar layer={layer} setLayer={setLayer} jatra={jatra} onJatra={toggleJatra} /> : null}
            <div className="relative">
            {cluster === 'patan' ? (
              <PatanMap
                layer={layer}
                jatra={jatra ? jatraNow : null}
                chariotLive={chariotLive}
                player={player}
                heading={mode === 'live' ? gps.fix?.heading ?? 0 : heading.patan}
                dwell={dwell}
                unlocked={progress.unlocked}
                target={target?.cluster === 'patan' ? target.pos : null}
                trail={trail.patan}
                accuracy={mode === 'live' ? gps.fix?.accuracy : null}
                onTap={mode === 'sim' ? (p) => walkTo('patan', p) : null}
              />
            ) : (
              <BoudhaMap
                player={player}
                heading={mode === 'live' ? gps.fix?.heading ?? 0 : heading.boudha}
                kora={progress.kora}
                koraLive={koraLive}
                target={target?.cluster === 'boudha' ? target.pos : null}
                trail={trail.boudha}
                accuracy={mode === 'live' ? gps.fix?.accuracy : null}
                onTap={mode === 'sim' ? (p) => walkTo('boudha', p) : null}
              />
            )}
            <MapOverlay
              cluster={cluster}
              mode={mode}
              gps={gps}
              farFromSite={farFromSite}
              insideId={insideId}
              dwell={dwell}
              speed={speed}
              zOpen={zOpen}
              koraLive={koraLive}
              kora={progress.kora}
              chariotLive={jatra ? chariotLive : null}
              layer={cluster === 'patan' ? layer : null}
              etiquette={etiquette}
              onDismissEtiquette={() => setEtiquette(false)}
              onUseSim={() => switchMode('sim')}
            />
            </div>
          </div>

        </section>

        <aside className="min-w-0 space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Panel>
            <ModeSwitch mode={mode} onChange={switchMode} />
            {mode === 'sim' ? (
              <SimControls
                dpad={dpad}
                setDpad={(v) => {
                  setDpad(v);
                  if (v) setTarget(null);
                }}
                onStop={() => {
                  setDpad(null);
                  setTarget(null);
                }}
                walkSpeed={walkSpeed}
                setWalkSpeed={setWalkSpeed}
              />
            ) : (
              <GpsStatus gps={gps} onRetry={startGps} />
            )}
            <AltitudeControl dz={dz} setDz={setDz} pressure={pressure} zOpen={zOpen} live={mode === 'live'} />
          </Panel>

          <Telemetry
            tick={tick}
            player={player}
            speed={speed}
            dz={dz}
            pressure={pressure}
            cluster={cluster}
            insideId={insideId}
            dwell={dwell}
            koraLive={koraLive}
            chariotLive={jatra && cluster === 'patan' ? chariotLive : null}
          />

          {cluster === 'patan' ? (
            <MonumentList
              player={player}
              dwell={dwell}
              progress={progress}
              canWalk={mode === 'sim'}
              onWalk={(m) => walkTo('patan', m.centroid)}
              onOpen={setCard}
            />
          ) : (
            <KoraPanel kora={progress.kora} koraLive={koraLive} speed={speed} onOpen={() => setCard('boudha')} />
          )}
        </aside>

        <div className="min-w-0 self-start lg:col-start-1 lg:row-start-2">
          <EventLog log={log} />
        </div>

        <section className="lg:col-span-2 grid gap-4 xl:grid-cols-[1fr_1.4fr]">
          <BadgesPanel score={score} progress={progress} />
          <LoreCodex progress={progress} onOpen={setCard} />
        </section>
      </main>

      <Toasts toasts={toasts} />

      {shopOpen ? <ShopDrawer score={score} progress={progress} onBuy={buy} onClose={() => setShopOpen(false)} /> : null}

      {card && (
        <LoreCard
          id={card}
          progress={progress}
          player={card === 'boudha' ? posFor('boudha', { mode, gps }) : posFor('patan', { mode, gps })}
          canWalk={mode === 'sim'}
          onWalk={(m) => {
            setCard(null);
            walkTo('patan', m.centroid);
          }}
          onSolve={solveRiddle}
          onClose={() => setCard(null)}
        />
      )}
    </div>
  );
}

function bearing(a, b) {
  const { e, n } = toLocal(a, b);
  return ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360;
}

function dwellLogEntry({ id, from, to, inside }, speed) {
  const name = BY_ID[id].name;
  if (to === 'dwelling' && from === 'too-fast') return { tone: 'info', text: `${name}: back to walking pace, dwell timer running` };
  if (to === 'dwelling' && from === 'grace') return { tone: 'info', text: `${name}: back inside, dwell timer kept` };
  if (to === 'dwelling') return { tone: 'info', text: `Entered ${name}: stay ${DWELL_SECONDS} s on foot to unlock` };
  if (to === 'too-fast') return { tone: 'warn', text: `${name}: ${fmt(speed)} m/s is over the ${MAX_WALK_SPEED.toFixed(1)} m/s walking limit, dwell paused` };
  if (to === 'grace') return { tone: 'muted', text: `${name}: position left the boundary, holding the timer for ${EXIT_GRACE_TICKS} s` };
  if (to === 'need-descent') return { tone: 'warn', text: `${name}: dwell done. Descend to ${Z_GATE.depthMeters.toFixed(1)} m (+${Z_GATE.shiftHpa.toFixed(2)} hPa) to unlock` };
  if (to === 'unlocked') return { tone: 'good', text: `${name} unlocked` };
  if (to === 'idle' && inside === false) return { tone: 'muted', text: `Left ${name}: dwell timer reset` };
  return { tone: 'muted', text: `${name}: ${STATUS_LABEL[to]}` };
}

// ---------------------------------------------------------------- layout pieces

function Panel({ children, className = '' }) {
  return <div className={`rounded-2xl border border-line bg-panel p-4 ${className}`}>{children}</div>;
}

function PanelTitle({ icon: Icon, children, right }) {
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

function MandalaMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#2a1d14" />
      <g fill="none" stroke="#e3a93f" strokeWidth="3">
        <circle cx="32" cy="32" r="22" />
        <rect x="17" y="17" width="30" height="30" transform="rotate(45 32 32)" />
        <rect x="19" y="19" width="26" height="26" />
      </g>
      <circle cx="32" cy="32" r="6" fill="#c4532f" />
    </svg>
  );
}

// ---------------------------------------------------------------- HUD

const BADGE_ICON = { hiti: Droplets, sthapati: Landmark, kora: RotateCw, chariot: Flag, guthi: HeartHandshake };

function Hud({ score, onReset, onShop, festivalUntil }) {
  const { rank, nextRank, xp, kala, badges } = score;
  const festivalLeft = Math.max(0, Math.round(((festivalUntil || 0) - Date.now()) / 1000));
  const span = nextRank ? nextRank.xp - rank.xp : 1;
  const into = nextRank ? xp - rank.xp : 1;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <div className="mr-auto flex items-center gap-3">
          <MandalaMark />
          <div className="leading-tight">
            <div className="font-display text-xl font-semibold tracking-wide">Mandala Quest</div>
            <div className="text-xs text-muted">Chronicles of the Living Valley</div>
          </div>
        </div>

        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:min-w-[220px] sm:max-w-[360px] sm:flex-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate">
                <span className="text-muted">Tier {rank.tier} · </span>
                <span className="font-semibold text-gold-soft">{rank.name}</span>
                <span className="text-muted"> {rank.nepali}</span>
              </span>
              <span className="shrink-0 font-mono text-muted">
                {xp}
                {nextRank ? ` / ${nextRank.xp}` : ''} Punya
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-label="Punya XP toward next rank" aria-valuenow={xp} aria-valuemin={rank.xp} aria-valuemax={nextRank?.xp ?? xp}>
              <div className="h-full rounded-full bg-gradient-to-r from-brick to-gold transition-[width] duration-500" style={{ width: `${(into / span) * 100}%` }} />
            </div>
            <div className="mt-0.5 text-[11px] text-faint">{nextRank ? `Next: Tier ${nextRank.tier} ${nextRank.name}` : 'Highest rank reached'}</div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">

          {festivalLeft > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-brick px-2.5 py-1.5 text-xs font-bold text-white" title="Festival multiplier: XP counts 3x">
              <Zap size={13} aria-hidden />
              {FESTIVAL.multiplier}× <span className="font-mono">{Math.floor(festivalLeft / 60)}:{String(festivalLeft % 60).padStart(2, '0')}</span>
            </span>
          ) : null}

          <button
            type="button"
            onClick={onShop}
            className="flex items-center gap-1.5 rounded-full border border-gold/50 bg-panel px-3 py-1.5 transition-colors hover:border-gold hover:bg-raised"
            title="Kala Tokens: open the Heritage Rewards & Guthi shop"
          >
            <Coins size={16} className="text-gold" aria-hidden />
            <span className="font-mono text-sm font-semibold">{kala}</span>
            <span className="text-xs text-muted">Kala</span>
            <Store size={14} className="text-gold" aria-hidden />
          </button>

          <div className="hidden items-center gap-1.5 sm:flex" aria-label="Badges">
            {BADGES.map((b) => {
              const Icon = BADGE_ICON[b.id];
              const on = badges.includes(b.id);
              return (
                <span
                  key={b.id}
                  title={`${b.name}${on ? ' (earned)' : ` — ${b.how}`}`}
                  className={`grid size-9 place-items-center rounded-full border ${on ? 'border-gold bg-gold/15 text-gold' : 'border-line text-faint'}`}
                >
                  <Icon size={16} aria-hidden />
                  <span className="sr-only">{b.name} {on ? 'earned' : 'not earned'}</span>
                </span>
              );
            })}
          </div>

          <button type="button" onClick={onReset} className="grid size-9 place-items-center rounded-full border border-line text-muted hover:text-text" title="Reset progress" aria-label="Reset progress">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}

function ClusterTabs({ cluster, setCluster, progress }) {
  const done = MONUMENTS.filter((m) => progress.unlocked[m.id]).length;
  const tabs = [
    { id: 'patan', label: 'Patan Durbar Square', short: 'Patan', sub: `Cluster A · ${done}/${MONUMENTS.length} monuments`, icon: Landmark },
    { id: 'boudha', label: 'Boudhanath Kora', short: 'Boudha kora', sub: `Cluster B · ${progress.kora.master ? 'kora complete' : `${Math.round(Math.max(0, progress.kora.theta))}° of 360°`}`, icon: RotateCw },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-panel p-1.5" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={cluster === t.id}
          onClick={() => setCluster(t.id)}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${cluster === t.id ? 'bg-raised ring-1 ring-gold/50' : 'hover:bg-raised/60'}`}
        >
          <t.icon size={20} className={cluster === t.id ? 'text-gold' : 'text-faint'} aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </span>
            <span className="block truncate text-xs text-muted">{t.sub}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- maps

function makeSvgTap(onTap, from) {
  return (e) => {
    if (!onTap) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    onTap(from(p.x, p.y));
  };
}

function Player({ xy, heading, accuracy }) {
  if (!xy) return null;
  const [x, y] = xy;
  return (
    <g>
      {accuracy ? <circle cx={x} cy={y} r={accuracy} fill="#4fa6c9" fillOpacity="0.12" stroke="#1f5d78" strokeOpacity="0.5" strokeWidth="0.3" /> : null}
      <circle cx={x} cy={y} r="1.6" fill="none" stroke="#c4532f" strokeWidth="0.4" className="mq-pulse" />
      <g transform={`translate(${x} ${y}) rotate(${heading})`}>
        <path d="M0 -4.2 L1.9 -1 L-1.9 -1 Z" fill="#14100c" />
      </g>
      <circle cx={x} cy={y} r="1.7" fill="#e3a93f" stroke="#14100c" strokeWidth="0.55" />
    </g>
  );
}

function Trail({ points, to }) {
  if (points.length < 2) return null;
  return (
    <polyline
      points={points.map((p) => to(p).map((v) => v.toFixed(2)).join(',')).join(' ')}
      fill="none"
      stroke="#14100c"
      strokeOpacity="0.35"
      strokeWidth="0.5"
      strokeDasharray="0.8 1"
      strokeLinecap="round"
    />
  );
}

function Target({ from, to }) {
  if (!to || !from) return null;
  const [x, y] = to;
  return (
    <g pointerEvents="none">
      <line x1={from[0]} y1={from[1]} x2={x} y2={y} stroke="#14100c" strokeOpacity="0.4" strokeWidth="0.35" strokeDasharray="1 1" />
      <circle cx={x} cy={y} r="1.6" fill="none" stroke="#c4532f" strokeWidth="0.5" />
      <path d={`M${x - 2.6} ${y}h1.6M${x + 1} ${y}h1.6M${x} ${y - 2.6}v1.6M${x} ${y + 1}v1.6`} stroke="#c4532f" strokeWidth="0.45" />
    </g>
  );
}

function ScaleBar({ x, y, meters = 20 }) {
  return (
    <g pointerEvents="none" fontSize="2.4" fill="#4a3b2b">
      <rect x={x - 1.5} y={y - 4.6} width={meters + 9} height="7" rx="1" fill="#efe2c4" fillOpacity="0.85" />
      <path d={`M${x} ${y - 1}v2h${meters}v-2`} fill="none" stroke="#4a3b2b" strokeWidth="0.45" />
      <text x={x + meters + 1.2} y={y + 0.9}>{meters} m</text>
    </g>
  );
}

function NorthArrow({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <circle r="4.2" fill="#efe2c4" fillOpacity="0.85" stroke="#4a3b2b" strokeWidth="0.3" />
      <path d="M0 -3.2 L1.4 1.6 L0 0.7 L-1.4 1.6 Z" fill="#c4532f" />
      <text y="-4.9" textAnchor="middle" fontSize="2.4" fontWeight="700" fill="#4a3b2b">N</text>
    </g>
  );
}

// ---------------------------------------------------------------- Patan map layers

const LAYERS = [
  { id: 'blueprint', label: 'Newa Parchment Blueprint', short: 'Blueprint' },
  { id: 'osm', label: 'OpenStreetMap', short: 'OSM' },
  { id: 'satellite', label: 'Satellite', short: 'Satellite' },
];

function MapToolbar({ layer, setLayer, jatra, onJatra }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-2 py-2">
      <div className="flex items-center gap-1 rounded-lg bg-ink p-1" role="radiogroup" aria-label="Map layer">
        <Layers size={14} className="mx-1 text-gold" aria-hidden />
        {LAYERS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={layer === l.id}
            onClick={() => setLayer(l.id)}
            title={l.label}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${layer === l.id ? 'bg-gold text-ink' : 'text-muted hover:text-text'}`}
          >
            <span className="hidden md:inline">{l.label}</span>
            <span className="md:hidden">{l.short}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onJatra}
        aria-pressed={jatra}
        className={`ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${jatra ? 'border-brick bg-brick text-white' : 'border-line text-muted hover:border-brick hover:text-text'}`}
      >
        <Flag size={14} aria-hidden />
        <span className="hidden sm:inline">Live Jatra: Rato Machhindranath</span>
        <span className="sm:hidden">Live Jatra</span>
        <span className={`ml-1 rounded px-1 font-mono text-[10px] ${jatra ? 'bg-white/20' : 'bg-raised'}`}>{jatra ? 'ON' : 'OFF'}</span>
      </button>
    </div>
  );
}

const ringPath = (rings, to) =>
  rings.map((r) => r.map(([lon, lat], i) => `${i ? 'L' : 'M'}${to({ lat, lon }).map((v) => v.toFixed(2)).join(' ')}`).join('') + 'Z').join('');
const linePoints = (line, to) => line.map(([lon, lat]) => to({ lat, lon }).map((v) => v.toFixed(2)).join(',')).join(' ');
const linePath = (line, to) => line.map(([lon, lat], i) => `${i ? 'L' : 'M'}${to({ lat, lon }).map((v) => v.toFixed(2)).join(' ')}`).join('');

const BLUEPRINT_STYLE = {
  green: { fill: '#c9d2a0', stroke: '#8e9a62' },
  water: { fill: '#9cc3cf', stroke: '#4d8496' },
  plinth: { fill: '#d8c8a1', stroke: '#8c7650' },
  plaza: { fill: 'url(#herringbone)', stroke: '#9b7c4e' },
  house: { fill: '#e0cfa9', stroke: '#a38b62' },
  temple: { fill: '#d3c096', stroke: '#8c7650' },
  palace: { fill: '#b5653f', stroke: '#6e3216' },
  column: { fill: '#bea97b', stroke: '#5e5134' },
};
const STREET_WIDTH = { street: 6, lane: 3.6, path: 1.4 };
const STREET_LABELS = { 'Mangalbazar Marg': 'Mangal Bazar Marg', 'Hakha Marg': 'Hakha Marg → Sundhara', 'Mha Maru Galli': 'Mha Maru Galli' };

/** Building footprints, the brick plaza and streets from OpenStreetMap. Static, so drawn once. */
const BlueprintBase = memo(function BlueprintBase() {
  const P = PROJ.patan;
  const grid = [];
  for (let x = 10; x < P.w; x += 10) grid.push(<line key={`x${x}`} x1={x} y1="0" x2={x} y2={P.h} />);
  for (let y = 10; y < P.h; y += 10) grid.push(<line key={`y${y}`} x1="0" y1={y} x2={P.w} y2={y} />);
  const streets = OSM_FEATURES.filter((f) => f.line);
  return (
    <g>
      <rect width={P.w} height={P.h} fill="#efe2c4" />
      <g stroke="#d9c7a1" strokeWidth="0.12">{grid}</g>
      {OSM_FEATURES.filter((f) => f.rings && ['green', 'water', 'plinth', 'plaza'].includes(f.kind)).map((f) => (
        <path key={f.id} d={ringPath(f.rings, P.to)} fill={BLUEPRINT_STYLE[f.kind].fill} stroke={BLUEPRINT_STYLE[f.kind].stroke} strokeWidth="0.25" fillRule="evenodd" />
      ))}
      {streets.map((f) => (
        <polyline key={`${f.id}c`} points={linePoints(f.line, P.to)} fill="none" stroke="#b9a27a" strokeWidth={STREET_WIDTH[f.kind] + 0.6} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {streets.map((f) => (
        <polyline key={f.id} points={linePoints(f.line, P.to)} fill="none" stroke={f.kind === 'path' ? '#e8dab9' : '#f6eedc'} strokeWidth={STREET_WIDTH[f.kind]} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {OSM_FEATURES.filter((f) => f.rings && ['house', 'temple', 'palace', 'column'].includes(f.kind)).map((f) => (
        <path key={f.id} d={ringPath(f.rings, P.to)} fill={BLUEPRINT_STYLE[f.kind].fill} stroke={BLUEPRINT_STYLE[f.kind].stroke} strokeWidth={f.kind === 'palace' ? 0.35 : 0.2} fillRule="evenodd" />
      ))}
      {/* palace roofs: a ridge line just inside the outer wall */}
      {OSM_FEATURES.filter((f) => f.kind === 'palace' && f.rings.length > 1).map((f) => (
        <path key={`${f.id}r`} d={ringPath(f.rings, P.to)} fill="none" stroke="#8a3f22" strokeWidth="2.2" strokeOpacity="0.35" fillRule="evenodd" />
      ))}
      <g fontSize="2.3" fontWeight="600" fill="#5a4630" stroke="#f6eedc" strokeWidth="0.6" paintOrder="stroke" letterSpacing="0.15">
        {streets.filter((f) => STREET_LABELS[f.name]).map((f) => (
          <g key={`${f.id}l`}>
            <path id={`st-${f.id}`} d={linePath(f.line, P.to)} fill="none" stroke="none" />
            <text dy="0.8">
              <textPath href={`#st-${f.id}`} startOffset={f.name === 'Mangalbazar Marg' ? '62%' : '8%'}>
                {STREET_LABELS[f.name]}
              </textPath>
            </text>
          </g>
        ))}
      </g>
      <g pointerEvents="none" fontWeight="700" letterSpacing="0.4" stroke="#efe2c4" strokeWidth="0.5" paintOrder="stroke">
        <text x="87.6" y="96" fontSize="2.1" fill="#7a5a2e" transform="rotate(-78.35 87.6 96)" textAnchor="middle">
          DURBAR SQUARE · BRICK PLAZA
        </text>
        <text x="121.5" y="112" fontSize="2.3" fill="#6e3216" transform="rotate(-78.35 121.5 112)" textAnchor="middle">
          ROYAL PALACE · MALLA DURBAR
        </text>
      </g>
    </g>
  );
});

// Web Mercator tiles at zoom 19, placed with the same projection as everything else on the map.
const TILE_Z = 19;
const TILE_SOURCES = {
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

const TileLayer = memo(function TileLayer({ source }) {
  const P = PROJ.patan;
  const b = PATAN.bounds;
  const src = TILE_SOURCES[source];
  const tiles = [];
  for (let x = Math.floor(tileX(b.lonMin)); x <= Math.floor(tileX(b.lonMax)); x++) {
    for (let y = Math.floor(tileY(b.latMax)); y <= Math.floor(tileY(b.latMin)); y++) {
      const [x0, y0] = P.to({ lat: tileLat(y), lon: tileLon(x) });
      const [x1, y1] = P.to({ lat: tileLat(y + 1), lon: tileLon(x + 1) });
      tiles.push(<image key={`${x}-${y}`} href={src.url(x, y)} x={x0} y={y0} width={x1 - x0 + 0.05} height={y1 - y0 + 0.05} preserveAspectRatio="none" />);
    }
  }
  return (
    <g>
      <rect width={P.w} height={P.h} fill={source === 'satellite' ? '#2a2620' : '#f2efe9'} />
      {tiles}
    </g>
  );
});

function PatanMap({ layer, jatra, chariotLive, player, heading, dwell, unlocked, target, trail, accuracy, onTap }) {
  const P = PROJ.patan;
  const tap = makeSvgTap(onTap, P.from);
  const pxy = player ? P.to(player) : null;
  const inView = pxy && pxy[0] >= 0 && pxy[0] <= P.w && pxy[1] >= 0 && pxy[1] <= P.h;
  const blueprint = layer === 'blueprint';
  const onTiles = !blueprint;
  const labelFill = onTiles && layer === 'satellite' ? '#fff8e8' : '#2b2016';
  const labelHalo = onTiles && layer === 'satellite' ? '#14100c' : '#efe2c4';

  let chariot = null;
  if (jatra != null) {
    const sB = chariotDistance(jatra);
    const sM = sB + CHARIOT.minnathLead;
    chariot = { b: chariotAt(sB), m: sM <= ROUTE_LENGTH ? chariotAt(sM) : null };
  }

  return (
    <svg
      viewBox={`0 0 ${P.w.toFixed(2)} ${P.h.toFixed(2)}`}
      className={`mx-auto block h-auto max-h-[72vh] w-full touch-none select-none ${onTap ? 'cursor-crosshair' : ''}`}
      onPointerDown={tap}
      role="img"
      aria-label="Map of Patan Durbar Square: the brick plaza, the royal palace, monument geofences and your position"
    >
      <defs>
        <pattern id="herringbone" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(11.65)">
          <rect width="2" height="2" fill="#dcb98b" />
          <path d="M0 0.5H1V0M1 2V1.5H2M1 1H2V0.5M0 1.5H1V1" fill="none" stroke="#b98d5c" strokeWidth="0.1" />
        </pattern>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="muted">
          <feColorMatrix type="saturate" values="0.3" />
        </filter>
      </defs>

      {blueprint ? <BlueprintBase /> : <TileLayer source={layer} />}

      {/* landmarks */}
      {blueprint ? (
        <g pointerEvents="none">
          <GarudaPillar x={P.to(LANDMARKS.garuda.pos)[0]} y={P.to(LANDMARKS.garuda.pos)[1]} />
          <Column x={P.to(LANDMARKS.column.pos)[0]} y={P.to(LANDMARKS.column.pos)[1]} />
          <BellIcon x={P.to(LANDMARKS.bell.pos)[0]} y={P.to(LANDMARKS.bell.pos)[1]} />
        </g>
      ) : null}

      {MONUMENTS.map((m) => {
        const st = dwell[m.id];
        const isOpen = !!unlocked[m.id];
        const pts = m.obb.map(([lon, lat]) => P.to({ lat, lon }));
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        const [cx, cy] = P.to(m.centroid);
        const big = m.kind === 'courtyard' || m.id === 'LAL1220';
        const labelY = big ? box.y + 3.4 : box.y + box.h + 3;
        const progress = st && !isOpen ? st.t / DWELL_SECONDS : 0;
        const ringColor = st?.status === 'too-fast' || st?.status === 'need-descent' ? '#c4532f' : '#e3a93f';
        return (
          <g key={m.id}>
            {blueprint ? (
              <g filter={isOpen ? undefined : 'url(#muted)'} opacity={isOpen ? 1 : 0.85}>
                <MonumentGlyph m={m} box={box} project={P.to} />
              </g>
            ) : null}
            <polygon
              points={pts.map((p) => p.join(',')).join(' ')}
              fill={isOpen ? '#e3a93f' : onTiles ? '#efe2c4' : 'none'}
              fillOpacity={isOpen ? 0.18 : 0.12}
              stroke={isOpen ? '#e3a93f' : onTiles ? '#fff3d6' : '#5a3a1e'}
              strokeWidth={isOpen ? 0.8 : 0.45}
              strokeDasharray={isOpen ? undefined : '1.2 0.8'}
              filter={isOpen ? 'url(#glow)' : undefined}
              className={st?.status === 'dwelling' ? 'mq-dwelling' : undefined}
            />
            {progress > 0 ? (
              <g transform={`rotate(-90 ${cx} ${cy})`}>
                <circle cx={cx} cy={cy} r="3.4" fill="#14100c" fillOpacity="0.5" />
                <circle cx={cx} cy={cy} r="3.4" fill="none" stroke={ringColor} strokeWidth="0.9" pathLength="100" strokeDasharray={`${progress * 100} 100`} />
              </g>
            ) : null}
            {!isOpen && !progress && onTiles ? <Lock x={cx - 1.3} y={cy - 1.3} width="2.6" height="2.6" color="#fff3d6" strokeWidth={2.2} /> : null}
            <text x={cx} y={labelY} textAnchor="middle" fontSize="2.5" fontWeight="700" fill={labelFill} stroke={labelHalo} strokeWidth="0.7" paintOrder="stroke" pointerEvents="none">
              {isOpen ? '✦ ' : ''}
              {m.id === 'LAL1220' ? 'Sundari Chowk' : m.id === 'LAL1270' ? 'Taleju (N)' : m.name.replace(' Temple', '')}
            </text>
          </g>
        );
      })}

      {/* palace details that sit on top of the courtyards */}
      <g pointerEvents="none">
        {blueprint ? <Statue x={P.to(LANDMARKS.ganga.pos)[0]} y={P.to(LANDMARKS.ganga.pos)[1]} /> : null}
        {blueprint ? <Statue x={P.to(LANDMARKS.yamuna.pos)[0]} y={P.to(LANDMARKS.yamuna.pos)[1]} /> : null}
        <GoldenDoor x={P.to(LANDMARKS.goldenDoor.pos)[0]} y={P.to(LANDMARKS.goldenDoor.pos)[1]} />
        <g fontSize="1.9" fontWeight="600" fill={labelFill} stroke={labelHalo} strokeWidth="0.55" paintOrder="stroke">
          <text x={P.to(LANDMARKS.goldenDoor.pos)[0] - 2.4} y={P.to(LANDMARKS.goldenDoor.pos)[1] + 0.7} textAnchor="end">Golden Door</text>
          <text x={P.to(LANDMARKS.bell.pos)[0] - 2.8} y={P.to(LANDMARKS.bell.pos)[1] + 0.7} textAnchor="end">Taleju Bell</text>
          <text x={P.to(LANDMARKS.garuda.pos)[0] + 1.8} y={P.to(LANDMARKS.garuda.pos)[1] + 0.7}>Garuda</text>
          <text x={P.to(LANDMARKS.column.pos)[0] - 1.8} y={P.to(LANDMARKS.column.pos)[1] + 0.7} textAnchor="end">Yoganarendra column</text>
        </g>
      </g>

      {chariot ? <ChariotLayer chariot={chariot} live={chariotLive} to={P.to} t={jatra} /> : null}

      <Trail points={trail} to={P.to} />
      <Target from={pxy} to={target ? P.to(target) : null} />
      {inView ? <Player xy={pxy} heading={heading} accuracy={accuracy} /> : null}
      <ScaleBar x={4} y={P.h - 4} />
      <NorthArrow x={P.w - 6} y={8} />
    </svg>
  );
}

function ChariotLayer({ chariot, live, to, t }) {
  const route = CHARIOT.route.map((p) => to(p).map((v) => v.toFixed(2)).join(',')).join(' ');
  const [bx, by] = to(chariot.b.pos);
  const pulling = live?.inPace;
  return (
    <g pointerEvents="none">
      <polyline points={route} fill="none" stroke="#c4322a" strokeWidth="0.6" strokeDasharray="1.6 1.2" strokeOpacity="0.75" />
      <circle cx={bx} cy={by} r={CHARIOT.radius} fill="#e3a93f" fillOpacity={pulling ? 0.22 : 0.1} stroke="#e3a93f" strokeWidth="0.6" />
      <circle cx={bx} cy={by} r={CHARIOT.radius} fill="none" stroke="#f3cd7e" strokeWidth="0.4" className="mq-fence" />
      {chariot.m ? (
        <g>
          <ChariotGlyph x={to(chariot.m.pos)[0]} y={to(chariot.m.pos)[1]} bearing={chariot.m.bearing} scale={0.55} small />
          <text x={to(chariot.m.pos)[0]} y={to(chariot.m.pos)[1] - 5} textAnchor="middle" fontSize="2" fontWeight="700" fill="#7a1e14" stroke="#fff3d6" strokeWidth="0.5" paintOrder="stroke">
            Minnath
          </text>
        </g>
      ) : null}
      <Crowd x={bx} y={by} bearing={chariot.b.bearing} seed={Math.floor(t)} />
      <ChariotGlyph x={bx} y={by} bearing={chariot.b.bearing} />
      <text x={bx} y={by + CHARIOT.radius + 3} textAnchor="middle" fontSize="2.3" fontWeight="700" fill="#7a1e14" stroke="#fff3d6" strokeWidth="0.6" paintOrder="stroke">
        Bungadyah · Rato Machhindranath
      </text>
    </g>
  );
}

function BoudhaMap({ player, heading, kora, koraLive, target, trail, accuracy, onTap }) {
  const P = PROJ.boudha;
  const c = BOUDHA.halfSpan;
  const tap = makeSvgTap(onTap, P.from);
  const pxy = player ? P.to(player) : null;
  const inView = pxy && pxy[0] >= 0 && pxy[0] <= P.w && pxy[1] >= 0 && pxy[1] <= P.h;
  const step = 360 / BOUDHA.sectors;
  const theta = kora.theta;
  const frac = Math.min(1, Math.abs(theta) / KORA_GOAL);
  const rProg = 66;
  return (
    <svg
      viewBox={`0 0 ${P.w} ${P.h}`}
      className={`mx-auto block h-auto max-h-[72vh] w-full touch-none select-none ${onTap ? 'cursor-crosshair' : ''}`}
      onPointerDown={tap}
      role="img"
      aria-label="Map of the Boudhanath kora ring with twelve sectors and your position"
    >
      <rect width={P.w} height={P.h} fill="#e6d7b5" />
      <circle cx={c} cy={c} r={BOUDHA.rMax + 4} fill="#efe2c4" />

      {Array.from({ length: BOUDHA.sectors }, (_, i) => {
        const visited = kora.visited[i];
        const current = koraLive?.inRing && koraLive.sector === i;
        return (
          <path
            key={i}
            d={annularSector(c, c, BOUDHA.rMin, BOUDHA.rMax, i * step + 0.4, (i + 1) * step - 0.4)}
            fill={visited ? '#67b783' : '#d8c59f'}
            fillOpacity={visited ? 0.45 : 0.55}
            stroke={current ? '#c4532f' : '#b39c74'}
            strokeWidth={current ? 0.8 : 0.25}
          />
        );
      })}
      {Array.from({ length: BOUDHA.sectors }, (_, i) => {
        const a = ((i + 0.5) * step * Math.PI) / 180;
        const r = 54.5;
        return (
          <text key={i} x={c + r * Math.sin(a)} y={c - r * Math.cos(a) + 0.9} textAnchor="middle" fontSize="2.6" fontWeight="600" fill="#4a3b2b" pointerEvents="none">
            {SECTOR_NAMES[i]}
          </text>
        );
      })}

      <circle cx={c} cy={c} r={BOUDHA.rWalk} fill="none" stroke="#7a6342" strokeWidth="0.4" strokeDasharray="1.6 1.2" />

      {/* prayer wheels on the inner wall */}
      {Array.from({ length: 72 }, (_, i) => {
        const a = (i * 5 * Math.PI) / 180;
        return <circle key={i} cx={c + 21.2 * Math.sin(a)} cy={c - 21.2 * Math.cos(a)} r="0.45" fill="#b8862d" />;
      })}
      {/* stupa: plinth, dome, harmika */}
      <circle cx={c} cy={c} r={BOUDHA.rMin} fill="#f8f4ea" stroke="#b39c74" strokeWidth="0.4" />
      <rect x={c - 15} y={c - 15} width="30" height="30" fill="none" stroke="#d9cdb3" strokeWidth="0.4" transform={`rotate(45 ${c} ${c})`} />
      <circle cx={c} cy={c} r="12.5" fill="#fffdf7" stroke="#cdbf9f" strokeWidth="0.4" />
      <rect x={c - 3.4} y={c - 3.4} width="6.8" height="6.8" fill="#e3a93f" stroke="#8a5d14" strokeWidth="0.3" />
      <circle cx={c} cy={c} r="1.6" fill="#c4532f" />

      {/* theta progress ring: from the start, clockwise gold, counter-clockwise brick */}
      <circle cx={c} cy={c} r={rProg} fill="none" stroke="#14100c" strokeOpacity="0.12" strokeWidth="1.6" />
      {frac > 0 ? (
        <circle
          cx={c}
          cy={c}
          r={rProg}
          fill="none"
          stroke={theta >= 0 ? '#e3a93f' : '#c4532f'}
          strokeWidth="1.6"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={`${frac * 100} 100`}
          transform={`rotate(-90 ${c} ${c})${theta < 0 ? ` translate(0 ${2 * c}) scale(1 -1)` : ''}`}
        />
      ) : null}
      {[45, 135, 225, 315].map((a) => {
        const t = (a * Math.PI) / 180;
        const x = c + 70 * Math.sin(t);
        const y = c - 70 * Math.cos(t);
        return (
          <path key={a} d="M-1.4 -1.2 L1.4 0 L-1.4 1.2" fill="none" stroke="#7a6342" strokeWidth="0.5" transform={`translate(${x} ${y}) rotate(${a})`} />
        );
      })}

      <Trail points={trail} to={P.to} />
      <Target from={pxy} to={target ? P.to(target) : null} />
      {inView ? <Player xy={pxy} heading={heading} accuracy={accuracy} /> : null}
      <ScaleBar x={4} y={P.h - 4} />
      <NorthArrow x={P.w - 6} y={8} />
    </svg>
  );
}

function MapOverlay({ cluster, mode, gps, farFromSite, insideId, dwell, speed, zOpen, koraLive, kora, chariotLive, layer, etiquette, onDismissEtiquette, onUseSim }) {
  let chip = null;
  let chariotChip = null;
  if (cluster === 'patan' && chariotLive?.inside) {
    chariotChip = chariotLive.inPace
      ? { tone: 'good', title: 'Pulling with Bungadyah', detail: `${Math.min(CHARIOT.holdSeconds, Math.floor(chariotLive.t))}/${CHARIOT.holdSeconds} s` }
      : { tone: 'warn', title: 'Chariot circle', detail: `Walk ${CHARIOT.speed} m/s SE · off by ${fmt(chariotLive.rel, 1)}` };
  }
  if (cluster === 'patan' && insideId) {
    const m = BY_ID[insideId];
    const st = dwell[insideId];
    const tone = st.status === 'unlocked' ? 'good' : st.status === 'too-fast' || st.status === 'need-descent' ? 'warn' : 'info';
    const detail = {
      unlocked: 'Unlocked',
      dwelling: `Dwell ${Math.floor(st.t)}/${DWELL_SECONDS} s`,
      'too-fast': `${fmt(speed)} m/s: slow to walking pace`,
      grace: 'Signal drift',
      'need-descent': zOpen ? 'Unlocking…' : `Descend to ${Z_GATE.depthMeters.toFixed(1)} m`,
      idle: '',
    }[st.status];
    chip = { tone, title: m.name, detail };
  } else if (cluster === 'boudha' && koraLive) {
    if (koraLive.inRing) {
      chip = {
        tone: koraLive.tooFast ? 'warn' : 'info',
        title: `Kora ring · sector ${SECTOR_NAMES[koraLive.sector]}`,
        detail: koraLive.tooFast ? `${fmt(speed)} m/s: not counted` : `θ ${signed(kora.theta, 0)}°`,
      };
    } else if (mode === 'sim' || farFromSite < 1000) {
      chip = { tone: 'muted', title: `Outside the ring (${fmt(koraLive.r, 0)} m)`, detail: `Walk between ${BOUDHA.rMin} and ${BOUDHA.rMax} m` };
    }
  }
  const toneCls = { good: 'border-jade/60 text-jade', warn: 'border-brick/70 text-[#f0a080]', info: 'border-gold/60 text-gold-soft', muted: 'border-line text-muted' };
  return (
    <>
      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-5rem)] flex-col gap-2">
        {mode === 'sim' ? (
          <span className="w-fit rounded-full bg-ink/80 px-2.5 py-1 text-[11px] text-muted">
            <Footprints size={12} className="mr-1 inline align-[-2px] text-gold" aria-hidden />
            Tap the map to walk there · arrows / WASD
          </span>
        ) : null}
        {[chip, chariotChip].filter(Boolean).map((c) => (
          <span key={c.title} className={`mq-in w-fit rounded-xl border bg-ink/90 px-3 py-1.5 text-sm ${toneCls[c.tone]}`}>
            <span className="font-semibold">{c.title}</span>
            {c.detail ? <span className="ml-2 font-mono text-xs opacity-90">{c.detail}</span> : null}
          </span>
        ))}
      </div>

      {layer ? (
        <div className="absolute bottom-1 right-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] text-muted">
          {layer === 'satellite' ? (
            <>
              <a href={TILE_SOURCES.satellite.href} target="_blank" rel="noreferrer" className="hover:text-text">{TILE_SOURCES.satellite.credit}</a> ·{' '}
            </>
          ) : null}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="hover:text-text">
            {OSM_ATTRIBUTION}
          </a>
        </div>
      ) : null}

      {mode === 'live' && (gps.status === 'waiting' || (gps.fix && farFromSite > 300)) ? (
        <div className="absolute inset-x-3 bottom-3 rounded-xl border border-line bg-ink/92 p-3 text-sm sm:inset-x-auto sm:right-3 sm:max-w-sm">
          {gps.status === 'waiting' && !gps.fix ? (
            <p className="flex items-center gap-2 text-muted">
              <Satellite size={16} className="animate-pulse text-gold" aria-hidden /> Waiting for a GPS fix…
            </p>
          ) : (
            <>
              <p>
                Your GPS fix is <span className="font-semibold text-gold-soft">{fmtDist(farFromSite)}</span> from {cluster === 'patan' ? 'Patan Durbar Square' : 'Boudhanath'}.
              </p>
              <p className="mt-1 text-muted">Geofences only trigger on site. To test from here, use the Virtual Walker.</p>
              <button type="button" onClick={onUseSim} className="mt-2 rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-ink">
                Use the Virtual Walker
              </button>
            </>
          )}
        </div>
      ) : null}

      {etiquette && cluster === 'boudha' ? (
        <div role="alert" className="mq-in absolute inset-x-3 bottom-3 rounded-xl border border-brick bg-[#2b140c]/95 p-3 text-sm sm:inset-x-auto sm:left-3 sm:max-w-md">
          <div className="flex items-start gap-3">
            <RotateCcw size={22} className="mt-0.5 shrink-0 text-brick" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold text-[#f6b79c]">Please walk the kora clockwise</p>
              <p className="mt-1 text-[#e8d2c5]">
                You have turned 90° counter-clockwise. Pilgrims circle Boudhanath clockwise, keeping the stupa and its prayer wheels on their right. Turn around to continue.
              </p>
            </div>
            <button type="button" onClick={onDismissEtiquette} className="-m-1 p-1 text-[#e8d2c5] hover:text-white" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- controls

function ModeSwitch({ mode, onChange }) {
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

const PAD = [
  { v: [-1, 1], icon: ArrowUpLeft, label: 'North-west' },
  { v: [0, 1], icon: ArrowUp, label: 'North' },
  { v: [1, 1], icon: ArrowUpRight, label: 'North-east' },
  { v: [-1, 0], icon: ArrowLeft, label: 'West' },
  null,
  { v: [1, 0], icon: ArrowRight, label: 'East' },
  { v: [-1, -1], icon: ArrowDownLeft, label: 'South-west' },
  { v: [0, -1], icon: ArrowDown, label: 'South' },
  { v: [1, -1], icon: ArrowDownRight, label: 'South-east' },
];

function SimControls({ dpad, setDpad, onStop, walkSpeed, setWalkSpeed }) {
  const fast = walkSpeed > MAX_WALK_SPEED;
  return (
    <div className="mt-4 flex flex-wrap items-start gap-4">
      <div className="grid shrink-0 grid-cols-3 gap-1.5" aria-label="Directional pad: hold to walk">
        {PAD.map((b, i) => {
          if (!b) {
            return (
              <button key={i} type="button" onClick={onStop} className="grid size-12 place-items-center rounded-xl border border-line bg-ink text-muted hover:text-text" aria-label="Stop">
                <CircleStop size={18} />
              </button>
            );
          }
          const len = Math.hypot(...b.v);
          const v = [b.v[0] / len, b.v[1] / len];
          const active = dpad && dpad[0] === v[0] && dpad[1] === v[1];
          const release = () => setDpad(null);
          return (
            <button
              key={i}
              type="button"
              aria-label={`Walk ${b.label} (hold)`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                setDpad(v);
              }}
              onPointerUp={release}
              onPointerCancel={release}
              onLostPointerCapture={release}
              onContextMenu={(e) => e.preventDefault()}
              className={`grid size-12 touch-none select-none place-items-center rounded-xl border transition-colors ${active ? 'border-gold bg-gold text-ink' : 'border-line bg-raised text-text hover:border-gold/60'}`}
            >
              <b.icon size={20} />
            </button>
          );
        })}
      </div>

      <div className="min-w-[150px] flex-1">
        <label className="flex items-baseline justify-between text-xs text-muted" htmlFor="speed">
          <span className="flex items-center gap-1.5">
            <Gauge size={14} className="text-gold" aria-hidden /> Walking speed
          </span>
          <span className={`font-mono text-sm ${fast ? 'text-[#f0a080]' : 'text-text'}`}>{walkSpeed.toFixed(1)} m/s</span>
        </label>
        <input id="speed" type="range" min="3" max="50" step="1" value={Math.round(walkSpeed * 10)} onChange={(e) => setWalkSpeed(Number(e.target.value) / 10)} aria-valuetext={`${walkSpeed.toFixed(1)} metres per second`} className="mt-2 w-full" />
        <div className="relative h-4 text-[10px] text-faint">
          <span className="absolute left-0">0.3</span>
          <span className="absolute -translate-x-1/2 text-muted" style={{ left: `${((MAX_WALK_SPEED - 0.3) / 4.7) * 100}%` }}>
            ▲ {MAX_WALK_SPEED.toFixed(1)} limit
          </span>
          <span className="absolute right-0">5.0</span>
        </div>
        <p className={`mt-1 text-xs ${fast ? 'text-[#f0a080]' : 'text-muted'}`}>
          {fast ? 'Faster than walking: geofence timers will pause.' : 'Pedestrian pace: geofence timers run.'}
        </p>
      </div>
    </div>
  );
}

function GpsStatus({ gps, onRetry }) {
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

function AltitudeControl({ dz, setDz, pressure, zOpen, live }) {
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

function Telemetry({ tick, player, speed, dz, pressure, cluster, insideId, dwell, koraLive, chariotLive }) {
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

// ---------------------------------------------------------------- cluster panels

function StatusPill({ status, unlocked }) {
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

function MonumentList({ player, dwell, progress, canWalk, onWalk, onOpen }) {
  const done = MONUMENTS.filter((m) => progress.unlocked[m.id]).length;
  return (
    <Panel>
      <PanelTitle icon={MapPin} right={<span className="font-mono text-xs text-muted">{done}/{MONUMENTS.length}</span>}>
        Monuments
      </PanelTitle>
      <ul className="-mx-2 space-y-0.5">
        {MONUMENTS.map((m) => {
          const st = dwell[m.id];
          const open = !!progress.unlocked[m.id];
          const d = player ? distanceMeters(player, m.centroid) : null;
          return (
            <li key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-raised">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: KIND_STYLE[m.kind].fill }} aria-hidden />
              <button type="button" onClick={() => onOpen(m.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm">{m.name}</span>
                <span className="block truncate text-[11px] text-muted">
                  {m.id} · {m.typeLabel}
                  {m.zGate ? ' · z-gate' : ''}
                  {m.riddle ? (progress.riddles[m.id] ? ' · riddle ✓' : ' · riddle') : ''}
                </span>
              </button>
              <span className="w-12 shrink-0 text-right font-mono text-[11px] text-muted">{d != null ? fmtDist(d) : ''}</span>
              <StatusPill status={st?.status} unlocked={open} />
              {canWalk ? (
                <button type="button" onClick={() => onWalk(m)} className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-ink hover:text-gold" aria-label={`Walk to ${m.name}`} title="Walk here">
                  <Footprints size={14} />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function KoraPanel({ kora, koraLive, speed, onOpen }) {
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

function BadgesPanel({ score, progress }) {
  const status = (b, on) => {
    if (on) return 'Earned';
    if (b.needs) return `${b.needs.filter((id) => progress.unlocked[id]).length}/${b.needs.length}`;
    if (b.id === 'kora') return `${Math.max(0, Math.min(360, Math.round(progress.kora.theta)))}/360°`;
    if (b.id === 'chariot') return 'Seasonal · Live Jatra';
    if (b.id === 'guthi') return 'Kala shop';
    return '';
  };
  return (
    <Panel>
      <PanelTitle icon={Award}>Badges & ranks</PanelTitle>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {BADGES.map((b) => {
          const Icon = BADGE_ICON[b.id];
          const on = score.badges.includes(b.id);
          return (
            <div key={b.id} className={`flex gap-3 rounded-xl border p-3 ${on ? 'border-gold/70 bg-gold/10' : 'border-line bg-ink/40'}`}>
              <span className={`grid size-10 shrink-0 place-items-center rounded-full ${on ? 'bg-gold text-ink' : 'bg-raised text-faint'}`}>
                <Icon size={18} aria-hidden />
              </span>
              <div className="min-w-0">
                <div className={`text-sm font-semibold ${on ? 'text-gold-soft' : ''}`}>
                  {b.name}
                  {b.seasonal ? <span className="ml-1.5 rounded bg-brick/25 px-1 align-middle text-[10px] font-semibold text-[#f0a080]">SEASONAL</span> : null}
                </div>
                <div className="text-xs text-muted">{b.how}</div>
                <div className="mt-1 font-mono text-[11px] text-faint">{status(b, on)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <ol className="mt-4 grid grid-cols-5 gap-1.5">
        {RANKS.map((r) => {
          const cur = r.tier === score.rank.tier;
          const past = r.tier < score.rank.tier;
          return (
            <li key={r.tier} className={`rounded-lg border px-1.5 py-2 text-center ${cur ? 'border-gold bg-gold/15' : past ? 'border-line bg-raised' : 'border-line'}`}>
              <div className="text-[10px] text-muted">Tier {r.tier}</div>
              <div className={`truncate text-xs font-semibold ${cur ? 'text-gold-soft' : past ? 'text-text' : 'text-faint'}`} title={`${r.name} (${r.meaning})`}>
                {r.name}
              </div>
              <div className="font-mono text-[10px] text-faint">{r.xp}</div>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11px] text-faint">
        Punya: {XP.unlock} per monument (+{XP.zGateBonus} for a hiti), {XP.riddle} per riddle, {XP.sector} per kora sector, {XP.koraMaster} for a full kora.
      </p>
    </Panel>
  );
}

function LoreCodex({ progress, onOpen }) {
  const items = [...MONUMENTS.map((m) => ({ id: m.id, name: m.name, kind: m.kind, open: !!progress.unlocked[m.id] })), { id: 'boudha', name: 'Boudhanath Stupa', kind: 'stupa', open: progress.kora.visited.some(Boolean) }];
  const count = items.filter((i) => i.open).length;
  return (
    <Panel>
      <PanelTitle icon={BookOpen} right={<span className="font-mono text-xs text-muted">{count}/{items.length}</span>}>
        DANAM lore cards
      </PanelTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onOpen(it.id)}
            className={`group flex min-h-[92px] flex-col justify-between rounded-xl border p-2.5 text-left transition-colors ${it.open ? 'border-gold/50 bg-gradient-to-br from-raised to-[#3a2614] hover:border-gold' : 'border-dashed border-line bg-ink/30 hover:border-faint'}`}
          >
            <span className="flex items-center justify-between text-[10px] font-mono text-faint">
              {it.id === 'boudha' ? 'KTM' : it.id}
              {it.open ? <ScrollText size={13} className="text-gold" aria-hidden /> : <Lock size={12} aria-hidden />}
            </span>
            <span className={`text-xs font-semibold leading-snug ${it.open ? 'text-text' : 'text-faint'}`}>{it.open ? it.name : '? ? ?'}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function EventLog({ log }) {
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

// ---------------------------------------------------------------- lore card modal

const CARD_TABS = [
  { id: 'record', label: 'Record', icon: FileText },
  { id: 'compare', label: '1970 vs 2026', icon: History },
  { id: 'inspect', label: 'Inspector', icon: ScanSearch },
];

function LoreCard({ id, progress, player, canWalk, onWalk, onSolve, onClose }) {
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
          <h2 id="lore-title" className="mt-2 pr-8 font-display text-2xl font-semibold">
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

function ThenAndNow({ id, restoration }) {
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

function Inspector({ id, items, solved }) {
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

// ---------------------------------------------------------------- Kala shop

const SHOP_ICON = { cafe: Ticket, workshop: Hammer, donation: HeartHandshake };

function ShopDrawer({ score, progress, onBuy, onClose }) {
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
              <h2 id="shop-title" className="font-display text-xl font-semibold">Lalitpur Heritage Rewards & Guthi Drawer</h2>
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

function Riddle({ m, solved, onSolve }) {
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

// ---------------------------------------------------------------- toasts

function Toasts({ toasts }) {
  const icon = { unlock: Sparkles, badge: Award, rank: Award };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => {
        const Icon = icon[t.kind] || Sparkles;
        return (
          <div key={t.key} className="mq-in flex w-full max-w-sm items-center gap-3 rounded-2xl border border-gold/60 bg-[#2a1d12]/95 px-4 py-3 shadow-2xl shadow-black/50">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold text-ink">
              <Icon size={18} aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-gold-soft">{t.title}</div>
              <div className="truncate text-xs text-muted">{t.body}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
