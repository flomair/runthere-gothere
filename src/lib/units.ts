/** Display units (per device). Distances are always stored in metres. */
export type Unit = 'km' | 'mi';
const KEY = 'rtgt.unit';
const M_PER_MI = 1609.344;

let unit: Unit = (() => {
  try {
    return localStorage.getItem(KEY) === 'mi' ? 'mi' : 'km';
  } catch {
    return 'km';
  }
})();

export const getUnit = () => unit;

export function setUnit(u: Unit) {
  unit = u;
  try {
    localStorage.setItem(KEY, u);
  } catch {
    /* ignore */
  }
  // every distance on screen changes: simplest is a fresh render
  window.location.reload();
}

/** Metres → number in the current unit. */
export const toUnit = (m: number) => (unit === 'mi' ? m / M_PER_MI : m / 1000);
/** Number in the current unit → metres. */
export const fromUnit = (v: number) => (unit === 'mi' ? v * M_PER_MI : v * 1000);
