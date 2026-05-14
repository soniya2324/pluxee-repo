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

    // normKey(area) → first canonical (raw trimmed) area string seen for that key
    // This ensures pinMatchArea is always the same string used in `data`,
    // regardless of case/whitespace variation in the CSV.
    const canonicalArea = new Map(); // normKey → first raw area seen
    /** pincode-filtered: normKey(area) → count */
    const pinAreaCounts = new Map();

    for (const r of records) {
      const st = String(r['STATE'] ?? '').trim();
      const ci = String(r['CITY'] ?? '').trim();
      if (normKey(st) !== wantS || normKey(ci) !== wantC) continue;

      const a = String(r['AREA'] ?? '').trim();
      if (!a) continue;

      const ak = normKey(a);
      if (!canonicalArea.has(ak)) canonicalArea.set(ak, a); // first occurrence wins

      if (wantPin) {
        const p = String(r['PINCODE'] ?? '').trim();
        if (normKey(p) === wantPin) {
          pinAreaCounts.set(ak, (pinAreaCounts.get(ak) || 0) + 1);
        }
      }
    }

    // Build sorted data list from canonical values
    const data = [...canonicalArea.values()].sort((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base' })
    );

    // pinMatchArea: pick the normKey with highest count, resolve to its canonical string
    let pinMatchArea = '';
    if (wantPin && pinAreaCounts.size) {
      const bestKey = [...pinAreaCounts.entries()].sort(
        (x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'en', { sensitivity: 'base' })
      )[0][0];
      pinMatchArea = canonicalArea.get(bestKey) ?? '';
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
