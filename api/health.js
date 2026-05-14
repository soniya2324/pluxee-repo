export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

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
    ],
  });
}
