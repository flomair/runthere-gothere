import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { Box, type SxProps, type Theme } from '@mui/material';

/**
 * Motion presets for the icons (keyframes in styles.css), in the spirit of Font Awesome's own
 * animations. An icon plays its preset when it, or the button/tab/tile around it, is hovered, and
 * once when its tab gets selected.
 */
export type Anim = 'pop' | 'wiggle' | 'bounce' | 'spin' | 'wave' | 'ring' | 'twinkle' | 'nudge' | 'drop' | 'none';

export interface AnimIconProps {
  icon: IconDefinition;
  anim?: Anim;
  /** Pop in when it appears. */
  enter?: boolean;
  /** Gentle floating loop (for big, decorative icons). */
  idle?: boolean;
  size?: number | string;
  color?: string;
  className?: string;
  sx?: SxProps<Theme>;
  title?: string;
  'aria-label'?: string;
}

/** A Font Awesome glyph as inline SVG in the current text colour (no font or runtime needed). */
export function faSvg(icon: IconDefinition): { viewBox: string; paths: string[] } {
  const [w, h, , , d] = icon.icon;
  return { viewBox: `0 0 ${w} ${h}`, paths: Array.isArray(d) ? d : [d] };
}

export function AnimIcon({ icon, anim = 'pop', enter = false, idle = false, size = '1em', color, className, sx, title, ...rest }: AnimIconProps) {
  const { viewBox, paths } = faSvg(icon);
  const label = rest['aria-label'] ?? title;
  return (
    <Box
      component="span"
      role={label ? 'img' : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      title={title}
      className={['ai', `ai-${anim}`, enter && 'ai-enter', idle && 'ai-idle', className].filter(Boolean).join(' ')}
      sx={[{ display: 'inline-flex', width: size, height: size, flexShrink: 0, color, verticalAlign: '-0.125em', lineHeight: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <svg viewBox={viewBox} fill="currentColor" focusable="false">
        {paths.map((d, i) => (
          // duotone-style second path (rare in the solid set) is drawn lighter
          <path key={i} d={d} opacity={paths.length > 1 && i === 0 ? 0.4 : undefined} />
        ))}
      </svg>
    </Box>
  );
}
