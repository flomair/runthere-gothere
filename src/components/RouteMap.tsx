import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { LayersControl, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { type LatLon, haversine, positionAt, sliceRoute, splitRoute } from '../../shared/geo';
import type { Waypoint } from '../lib/types';

const icon = (cls: string, html = '') =>
  L.divIcon({ className: '', html: `<div class="rtgt-marker ${cls}">${html}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] });

const ICONS = {
  me: icon('me', '🏃'),
  start: L.divIcon({ className: '', html: '<div class="rtgt-marker start">A</div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
  goal: icon('goal', '🏁'),
  via: L.divIcon({ className: '', html: '<div class="rtgt-marker start">•</div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
  peek: L.divIcon({ className: '', html: '<div class="rtgt-marker peek">👀</div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
};

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
}

export default function RouteMap({ points, cum, doneM, waypoints, peekM, onPeek, flyToken, flyTarget, height = 460, highlight }: Props) {
  const { done, ahead } = useMemo(() => splitRoute(points, cum, doneM), [points, cum, doneM]);
  const hl = useMemo(() => (highlight ? sliceRoute(points, cum, highlight.fromM, highlight.toM) : []), [points, cum, highlight]);
  const me = done[done.length - 1];
  const peek = peekM != null ? positionAt(points, cum, peekM).point : null;
  const start = points[0];
  const goal = points[points.length - 1];

  return (
    <MapContainer center={start} zoom={6} style={{ height, width: '100%' }} scrollWheelZoom worldCopyJump>
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer
            attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Terrain">
          <TileLayer
            attribution='Map data &copy; OpenStreetMap contributors, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
            maxZoom={17}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <Polyline positions={ahead} pathOptions={{ color: '#1d3557', weight: 4, opacity: 0.55, dashArray: '6 8' }} />
      <Polyline positions={done} pathOptions={{ color: '#fc4c02', weight: 6, opacity: 0.95 }} />
      {hl.length >= 2 && <Polyline positions={hl} pathOptions={{ color: '#f4b400', weight: 9, opacity: 0.9, lineCap: 'round' }} />}
      {hl.length >= 2 && <FitHighlight line={hl} />}

      <Marker position={start} icon={ICONS.start}>
        <Tooltip>{waypoints[0]?.name ?? 'Start'}</Tooltip>
      </Marker>
      {waypoints.slice(1, -1).map((w) => (
        <Marker key={`${w.lat},${w.lon}`} position={[w.lat, w.lon]} icon={ICONS.via}>
          <Tooltip>{w.name}</Tooltip>
        </Marker>
      ))}
      <Marker position={goal} icon={ICONS.goal}>
        <Tooltip>{waypoints[waypoints.length - 1]?.name ?? 'Finish'}</Tooltip>
      </Marker>
      {peek && (
        <Marker position={peek} icon={ICONS.peek} zIndexOffset={500}>
          <Tooltip>Look-ahead point</Tooltip>
        </Marker>
      )}
      {me && (
        <Marker position={me} icon={ICONS.me} zIndexOffset={1000}>
          <Tooltip permanent direction="top" offset={[0, -18]}>
            You are here
          </Tooltip>
        </Marker>
      )}

      <FitOnce points={points} />
      <FlyTo target={flyTarget} token={flyToken} />
      <ClickToPeek points={points} cum={cum} onPick={onPeek} />
    </MapContainer>
  );
}
