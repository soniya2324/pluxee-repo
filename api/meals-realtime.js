import { getMealRecordsRemote } from '../lib/getMealRecords.js';
import { applyMealQuery } from '../lib/mealFilters.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { records, source } = await getMealRecordsRemote();
    const { data, pagination } = applyMealQuery(records, req.query);

    return res.status(200).json({
      success: true,
      source,
      data,
      pagination,
      timestamp: new Date().toISOString(),
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
