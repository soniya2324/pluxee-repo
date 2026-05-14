/**
 * formatDistance — human-readable distance label from API outlet data.
 *
 * The /api/nearby response now includes:
 *   distanceM   {number}  integer metres  (primary — use this)
 *   distanceKm  {number}  km to 4 dp      (fallback)
 *   locateVia   {string}  'row' | 'pincode'
 *
 * Rules:
 *   < 1 000 m  →  "340 m"          (no tilde — actual haversine value)
 *   ≥ 1 000 m  →  "1.2 km"         (1 decimal place)
 *
 * When locateVia === 'pincode' the distance is approximate (PIN centroid),
 * so a tilde prefix is added: "~340 m" / "~1.2 km".
 *
 * @param {object} outlet   - one item from data[] in the API response
 * @param {number} [outlet.distanceM]
 * @param {number} [outlet.distanceKm]
 * @param {string} [outlet.locateVia]
 * @returns {string}
 */
export function formatDistance(outlet) {
  const { distanceM, distanceKm, locateVia } = outlet ?? {};

  // Resolve metres from whichever field is present
  let metres;
  if (typeof distanceM === 'number' && Number.isFinite(distanceM)) {
    metres = distanceM;
  } else if (typeof distanceKm === 'number' && Number.isFinite(distanceKm)) {
    metres = Math.round(distanceKm * 1000);
  } else {
    return '';
  }

  const approx = locateVia === 'pincode' ? '~' : '';

  if (metres < 1000) {
    return `${approx}${metres} m`;
  }

  const km = (metres / 1000).toFixed(1);
  return `${approx}${km} km`;
}

/**
 * Quick usage examples (JSX / template literals):
 *
 *   import { formatDistance } from '@/utils/formatDistance';
 *
 *   // In a card component:
 *   <span className="distance">{formatDistance(outlet)}</span>
 *
 *   // Results for the screenshot scenario (pincode centroid, all 600091):
 *   //   outlet A  distanceM: 340  locateVia: 'pincode'  →  "~340 m"
 *   //   outlet B  distanceM: 680  locateVia: 'pincode'  →  "~680 m"
 *   //   outlet C  distanceM: 1200 locateVia: 'pincode'  →  "~1.2 km"
 *   //   outlet D  distanceM: 50   locateVia: 'row'      →  "50 m"   (exact coords in CSV)
 */
