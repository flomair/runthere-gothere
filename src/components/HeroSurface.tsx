import { Box, type BoxProps } from '@mui/material';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { IRIS, HERO_SURFACE } from '../theme';

/** Concentric, slightly irregular rings, like contour lines on a hiking map. */
function contourPaths(cx: number, cy: number, rings: number, seed: number): string[] {
  const out: string[] = [];
  for (let r = 1; r <= rings; r++) {
    const base = r * 34;
    const pts: string[] = [];
    for (let a = 0; a <= 64; a++) {
      const th = (a / 64) * Math.PI * 2;
      const wobble = 1 + 0.09 * Math.sin(3 * th + seed + r * 0.35) + 0.05 * Math.sin(5 * th - seed * 1.7 + r * 0.2);
      pts.push(`${a ? 'L' : 'M'}${(cx + Math.cos(th) * base * wobble * 1.25).toFixed(1)},${(cy + Math.sin(th) * base * wobble).toFixed(1)}`);
    }
    out.push(`${pts.join('')}Z`);
  }
  return out;
}

/**
 * The app's signature surface: deep pine with a faint iris glow and a topographic texture.
 * Used for the journey hero, the start page and shared/public journey headers.
 */
export default function HeroSurface({ children, sx, seed = 1, ...rest }: BoxProps & { seed?: number }) {
  const paths = useMemo(() => [...contourPaths(760, 40, 11, seed), ...contourPaths(40, 330, 6, seed + 2)], [seed]);
  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: { xs: '24px', sm: '28px' },
        color: '#EEF4F1',
        background: HERO_SURFACE,
        boxShadow: '0 24px 48px -28px rgba(15, 59, 53, 0.55)',
        isolation: 'isolate',
        ...sx,
      }}
      {...rest}
    >
      <Box
        component="svg"
        aria-hidden
        viewBox="0 0 800 360"
        preserveAspectRatio="xMidYMid slice"
        sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: -1, pointerEvents: 'none' }}
      >
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#fff" strokeOpacity={0.07} strokeWidth={1} />
        ))}
      </Box>
      <Box
        component={motion.div}
        aria-hidden
        animate={{ x: ['-6%', '8%', '-6%'], y: ['-6%', '6%', '-6%'] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        sx={{
          position: 'absolute',
          width: '60%',
          height: '130%',
          top: '-45%',
          right: '-15%',
          zIndex: -1,
          background: `radial-gradient(closest-side, ${IRIS}33, transparent)`,
          pointerEvents: 'none',
        }}
      />
      {children}
    </Box>
  );
}
