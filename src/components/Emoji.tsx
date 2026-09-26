import { Box, type SxProps, type Theme } from '@mui/material';
import * as L from 'lucide';
import {
  BedIcon,
  BellIcon,
  BicepsFlexedIcon,
  BikeIcon,
  BookOpenIcon,
  CalendarIcon,
  CameraIcon,
  CandyIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  CloverIcon,
  CompassIcon,
  CrownIcon,
  DicesIcon,
  EyeIcon,
  FlagIcon,
  FlagTriangleRightIcon,
  FlameIcon,
  FootprintsIcon,
  FrownIcon,
  GemIcon,
  GiftIcon,
  GlassesIcon,
  HandIcon,
  HandshakeIcon,
  HourglassIcon,
  LeafIcon,
  LockIcon,
  type LucideIcon,
  MailboxIcon,
  MapIcon,
  MapPinIcon,
  MedalIcon,
  MessageCircleIcon,
  MountainIcon,
  MusicIcon,
  PackageIcon,
  PackageOpenIcon,
  PartyPopperIcon,
  PiggyBankIcon,
  RepeatIcon,
  RibbonIcon,
  RocketIcon,
  RouteIcon,
  ScaleIcon,
  SmileIcon,
  SparklesIcon,
  StampIcon,
  StarIcon,
  SwordsIcon,
  TargetIcon,
  ThumbsUpIcon,
  TrophyIcon,
  ZapIcon,
} from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { type Anim, AnimIcon } from './AnimIcon';

/**
 * The playful symbols (gifts, trophies, swords, the bucket, map markers…): minimal Lucide line
 * icons that draw themselves in and move on hover, each with its own accent colour. The names
 * match the emoji they replace, and <EmojiText> swaps those emoji inside plain text.
 */
type Spec = { char: string; icon: LucideIcon; node: L.IconNode; anim: Anim; tone: string };
const INK = 'var(--mui-palette-text-primary)';
const S = (char: string, icon: LucideIcon, node: L.IconNode, anim: Anim, tone: string): Spec => ({ char, icon, node, anim, tone });

export const SPECS = {
  gift: S('🎁', GiftIcon, L.Gift, 'wiggle', '#A259E8'),
  swords: S('⚔', SwordsIcon, L.Swords, 'wiggle', '#7B5CF0'),
  trophy: S('🏆', TrophyIcon, L.Trophy, 'wiggle', '#D9A21B'),
  medal: S('🏅', MedalIcon, L.Medal, 'wiggle', '#D9A21B'),
  flag: S('🚩', FlagTriangleRightIcon, L.FlagTriangleRight, 'wave', '#E0457B'),
  finish: S('🏁', FlagIcon, L.Flag, 'wave', '#149A80'),
  bucket: S('🪣', PackageOpenIcon, L.PackageOpen, 'bounce', '#D65DB1'),
  runner: S('🏃', FootprintsIcon, L.Footprints, 'bounce', '#5B5BF0'),
  sparkles: S('✨', SparklesIcon, L.Sparkles, 'twinkle', '#E8B03A'),
  lock: S('🔒', LockIcon, L.Lock, 'wiggle', '#8A8EB0'),
  crown: S('👑', CrownIcon, L.Crown, 'bounce', '#E8B03A'),
  music: S('🎵', MusicIcon, L.Music, 'bounce', '#5B5BF0'),
  die: S('🎲', DicesIcon, L.Dices, 'spin', '#5B5BF0'),
  clover: S('🍀', CloverIcon, L.Clover, 'spin', '#149A80'),
  pin: S('📍', MapPinIcon, L.MapPin, 'drop', '#E0457B'),
  gem: S('💎', GemIcon, L.Gem, 'twinkle', '#3F7CF6'),
  ribbon: S('🎀', RibbonIcon, L.Ribbon, 'wiggle', '#D65DB1'),
  candy: S('🍬', CandyIcon, L.Candy, 'wiggle', '#149A80'),
  question: S('❓', CircleHelpIcon, L.CircleHelp, 'wiggle', '#E0457B'),
  party: S('🎉', PartyPopperIcon, L.PartyPopper, 'bounce', '#D65DB1'),
  star: S('⭐', StarIcon, L.Star, 'twinkle', '#E8B03A'),
  check: S('✅', CircleCheckIcon, L.CircleCheck, 'pop', '#149A80'),
  devil: S('😈', FrownIcon, L.Frown, 'wiggle', '#C2477A'),
  eyes: S('👀', EyeIcon, L.Eye, 'pop', '#5B5BF0'),
  handshake: S('🤝', HandshakeIcon, L.Handshake, 'bounce', '#149A80'),
  wave: S('👋', HandIcon, L.Hand, 'wiggle', '#E8B03A'),
  speech: S('💬', MessageCircleIcon, L.MessageCircle, 'wiggle', '#5B5BF0'),
  package: S('📦', PackageIcon, L.Package, 'bounce', '#8C5A3C'),
  postbox: S('📮', MailboxIcon, L.Mailbox, 'wiggle', '#E0457B'),
  scale: S('⚖', ScaleIcon, L.Scale, 'wiggle', '#5B5BF0'),
  passport: S('🛂', StampIcon, L.Stamp, 'drop', '#3D6FA8'),
  moneybag: S('💰', PiggyBankIcon, L.PiggyBank, 'bounce', '#149A80'),
  map: S('🗺', MapIcon, L.Map, 'pop', '#149A80'),
  book: S('📖', BookOpenIcon, L.BookOpen, 'pop', '#5B5BF0'),
  sunglasses: S('🕶', GlassesIcon, L.Glasses, 'wiggle', INK),
  fire: S('🔥', FlameIcon, L.Flame, 'twinkle', '#E8702A'),
  target: S('🎯', TargetIcon, L.Target, 'pop', '#E0457B'),
  calendar: S('🗓', CalendarIcon, L.Calendar, 'pop', '#5B5BF0'),
  mountain: S('🏔', MountainIcon, L.Mountain, 'bounce', '#3D6FA8'),
  compass: S('🧭', CompassIcon, L.Compass, 'spin', '#5B5BF0'),
  camera: S('📸', CameraIcon, L.Camera, 'pop', '#5B5BF0'),
  hourglass: S('⏳', HourglassIcon, L.Hourglass, 'spin', '#C98A12'),
  bell: S('🔔', BellIcon, L.Bell, 'ring', '#E8B03A'),
  rocket: S('🚀', RocketIcon, L.Rocket, 'bounce', '#7B5CF0'),
  confetti: S('🎊', PartyPopperIcon, L.PartyPopper, 'bounce', '#D65DB1'),
  flexed: S('💪', BicepsFlexedIcon, L.BicepsFlexed, 'bounce', '#E8702A'),
  zap: S('⚡', ZapIcon, L.Zap, 'twinkle', '#E8B03A'),
  repeat: S('🔁', RepeatIcon, L.Repeat, 'spin', '#5B5BF0'),
  clap: S('👏', ThumbsUpIcon, L.ThumbsUp, 'bounce', '#5B5BF0'),
  smile: S('🙂', SmileIcon, L.Smile, 'bounce', '#149A80'),
  road: S('🛣', RouteIcon, L.Route, 'nudge', '#5B5BF0'),
  herb: S('🌿', LeafIcon, L.Leaf, 'wiggle', '#5C7A29'),
  sleep: S('😴', BedIcon, L.Bed, 'pop', '#8A94A3'),
  bike: S('🚴', BikeIcon, L.Bike, 'nudge', '#3D6FA8'),
} satisfies Record<string, Spec>;

export type EmojiName = keyof typeof SPECS;
export const EMOJI = Object.fromEntries(Object.entries(SPECS).map(([k, v]) => [k, v.char])) as Record<EmojiName, string>;
export const emojiTone = (name: EmojiName) => SPECS[name].tone;

/** Static SVG markup of a symbol, for HTML strings (map markers). */
export function emojiHtml(name: EmojiName, size = 20, color = 'currentColor', strokeWidth = 2) {
  const inner = SPECS[name].node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" style="display:block">${inner}</svg>`;
}

export function Emoji({
  name,
  size = '1.2em',
  color,
  badge = false,
  draw = true,
  idle = false,
  strokeWidth,
  sx,
  title,
}: {
  name: EmojiName;
  size?: number | string;
  /** Defaults to the symbol's accent colour; 'inherit' follows the text. */
  color?: string;
  /** Sit in a softly tinted circle, like an app icon. */
  badge?: boolean;
  draw?: boolean;
  idle?: boolean;
  strokeWidth?: number;
  sx?: SxProps<Theme>;
  title?: string;
}) {
  const spec = SPECS[name];
  const c = color === 'inherit' ? undefined : (color ?? spec.tone);
  const px = typeof size === 'number' ? size : undefined;
  const sw = strokeWidth ?? (px && px >= 40 ? 1.5 : 1.9);
  if (badge) {
    const d = px ? px * 1.75 : '2.1em';
    return (
      <Box
        component="span"
        sx={[{ width: d, height: d, borderRadius: '32%', display: 'inline-grid', placeItems: 'center', flexShrink: 0, color: c, bgcolor: `color-mix(in srgb, ${c ?? 'currentColor'} 13%, transparent)` }, ...(Array.isArray(sx) ? sx : [sx])]}
      >
        <AnimIcon icon={spec.icon} anim={spec.anim} draw={draw} idle={idle} size={size} strokeWidth={sw} title={title} />
      </Box>
    );
  }
  return <AnimIcon icon={spec.icon} anim={spec.anim} draw={draw} idle={idle} size={size} color={c} strokeWidth={sw} sx={sx} title={title} />;
}

const BY_CHAR = new Map<string, EmojiName>(Object.entries(EMOJI).map(([k, v]) => [v, k as EmojiName]));
const PATTERN = new RegExp(`(${[...BY_CHAR.keys()].sort((a, b) => b.length - a.length).map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\uFE0F?`, 'gu');

/** Text with the known emoji swapped for the line icons (in the text colour; others stay as they are). */
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
