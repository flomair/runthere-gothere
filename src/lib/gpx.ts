import { cumulativeDistances, parseGpx, simplifyToMax } from '../../shared/geo';
import type { PlannedRoute } from './types';

/** Parse a GPX file in the browser and turn it into a stored route. */
export function finalizeClientRoute(xml: string): PlannedRoute {
  const raw = parseGpx(xml);
  if (raw.length < 2) throw new Error('No track or route points found in this GPX file.');
  const cum = cumulativeDistances(raw);
  return { points: simplifyToMax(raw, 4000), totalM: cum[cum.length - 1], provider: 'GPX upload' };
}
