// Real-time CORS-free API - Reads directly from GitHub
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { category, city, search, limit = 100, offset = 0 } = req.query;

    // Fetch directly from GitHub raw content (real-time)
    const response = await fetch(
      'https://raw.githubusercontent.com/soniya2324/pluxee-repo/main/pluxee%20meal%20directory%20-%20Sheet1.csv'
    );

    if (!response.ok) {
      throw new Error('Failed to fetch CSV from GitHub');
    }

    const csvText = await response.text();
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    // Parse CSV
    const records = lines.slice(1).map(line => {
      if (!line.trim()) return null;
      
      const values = [];
      let current = '';
      let insideQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
          values.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^"|"$/g, ''));

      const record = {};
      headers.forEach((header, idx) => {
        record[header] = values[idx] || '';
      });
      return record;
    }).filter(r => r !== null && Object.values(r).some(v => v));

    // Apply filters
    let filtered = records;

    if (category) {
      filtered = filtered.filter(
        r => r['NEW CATEGORY']?.toLowerCase() === category.toLowerCase()
      );
    }

    if (city) {
      filtered = filtered.filter(
        r => r['CITY']?.toLowerCase() === city.toLowerCase()
      );
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(record =>
        Object.values(record).some(val =>
          val?.toLowerCase().includes(searchLower)
        )
      );
    }

    // Pagination
    const total = filtered.length;
    const paginatedData = filtered.slice(
      parseInt(offset),
      parseInt(offset) + parseInt(limit)
    );

    return res.status(200).json({
      success: true,
      data: paginatedData,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(total / parseInt(limit)),
      },
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
