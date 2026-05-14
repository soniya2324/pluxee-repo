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

  try {
    const { records, source } = await getMealRecords();

    const stateKeyToCanonical = new Map();
    for (const r of records) {
      const s = String(r['STATE'] ?? '').trim();
      if (!s) continue;
      const sk = normKey(s);
      if (!stateKeyToCanonical.has(sk)) stateKeyToCanonical.set(sk, s);
    }

    const states = [...stateKeyToCanonical.values()].sort((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base' })
    );

    const citiesByState = {};
    for (const canonState of states) {
      const want = normKey(canonState);
      const set = new Set();
      for (const r of records) {
        const st = String(r['STATE'] ?? '').trim();
        if (!st || normKey(st) !== want) continue;
        const c = String(r['CITY'] ?? '').trim();
        if (c) set.add(c);
      }
      citiesByState[canonState] = [...set].sort((a, b) =>
        a.localeCompare(b, 'en', { sensitivity: 'base' })
      );
    }

    return res.status(200).json({
      success: true,
      source,
      count: { states: states.length, citiesByStateKeys: Object.keys(citiesByState).length },
      data: { states, citiesByState },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load states and cities',
      message: error.message,
    });
  }
}
