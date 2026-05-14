/**
 * Shared query filters for meal CSV rows (no pagination).
 * @param {Record<string, string>[]} records
 * @param {Record<string, string | string[] | undefined>} query
 * @returns {Record<string, string>[]}
 */
export function filterMeals(records, query) {
  const {
    category,
    city,
    cityMatch = 'exact',
    state,
    stateMatch = 'exact',
    area,
    areaMatch = 'exact',
    bqr,
    search,
  } = query;

  let filtered = records;

  if (category && typeof category === 'string') {
    const c = category.trim().toLowerCase();
    filtered = filtered.filter(
      (r) => String(r['NEW CATEGORY'] ?? '').trim().toLowerCase() === c
    );
  }

  if (state && typeof state === 'string') {
    const q = state.trim().toLowerCase();
    const mode = String(stateMatch).toLowerCase();
    filtered = filtered.filter((r) => {
      const cell = String(r['STATE'] ?? '').trim().toLowerCase();
      if (!q) return true;
      if (mode === 'contains') return cell.includes(q);
      return cell === q;
    });
  }

  if (city && typeof city === 'string') {
    const q = city.trim().toLowerCase();
    const mode = String(cityMatch).toLowerCase();
    filtered = filtered.filter((r) => {
      const cell = String(r['CITY'] ?? '').trim().toLowerCase();
      if (!q) return true;
      if (mode === 'contains') return cell.includes(q);
      return cell === q;
    });
  }

  if (area && typeof area === 'string') {
    const q = area.trim().toLowerCase();
    const mode = String(areaMatch).toLowerCase();
    filtered = filtered.filter((r) => {
      const cell = String(r['AREA'] ?? '').trim().toLowerCase();
      if (!q) return true;
      if (mode === 'contains') return cell.includes(q);
      return cell === q;
    });
  }

  if (bqr === '1' || bqr === '0') {
    const wantYes = bqr === '1';
    filtered = filtered.filter((r) => {
      const raw = String(r['ENABLED WITH BQR CODE'] ?? '')
        .trim()
        .toLowerCase();
      const yes = ['yes', '1', 'y', 'true'].includes(raw);
      return wantYes ? yes : !yes;
    });
  }

  if (search && typeof search === 'string') {
    const searchLower = search.trim().toLowerCase();
    if (searchLower) {
      filtered = filtered
        .map((record) => ({ record, rank: searchMatchRank(record, searchLower) }))
        .filter(({ rank }) => rank > 0)
        .sort((a, b) => {
          if (b.rank !== a.rank) return b.rank - a.rank;
          const oa = String(a.record['OUTLET NAME'] ?? '').trim();
          const ob = String(b.record['OUTLET NAME'] ?? '').trim();
          return oa.localeCompare(ob, 'en', { sensitivity: 'base' });
        })
        .map(({ record }) => record);
    }
  }

  return filtered;
}

/** 3 = outlet name, 2 = merchant name, 1 = address only, 0 = no match (outlet / merchant / address only). */
function searchMatchRank(record, q) {
  const outlet = String(record['OUTLET NAME'] ?? '').toLowerCase();
  if (outlet.includes(q)) return 3;
  const merchant = String(record['MERCHANT NAME'] ?? '').toLowerCase();
  if (merchant.includes(q)) return 2;
  const addr = `${String(record['ADDRESS1'] ?? '')} ${String(record['ADDRESS2'] ?? '')}`
    .trim()
    .toLowerCase();
  if (addr.includes(q)) return 1;
  return 0;
}

/**
 * Shared query + pagination for meal CSV rows.
 * @param {Record<string, string>[]} records
 * @param {Record<string, string | string[] | undefined>} query
 */
export function applyMealQuery(records, query) {
  const { limit = '100', offset = '0' } = query;
  const filtered = filterMeals(records, query);

  const lim = Math.min(500, Math.max(1, parseInt(String(limit), 10) || 100));
  const off = Math.max(0, parseInt(String(offset), 10) || 0);
  const total = filtered.length;
  const data = filtered.slice(off, off + lim);

  return {
    data,
    pagination: {
      total,
      limit: lim,
      offset: off,
      pages: Math.ceil(total / lim) || 0,
    },
  };
}
