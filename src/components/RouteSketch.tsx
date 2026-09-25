import { Box } from '@mui/material';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { type LatLon, cumulativeDistances, simplifyToMax, splitRoute } from '../../shared/geo';

/** Lightweight SVG outline of a route with the covered part highlighted. */
export default function RouteSketch({ points, doneM, height = 120 }: { points: LatLon[]; doneM: number; height?: number }) {
  const { done, ahead, viewBox, me } = useMemo(() => {
    const pts = simplifyToMax(points, 300);
    const cum = cumulativeDistances(pts);
    const { done, ahead } = splitRoute(pts, cum, doneM);
    const lat0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const proj = ([la, lo]: LatLon) => [lo * k, -la] as const;
    const xy = pts.map(proj);
    const xs = xy.map((p) => p[0]);
    const ys = xy.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const span = Math.max(maxX - minX, maxY - minY, 1e-6);
    const pad = span * 0.08;
    const path = (arr: LatLon[]) => arr.map((p, i) => `${i ? 'L' : 'M'}${proj(p)[0]},${proj(p)[1]}`).join('');
    const last = done[done.length - 1];
    return {
      done: path(done),
      ahead: path(ahead),
      me: last ? proj(last) : null,
      viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`,
    };
  }, [points, doneM]);

  return (
    <Box
      component="svg"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      sx={{ width: '100%', height, display: 'block' }}
      aria-hidden
    >
      <path d={ahead} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} vectorEffect="non-scaling-stroke" strokeDasharray="4 4" strokeLinecap="round" />
      <motion.path
        d={done}
        fill="none"
        stroke="#fc4c02"
        strokeWidth={4}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      />
      {me && (
        <>
          <path d={`M${me[0]},${me[1]}l0,0`} stroke="#fff" strokeWidth={14} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={`M${me[0]},${me[1]}l0,0`} stroke="#fc4c02" strokeWidth={9} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </>
      )}
    </Box>
  );
}
