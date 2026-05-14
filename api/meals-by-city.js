import { setCorsHeaders } from '../lib/cors.js';
import { getMealRecords } from '../lib/getMealRecords.js';
import { applyMealQuery } from '../lib/mealFilters.js';

export default async function handler(req, res) {
  setCorsHeaders(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawCity = req.query.city;
  if (typeof rawCity !== 'string' || !rawCity.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Query parameter "city" is required',
      examples: [
        '/api/meals-by-city?city=New%20Delhi',
        '/api/meals-by-city?city=Mumbai&limit=20&offset=0',
        '/api/meals-by-city?city=delhi&cityMatch=contains',
      ],
    });
  }

  try {
    const { records, source } = await getMealRecords();
    const city = rawCity.trim();
    const { data, pagination } = applyMealQuery(records, {
      ...req.query,
      city,
    });

    return res.status(200).json({
      success: true,
      city,
      cityMatch: String(req.query.cityMatch || 'exact').toLowerCase(),
      source,
      data,
      pagination,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load meals',
      message: error.message,
    });
  }
}
