import { setCorsHeaders } from '../lib/cors.js';

const NOMINATIM_UA = 'PluxeeOutletFinder/1.0 (https://github.com/)';
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
/** @type {Map<string, { t: number, v: { lat: number; lon: number } | null }>} */
const cache = new Map();

function cacheGet(q) {
  const e = cache.get(q);
  if (!e) return undefined;
  if (Date.now() - e.t > CACHE_MS) {
    cache.delete(q);
    return undefined;
  }
  return e.v;
}

function cacheSet(q, v) {
  cache.set(q, { t: Date.now(), v });
}

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
  if (!q) {
    return res.status(400).json({
      success: false,
      error: 'Query parameter q is required',
      example: '/api/geocode?q=Restaurant+Name+Street+Chennai+India',
    });
  }

  const cached = cacheGet(q);
  if (cached !== undefined) {
    if (cached === null) {
      return res.status(200).json({ success: true, found: false, cached: true });
    }
    return res.status(200).json({ success: true, found: true, lat: cached.lat, lon: cached.lon, cached: true });
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
      cacheSet(q, null);
      return res.status(200).json({ success: true, found: false });
    }

    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    cacheSet(q, { lat, lon });
    return res.status(200).json({
      success: true,
      found: true,
      lat,
      lon,
      displayName: hit.display_name || '',
    });
  } catch (e) {
    console.error('[geocode]', e);
    return res.status(500).json({ success: false, error: String(e?.message || e) });
  }
}
