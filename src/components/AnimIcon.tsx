import { Box, type SxProps, type Theme } from '@mui/material';
import type { LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';

/**
 * Motion presets for line icons (keyframes in styles.css). An icon plays its preset when it, or
 * the button/tab/tile around it, is hovered, and once when its tab gets selected.
 */
export type Anim = 'pop' | 'wiggle' | 'bounce' | 'spin' | 'wave' | 'ring' | 'twinkle' | 'nudge' | 'drop' | 'none';

export interface AnimIconProps {
  icon: LucideIcon;
  anim?: Anim;
  /** Draw the strokes in on mount. */
  draw?: boolean;
  /** Gentle floating loop (for big, decorative icons). */
  idle?: boolean;
  size?: number | string;
  color?: string;
  strokeWidth?: number;
  className?: string;
  sx?: SxProps<Theme>;
  title?: string;
  'aria-label'?: string;
}

const SHAPES = 'path,circle,rect,line,polyline,polygon,ellipse';

export function AnimIcon({ icon: Icon, anim = 'pop', draw = false, idle = false, size = '1em', color, strokeWidth = 1.75, className, sx, title, ...rest }: AnimIconProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // normalise every stroke to length 1 so the draw-in takes the same time for long and short lines
  useLayoutEffect(() => {
    if (!draw || !ref.current) return;
    ref.current.querySelectorAll(SHAPES).forEach((el, i) => {
      el.setAttribute('pathLength', '1');
      (el as SVGElement).style.animationDelay = `${Math.min(i, 6) * 70}ms`;
    });
  }, [draw, Icon]);
  return (
    <Box
      component="span"
      ref={ref}
      role={rest['aria-label'] || title ? 'img' : undefined}
      aria-hidden={rest['aria-label'] || title ? undefined : true}
      aria-label={rest['aria-label'] ?? title}
      title={title}
      className={['ai', `ai-${anim}`, draw && 'ai-draw', idle && 'ai-idle', className].filter(Boolean).join(' ')}
      sx={[{ display: 'inline-flex', width: size, height: size, flexShrink: 0, color, verticalAlign: '-0.18em', lineHeight: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <Icon size="100%" strokeWidth={strokeWidth} />
    </Box>
  );
}
