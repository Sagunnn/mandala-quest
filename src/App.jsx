import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Footprints, Gauge } from 'lucide-react';
import {
  ALTITUDE_RANGE, BADGES, BOUDHA, BOUDHA_START, CHARIOT, DWELL_SECONDS, EXIT_GRACE_TICKS, FESTIVAL, KALA, MAX_WALK_SPEED,
  MONUMENTS, PATAN, SECTOR_NAMES, SHOP_ITEMS, TICK_MS, XP, Z_GATE, chariotAt, chariotDistance, computeScore, distanceMeters,
  festivalBonus, fromLocal, initialProgress, normalizeProgress, pointInPolygon, pressureHpa, stepChariot, stepDwell, stepKora,
  toLocal, zGatePassed,
} from './engine.js';
import { PROJ, clampToMap } from './view.js';
import { BadgePage, DexPage, GameFrame, Hud, MENU, Screen, StartMenu, TILE_SOURCES, TextBox } from './Game.jsx';
import {
  AltitudeControl, EventLog, GpsStatus, KoraPanel, LoreCard, ModeSwitch, Panel, PanelTitle, STATUS_LABEL, ShopDrawer, Telemetry, fmt, fmtDist,
} from './panels.jsx';

const STORAGE_KEY = 'mandala-quest-v1';
const TRAIL_LENGTH = 90;
const RUN_SPEED = 3.0; // m/s while B is held: faster than walking, so timers pause
const BARO_RATE = 1.5; // m/s of descent or climb while L or R is held
const BY_ID = Object.fromEntries(MONUMENTS.map((m) => [m.id, m]));
const DIRS = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };
const LAYERS = ['pixel', 'osm', 'satellite'];
const DEX_IDS = [...MONUMENTS.map((m) => m.id), 'boudha'];

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : v;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage blocked: nothing is remembered */
    }
  },
};

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
  store.set(STORAGE_KEY, JSON.stringify(p));
}

const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const bearingOf = (de, dn) => ((Math.atan2(de, dn) * 180) / Math.PI + 360) % 360;
const CLOSED_MENU = { open: false, index: 0, page: null, pageIndex: 0 };

export default function App() {
  const [cluster, setCluster] = useState('patan');
  const [mode, setMode] = useState('sim');
  const [walkSpeed, setWalkSpeed] = useState(1.4);
  const [dz, setDz] = useState(0);
  const [simPos, setSimPosState] = useState({ patan: PATAN.start, boudha: BOUDHA_START });
  const [heading, setHeading] = useState({ patan: 180, boudha: 0 });
  const [moving, setMoving] = useState(false);
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState(null);
  const [gps, setGps] = useState({ status: 'off', fix: null, error: null });
  const [progress, setProgress] = useState(loadProgress);
  const [dwell, setDwell] = useState({});
  const [koraLive, setKoraLive] = useState(null);
  const [speeds, setSpeeds] = useState({ patan: 0, boudha: 0 });
  const [tick, setTick] = useState(0);
  const [log, setLog] = useState([]);
  const [messages, setMessages] = useState([]);
  const [card, setCard] = useState(null);
  const [layer, setLayer] = useState(() => {
    const l = store.get('mandala-quest-layer', 'pixel');
    return LAYERS.includes(l) ? l : 'pixel';
  });
  const [zoomOut, setZoomOut] = useState(false);
  const [menu, setMenu] = useState(CLOSED_MENU);
  const [jatra, setJatra] = useState(false);
  const [jatraNow, setJatraNow] = useState(0);
  const [chariotLive, setChariotLive] = useState(null);
  const [shopOpen, setShopOpen] = useState(false);

  const simPosRef = useRef(simPos);
  const held = useRef(new Set());
  const watchRef = useRef(null);
  const lastTickRef = useRef({ time: 0, pos: {} });
  const jatraStartRef = useRef(0);
  const chariotHoldRef = useRef({ t: 0, miss: 0 });
  const state = useRef({});
  state.current = { cluster, mode, walkSpeed, dz, target, gps, progress, dwell, koraLive, card, jatra, chariotLive, shopOpen, menu, messages };

  const setSimPos = useCallback((c, pos) => {
    simPosRef.current = { ...simPosRef.current, [c]: pos };
    setSimPosState(simPosRef.current);
  }, []);
  const posFor = useCallback((c, s = state.current) => (s.mode === 'live' ? s.gps.fix : simPosRef.current[c]), []);

  const score = useMemo(() => computeScore(progress), [progress]);

  const pushLog = useCallback((entries) => {
    if (!entries.length) return;
    const t = clock();
    setLog((l) => [...entries.map((e) => ({ ...e, t, key: Math.random() })).reverse(), ...l].slice(0, 40));
  }, []);

  /** Queue a line for the text box. */
  const say = useCallback((text, opts = {}) => {
    setMessages((q) => (q.some((m) => m.text === text) ? q : [...q, { text, key: Math.random(), ...opts }].slice(-5)));
  }, []);
  const nextMessage = useCallback(() => setMessages((q) => q.slice(1)), []);

  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => store.set('mandala-quest-layer', layer), [layer]);

  useEffect(() => {
    if (store.get('mandala-quest-intro', '') === 'seen') return;
    store.set('mandala-quest-intro', 'seen');
    say('Welcome to the Living Valley!\nWalk with the arrow keys (or the D-pad on a phone), or tap the map to walk there.', { hold: 5200 });
    say('Stand still inside a monument to record it.\nMenu (Enter) has your Dex, badges and bag.', { hold: 5200 });
  }, [say]);

  // Rank-ups and badges, announced when they change (not on page load).
  const prevScore = useRef(score);
  useEffect(() => {
    const prev = prevScore.current;
    prevScore.current = score;
    if (score.rank.tier > prev.rank.tier) say(`Rank up! You are now TIER ${score.rank.tier}: ${score.rank.name.toUpperCase()}.\n${score.rank.nepali} — ${score.rank.meaning}`);
    for (const id of score.badges) {
      if (!prev.badges.includes(id)) {
        const b = BADGES.find((x) => x.id === id);
        say(`You received the ${b.name.toUpperCase()} badge!${b.reward ? `\n+${KALA.badge} KALA` : ''}`);
      }
    }
  }, [score, say]);

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
      const cap = Math.max(s.walkSpeed, held.current.has('b') ? RUN_SPEED : 0);
      for (const c of ['patan', 'boudha']) {
        pos[c] = posFor(c, s);
        if (!pos[c]) continue;
        if (s.mode === 'live') sp[c] = s.gps.fix?.speed ?? 0;
        // The walker never goes faster than its set pace; this drops frame-timing jitter.
        else sp[c] = last[c] ? Math.min(cap, distanceMeters(last[c], pos[c]) / dt) : 0;
        const d = last[c] ? toLocal(last[c], pos[c]) : { e: 0, n: 0 };
        vel[c] = { e: d.e / dt, n: d.n / dt };
      }
      lastTickRef.current = { time: now, pos };
      setSpeeds({ patan: sp.patan ?? 0, boudha: sp.boudha ?? 0 });
      setTick((t) => t + 1);
      if (!pos.patan) return;

      const entries = [];
      let next = s.progress;
      let earnedXp = 0;

      // Cluster A: point-in-polygon + dwell + barometric gate
      const d = stepDwell(s.dwell, { pos: pos.patan, speed: sp.patan, dz: s.dz, dt, unlocked: s.progress.unlocked });
      for (const ch of d.changes) {
        entries.push(dwellLogEntry(ch, sp.patan));
        const line = dwellLine(ch);
        if (line && (s.cluster === 'patan' || s.mode === 'live')) say(line);
      }
      setDwell(d.dwell);
      if (d.newly.length) {
        const unlocked = { ...next.unlocked };
        for (const mid of d.newly) unlocked[mid] = Date.now();
        next = { ...next, unlocked };
        for (const mid of d.newly) {
          const m = BY_ID[mid];
          const xp = XP.unlock + (m.zGate ? XP.zGateBonus : 0);
          earnedXp += xp;
          const bonus = festivalBonus(s.progress, xp);
          say(`You discovered ${m.name.toUpperCase()}!\n+${xp + bonus} PUNYA${bonus ? ` (${FESTIVAL.multiplier}×)` : ''}  +${KALA.unlock} KALA\nPress Read (X) for its Dex entry${m.riddle ? ' and riddle' : ''}.`, { hold: 5200 });
        }
      }

      // Cluster B: kora angle
      const k = stepKora(next.kora, s.koraLive, { pos: pos.boudha, speed: sp.boudha });
      const wasIn = s.koraLive?.inRing;
      if (k.live.inRing && !wasIn) {
        entries.push({ tone: 'info', text: `Entered the kora ring (${fmt(k.live.r, 0)} m from the stupa)` });
        say('You join the kora.\nWalk clockwise, keeping the stupa on your right.');
      }
      if (!k.live.inRing && wasIn) entries.push({ tone: 'muted', text: 'Left the kora ring: angle tracking paused' });
      if (k.live.tooFast && !s.koraLive?.tooFast) {
        entries.push({ tone: 'warn', text: `Kora: ${fmt(sp.boudha)} m/s is faster than walking, so the angle is not counted` });
        say('Slow down! Running laps does not count.\nWalk the kora.');
      }
      for (const ev of k.events) {
        if (ev.type === 'sector') {
          earnedXp += XP.sector;
          entries.push({ tone: 'good', text: `Kora sector ${SECTOR_NAMES[ev.sector]} visited (+${XP.sector} Punya, +${KALA.sector} Kala)` });
        }
        if (ev.type === 'master') {
          earnedXp += XP.koraMaster;
          entries.push({ tone: 'good', text: 'Kora complete: +360° clockwise' });
          say(`KORA COMPLETE! +360° clockwise.\n+${XP.koraMaster} PUNYA  +${KALA.koraMaster} KALA`, { hold: 5200 });
        }
        if (ev.type === 'etiquette') {
          entries.push({ tone: 'warn', text: 'Etiquette: 90° counter-clockwise. Walk the kora with the stupa on your right.' });
          say('A pilgrim stops you kindly:\n"The kora is walked clockwise, with the stupa on your right."', { hold: 6000 });
        }
      }
      setKoraLive(k.live);
      if (k.kora !== next.kora) next = { ...next, kora: k.kora };

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
        if (r.inside && !prevC?.inside) {
          entries.push({ tone: 'info', text: `Inside the chariot’s ${CHARIOT.radius} m circle` });
          say(`Bungadyah's chariot rolls past!\nPress Read (X) to fall in step with the pullers (${CHARIOT.speed} m/s), then walk with it.`, { hold: 5200 });
        }
        if (!r.inside && prevC?.inside) entries.push({ tone: 'muted', text: 'Left the chariot’s circle' });
        if (r.inPace && !prevC?.inPace) entries.push({ tone: 'info', text: 'In pace with Bungadyah: keep pulling' });
        if (r.done) {
          const first = !next.chariot;
          next = { ...next, chariot: next.chariot || Date.now(), festivalUntil: Date.now() + FESTIVAL.seconds * 1000 };
          entries.push({ tone: 'good', text: `Pulled with Bungadyah for ${CHARIOT.holdSeconds} s: ${FESTIVAL.multiplier}× Punya for ${FESTIVAL.seconds / 60} min` });
          say(`${first ? 'You pulled the chariot of Bungadyah!' : 'You pulled again!'}\n${FESTIVAL.multiplier}× PUNYA for ${FESTIVAL.seconds / 60} minutes!`, { hold: 5200 });
        }
        setChariotLive({ inside: r.inside, inPace: r.inPace, distance: r.distance, rel: r.rel, t: r.done ? CHARIOT.holdSeconds : r.hold.t });
      }
      if (next !== s.progress) setProgress(next);
      pushLog(entries);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [posFor, pushLog, say]);

  useEffect(() => {
    if (!jatra) return undefined;
    const id = setInterval(() => setJatraNow((performance.now() - jatraStartRef.current) / 1000), 150);
    return () => clearInterval(id);
  }, [jatra]);

  // ------------------------------------------------ movement + barometer (every frame)

  useEffect(() => {
    let raf;
    let last = performance.now();
    let stepClock = 0;
    let wasMoving = false;
    const frame = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = state.current;
      const h = held.current;
      const busy = s.menu.open || s.card || s.shopOpen;
      if (!busy && (h.has('l') || h.has('r'))) {
        const delta = (h.has('r') ? 1 : 0) - (h.has('l') ? 1 : 0);
        setDz((z) => Math.round(Math.min(ALTITUDE_RANGE.max, Math.max(ALTITUDE_RANGE.min, z + delta * BARO_RATE * dt)) * 100) / 100);
      }
      let isMoving = false;
      if (s.mode === 'sim' && !busy) {
        const c = s.cluster;
        const pos = simPosRef.current[c];
        let e = 0;
        let n = 0;
        for (const d of Object.keys(DIRS)) {
          if (h.has(d)) {
            e += DIRS[d][0];
            n += DIRS[d][1];
          }
        }
        const len = Math.hypot(e, n);
        const speed = h.has('b') ? Math.max(RUN_SPEED, s.walkSpeed) : s.walkSpeed;
        const stepM = speed * dt;
        let de = 0;
        let dn = 0;
        if (len) {
          de = (e / len) * stepM;
          dn = (n / len) * stepM;
        } else if (s.target?.cluster === c) {
          const v = toLocal(pos, s.target.pos);
          const dist = Math.hypot(v.e, v.n);
          if (dist <= stepM) {
            de = v.e;
            dn = v.n;
            setTarget(null);
          } else {
            de = (v.e / dist) * stepM;
            dn = (v.n / dist) * stepM;
          }
        }
        if (de || dn) {
          setSimPos(c, clampToMap(c, fromLocal(pos, de, dn)));
          const b = bearingOf(de, dn);
          setHeading((hd) => (Math.abs(hd[c] - b) < 0.5 ? hd : { ...hd, [c]: b }));
          stepClock += dt * (speed > 2 ? 9 : 6);
          setStep(Math.floor(stepClock));
          isMoving = true;
        }
      }
      if (isMoving !== wasMoving) {
        wasMoving = isMoving;
        setMoving(isMoving);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [setSimPos]);

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
        if (Number.isFinite(p.coords.heading) && p.coords.heading != null) fix.heading = p.coords.heading;
        else if (prev && derived > 0.3) {
          const v = toLocal(prev, fix);
          fix.heading = bearingOf(v.e, v.n);
        } else fix.heading = prev?.heading ?? 180;
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
    say(`Correct! "${m.riddle.answer}".\n+${XP.riddle + bonus} PUNYA  +${KALA.riddle} KALA`);
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

  const toggleJatra = () => {
    if (state.current.jatra) {
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
    say('LIVE JATRA!\nRato Machhindranath\'s chariot sets off from Mangal Bazar toward Sundhara. Catch it and pull for 6 seconds!', { hold: 6000 });
  };

  const resetAll = () => {
    if (!window.confirm('Reset all progress, XP, tokens and badges?')) return;
    const fresh = initialProgress();
    prevScore.current = computeScore(fresh);
    setProgress(fresh);
    setDwell({});
    setKoraLive(null);
    setTarget(null);
    setSimPos('patan', PATAN.start);
    setSimPos('boudha', BOUDHA_START);
    setDz(0);
    setJatra(false);
    setChariotLive(null);
    setLog([]);
    setMessages([]);
    lastTickRef.current = { time: performance.now(), pos: {} };
  };

  const pickMenu = (i) => {
    const item = MENU[i];
    if (item === 'DEX') setMenu({ open: true, index: i, page: 'dex', pageIndex: 0 });
    else if (item === 'BADGES') setMenu({ open: true, index: i, page: 'badges', pageIndex: 0 });
    else if (item === 'BAG') {
      setMenu(CLOSED_MENU);
      setShopOpen(true);
    } else if (item === 'TRAVEL') {
      setCluster((c) => (c === 'patan' ? 'boudha' : 'patan'));
      setTarget(null);
      setMenu(CLOSED_MENU);
    } else if (item === 'JATRA') {
      toggleJatra();
      setMenu(CLOSED_MENU);
    } else if (item === 'MAP') {
      setMenu((m) => ({ ...m, index: i }));
      setLayer((l) => LAYERS[(LAYERS.indexOf(l) + 1) % LAYERS.length]);
    } else if (item === 'RESET') {
      setMenu(CLOSED_MENU);
      resetAll();
    } else setMenu(CLOSED_MENU);
  };

  /** A on the overworld: read the monument you are in (or next to), or fall in step with the chariot. */
  const inspect = () => {
    const s = state.current;
    const player = posFor(s.cluster, s);
    if (s.cluster === 'patan' && player) {
      if (s.jatra && s.chariotLive?.inside && !s.chariotLive.inPace && Math.abs(s.walkSpeed - CHARIOT.speed) > 0.05) {
        setWalkSpeed(CHARIOT.speed);
        say(`You fall in step with the pullers: ${CHARIOT.speed} m/s.\nNow walk the way the chariot goes.`);
        return;
      }
      const inside = MONUMENTS.find((m) => pointInPolygon([player.lon, player.lat], m.obb));
      const near = inside || MONUMENTS.map((m) => ({ m, d: distanceMeters(player, m.centroid) })).sort((a, b) => a.d - b.d).find((x) => x.d < 9)?.m;
      if (near) {
        setCard(near.id);
        return;
      }
    }
    if (s.cluster === 'boudha' && s.koraLive?.inRing) {
      setCard('boudha');
      return;
    }
    say('Nothing to read here.\nWalk into a monument’s outline, then press Read (X).');
  };

  // ------------------------------------------------ buttons (screen + keyboard)

  const actions = useRef({});
  actions.current = { pickMenu, inspect };
  const press = useCallback(
    (btn) => {
      const s = state.current;
      if (s.card || s.shopOpen) {
        if (btn === 'b' || btn === 'start') {
          setCard(null);
          setShopOpen(false);
        }
        return;
      }
      if (s.menu.open) {
        const m = s.menu;
        if (btn === 'up' || btn === 'down') {
          const d = btn === 'up' ? -1 : 1;
          if (m.page === 'dex') setMenu({ ...m, pageIndex: (m.pageIndex + d + DEX_IDS.length) % DEX_IDS.length });
          else if (!m.page) setMenu({ ...m, index: (m.index + d + MENU.length) % MENU.length });
        } else if (btn === 'a') {
          if (m.page === 'dex') setCard(DEX_IDS[m.pageIndex]);
          else if (!m.page) actions.current.pickMenu(m.index);
        } else if (btn === 'b') setMenu(m.page ? { ...m, page: null } : CLOSED_MENU);
        else if (btn === 'start') setMenu(CLOSED_MENU);
        return;
      }
      if (DIRS[btn]) {
        held.current.add(btn);
        setTarget(null);
      } else if (btn === 'a') {
        if (s.messages.length) nextMessage();
        else actions.current.inspect();
      } else if (btn === 'b') {
        held.current.add('b');
        if (s.messages.length) nextMessage();
      } else if (btn === 'start') setMenu({ open: true, index: 0, page: null, pageIndex: 0 });
      else if (btn === 'select') setZoomOut((z) => !z);
      else if (btn === 'l' || btn === 'r') held.current.add(btn);
    },
    [nextMessage],
  );
  const release = useCallback((btn) => held.current.delete(btn), []);

  useEffect(() => {
    const map = {
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      KeyX: 'a', KeyK: 'a', KeyZ: 'b', KeyJ: 'b', Enter: 'start', ShiftLeft: 'select', ShiftRight: 'select', KeyQ: 'l', KeyE: 'r',
    };
    // Game keys work everywhere except while typing (sliders do not count as typing).
    const typing = (e) => e.target instanceof HTMLElement && !!e.target.closest('input:not([type=range]), textarea, select, [contenteditable]');
    const down = (e) => {
      const btn = map[e.code];
      if (!btn || typing(e)) return;
      // Enter on a focused button should press that button, not START.
      if (btn === 'start' && e.target instanceof HTMLElement && e.target.closest('button, a')) return;
      e.preventDefault();
      if (!e.repeat) press(btn);
    };
    const up = (e) => {
      const btn = map[e.code];
      if (btn) release(btn);
    };
    const clear = () => held.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, [press, release]);

  // ------------------------------------------------ view

  const player = posFor(cluster, { mode, gps });
  const speed = speeds[cluster];
  const pressure = pressureHpa(dz);
  const zOpen = zGatePassed(dz);
  const insideId = MONUMENTS.find((m) => dwell[m.id]?.inside)?.id;
  const farFromSite = mode === 'live' && player ? distanceMeters(player, cluster === 'patan' ? PATAN.center : BOUDHA.center) : 0;
  const festivalLeft = Math.max(0, Math.round(((progress.festivalUntil || 0) - Date.now()) / 1000));
  const bearing = mode === 'live' ? gps.fix?.heading ?? 180 : heading[cluster];

  let status = null;
  if (cluster === 'patan' && jatra && chariotLive?.inside) {
    status = chariotLive.inPace
      ? { tone: 'good', title: 'PULLING', bar: Math.min(1, chariotLive.t / CHARIOT.holdSeconds) }
      : { tone: 'warn', title: 'CHARIOT', detail: `Read: match ${CHARIOT.speed} m/s` };
  } else if (cluster === 'patan' && insideId) {
    const st = dwell[insideId];
    const name = BY_ID[insideId].name.toUpperCase();
    if (st.status === 'dwelling' || st.status === 'grace') status = { tone: 'info', title: name, bar: st.t / DWELL_SECONDS };
    else if (st.status === 'too-fast') status = { tone: 'warn', title: name, detail: 'TOO FAST' };
    else if (st.status === 'need-descent') status = { tone: 'warn', title: name, detail: zOpen ? '…' : 'HOLD STEPS ▼' };
    else if (st.status === 'unlocked') status = { tone: 'good', title: `★ ${name}`, detail: 'READ: DEX' };
  } else if (cluster === 'boudha' && koraLive) {
    status = koraLive.inRing
      ? { tone: koraLive.tooFast ? 'warn' : 'info', title: `KORA ${SECTOR_NAMES[koraLive.sector]}`, detail: `θ ${progress.kora.theta >= 0 ? '+' : ''}${Math.round(progress.kora.theta)}°` }
      : { tone: 'info', title: 'KORA RING', detail: `${Math.max(0, Math.round(koraLive.r - BOUDHA.rMax))} m away` };
  }

  const chariotY = jatra ? PROJ.patan.to(chariotAt(chariotDistance(jatraNow)).pos)[1] : 0;
  const playerY = player ? PROJ[cluster].to(player)[1] : 0;

  const screen = (
    <Screen
      cluster={cluster}
      layer={layer}
      zoomOut={zoomOut}
      player={player}
      bearing={bearing}
      moving={moving && mode === 'sim'}
      step={step}
      accuracy={mode === 'live' ? gps.fix?.accuracy : null}
      target={target?.cluster === cluster ? target.pos : null}
      onTap={mode === 'sim' && !menu.open ? (p) => walkTo(cluster, p) : null}
      dwell={dwell}
      progress={progress}
      koraLive={koraLive}
      jatra={jatra ? jatraNow : null}
      chariotLive={chariotLive}
      chariotInFront={jatra && cluster === 'patan' && chariotY > playerY}
    >
      <Hud cluster={cluster} score={score} festivalLeft={festivalLeft} dz={dz} pressure={pressure} zOpen={zOpen} status={status} />
      {mode === 'live' && (gps.status === 'waiting' || (gps.fix && farFromSite > 300)) ? (
        <div data-ui className="gb-box absolute inset-x-6 top-1/3 p-3 text-sm">
          {gps.status === 'waiting' && !gps.fix ? (
            'Waiting for a GPS fix…'
          ) : (
            <>
              You are {fmtDist(farFromSite)} from {cluster === 'patan' ? 'Patan Durbar Square' : 'Boudhanath'}. Geofences only trigger on site.
              <button type="button" onClick={() => switchMode('sim')} className="mt-2 block font-bold text-[#c4322a] underline">
                Use the Virtual Walker
              </button>
            </>
          )}
        </div>
      ) : null}
      <div data-ui className="absolute bottom-0 right-0 bg-black/50 px-1 text-[9px] text-white/80">
        {layer === 'satellite' ? `${TILE_SOURCES.satellite.credit} · ` : ''}
        {layer === 'pixel' && cluster === 'boudha' ? 'Illustrated' : TILE_SOURCES.osm.credit}
      </div>
      {zoomOut ? <span data-ui className="gb-plate absolute bottom-2 left-2">AREA MAP · SELECT to close</span> : null}
      <TextBox message={messages[0]} onNext={nextMessage} />
      {menu.open && !menu.page ? <StartMenu index={menu.index} onPick={pickMenu} cluster={cluster} jatra={jatra} layer={layer} /> : null}
      {menu.open && menu.page === 'dex' ? <DexPage index={menu.pageIndex} progress={progress} player={player} onOpen={setCard} onClose={() => setMenu({ ...menu, page: null })} /> : null}
      {menu.open && menu.page === 'badges' ? <BadgePage score={score} progress={progress} onClose={() => setMenu({ ...menu, page: null })} /> : null}
    </Screen>
  );

  return (
    <div className="min-h-dvh pb-10">
      <header className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-4">
        <div>
          <h1 className="font-display text-sm leading-relaxed text-[#f6d77a] drop-shadow-[2px_2px_0_#c4322a] sm:text-lg">MANDALA QUEST</h1>
          <p className="text-sm text-muted">Chronicles of the Living Valley</p>
        </div>
        <p className="hidden max-w-md text-right text-xs leading-relaxed text-faint md:block">
          Walk with the arrow keys or WASD, or tap the map. X reads, Z runs, Q / E go down / up steps, Enter opens the menu.
        </p>
      </header>

      <main className="mx-auto grid max-w-[1400px] gap-5 px-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0">
          <GameFrame
            screen={screen}
            press={press}
            release={release}
            cluster={cluster}
            onCluster={(c) => {
              setCluster(c);
              setTarget(null);
            }}
            layer={layer}
            onLayer={setLayer}
            jatra={jatra}
            onJatra={toggleJatra}
          />
        </section>

        <aside className="min-w-0 space-y-4">
          <Panel>
            <PanelTitle icon={Footprints}>Field notebook</PanelTitle>
            <ModeSwitch mode={mode} onChange={switchMode} />
            {mode === 'sim' ? (
              <div className="mt-4">
                <label className="flex items-baseline justify-between text-xs text-muted" htmlFor="speed">
                  <span className="flex items-center gap-1.5">
                    <Gauge size={14} className="text-gold" aria-hidden /> Walking pace
                  </span>
                  <span className={`font-mono text-sm ${walkSpeed > MAX_WALK_SPEED ? 'text-[#f0a080]' : 'text-text'}`}>{walkSpeed.toFixed(1)} m/s</span>
                </label>
                <input id="speed" type="range" min="3" max="50" step="1" value={Math.round(walkSpeed * 10)} onChange={(e) => setWalkSpeed(Number(e.target.value) / 10)} aria-valuetext={`${walkSpeed.toFixed(1)} metres per second`} className="mt-2 w-full" />
                <p className={`mt-1 text-xs ${walkSpeed > MAX_WALK_SPEED ? 'text-[#f0a080]' : 'text-muted'}`}>
                  {walkSpeed > MAX_WALK_SPEED ? 'Faster than walking: timers pause.' : `Timers run at ≤ ${MAX_WALK_SPEED.toFixed(1)} m/s. Hold B to run (${RUN_SPEED} m/s).`}
                </p>
              </div>
            ) : (
              <GpsStatus gps={gps} onRetry={startGps} />
            )}
            <AltitudeControl dz={dz} setDz={setDz} pressure={pressure} zOpen={zOpen} live={mode === 'live'} />
          </Panel>

          <Telemetry tick={tick} player={player} speed={speed} dz={dz} pressure={pressure} cluster={cluster} insideId={insideId} dwell={dwell} koraLive={koraLive} chariotLive={jatra && cluster === 'patan' ? chariotLive : null} />

          {cluster === 'boudha' ? <KoraPanel kora={progress.kora} koraLive={koraLive} speed={speed} onOpen={() => setCard('boudha')} /> : null}

          <EventLog log={log} />
        </aside>
      </main>

      {shopOpen ? <ShopDrawer score={score} progress={progress} onBuy={buy} onClose={() => setShopOpen(false)} /> : null}

      {card ? (
        <LoreCard
          id={card}
          progress={progress}
          player={card === 'boudha' ? posFor('boudha', { mode, gps }) : posFor('patan', { mode, gps })}
          canWalk={mode === 'sim'}
          onWalk={(m) => {
            setCard(null);
            setMenu(CLOSED_MENU);
            walkTo('patan', m.centroid);
          }}
          onSolve={solveRiddle}
          onClose={() => setCard(null)}
        />
      ) : null}
    </div>
  );
}

function dwellLine({ id, from, to }) {
  const name = BY_ID[id].name.toUpperCase();
  if (to === 'dwelling' && from === 'idle') return `This is ${name}.\nStand still for ${DWELL_SECONDS} seconds to record it.`;
  if (to === 'too-fast') return `Too fast! Slow to walking pace to study ${name}.`;
  if (to === 'need-descent') return `${name} lies below the street.\nHold Steps ▼ (Q) to walk down to ${Z_GATE.depthMeters.toFixed(1)} m.`;
  return null;
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
