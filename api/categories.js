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
      example: '/api/categories?state=Tamil+Nadu&city=Chennai',
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
    const set = new Set();

    for (const r of records) {
      const st = String(r['STATE'] ?? '').trim();
      const ci = String(r['CITY'] ?? '').trim();
      if (normKey(st) !== wantS || normKey(ci) !== wantC) continue;
      const c = String(r['NEW CATEGORY'] ?? '').trim();
      if (c) set.add(c);
    }

    const data = [...set].sort((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base' })
    );

    return res.status(200).json({
      success: true,
      source,
      count: data.length,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load categories',
      message: error.message,
    });
  }
}
