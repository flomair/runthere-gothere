export { formatKm } from '../../shared/geo';

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
