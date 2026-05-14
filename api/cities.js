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
  if (typeof rawState !== 'string' || !rawState.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Query parameter "state" is required',
      examples: ['/api/cities?state=Tamil+Nadu', '/api/cities?state=Maharashtra'],
    });
  }

  try {
    const { records, source } = await getMealRecords();
    const want = normKey(rawState);
    const set = new Set();
    let canonicalState = '';

    for (const r of records) {
      const st = String(r['STATE'] ?? '').trim();
      if (!st || normKey(st) !== want) continue;
      if (!canonicalState) canonicalState = st;
      const c = String(r['CITY'] ?? '').trim();
      if (c) set.add(c);
    }

    const data = [...set].sort((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base' })
    );

    return res.status(200).json({
      success: true,
      source,
      state: rawState.trim(),
      canonicalState: canonicalState || rawState.trim(),
      count: data.length,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load cities',
      message: error.message,
    });
  }
}
