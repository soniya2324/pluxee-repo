import { setCorsHeaders } from '../lib/cors.js';
import { getMealRecords } from '../lib/getMealRecords.js';
import { applyMealQuery, filterMeals } from '../lib/mealFilters.js';

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

    const { data, pagination } = applyMealQuery(records, mergedQuery);

    return res.status(200).json({
      success: true,
      source,
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
