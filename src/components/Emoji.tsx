import {
  type IconDefinition,
  faBed,
  faBell,
  faBicycle,
  faBolt,
  faBookOpen,
  faBox,
  faBoxOpen,
  faBullseye,
  faCalendar,
  faCamera,
  faCandyCane,
  faChampagneGlasses,
  faCircleCheck,
  faCircleQuestion,
  faClover,
  faComment,
  faCompass,
  faCrown,
  faDice,
  faDumbbell,
  faEnvelope,
  faEye,
  faFaceGrimace,
  faFaceSmile,
  faFire,
  faFlag,
  faFlagCheckered,
  faGem,
  faGift,
  faGlasses,
  faHand,
  faHandFist,
  faHandshake,
  faHourglassHalf,
  faLeaf,
  faLocationDot,
  faLock,
  faMap,
  faMedal,
  faMountain,
  faMusic,
  faPassport,
  faPersonRunning,
  faPiggyBank,
  faRepeat,
  faRibbon,
  faRoad,
  faRocket,
  faScaleBalanced,
  faStar,
  faThumbsUp,
  faTrophy,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import { Box, type SxProps, type Theme } from '@mui/material';
import { Fragment, type ReactNode } from 'react';
import { type Anim, AnimIcon, faSvg } from './AnimIcon';

/**
 * The playful symbols (gifts, trophies, challenges, the bucket, map markers…): Font Awesome Free
 * solid glyphs in a single colour, with a small motion on hover and a pop-in when they appear.
 * The names match the emoji they replace, and <EmojiText> swaps those emoji inside plain text.
 */
type Spec = { char: string; icon: IconDefinition; anim: Anim };
/** The one accent colour used for standalone symbols. */
export const ACCENT = 'var(--mui-palette-secondary-main)';

export const SPECS = {
  gift: { char: '🎁', icon: faGift, anim: 'wiggle' },
  swords: { char: '⚔', icon: faHandFist, anim: 'wiggle' },
  trophy: { char: '🏆', icon: faTrophy, anim: 'wiggle' },
  medal: { char: '🏅', icon: faMedal, anim: 'wiggle' },
  flag: { char: '🚩', icon: faFlag, anim: 'wave' },
  finish: { char: '🏁', icon: faFlagCheckered, anim: 'wave' },
  bucket: { char: '🪣', icon: faBoxOpen, anim: 'bounce' },
  runner: { char: '🏃', icon: faPersonRunning, anim: 'bounce' },
  sparkles: { char: '✨', icon: faWandMagicSparkles, anim: 'twinkle' },
  lock: { char: '🔒', icon: faLock, anim: 'wiggle' },
  crown: { char: '👑', icon: faCrown, anim: 'bounce' },
  music: { char: '🎵', icon: faMusic, anim: 'bounce' },
  die: { char: '🎲', icon: faDice, anim: 'spin' },
  clover: { char: '🍀', icon: faClover, anim: 'spin' },
  pin: { char: '📍', icon: faLocationDot, anim: 'drop' },
  gem: { char: '💎', icon: faGem, anim: 'twinkle' },
  ribbon: { char: '🎀', icon: faRibbon, anim: 'wiggle' },
  candy: { char: '🍬', icon: faCandyCane, anim: 'wiggle' },
  question: { char: '❓', icon: faCircleQuestion, anim: 'wiggle' },
  party: { char: '🎉', icon: faChampagneGlasses, anim: 'bounce' },
  star: { char: '⭐', icon: faStar, anim: 'twinkle' },
  check: { char: '✅', icon: faCircleCheck, anim: 'pop' },
  devil: { char: '😈', icon: faFaceGrimace, anim: 'wiggle' },
  eyes: { char: '👀', icon: faEye, anim: 'pop' },
  handshake: { char: '🤝', icon: faHandshake, anim: 'bounce' },
  wave: { char: '👋', icon: faHand, anim: 'wiggle' },
  speech: { char: '💬', icon: faComment, anim: 'wiggle' },
  package: { char: '📦', icon: faBox, anim: 'bounce' },
  postbox: { char: '📮', icon: faEnvelope, anim: 'wiggle' },
  scale: { char: '⚖', icon: faScaleBalanced, anim: 'wiggle' },
  passport: { char: '🛂', icon: faPassport, anim: 'drop' },
  moneybag: { char: '💰', icon: faPiggyBank, anim: 'bounce' },
  map: { char: '🗺', icon: faMap, anim: 'pop' },
  book: { char: '📖', icon: faBookOpen, anim: 'pop' },
  sunglasses: { char: '🕶', icon: faGlasses, anim: 'wiggle' },
  fire: { char: '🔥', icon: faFire, anim: 'twinkle' },
  target: { char: '🎯', icon: faBullseye, anim: 'pop' },
  calendar: { char: '🗓', icon: faCalendar, anim: 'pop' },
  mountain: { char: '🏔', icon: faMountain, anim: 'bounce' },
  compass: { char: '🧭', icon: faCompass, anim: 'spin' },
  camera: { char: '📸', icon: faCamera, anim: 'pop' },
  hourglass: { char: '⏳', icon: faHourglassHalf, anim: 'spin' },
  bell: { char: '🔔', icon: faBell, anim: 'ring' },
  rocket: { char: '🚀', icon: faRocket, anim: 'bounce' },
  confetti: { char: '🎊', icon: faChampagneGlasses, anim: 'bounce' },
  flexed: { char: '💪', icon: faDumbbell, anim: 'bounce' },
  zap: { char: '⚡', icon: faBolt, anim: 'twinkle' },
  repeat: { char: '🔁', icon: faRepeat, anim: 'spin' },
  clap: { char: '👏', icon: faThumbsUp, anim: 'bounce' },
  smile: { char: '🙂', icon: faFaceSmile, anim: 'bounce' },
  road: { char: '🛣', icon: faRoad, anim: 'nudge' },
  herb: { char: '🌿', icon: faLeaf, anim: 'wiggle' },
  sleep: { char: '😴', icon: faBed, anim: 'pop' },
  bike: { char: '🚴', icon: faBicycle, anim: 'nudge' },
} satisfies Record<string, Spec>;

export type EmojiName = keyof typeof SPECS;
export const EMOJI = Object.fromEntries(Object.entries(SPECS).map(([k, v]) => [k, v.char])) as Record<EmojiName, string>;

/** Static SVG markup of a symbol, for HTML strings (map markers). */
export function emojiHtml(name: EmojiName, size = 18, color = 'currentColor') {
  const { viewBox, paths } = faSvg(SPECS[name].icon);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}" fill="${color}" style="display:block">${paths.map((d) => `<path d="${d}"/>`).join('')}</svg>`;
}

export function Emoji({
  name,
  size = '1.1em',
  color,
  badge = false,
  draw = true,
  idle = false,
  sx,
  title,
}: {
  name: EmojiName;
  size?: number | string;
  /** Defaults to the accent colour; 'inherit' follows the text. */
  color?: string;
  /** Sit in a softly tinted rounded square, like an app icon. */
  badge?: boolean;
  /** Pop in when it appears. */
  draw?: boolean;
  idle?: boolean;
  /** Ignored (kept for older call sites). */
  strokeWidth?: number;
  sx?: SxProps<Theme>;
  title?: string;
}) {
  const spec = SPECS[name];
  const c = color === 'inherit' ? undefined : (color ?? ACCENT);
  if (badge) {
    const px = typeof size === 'number' ? size : undefined;
    const d = px ? px * 1.8 : '2em';
    return (
      <Box
        component="span"
        sx={[{ width: d, height: d, borderRadius: '30%', display: 'inline-grid', placeItems: 'center', flexShrink: 0, color: c, bgcolor: `color-mix(in srgb, ${c ?? 'currentColor'} 12%, transparent)` }, ...(Array.isArray(sx) ? sx : [sx])]}
      >
        <AnimIcon icon={spec.icon} anim={spec.anim} enter={draw} idle={idle} size={size} title={title} />
      </Box>
    );
  }
  return <AnimIcon icon={spec.icon} anim={spec.anim} enter={draw} idle={idle} size={size} color={c} sx={sx} title={title} />;
}

const BY_CHAR = new Map<string, EmojiName>(Object.entries(EMOJI).map(([k, v]) => [v, k as EmojiName]));
const PATTERN = new RegExp(`(${[...BY_CHAR.keys()].sort((a, b) => b.length - a.length).map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\uFE0F?`, 'gu');

/** Text with the known emoji swapped for the icons (in the text colour; others stay as they are). */
export function EmojiText({ text, size = '1.15em', tinted = false }: { text: string; size?: number | string; tinted?: boolean }): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push(<Emoji key={m.index} name={BY_CHAR.get(m[1])!} size={size} color={tinted ? undefined : 'inherit'} draw={false} />);
    last = m.index! + m[0].length;
  }
  if (!parts.length) return text;
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}
