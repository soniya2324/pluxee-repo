import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {Map<string, { lat: number; lon: number }> | null} */
let mapCache = null;

function normPin(pin) {
  const d = String(pin ?? '')
    .replace(/\D/g, '')
    .trim();
  if (d.length === 6) return d;
  if (d.length > 6) return d.slice(0, 6);
  if (d.length >= 1) return d.padStart(6, '0');
  return '';
}

function loadMap() {
  if (mapCache) return mapCache;
  const csvPath = path.join(__dirname, 'data', 'pincode-IN.csv');
  if (!fs.existsSync(csvPath)) {
    mapCache = new Map();
    return mapCache;
  }
  const text = fs.readFileSync(csvPath, 'utf-8');
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
  /** @type {Map<string, { sumLat: number; sumLon: number; n: number }>} */
  const acc = new Map();
  for (const r of rows) {
    const key = String(r.key ?? r.Key ?? '').trim();
    const pinRaw = key.includes('/') ? key.split('/').pop() : key;
    const nk = normPin(pinRaw);
    if (!nk) continue;
    const lat = parseFloat(String(r.latitude ?? r.Latitude ?? '').trim());
    const lon = parseFloat(String(r.longitude ?? r.Longitude ?? '').trim());
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!acc.has(nk)) acc.set(nk, { sumLat: 0, sumLon: 0, n: 0 });
    const a = acc.get(nk);
    a.sumLat += lat;
    a.sumLon += lon;
    a.n += 1;
  }
  mapCache = new Map();
  for (const [nk, a] of acc) {
    mapCache.set(nk, { lat: a.sumLat / a.n, lon: a.sumLon / a.n });
  }
  return mapCache;
}

/** @returns {{ lat: number; lon: number } | null} */
export function getPincodeCentroid(pin) {
  const nk = normPin(pin);
  if (!nk) return null;
  const m = loadMap();
  return m.get(nk) ?? null;
}
