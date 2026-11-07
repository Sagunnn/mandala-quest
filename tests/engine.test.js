import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARIOT, FESTIVAL, LANDMARKS, ROUTE_LENGTH, SHOP_ITEMS, chariotAt, chariotDistance, festivalBonus, normalizeProgress, stepChariot, toLocal,
  BOUDHA, BOUDHA_START, DWELL_SECONDS, MAX_XP, MONUMENTS, PATAN, RANKS,
  angleDelta, computeScore, distanceMeters, fromLocal, initialKora, initialProgress,
  pointInPolygon, pressureHpa, stepDwell, stepKora, zGatePassed,
} from '../src/engine.js';

const byId = Object.fromEntries(MONUMENTS.map((m) => [m.id, m]));

test('every centroid is inside its own box and no other', () => {
  for (const m of MONUMENTS) {
    for (const o of MONUMENTS) {
      assert.equal(pointInPolygon([m.centroid.lon, m.centroid.lat], o.obb), m === o, `${m.name} in ${o.name}`);
    }
  }
});

test('every box sits inside the Patan map bounds', () => {
  const b = PATAN.bounds;
  for (const m of MONUMENTS) for (const [lon, lat] of m.obb) {
    assert.ok(lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax, m.name);
  }
});

test('start point is outside every monument', () => {
  for (const m of MONUMENTS) assert.equal(pointInPolygon([PATAN.start.lon, PATAN.start.lat], m.obb), false, m.name);
});

test('Vishwanath is about 18.5 m from Krishna Mandir', () => {
  const d = distanceMeters(byId.LAL1340.centroid, byId.LAL1350.centroid);
  assert.ok(Math.abs(d - 18.5) < 0.3, `${d}`);
});

test('barometer: 864.40 hPa at street level, z-gate opens at -3.0 m', () => {
  assert.equal(pressureHpa(0), 864.4);
  assert.ok(Math.abs(pressureHpa(-3) - 864.7021) < 1e-9);
  assert.equal(zGatePassed(-2.9), false);
  assert.equal(zGatePassed(-3.0), true);
  assert.equal(zGatePassed(-4.0), true);
  assert.equal(zGatePassed(10), false);
});

const run = (ticks, { pos, speed = 1, dz = 0, unlocked = {} }, start = {}) => {
  let dwell = start;
  let all = [];
  for (let i = 0; i < ticks; i++) {
    const r = stepDwell(dwell, { pos, speed, dz, dt: 1, unlocked });
    dwell = r.dwell;
    all = all.concat(r.newly);
  }
  return { dwell, newly: all };
};

test('dwell: unlocks after 5 s on foot, not before', () => {
  const pos = byId.LAL1340.centroid;
  assert.deepEqual(run(DWELL_SECONDS - 1, { pos }).newly, []);
  assert.deepEqual(run(DWELL_SECONDS, { pos }).newly, ['LAL1340']);
});

test('dwell: pauses above 2.0 m/s', () => {
  const pos = byId.LAL1340.centroid;
  const { dwell, newly } = run(10, { pos, speed: 2.5 });
  assert.deepEqual(newly, []);
  assert.equal(dwell.LAL1340.status, 'too-fast');
  assert.equal(dwell.LAL1340.t, 0);
});

test('dwell: a 2-tick GPS jump out keeps the timer, a 3rd tick resets it', () => {
  const inPos = byId.LAL1340.centroid;
  let { dwell } = run(3, { pos: inPos });
  ({ dwell } = run(2, { pos: PATAN.start }, dwell));
  assert.equal(dwell.LAL1340.status, 'grace');
  assert.equal(dwell.LAL1340.t, 3);
  ({ dwell } = run(1, { pos: PATAN.start }, dwell));
  assert.equal(dwell.LAL1340.t, 0);
});

test('z-gate: Manga Hiti and Tusa Hiti wait for the descent', () => {
  for (const id of ['LAL1360', 'LAL1220']) {
    const pos = byId[id].centroid;
    const high = run(8, { pos, dz: 0 });
    assert.deepEqual(high.newly, []);
    assert.equal(high.dwell[id].status, 'need-descent');
    const low = run(1, { pos, dz: -3 }, high.dwell);
    assert.deepEqual(low.newly, [id]);
  }
});

const walkKora = (degrees, step = 2, start = 180) => {
  let kora = initialKora();
  let live = null;
  const events = [];
  const n = Math.abs(degrees) / step;
  for (let i = 0; i <= n; i++) {
    const b = ((start + Math.sign(degrees) * step * i) * Math.PI) / 180;
    const pos = fromLocal(BOUDHA.center, BOUDHA.rWalk * Math.sin(b), BOUDHA.rWalk * Math.cos(b));
    const r = stepKora(kora, live, { pos, speed: 1.4 });
    kora = r.kora;
    live = r.live;
    events.push(...r.events);
  }
  return { kora, events };
};

test('kora: start is south of the stupa, outside the ring, so nothing counts on page load', () => {
  const r = distanceMeters(BOUDHA.center, BOUDHA_START);
  assert.ok(r > BOUDHA.rMax && r < BOUDHA.halfSpan);
  assert.deepEqual(stepKora(initialKora(), null, { pos: BOUDHA_START, speed: 0 }).events, []);
});

test('kora: a full clockwise circuit makes Kora Master and visits all 12 sectors', () => {
  const { kora, events } = walkKora(360);
  assert.ok(Math.abs(kora.theta - 360) < 1e-6);
  assert.equal(kora.master, true);
  assert.ok(kora.visited.every(Boolean));
  assert.ok(events.some((e) => e.type === 'master'));
});

test('kora: walking 90° counter-clockwise warns once', () => {
  const { kora, events } = walkKora(-100);
  assert.ok(kora.theta < -90);
  assert.equal(events.filter((e) => e.type === 'etiquette').length, 1);
  assert.equal(kora.master, false);
});

test('kora: leaving the ring forgets the bearing, so crossing the centre adds nothing', () => {
  let kora = initialKora();
  let r = stepKora(kora, null, { pos: fromLocal(BOUDHA.center, 0, -48), speed: 1 });
  r = stepKora(r.kora, r.live, { pos: BOUDHA.center, speed: 1 });
  assert.equal(r.live.inRing, false);
  r = stepKora(r.kora, r.live, { pos: fromLocal(BOUDHA.center, 0, 48), speed: 1 });
  assert.equal(r.kora.theta, 0);
});

test('angleDelta wraps across north', () => {
  assert.equal(angleDelta(350, 10), 20);
  assert.equal(angleDelta(10, 350), -20);
});

test('everything done reaches Tier 5', () => {
  const p = initialProgress();
  for (const m of MONUMENTS) {
    p.unlocked[m.id] = 1;
    if (m.riddle) p.riddles[m.id] = 1;
  }
  p.kora = { ...walkKora(360).kora };
  const s = computeScore(p);
  assert.equal(s.xp, MAX_XP);
  assert.equal(s.rank.tier, 5);
  assert.equal(s.nextRank, null);
  assert.deepEqual(s.badges, ['hiti', 'sthapati', 'kora']);
  assert.equal(computeScore(initialProgress()).rank, RANKS[0]);
});

test('riddle answers', () => {
  assert.ok(byId.LAL1340.riddle.check(' 21 '));
  assert.ok(byId.LAL1340.riddle.check('Twenty-one'));
  assert.ok(!byId.LAL1340.riddle.check('12'));
  assert.ok(byId.LAL1350.riddle.check('Two Elephants'));
  assert.ok(byId.LAL1350.riddle.check('elephant'));
  assert.ok(!byId.LAL1350.riddle.check('lions'));
});

test('boxes contain their OpenStreetMap features', () => {
  const inBox = (id, p) => pointInPolygon([p.lon, p.lat], byId[id].obb);
  assert.ok(inBox('LAL1260', LANDMARKS.ganga.pos), 'Ganga statue in Mul Chowk');
  assert.ok(inBox('LAL1260', LANDMARKS.yamuna.pos), 'Yamuna statue in Mul Chowk');
  assert.ok(inBox('LAL1220', LANDMARKS.tusaHiti.pos), 'Tusa Hiti in Sundari Chowk');
  const steps = LANDMARKS.hitiSteps.pos;
  const westEdge = byId.LAL1360.obb[0][0];
  assert.ok(steps.lat > byId.LAL1360.obb[0][1] && steps.lat < byId.LAL1360.obb[2][1], 'steps reach the basin at its latitude');
  assert.ok(distanceMeters(steps, { lat: steps.lat, lon: westEdge }) < 4, 'steps end at the basin edge');
  assert.ok(!inBox('LAL1330', byId.LAL1360.centroid), 'Manga Hiti is north of Keshav Narayan Chowk, not inside it');
});

test('chariot route stays on the map and runs at 0.4 m/s', () => {
  const b = PATAN.bounds;
  for (const p of CHARIOT.route) assert.ok(p.lat >= b.latMin && p.lat <= b.latMax && p.lon >= b.lonMin && p.lon <= b.lonMax);
  assert.ok(ROUTE_LENGTH > 90 && ROUTE_LENGTH < 130, `${ROUTE_LENGTH}`);
  const c = chariotAt(10);
  assert.ok(Math.abs(Math.hypot(c.vel.e, c.vel.n) - 0.4) < 1e-9);
  assert.ok(c.bearing > 100 && c.bearing < 160, 'heads south-east toward Sundhara');
  assert.ok(chariotDistance(ROUTE_LENGTH / 0.4 + 5) < 3, 'loops');
});

const pull = (ticks, velFn, offset = 5) => {
  let hold = { t: 0, miss: 0 };
  let done = false;
  for (let i = 0; i < ticks; i++) {
    const chariot = chariotAt(20 + i * 0.4);
    const pos = fromLocal(chariot.pos, offset, 0);
    const r = stepChariot(hold, { pos, vel: velFn(chariot), chariot, dt: 1 });
    hold = r.hold;
    done = done || r.done;
  }
  return done;
};

test('chariot pull: 6 s in pace inside 15 m completes, standing still does not', () => {
  assert.equal(pull(5, (c) => c.vel), false);
  assert.equal(pull(6, (c) => c.vel), true);
  assert.equal(pull(20, () => ({ e: 0, n: 0 })), false);
  assert.equal(pull(20, (c) => c.vel, 16), false, 'outside the 15 m geofence');
  assert.equal(pull(20, (c) => ({ e: c.vel.e * 3, n: c.vel.n * 3 })), false, 'too fast');
});

test('festival multiplier triples XP while it runs', () => {
  const p = { ...initialProgress(), festivalUntil: 10_000 };
  assert.equal(festivalBonus(p, 100, 5_000), 100 * (FESTIVAL.multiplier - 1));
  assert.equal(festivalBonus(p, 100, 20_000), 0);
  const s = computeScore({ ...initialProgress(), bonusXp: 200 });
  assert.equal(s.xp, 200);
});

test('shop: spending lowers Kala; the donation earns Living Guthi Patron', () => {
  const p = initialProgress();
  for (const m of MONUMENTS) p.unlocked[m.id] = 1;
  const before = computeScore(p);
  p.shop.donation = { ts: 1 };
  const after = computeScore(p);
  const cost = SHOP_ITEMS.find((i) => i.id === 'donation').cost;
  assert.equal(after.kala, before.kala - cost);
  assert.ok(after.badges.includes('guthi'));
});

test('old saves gain the new fields', () => {
  const old = { unlocked: { LAL1340: 1 }, riddles: {}, kora: initialKora() };
  const p = normalizeProgress(old);
  assert.deepEqual(p.shop, {});
  assert.equal(p.bonusXp, 0);
  assert.equal(computeScore(p).xp, 100);
});
