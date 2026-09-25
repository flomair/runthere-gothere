import { Box } from '@mui/material';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type LatLon, cumulativeDistances, simplifyToMax, splitRoute } from '../../shared/geo';
import { C } from '../theme';

/**
 * Lightweight SVG outline of a route with the covered part highlighted.
 * Drawn in real pixels (measured), so stroke widths never depend on `vector-effect`,
 * which iOS Safari ignores together with animated path lengths.
 */
export default function RouteSketch({ points, doneM, height = 120 }: { points: LatLon[]; doneM: number; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
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
    const cum = cumulativeDistances(pts);
    const { done, ahead } = splitRoute(pts, cum, doneM);
    const lat0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const raw = pts.map(([la, lo]) => [lo * k, -la] as const);
    const xs = raw.map((p) => p[0]);
    const ys = raw.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = 14;
    const scale = Math.min((width - 2 * pad) / Math.max(maxX - minX, 1e-9), (height - 2 * pad) / Math.max(maxY - minY, 1e-9));
    const ox = (width - (maxX - minX) * scale) / 2;
    const oy = (height - (maxY - minY) * scale) / 2;
    const proj = ([la, lo]: LatLon): [number, number] => [ox + (lo * k - minX) * scale, oy + (-la - minY) * scale];
    const path = (arr: LatLon[]) => arr.map((p, i) => `${i ? 'L' : 'M'}${proj(p)[0].toFixed(1)},${proj(p)[1].toFixed(1)}`).join('');
    const last = done[done.length - 1];
    return { done: path(done), ahead: path(ahead), start: proj(pts[0]), end: proj(pts[pts.length - 1]), me: doneM > 0 && last ? proj(last) : null };
  }, [points, doneM, width, height]);

  return (
    <Box ref={ref} sx={{ width: '100%', height }} aria-hidden>
      {g && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
          <path d={g.ahead} fill="none" style={{ stroke: C.track }} strokeWidth={2} strokeDasharray="1 5" strokeLinecap="round" strokeLinejoin="round" />
          {g.done.length > 1 && (
            <motion.path
              d={g.done}
              fill="none"
              style={{ stroke: C.ember }}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            />
          )}
          <circle cx={g.start[0]} cy={g.start[1]} r={3.5} style={{ fill: C.ink }} />
          <circle cx={g.end[0]} cy={g.end[1]} r={5} fill="none" strokeWidth={2} style={{ stroke: C.lagoon }} />
          <circle cx={g.end[0]} cy={g.end[1]} r={1.8} style={{ fill: C.lagoon }} />
          {g.me && (
            <>
              <circle cx={g.me[0]} cy={g.me[1]} r={9} opacity={0.18} style={{ fill: C.ember }} />
              <circle cx={g.me[0]} cy={g.me[1]} r={4.5} strokeWidth={2} style={{ fill: C.ember, stroke: 'var(--mui-palette-background-paper)' }} />
            </>
          )}
        </svg>
      )}
    </Box>
  );
}
