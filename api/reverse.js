import { setCorsHeaders } from '../lib/cors.js';

const NOMINATIM_UA = 'PluxeeOutletFinder/1.0 (https://github.com/)';
const CACHE_MS = 24 * 60 * 60 * 1000;
/** @type {Map<string, { t: number, v: object }>} */
const cache = new Map();

function cacheKey(lat, lon) {
  return `${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`;
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

  const latRaw = req.query.lat;
  const lonRaw = req.query.lon;
  const lat = typeof latRaw === 'string' ? parseFloat(latRaw) : Number.NaN;
  const lon = typeof lonRaw === 'string' ? parseFloat(lonRaw) : Number.NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({
      success: false,
      error: 'Query parameters lat and lon are required',
      example: '/api/reverse?lat=13.628&lon=79.418',
    });
  }

  const ck = cacheKey(lat, lon);
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < CACHE_MS) {
    return res.status(200).json({ success: true, data: hit.v, cached: true });
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
    cache.set(ck, { t: Date.now(), v: data });
    return res.status(200).json({ success: true, data });
  } catch (e) {
    console.error('[reverse]', e);
    return res.status(500).json({ success: false, error: String(e?.message || e) });
  }
}
