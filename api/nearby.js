import { setCorsHeaders } from '../lib/cors.js';
import { getMealRecords } from '../lib/getMealRecords.js';
import { filterMeals } from '../lib/mealFilters.js';
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

  const lat = parseFloat(String(req.query.lat ?? '').trim());
  const lon = parseFloat(String(req.query.lon ?? '').trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({
      success: false,
      error: 'Query parameters "lat" and "lon" (WGS84 numbers) are required',
      examples: ['/api/nearby?lat=12.97&lon=80.22&radiusKm=20&limit=24&offset=0'],
    });
  }

  let radiusKm = parseFloat(String(req.query.radiusKm ?? '25').trim());
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) radiusKm = 25;
  radiusKm = Math.min(120, Math.max(1, radiusKm));

  const limitRaw = parseInt(String(req.query.limit ?? '24'), 10);
  const offsetRaw = parseInt(String(req.query.offset ?? '0'), 10);
  const lim = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 24));
  const off = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0);

  try {
    const { records, source } = await getMealRecords();

    const mealQuery = {
      category: req.query.category,
      bqr: req.query.bqr,
      search: req.query.search,
    };

    const baseFiltered = filterMeals(records, mealQuery);

    const withDist = [];
    for (const r of baseFiltered) {
      const anchor = outletAnchorCoords(r);
      if (!anchor) continue;
      const d = haversineKm(lat, lon, anchor.lat, anchor.lon);
      if (d > radiusKm) continue;
      withDist.push({
        record: r,
        distanceKm: d,
        locateVia: anchor.via,
      });
    }

    withDist.sort((a, b) => a.distanceKm - b.distanceKm || normKey(a.record['OUTLET NAME']).localeCompare(normKey(b.record['OUTLET NAME'])));

    const scopeRecords = withDist.map((x) => x.record);
    const categoryBreakdown = categoryBreakdownForScope(scopeRecords);
    const total = withDist.length;
    const page = withDist.slice(off, off + lim);
    const data = page.map(({ record, distanceKm }) => ({
      ...record,
      distanceKm: Math.round(distanceKm * 100) / 100,
    }));

    return res.status(200).json({
      success: true,
      source,
      locateBy: 'latlng+pincode-centroid',
      anchor: { lat, lon, radiusKm },
      disclaimer:
        'distanceKm uses PIN office centroid per PINCODE when LAT/LON columns are absent (approximate).',
      data,
      pagination: {
        total,
        limit: lim,
        offset: off,
        pages: Math.ceil(total / lim) || 0,
      },
      categoryBreakdown,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('nearby:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load nearby outlets',
      message: error.message,
    });
  }
}
