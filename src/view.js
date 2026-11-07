/** Map projections shared by the renderer and the screen: lat/lon <-> metres on each area's map. */
import { BOUDHA, PATAN, fromLocal, metersPerDegree, toLocal } from './engine.js';

const PATAN_M = metersPerDegree(PATAN.center.lat);

export const PROJ = {
  patan: {
    w: (PATAN.bounds.lonMax - PATAN.bounds.lonMin) * PATAN_M.lon,
    h: (PATAN.bounds.latMax - PATAN.bounds.latMin) * PATAN_M.lat,
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

export function clampToMap(cluster, pos) {
  const P = PROJ[cluster];
  const [x, y] = P.to(pos);
  return P.from(Math.min(P.w - 1, Math.max(1, x)), Math.min(P.h - 1, Math.max(1, y)));
}

/** Box of a monument's OBB on the map, in metres. */
export function monumentBox(m, to) {
  const pts = m.obb.map(([lon, lat]) => to({ lat, lon }));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), pts };
}
