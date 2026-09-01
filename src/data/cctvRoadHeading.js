/**
 * @module cctvRoadHeading
 *
 * Cheap heading prior for CCTV cameras whose catalogs do not publish a
 * facing. Snaps to the nearest OSM carriageway so a hashed compass point
 * does not aim the frustum into a building facade.
 */

const M_PER_DEG = 111_320;
const DEFAULT_RADIUS_M = 80;
const MAX_SNAP_DIST_M = 45;
const HIGHWAY_REGEX = '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)$';

/**
 * @param {number} deg
 * @returns {number}
 */
export function normalizeHeadingDeg(deg) {
  let value = Number(deg) % 360;
  if (!Number.isFinite(value)) return 0;
  if (value < 0) value += 360;
  return value;
}

/**
 * Smallest absolute heading difference in degrees.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function headingDeltaDeg(a, b) {
  let delta = Math.abs(normalizeHeadingDeg(a) - normalizeHeadingDeg(b)) % 360;
  if (delta > 180) delta = 360 - delta;
  return delta;
}

/**
 * Geographic bearing from A to B, degrees clockwise from north.
 *
 * @param {{lat:number, lon:number}} from
 * @param {{lat:number, lon:number}} to
 * @returns {number}
 */
export function segmentBearingDeg(from, to) {
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const dLon = (to.lon - from.lon) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeHeadingDeg(Math.atan2(y, x) * 180 / Math.PI);
}

function toLocalMeters(origin, point) {
  const latRad = origin.lat * Math.PI / 180;
  return {
    x: (point.lon - origin.lon) * M_PER_DEG * Math.cos(latRad),
    y: (point.lat - origin.lat) * M_PER_DEG,
  };
}

function dist2PointToSegment(origin, point, a, b) {
  const p = toLocalMeters(origin, point);
  const pa = toLocalMeters(origin, a);
  const pb = toLocalMeters(origin, b);
  const abx = pb.x - pa.x;
  const aby = pb.y - pa.y;
  const apx = p.x - pa.x;
  const apy = p.y - pa.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-6) return apx * apx + apy * apy;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / len2));
  const dx = apx - t * abx;
  const dy = apy - t * aby;
  return dx * dx + dy * dy;
}

/**
 * Nearest carriageway-segment bearing at a camera, or NaN when none is close.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {Array<{type?:string, geometry?:Array<{lat:number, lon:number}>}>} elements
 * @param {number} [maxDistM=MAX_SNAP_DIST_M]
 * @returns {number}
 */
export function nearestRoadHeadingDeg(lat, lon, elements, maxDistM = MAX_SNAP_DIST_M) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Array.isArray(elements)) return NaN;
  const origin = { lat, lon };
  const maxDist2 = Math.max(4, Number(maxDistM) || MAX_SNAP_DIST_M) ** 2;
  let bestDist2 = Infinity;
  let bestBearing = NaN;
  for (const element of elements) {
    const geom = element?.geometry;
    if (!Array.isArray(geom) || geom.length < 2) continue;
    for (let i = 1; i < geom.length; i++) {
      const a = geom[i - 1];
      const b = geom[i];
      if (!Number.isFinite(a?.lat) || !Number.isFinite(a?.lon)) continue;
      if (!Number.isFinite(b?.lat) || !Number.isFinite(b?.lon)) continue;
      const dist2 = dist2PointToSegment(origin, origin, a, b);
      if (dist2 < bestDist2) {
        bestDist2 = dist2;
        bestBearing = segmentBearingDeg(a, b);
      }
    }
  }
  if (!Number.isFinite(bestBearing) || bestDist2 > maxDist2) return NaN;
  return normalizeHeadingDeg(bestBearing);
}

/**
 * Pick the heading with more free space along the view axis. A miss (no hit)
 * counts as an open street. Equal clearance keeps the heading closer to the
 * current prior so a 180° flip is not arbitrary.
 *
 * @param {number} headingA
 * @param {number} headingB
 * @param {number} distA Metres to first hit, or Infinity/NaN for a miss.
 * @param {number} distB
 * @param {number} [currentHeading=headingA]
 * @returns {number}
 */
export function chooseClearerHeading(headingA, headingB, distA, distB, currentHeading = headingA) {
  const a = Number.isFinite(distA) ? distA : Infinity;
  const b = Number.isFinite(distB) ? distB : Infinity;
  const similar = (!Number.isFinite(a) && !Number.isFinite(b))
    || Math.abs(a - b) < 8;
  if (similar) {
    return headingDeltaDeg(currentHeading, headingA) <= headingDeltaDeg(currentHeading, headingB)
      ? normalizeHeadingDeg(headingA)
      : normalizeHeadingDeg(headingB);
  }
  return a > b ? normalizeHeadingDeg(headingA) : normalizeHeadingDeg(headingB);
}

/**
 * True when the catalog heading is a guess we are allowed to replace.
 *
 * @param {object|null|undefined} camera
 * @returns {boolean}
 */
export function shouldSnapRoadHeading(camera) {
  if (!camera || camera.roadHeadingSnapped) return false;
  if (camera.calSource === 'manual') return false;
  if (camera.poseSource === 'curated') return false;
  return String(camera.headingConfidence || '').toLowerCase() === 'low';
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {number} [radiusM=DEFAULT_RADIUS_M]
 * @returns {string}
 */
export function buildCctvRoadHeadingQuery(lat, lon, radiusM = DEFAULT_RADIUS_M) {
  const radius = Math.max(20, Math.min(200, Math.round(Number(radiusM) || DEFAULT_RADIUS_M)));
  return `[out:json][timeout:8];way(around:${radius},${lat},${lon})["highway"~"${HIGHWAY_REGEX}"];out geom;`;
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {{fetchImpl?: typeof fetch, signal?: AbortSignal}} [options]
 * @returns {Promise<Array>}
 */
export async function fetchNearbyRoadElements(lat, lon, options = {}) {
  const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  const query = buildCctvRoadHeadingQuery(lat, lon);
  const controller = options.signal ? null : new AbortController();
  const signal = options.signal || controller.signal;
  const timer = controller
    ? setTimeout(() => controller.abort(), 9000)
    : 0;
  try {
    const response = await fetchImpl('/api/overpass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal,
    });
    if (!response?.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload?.elements) ? payload.elements : [];
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}
