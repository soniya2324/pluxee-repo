/**
 * Shared query + pagination for meal CSV rows.
 * @param {Record<string, string>[]} records
 * @param {Record<string, string | string[] | undefined>} query
 */
export function applyMealQuery(records, query) {
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
    limit = '100',
    offset = '0',
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
    const searchLower = search.toLowerCase();
    filtered = filtered.filter((record) =>
      Object.values(record).some((val) =>
        String(val ?? '')
          .toLowerCase()
          .includes(searchLower)
      )
    );
  }

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
