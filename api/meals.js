import { setCorsHeaders } from '../lib/cors.js';
import { tryGetMealRecordsFromFilesystem } from '../lib/getMealRecords.js';
import { applyMealQuery } from '../lib/mealFilters.js';

export default function handler(req, res) {
  setCorsHeaders(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const got = tryGetMealRecordsFromFilesystem();
    if (!got) {
      return res.status(503).json({
        success: false,
        error: 'CSV not found on server',
        hint: 'Use /api/meals-realtime or /api/meals-by-city or set PLUXEE_CSV_URL.',
      });
    }

    const { data, pagination } = applyMealQuery(got.records, req.query);

    return res.status(200).json({
      success: true,
      source: got.source,
      data,
      pagination,
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch data',
      message: error.message,
    });
  }
}
