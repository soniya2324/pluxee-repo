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
