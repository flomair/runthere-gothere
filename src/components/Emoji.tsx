import { Box, type SxProps, type Theme } from '@mui/material';
import { Fragment, type ReactNode } from 'react';

/**
 * Playful objects are drawn with Microsoft Fluent Emoji 3D (public/emoji, MIT), so gifts, trophies
 * and swords look the same on every phone instead of each platform's own emoji font.
 */
export const EMOJI = {
  gift: '🎁', swords: '⚔', trophy: '🏆', medal: '🏅', flag: '🚩', finish: '🏁', bucket: '🪣', runner: '🏃',
  sparkles: '✨', lock: '🔒', crown: '👑', music: '🎵', die: '🎲', clover: '🍀', pin: '📍', gem: '💎',
  ribbon: '🎀', candy: '🍬', question: '❓', party: '🎉', star: '⭐', check: '✅', devil: '😈', eyes: '👀',
  handshake: '🤝', wave: '👋', speech: '💬', package: '📦', postbox: '📮', scale: '⚖', passport: '🛂',
  moneybag: '💰', map: '🗺', book: '📖', sunglasses: '🕶', fire: '🔥', target: '🎯', calendar: '🗓',
  mountain: '🏔', compass: '🧭', camera: '📸', hourglass: '⏳', bell: '🔔', rocket: '🚀', confetti: '🎊',
  flexed: '💪', zap: '⚡', repeat: '🔁', clap: '👏', smile: '🙂', road: '🛣', herb: '🌿', sleep: '😴', bike: '🚴',
} as const;
export type EmojiName = keyof typeof EMOJI;

export const emojiSrc = (name: EmojiName) => `/emoji/${name}.webp`;

/** For HTML strings (map markers). */
export const emojiHtml = (name: EmojiName, size = 20) =>
  `<img src="${emojiSrc(name)}" alt="${EMOJI[name]}" width="${size}" height="${size}" draggable="false" style="display:block;width:${size}px;height:${size}px"/>`;

export function Emoji({ name, size = '1.25em', sx, title }: { name: EmojiName; size?: number | string; sx?: SxProps<Theme>; title?: string }) {
  return (
    <Box
      component="img"
      src={emojiSrc(name)}
      alt={EMOJI[name]}
      title={title}
      draggable={false}
      sx={[{ width: size, height: size, display: 'inline-block', verticalAlign: '-0.22em', flexShrink: 0, userSelect: 'none' }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
}

const BY_CHAR = new Map<string, EmojiName>(Object.entries(EMOJI).map(([k, v]) => [v, k as EmojiName]));
const PATTERN = new RegExp(`(${[...BY_CHAR.keys()].sort((a, b) => b.length - a.length).map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\uFE0F?`, 'gu');

/** Text with the known emoji swapped for the 3D images (others stay as they are). */
export function EmojiText({ text, size = '1.2em' }: { text: string; size?: number | string }): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push(<Emoji key={m.index} name={BY_CHAR.get(m[1])!} size={size} />);
    last = m.index! + m[0].length;
  }
  if (!parts.length) return text;
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}
