import { setCorsHeaders } from '../lib/cors.js';

const NOMINATIM_UA = 'PluxeeOutletFinder/1.0 (https://github.com/)';
const FORWARD_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const REVERSE_CACHE_MS = 24 * 60 * 60 * 1000;

/** @type {Map<string, { t: number, v: { lat: number; lon: number } | null }>} */
const forwardCache = new Map();

function forwardCacheGet(q) {
  const e = forwardCache.get(q);
  if (!e) return undefined;
  if (Date.now() - e.t > FORWARD_CACHE_MS) {
    forwardCache.delete(q);
    return undefined;
  }
  return e.v;
}

function forwardCacheSet(q, v) {
  forwardCache.set(q, { t: Date.now(), v });
}

/** @type {Map<string, { t: number, v: object }>} */
const reverseCache = new Map();

function reverseCacheKey(lat, lon) {
  return `${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`;
}

async function handleForwardGeocode(_req, res, q) {
  const cached = forwardCacheGet(q);
  if (cached !== undefined) {
    if (cached === null) {
      return res.status(200).json({ success: true, mode: 'search', found: false, cached: true });
    }
    return res.status(200).json({
      success: true,
      mode: 'search',
      found: true,
      lat: cached.lat,
      lon: cached.lon,
      cached: true,
    });
  }

  try {
    const u = new URL('https://nominatim.openstreetmap.org/search');
    u.searchParams.set('format', 'jsonv2');
    u.searchParams.set('limit', '1');
    u.searchParams.set('countrycodes', 'in');
    u.searchParams.set('q', q);

    const nr = await fetch(u.toString(), {
      headers: {
        'User-Agent': NOMINATIM_UA,
        'Accept-Language': 'en',
      },
    });

    if (!nr.ok) {
      return res.status(502).json({
        success: false,
        error: 'Upstream geocoder error',
        status: nr.status,
      });
    }

    const arr = await nr.json();
    const hit = Array.isArray(arr) && arr[0];
    if (!hit || hit.lat == null || hit.lon == null) {
      forwardCacheSet(q, null);
      return res.status(200).json({ success: true, mode: 'search', found: false });
    }

    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    forwardCacheSet(q, { lat, lon });
    return res.status(200).json({
      success: true,
      mode: 'search',
      found: true,
      lat,
      lon,
      displayName: hit.display_name || '',
    });
  } catch (e) {
    console.error('[geo/search]', e);
    return res.status(500).json({ success: false, error: String(e?.message || e) });
  }
}

async function handleReverseGeocode(_req, res, lat, lon) {
  const ck = reverseCacheKey(lat, lon);
  const hit = reverseCache.get(ck);
  if (hit && Date.now() - hit.t < REVERSE_CACHE_MS) {
    return res.status(200).json({ success: true, mode: 'reverse', data: hit.v, cached: true });
  }

  try {
    const u = new URL('https://nominatim.openstreetmap.org/reverse');
    u.searchParams.set('format', 'jsonv2');
    u.searchParams.set('lat', String(lat));
    u.searchParams.set('lon', String(lon));

    const nr = await fetch(u.toString(), {
      headers: {
        'User-Agent': NOMINATIM_UA,
        'Accept-Language': 'en',
      },
    });

    if (!nr.ok) {
      return res.status(502).json({
        success: false,
        error: 'Upstream reverse geocoder error',
        status: nr.status,
      });
    }

    const data = await nr.json();
    reverseCache.set(ck, { t: Date.now(), v: data });
    return res.status(200).json({ success: true, mode: 'reverse', data });
  } catch (e) {
    console.error('[geo/reverse]', e);
    return res.status(500).json({ success: false, error: String(e?.message || e) });
  }
}

/**
 * Combined geocoder (single Vercel function):
 * - `GET /api/geo?q=...` — forward search → lat, lon
 * - `GET /api/geo?lat=...&lon=...` — reverse → full Nominatim JSON in `data`
 */
export default async function handler(req, res) {
  setCorsHeaders(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const latRaw = req.query.lat;
  const lonRaw = req.query.lon;
  const lat = typeof latRaw === 'string' ? parseFloat(latRaw) : Number.NaN;
  const lon = typeof lonRaw === 'string' ? parseFloat(lonRaw) : Number.NaN;

  if (q) {
    return handleForwardGeocode(req, res, q);
  }

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return handleReverseGeocode(req, res, lat, lon);
  }

  return res.status(400).json({
    success: false,
    error: 'Provide either query q (forward search) or lat and lon (reverse geocode)',
    examples: ['/api/geo?q=Shop+Street+Chennai+India', '/api/geo?lat=13.628&lon=79.418'],
  });
}
