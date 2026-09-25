import { Box, type BoxProps } from '@mui/material';
import { motion } from 'motion/react';
import { HERO_SURFACE } from '../theme';

/**
 * The app's signature surface, like the iOS countdown widget: a blue → violet gradient with a soft
 * sheen and white text. Used for the journey hero, the start page and shared/public journey headers.
 */
export default function HeroSurface({ children, sx, ...rest }: BoxProps & { seed?: number }) {
  const { seed: _seed, ...props } = rest as typeof rest & { seed?: number };
  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: { xs: '28px', sm: '32px' },
        color: '#fff',
        background: HERO_SURFACE,
        boxShadow: '0 24px 48px -26px rgba(91, 91, 240, 0.65)',
        isolation: 'isolate',
        ...sx,
      }}
      {...props}
    >
      {/* a slow drifting light, barely noticeable */}
      <Box
        component={motion.div}
        aria-hidden
        animate={{ x: ['-8%', '10%', '-8%'], y: ['-6%', '8%', '-6%'] }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
        sx={{
          position: 'absolute',
          width: '70%',
          height: '140%',
          bottom: '-70%',
          right: '-20%',
          zIndex: -1,
          background: 'radial-gradient(closest-side, rgba(255,255,255,0.14), transparent)',
          pointerEvents: 'none',
        }}
      />
      {children}
    </Box>
  );
}
