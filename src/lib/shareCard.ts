import type { LatLon } from '../../shared/geo';
import { cumulativeDistances, simplifyToMax, splitRoute } from '../../shared/geo';
import { formatKm } from './format';
import { t } from './i18n';
import { ORCHID, SKY } from '../theme';

export interface CardInput {
  name: string;
  from: string;
  to: string;
  points: LatLon[];
  totalM: number;
  doneM: number;
  place?: string;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** Renders a 1080×1350 share image (Instagram portrait) and returns it as a PNG blob. */
export async function renderShareCard(c: CardInput): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  await document.fonts?.ready;

  // the widget gradient: sky blue → violet → orchid, with a soft sheen
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, SKY);
  bg.addColorStop(0.52, '#6A67F0');
  bg.addColorStop(1, ORCHID);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const sheen = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.9);
  sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);

  // route
  const pts = simplifyToMax(c.points, 800);
  const cum = cumulativeDistances(pts);
  const scale = cum[cum.length - 1] / c.totalM;
  const { done, ahead } = splitRoute(pts, cum, c.doneM * scale);
  const lat0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = pts.map(([la, lo]) => [lo * k, -la]);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const box = { x: 110, y: 330, w: W - 220, h: 560 };
  const s = Math.min(box.w / (maxX - minX || 1), box.h / (maxY - minY || 1));
  const ox = box.x + (box.w - (maxX - minX) * s) / 2;
  const oy = box.y + (box.h - (maxY - minY) * s) / 2;
  const P = ([la, lo]: LatLon) => [ox + (lo * k - minX) * s, oy + (-la - minY) * s] as const;
  const stroke = (line: LatLon[], style: string, width: number, dash: number[] = []) => {
    ctx.beginPath();
    line.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))));
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  stroke(ahead, 'rgba(255,255,255,0.4)', 8, [2, 20]);
  stroke(done, '#ffffff', 12);
  const me = P(done[done.length - 1]);
  ctx.beginPath();
  ctx.arc(me[0], me[1], 26, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(me[0], me[1], 16, 0, Math.PI * 2);
  ctx.fillStyle = '#5B5BF0';
  ctx.fill();

  // text
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 34px Inter, sans-serif';
  ctx.globalAlpha = 0.65;
  ctx.fillText(t('I’M RUNNING'), 90, 150);
  ctx.globalAlpha = 1;
  ctx.font = '800 84px ui-rounded, "SF Pro Rounded", Nunito, sans-serif';
  const title = c.name.length > 22 ? `${c.name.slice(0, 21)}…` : c.name;
  ctx.fillText(title, 90, 250);

  ctx.font = '900 150px ui-rounded, "SF Pro Rounded", Nunito, sans-serif';
  ctx.fillText(formatKm(c.doneM, 0), 90, 1085);
  ctx.font = '600 44px Inter, sans-serif';
  ctx.globalAlpha = 0.9;
  ctx.fillText(t('{pct}% of {from} → {to}', { pct: Math.round((c.doneM / c.totalM) * 100), from: c.from, to: c.to }), 94, 1150);
  if (c.place) ctx.fillText(`📍 ${t('Now near {place}', { place: c.place })}`.slice(0, 48), 94, 1212);
  ctx.globalAlpha = 1;

  try {
    const logo = await loadImage('/icons/icon-192.png');
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.roundRect(W - 90 - 96, H - 90 - 96, 96, 96, 22);
    ctx.fill();
    ctx.drawImage(logo, W - 90 - 88, H - 90 - 88, 80, 80);
  } catch {
    /* logo is decorative */
  }
  ctx.font = '600 32px Inter, sans-serif';
  ctx.fillText('Run There · Go There', 90, H - 110);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
}
