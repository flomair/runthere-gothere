import L from 'leaflet';
import { Fragment, useEffect, useMemo, useRef } from 'react';
import { LayersControl, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { type LatLon, haversine, positionAt, sliceRoute, splitRoute } from '../../shared/geo';
import type { Waypoint } from '../lib/types';
import { t } from '../lib/i18n';
import { HIGHLIGHT } from '../theme';
import BaseTiles from './BaseTiles';
import { routeColors, useDarkMap } from '../lib/mapStyle';
import { type EmojiName, emojiHtml } from './Emoji';

const icon = (cls: string, html = '') =>
  L.divIcon({ className: '', html: `<div class="rtgt-marker ${cls}">${html}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] });

const ICONS = {
  me: icon('me', emojiHtml('runner', 22)),
  start: L.divIcon({ className: '', html: '<div class="rtgt-marker start">A</div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
  goal: icon('goal', emojiHtml('finish', 22)),
  via: L.divIcon({ className: '', html: '<div class="rtgt-marker start">•</div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
  /** A stop you have reached ("unlocked"). */
  viaReached: L.divIcon({ className: '', html: '<div class="rtgt-marker reached">✓</div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
  /** An earlier destination of the journey (end of a previous leg). */
  legGoal: L.divIcon({ className: '', html: `<div class="rtgt-marker reached leg">${emojiHtml('finish', 18)}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
  reward: {
    locked: L.divIcon({ className: '', html: `<div class="rtgt-marker reward">${emojiHtml('gift', 18)}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
    unlocked: L.divIcon({ className: '', html: `<div class="rtgt-marker reward unlocked">${emojiHtml('gift', 22)}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
    claimed: L.divIcon({ className: '', html: '<div class="rtgt-marker reward claimed">✓</div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
  },
  peek: L.divIcon({ className: '', html: `<div class="rtgt-marker peek">${emojiHtml('eyes', 18)}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
};

/** A side branch leaving the route at `m`: a gentle curve off to one side (stored-line metres). */
export function branchLine(points: LatLon[], cum: number[], m: number, side: 1 | -1, n = 24): LatLon[] {
  const total = cum[cum.length - 1] || 1;
  const P = positionAt(points, cum, m).point;
  const a = positionAt(points, cum, Math.max(0, m - total * 0.01)).point;
  const b = positionAt(points, cum, Math.min(total, m + total * 0.01)).point;
  const kx = 111_320 * Math.cos((P[0] * Math.PI) / 180);
  const ky = 110_540;
  let ux = (b[1] - a[1]) * kx;
  let uy = (b[0] - a[0]) * ky;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len;
  uy /= len;
  const L = Math.min(120_000, Math.max(2000, total * 0.1));
  // perpendicular (to the chosen side), bending forward along the route
  const px = -uy * side;
  const py = ux * side;
  const ctrl = [px * L * 0.7, py * L * 0.7];
  const end = [px * L + ux * L * 0.45, py * L + uy * L * 0.45];
  const out: LatLon[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = 2 * (1 - t) * t * ctrl[0] + t * t * end[0];
    const y = 2 * (1 - t) * t * ctrl[1] + t * t * end[1];
    out.push([P[0] + y / ky, P[1] + x / kx]);
  }
  return out;
}

function FitOnce({ points }: { points: LatLon[] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length < 2) return;
    map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
    done.current = true;
  }, [map, points]);
  return null;
}

function FlyTo({ target, token }: { target: LatLon | null; token: number }) {
  const map = useMap();
  useEffect(() => {
    if (target && token > 0) map.flyTo(target, Math.max(map.getZoom(), 12), { duration: 1.2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return null;
}

function FitHighlight({ line }: { line: LatLon[] }) {
  const map = useMap();
  useEffect(() => {
    if (line.length >= 2) map.flyToBounds(L.latLngBounds(line), { padding: [60, 60], duration: 1, maxZoom: 13 });
  }, [map, line]);
  return null;
}

function ClickToPeek({ points, cum, onPick }: { points: LatLon[]; cum: number[]; onPick: (m: number) => void }) {
  useMapEvents({
    click(e) {
      const p: LatLon = [e.latlng.lat, e.latlng.lng];
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < points.length; i++) {
        const d = haversine(p, points[i]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      // only react to clicks reasonably close to the line (relative to zoom)
      const mPerPx = (40_075_016 * Math.cos((p[0] * Math.PI) / 180)) / 2 ** (e.target.getZoom() + 8);
      if (bestD < 40 * mPerPx) onPick(cum[best]);
    },
  });
  return null;
}

interface Props {
  points: LatLon[];
  cum: number[];
  doneM: number;
  waypoints: Waypoint[];
  peekM: number | null;
  onPeek: (m: number) => void;
  /** Increment to fly the map to `flyTarget`. */
  flyToken: number;
  flyTarget: LatLon | null;
  height?: number | string;
  /** Stretch to highlight (stored-line metres), e.g. a selected run. */
  highlight?: { fromM: number; toM: number } | null;
  /** Per waypoint (same order): reached yet, and whether it was the destination of an earlier leg. */
  stops?: { reached: boolean; legFinish: boolean }[];
  /** Personal rewards pinned on the route (stored-line metres). */
  rewards?: { id: string; title: string; m: number; status: 'locked' | 'unlocked' | 'claimed' }[];
  /** Side quests branching off the route (stored-line metres). */
  branches?: { id: string; m: number; fraction: number; label: string; emoji: EmojiName; offered?: boolean; done?: boolean }[];
}

export default function RouteMap({ points, cum, doneM, waypoints, peekM, onPeek, flyToken, flyTarget, height = 460, highlight, stops, rewards, branches }: Props) {
  const { done, ahead } = useMemo(() => splitRoute(points, cum, doneM), [points, cum, doneM]);
  const hl = useMemo(() => (highlight ? sliceRoute(points, cum, highlight.fromM, highlight.toM) : []), [points, cum, highlight]);
  const me = done[done.length - 1];
  const col = routeColors(useDarkMap());
  const peek = peekM != null ? positionAt(points, cum, peekM).point : null;
  const start = points[0];
  const goal = points[points.length - 1];

  return (
    <MapContainer center={start} zoom={6} style={{ height, width: '100%' }} scrollWheelZoom worldCopyJump>
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name={t('Map')}>
          <BaseTiles />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name={t('Street map')}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name={t('Satellite')}>
          <TileLayer
            attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name={t('Terrain')}>
          <TileLayer
            attribution='Map data &copy; OpenStreetMap contributors, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
            maxZoom={17}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <Polyline positions={ahead} pathOptions={{ color: col.ahead, weight: 3, opacity: 0.75, dashArray: '2 7', lineCap: 'round' }} />
      <Polyline positions={done} pathOptions={{ color: col.casing, weight: 8, opacity: 0.9 }} />
      <Polyline positions={done} pathOptions={{ color: col.done, weight: 4.5 }} />
      {hl.length >= 2 && <Polyline positions={hl} pathOptions={{ color: HIGHLIGHT, weight: 8, opacity: 0.95, lineCap: 'round' }} />}
      {hl.length >= 2 && <FitHighlight line={hl} />}

      <Marker position={start} icon={ICONS.start}>
        <Tooltip>{waypoints[0]?.name ?? t('Start')}</Tooltip>
      </Marker>
      {waypoints.slice(1, -1).map((w, k) => {
        const s = stops?.[k + 1];
        return (
          <Marker key={`${k}-${w.lat},${w.lon}`} position={[w.lat, w.lon]} icon={s?.legFinish ? ICONS.legGoal : s?.reached ? ICONS.viaReached : ICONS.via}>
            <Tooltip>
              {w.name}
              {s?.reached ? ' ✓' : ''}
            </Tooltip>
          </Marker>
        );
      })}
      <Marker position={goal} icon={ICONS.goal}>
        <Tooltip>{waypoints[waypoints.length - 1]?.name ?? t('Finish')}</Tooltip>
      </Marker>
      {branches?.map((b, i) => {
        const line = branchLine(points, cum, b.m, i % 2 ? -1 : 1);
        const k = Math.round(b.fraction * (line.length - 1));
        const color = b.done ? '#149A80' : '#A259E8';
        return (
          <Fragment key={b.id}>
            <Polyline positions={line} pathOptions={{ color, weight: 3, opacity: b.offered ? 0.5 : 0.8, dashArray: '2 7', lineCap: 'round' }} />
            {k > 0 && <Polyline positions={line.slice(0, k + 1)} pathOptions={{ color, weight: 5, opacity: 0.95, lineCap: 'round' }} />}
            <Marker
              position={line[line.length - 1]}
              icon={L.divIcon({ className: '', html: `<div class="rtgt-marker quest${b.offered ? ' offered' : ''}${b.done ? ' done' : ''}">${emojiHtml(b.emoji, 18)}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] })}
              zIndexOffset={150}
            >
              <Tooltip>{b.label}</Tooltip>
            </Marker>
          </Fragment>
        );
      })}
      {rewards?.map((r) => (
        <Marker key={r.id} position={positionAt(points, cum, r.m).point} icon={ICONS.reward[r.status]} zIndexOffset={200}>
          <Tooltip>
            {r.title}
            {r.status === 'locked' ? ` · ${t('locked')}` : r.status === 'unlocked' ? ` · ${t('unlocked!')}` : ` · ${t('Claimed')}`}
          </Tooltip>
        </Marker>
      ))}
      {peek && (
        <Marker position={peek} icon={ICONS.peek} zIndexOffset={500}>
          <Tooltip>{t('Look-ahead point')}</Tooltip>
        </Marker>
      )}
      {me && (
        <Marker position={me} icon={ICONS.me} zIndexOffset={1000}>
          <Tooltip permanent direction="top" offset={[0, -18]}>
            {t('You are here')}
          </Tooltip>
        </Marker>
      )}

      <FitOnce points={points} />
      <FlyTo target={flyTarget} token={flyToken} />
      <ClickToPeek points={points} cum={cum} onPick={onPeek} />
    </MapContainer>
  );
}
