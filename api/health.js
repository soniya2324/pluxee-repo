import { setCorsHeaders } from '../lib/cors.js';

export default function handler(req, res) {
  setCorsHeaders(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    ok: true,
    service: 'pluxee-api',
    endpoints: [
      '/api',
      '/api/health',
      '/api/meals',
      '/api/meals-realtime',
      '/api/meals-by-city',
      '/api/states',
      '/api/states-cities',
      '/api/cities',
      '/api/areas',
      '/api/categories',
      '/api/outlets',
      '/api/geocode',
      '/api/reverse',
    ],
  });
}
