import { Box } from '@mui/material';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type LatLon, cumulativeDistances, simplifyToMax, splitRoute } from '../../shared/geo';
import { routeColors, tileUrl, useDarkMap } from '../lib/mapStyle';
import { C } from '../theme';

const TILE = 256;
/** Web Mercator position at zoom 0, in pixels (0…256). */
const world = ([lat, lon]: LatLon): [number, number] => {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return [((lon + 180) / 360) * TILE, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE];
};

/**
 * A small static map of a route, in the app's map style: base map tiles as plain images with the
 * route drawn on top. Much lighter than an interactive map, so it suits lists of journeys.
 */
export default function MiniMap({ points, doneM, height = 140 }: { points: LatLon[]; doneM: number; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const dark = useDarkMap();
  const col = routeColors(dark);
  const retina = typeof window !== 'undefined' && window.devicePixelRatio > 1;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => {
    if (!width || points.length < 2) return null;
    const pts = simplifyToMax(points, 300);
    const w0 = pts.map(world);
    const xs = w0.map((p) => p[0]);
    const ys = w0.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = 22;
    const zf = Math.max(1, Math.min(13, Math.log2(Math.min((width - 2 * pad) / Math.max(maxX - minX, 1e-9), (height - 2 * pad) / Math.max(maxY - minY, 1e-9)))));
    // one zoom level deeper on high-density screens keeps the little map sharp
    const zi = Math.min(19, Math.floor(zf) + (retina ? 1 : 0));
    const scale = 2 ** zf;
    const tileSize = TILE * 2 ** (zf - zi);
    const ox = ((minX + maxX) / 2) * scale - width / 2;
    const oy = ((minY + maxY) / 2) * scale - height / 2;
    const n = 2 ** zi;
    const tiles: { key: string; x: number; y: number; left: number; top: number }[] = [];
    for (let ty = Math.floor(oy / tileSize); ty <= Math.floor((oy + height) / tileSize); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(ox / tileSize); tx <= Math.floor((ox + width) / tileSize); tx++) {
        tiles.push({ key: `${zi}/${tx}/${ty}`, x: ((tx % n) + n) % n, y: ty, left: tx * tileSize - ox, top: ty * tileSize - oy });
      }
    }
    const proj = (p: LatLon): [number, number] => {
      const [x, y] = world(p);
      return [x * scale - ox, y * scale - oy];
    };
    const cum = cumulativeDistances(pts);
    const { done, ahead } = splitRoute(pts, cum, doneM);
    const path = (arr: LatLon[]) => arr.map((p, i) => `${i ? 'L' : 'M'}${proj(p)[0].toFixed(1)},${proj(p)[1].toFixed(1)}`).join('');
    const last = done[done.length - 1];
    return { zi, tileSize, tiles, done: path(done), ahead: path(ahead), start: proj(pts[0]), end: proj(pts[pts.length - 1]), me: doneM > 0 && last ? proj(last) : null };
  }, [points, doneM, width, height, retina]);

  return (
    <Box ref={ref} sx={{ position: 'relative', width: '100%', height, overflow: 'hidden', bgcolor: dark ? '#191c2e' : '#eef0fb' }} aria-hidden>
      {g && (
        <>
          <Box className="rtgt-tiles" sx={{ position: 'absolute', inset: 0 }}>
            {g.tiles.map((tl) => (
              <Box
                key={tl.key}
                component="img"
                alt=""
                loading="lazy"
                decoding="async"
                src={tileUrl(g.zi, tl.x, tl.y)}
                onLoad={(e) => ((e.target as HTMLImageElement).style.opacity = '1')}
                sx={{ position: 'absolute', left: tl.left, top: tl.top, width: g.tileSize + 0.5, height: g.tileSize + 0.5, opacity: 0, transition: 'opacity .4s ease', userSelect: 'none', pointerEvents: 'none' }}
              />
            ))}
          </Box>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, display: 'block' }}>
            <path d={g.ahead} fill="none" stroke={col.ahead} strokeOpacity={0.7} strokeWidth={2.2} strokeDasharray="1 5" strokeLinecap="round" strokeLinejoin="round" />
            {g.done.length > 1 && (
              <>
                <path d={g.done} fill="none" stroke={col.casing} strokeOpacity={0.85} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
                <motion.path
                  d={g.done}
                  fill="none"
                  stroke={col.done}
                  strokeWidth={3.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                />
              </>
            )}
            <circle cx={g.start[0]} cy={g.start[1]} r={4} fill={col.start} stroke={col.casing} strokeWidth={1.5} />
            <circle cx={g.end[0]} cy={g.end[1]} r={6} fill={col.casing} stroke={dark ? '#4FD1B5' : '#149A80'} strokeWidth={2.2} />
            <circle cx={g.end[0]} cy={g.end[1]} r={2} fill={dark ? '#4FD1B5' : '#149A80'} />
            {g.me && (
              <>
                <circle cx={g.me[0]} cy={g.me[1]} r={11} fill={col.done} opacity={0.2} />
                <circle cx={g.me[0]} cy={g.me[1]} r={5.5} fill={col.done} stroke={col.casing} strokeWidth={2.2} />
              </>
            )}
          </svg>
          <Box sx={{ position: 'absolute', right: 6, bottom: 3, fontSize: 9, opacity: 0.55, color: C.brand, pointerEvents: 'none' }}>© OpenStreetMap</Box>
        </>
      )}
    </Box>
  );
}
