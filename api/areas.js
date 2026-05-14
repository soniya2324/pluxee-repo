import { setCorsHeaders } from '../lib/cors.js';
import { getMealRecords } from '../lib/getMealRecords.js';

function normKey(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

export default async function handler(req, res) {
  setCorsHeaders(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

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
        '/api/areas?state=Tamil+Nadu&city=Chennai',
        '/api/areas?state=Tamil+Nadu&city=Chennai&pincode=600042',
        '/api/areas?state=Maharashtra&city=Mumbai',
      ],
    });
  }
  if (typeof rawCity !== 'string' || !rawCity.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Query parameter "city" is required',
    });
  }

  try {
    const { records, source } = await getMealRecords();
    const wantS = normKey(rawState);
    const wantC = normKey(rawCity);
    const pinRaw = typeof req.query.pincode === 'string' ? req.query.pincode.trim() : '';
    const wantPin = pinRaw ? normKey(pinRaw) : '';
    const set = new Set();
    /** When `pincode` is set: AREA → count for outlets in that city with that PINCODE (for Loc rn–style alignment). */
    const pinAreaCounts = new Map();

    for (const r of records) {
      const st = String(r['STATE'] ?? '').trim();
      const ci = String(r['CITY'] ?? '').trim();
      if (normKey(st) !== wantS || normKey(ci) !== wantC) continue;
      const a = String(r['AREA'] ?? '').trim();
      if (a) set.add(a);
      if (wantPin && a) {
        const p = String(r['PINCODE'] ?? '').trim();
        if (normKey(p) === wantPin) pinAreaCounts.set(a, (pinAreaCounts.get(a) || 0) + 1);
      }
    }

    const data = [...set].sort((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base' })
    );

    let pinMatchArea = '';
    if (wantPin && pinAreaCounts.size) {
      pinMatchArea = [...pinAreaCounts.entries()].sort(
        (x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'en', { sensitivity: 'base' })
      )[0][0];
    }

    return res.status(200).json({
      success: true,
      source,
      state: rawState.trim(),
      city: rawCity.trim(),
      count: data.length,
      data,
      pincode: pinRaw || undefined,
      pinMatchArea: pinMatchArea || undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load areas',
      message: error.message,
    });
  }
}
