import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

// CORS-free API handler for Vercel or similar serverless platforms
export default function handler(req, res) {
  // Set CORS headers to allow all origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read CSV file
    const csvPath = path.join(process.cwd(), 'public', 'pluxee meal directory - Sheet1.csv');
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    
    // Parse CSV
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    });

    const { category, city, search, limit = 100, offset = 0 } = req.query;

    let filtered = records;

    // Filter by category
    if (category) {
      filtered = filtered.filter(
        record => record['NEW CATEGORY']?.toLowerCase() === category.toLowerCase()
      );
    }

    // Filter by city
    if (city) {
      filtered = filtered.filter(
        record => record['CITY']?.toLowerCase() === city.toLowerCase()
      );
    }

    // Search functionality
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
