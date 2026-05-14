import { setCorsHeaders } from '../lib/cors.js';

const NOMINATIM_UA = 'PluxeeOutletFinder/1.0 (https://github.com/)';
const FORWARD_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const REVERSE_CACHE_MS = 24 * 60 * 60 * 1000;

/** Server-only. Prefer Geocoding API; falls back to Nominatim when unset or on failure. */
const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

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

function getGoogleMapsApiKey() {
  return String(
    process.env.GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_GEOCODING_API_KEY ||
      process.env.GOOGLE_SERVER_KEY ||
      ''
  ).trim();
}

function pickGoogleComponent(components, ...types) {
  if (!Array.isArray(components)) return '';
  for (const t of types) {
    const c = components.find((x) => Array.isArray(x.types) && x.types.includes(t));
    if (c && c.long_name) return String(c.long_name).trim();
  }
  return '';
}

/**
 * Shape a Google Geocode `address_components` list like Nominatim `address`
 * so the SPA can keep using `nominatimAddrHints` unchanged.
 */
function googleComponentsToPseudoAddress(components) {
  const locality = pickGoogleComponent(components, 'locality');
  const state = pickGoogleComponent(components, 'administrative_area_level_1');
  const postcode = pickGoogleComponent(components, 'postal_code');
  const sub1 = pickGoogleComponent(components, 'sublocality_level_1', 'sublocality');
  const sub2 = pickGoogleComponent(components, 'sublocality_level_2');
  const neighborhood = pickGoogleComponent(components, 'neighborhood');
  const adm2 = pickGoogleComponent(components, 'administrative_area_level_2');
  const adm3 = pickGoogleComponent(components, 'administrative_area_level_3');
  const village = pickGoogleComponent(components, 'village');

  const city = locality || adm2 || adm3 || sub1 || '';
  const suburb = sub1 || sub2 || neighborhood || '';
  const neighbourhood = neighborhood || sub2 || '';

  return {
    state,
    city,
    town: '',
    village: village || '',
    municipality: '',
    county: '',
    city_district: adm2 || '',
    state_district: '',
    suburb,
    neighbourhood,
    quarter: '',
    hamlet: '',
    residential: '',
    postcode,
  };
}

async function tryGoogleForwardGeocode(q, key) {
  const u = new URL(GOOGLE_GEOCODE_URL);
  u.searchParams.set('address', q);
  u.searchParams.set('key', key);
  u.searchParams.set('region', 'in');
  const nr = await fetch(u.toString());
  if (!nr.ok) return { err: `google_http_${nr.status}` };
  const body = await nr.json().catch(() => ({}));
  if (body.status === 'ZERO_RESULTS') return { ok: false };
  if (body.status !== 'OK' || !Array.isArray(body.results) || !body.results.length) {
    return { err: body.status || 'google_bad_response' };
  }
  const r0 = body.results[0];
  const loc = r0.geometry && r0.geometry.location;
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return { ok: false };
  return {
    ok: true,
    lat: loc.lat,
    lon: loc.lng,
    displayName: String(r0.formatted_address || ''),
  };
}

/** @returns {Promise<object|null>} Nominatim-shaped payload or null */
async function tryGoogleReverseGeocode(lat, lon, key) {
  const u = new URL(GOOGLE_GEOCODE_URL);
  u.searchParams.set('latlng', `${lat},${lon}`);
  u.searchParams.set('key', key);
  const nr = await fetch(u.toString());
  if (!nr.ok) return null;
  const body = await nr.json().catch(() => ({}));
  if (body.status !== 'OK' || !Array.isArray(body.results) || !body.results.length) return null;
  const r0 = body.results[0];
  const display_name = String(r0.formatted_address || '');
  const address = googleComponentsToPseudoAddress(r0.address_components || []);
  return {
    display_name,
    address,
    lat,
    lon,
    _geocoder: 'google',
  };
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

  const gKey = getGoogleMapsApiKey();
  if (gKey) {
    try {
      const g = await tryGoogleForwardGeocode(q, gKey);
      if (g.ok) {
        forwardCacheSet(q, { lat: g.lat, lon: g.lon });
        return res.status(200).json({
          success: true,
          mode: 'search',
          found: true,
          lat: g.lat,
          lon: g.lon,
          displayName: g.displayName,
          geocoder: 'google',
        });
      }
    } catch (e) {
      console.error('[geo/search-google]', e);
    }
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
      return res.status(200).json({ success: true, mode: 'search', found: false, geocoder: 'nominatim' });
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
      geocoder: 'nominatim',
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

  const gKey = getGoogleMapsApiKey();
  if (gKey) {
    try {
      const gData = await tryGoogleReverseGeocode(lat, lon, gKey);
      if (gData) {
        reverseCache.set(ck, { t: Date.now(), v: gData });
        return res.status(200).json({ success: true, mode: 'reverse', data: gData, geocoder: 'google' });
      }
    } catch (e) {
      console.error('[geo/reverse-google]', e);
    }
  }

  try {
    const u = new URL('https://nominatim.openstreetmap.org/reverse');
    u.searchParams.set('format', 'jsonv2');
    u.searchParams.set('lat', String(lat));
    u.searchParams.set('lon', String(lon));
    u.searchParams.set('zoom', '18');

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
    if (data && typeof data === 'object') data._geocoder = 'nominatim';
    reverseCache.set(ck, { t: Date.now(), v: data });
    return res.status(200).json({ success: true, mode: 'reverse', data, geocoder: 'nominatim' });
  } catch (e) {
    console.error('[geo/reverse]', e);
    return res.status(500).json({ success: false, error: String(e?.message || e) });
  }
}

/**
 * Combined geocoder (single Vercel function):
 * - `GET /api/geo?q=...` — forward search → lat, lon
 * - `GET /api/geo?lat=...&lon=...` — reverse → JSON in `data` (Google-shaped like Nominatim when using Google)
 *
 * Set **`GOOGLE_MAPS_API_KEY`** (or `GOOGLE_GEOCODING_API_KEY`) on the server for **Google Geocoding**;
 * otherwise **OpenStreetMap Nominatim** is used. The key is never exposed to the browser.
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
