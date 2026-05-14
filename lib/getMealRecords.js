import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const DEFAULT_CSV_URL =
  'https://raw.githubusercontent.com/soniya2324/pluxee-repo/main/pluxee%20meal%20directory%20-%20Sheet1.csv';

function resolveLocalCsvPath() {
  const root = path.join(process.cwd(), 'pluxee meal directory - Sheet1.csv');
  const pub = path.join(
    process.cwd(),
    'public',
    'pluxee meal directory - Sheet1.csv'
  );
  if (fs.existsSync(root)) return root;
  if (fs.existsSync(pub)) return pub;
  return null;
}

function parseRecords(text) {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
  });
}

/** Local CSV only; returns null if file is missing. */
export function tryGetMealRecordsFromFilesystem() {
  const localPath = resolveLocalCsvPath();
  if (!localPath) return null;
  const text = fs.readFileSync(localPath, 'utf-8');
  return { records: parseRecords(text), source: 'filesystem' };
}

/** Always loads from PLUXEE_CSV_URL or default GitHub raw URL. */
export async function getMealRecordsRemote() {
  const url = process.env.PLUXEE_CSV_URL || DEFAULT_CSV_URL;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch CSV (${response.status})`);
  }
  const text = await response.text();
  return { records: parseRecords(text), source: 'remote' };
}

/** Prefers local CSV; falls back to remote if no file on disk. */
export async function getMealRecords() {
  const local = tryGetMealRecordsFromFilesystem();
  if (local) return local;
  return getMealRecordsRemote();
}
