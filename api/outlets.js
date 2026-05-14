import { setCorsHeaders } from '../lib/cors.js';
import { getMealRecords } from '../lib/getMealRecords.js';
import { applyMealQuery, filterMeals } from '../lib/mealFilters.js';
import { haversineKm } from '../lib/haversineKm.js';
import { getPincodeCentroid } from '../lib/pincodeCentroids.js';

function normKey(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function categoryBreakdownForScope(records) {
  const byKey = new Map();
  for (const r of records) {
    const raw = String(r['NEW CATEGORY'] ?? '').trim();
    if (!raw) continue;
    const k = normKey(raw);
    if (!byKey.has(k)) byKey.set(k, { category: raw, count: 0 });
    byKey.get(k).count += 1;
  }
  return [...byKey.values()].sort(
    (a, b) => b.count - a.count || a.category.localeCompare(b.category, 'en', { sensitivity: 'base' })
  );
}

/**
 * Prefer explicit LAT/LON on the row (optional CSV columns); else PINCODE centroid.
 * @returns {{ lat: number; lon: number; via: 'row' | 'pincode' } | null}
 */
function outletAnchorCoords(record) {
  const latRaw = record.LAT ?? record.lat ?? record.Latitude ?? record.latitude;
  const lonRaw = record.LON ?? record.lon ?? record.Longitude ?? record.longitude;
  const lat = parseFloat(String(latRaw ?? '').trim());
  const lon = parseFloat(String(lonRaw ?? '').trim());
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    return { lat, lon, via: 'row' };
  }
  const pin = String(record.PINCODE ?? record.Pincode ?? '').trim();
  const c = getPincodeCentroid(pin);
  if (c) return { lat: c.lat, lon: c.lon, via: 'pincode' };
  return null;
}

export default async function handler(req, res) {
  setCorsHeaders(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawState = req.query.state;
  const rawCity = req.query.city;
  if (typeof rawState !== 'string' || !rawState.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Query parameters "state" and "city" are required',
      examples: [
        '/api/outlets?state=Tamil+Nadu&city=Chennai&limit=30&offset=0',
        '/api/outlets?state=Tamil+Nadu&city=Chennai&area=Adyar&bqr=1',
      ],
    });
  }
  if (typeof rawCity !== 'string' || !rawCity.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Query parameter "city" is required',
    });
  }

  // Optional user coordinates for distance computation
  const userLat = parseFloat(String(req.query.lat ?? '').trim());
  const userLon = parseFloat(String(req.query.lon ?? '').trim());
  const hasUserCoords =
    Number.isFinite(userLat) &&
    Number.isFinite(userLon) &&
    Math.abs(userLat) <= 90 &&
    Math.abs(userLon) <= 180;

  try {
    const { records, source } = await getMealRecords();
    const mergedQuery = {
      ...req.query,
      state: rawState.trim(),
      stateMatch: req.query.stateMatch || 'exact',
      city: rawCity.trim(),
      cityMatch: req.query.cityMatch || 'exact',
    };

    const { category: _dropCategory, ...scopeQuery } = mergedQuery;
    const scopeRecords = filterMeals(records, scopeQuery);
    const categoryBreakdown = categoryBreakdownForScope(scopeRecords);

    const { data: rawData, pagination } = applyMealQuery(records, mergedQuery);

    // Attach distanceKm to each outlet when the caller supplies lat/lon
    const data = rawData.map((record) => {
      if (!hasUserCoords) return record;
      const anchor = outletAnchorCoords(record);
      if (!anchor) return record;
      const distanceKm = Math.round(haversineKm(userLat, userLon, anchor.lat, anchor.lon) * 100) / 100;
      return { ...record, distanceKm, locateVia: anchor.via };
    });

    return res.status(200).json({
      success: true,
      source,
      ...(hasUserCoords && {
        anchor: { lat: userLat, lon: userLon },
        disclaimer:
          'distanceKm uses PIN office centroid per PINCODE when LAT/LON columns are absent (approximate).',
      }),
      data,
      pagination,
      categoryBreakdown,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load outlets',
      message: error.message,
    });
  }
}
