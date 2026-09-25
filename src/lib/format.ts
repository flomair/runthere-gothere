import { getUnit, toUnit } from './units';

/** Distance in the user's unit (km or mi), e.g. "12.3 km". */
export function formatKm(meters: number, digits = 1): string {
  const v = toUnit(meters);
  return `${v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: v < 100 ? digits : 0 })} ${getUnit()}`;
}

/** Pace in the user's unit, e.g. "5:12 /km". */
export function formatPace(secPerKm: number): string {
  const s = getUnit() === 'mi' ? secPerKm * 1.609344 : secPerKm;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} /${getUnit()}`;
}

export const formatDate = (d: Date | string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) =>
  new Intl.DateTimeFormat(undefined, opts).format(typeof d === 'string' ? new Date(d.length === 10 ? `${d}T12:00:00` : d) : d);

export function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m} min`;
}

export const pct = (f: number) => `${(f * 100).toLocaleString(undefined, { maximumFractionDigits: f < 0.1 ? 1 : 0 })}%`;

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
