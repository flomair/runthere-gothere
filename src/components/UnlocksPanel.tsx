import { MusicNoteOutlined as MusicIcon } from '../icons';
import { PlayArrowRounded as PlayIcon } from '../icons';
import { StopRounded as StopIcon } from '../icons';
import { Box, Button, Link, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { songLinks } from '../../shared/rewards';
import { t } from '../lib/i18n';
import { useNarratorSettings } from '../lib/narrator';
import { type Playback, readAloud } from '../lib/readAloud';
import type { Milestone } from '../lib/types';
import Stamp from './Stamp';

/** Read a text aloud with the narrator's voice; the button toggles between play and stop. */
export function ListenButton({ text }: { text: string }) {
  const settings = useNarratorSettings();
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const pb = useRef<Playback | null>(null);
  useEffect(() => () => pb.current?.stop(), []);
  return (
    <Button
      size="small"
      variant="outlined"
      loading={busy}
      startIcon={playing ? <StopIcon /> : <PlayIcon />}
      onClick={async () => {
        if (playing) {
          pb.current?.stop();
          return;
        }
        setBusy(true);
        try {
          const p = await readAloud(text, settings);
          pb.current = p;
          setPlaying(true);
          void p.done.finally(() => setPlaying(false));
        } finally {
          setBusy(false);
        }
      }}
    >
      {playing ? t('Stop') : t('Listen')}
    </Button>
  );
}

/** What reaching a city unlocked: passport stamp, fun fact, a song, and the audio story. */
export default function UnlocksPanel({ m }: { m: Milestone }) {
  const u = m.unlocks;
  if (!u) return null;
  const links = u.song ? songLinks(u.song) : null;
  const story = [m.postcard?.text, u.funFact?.text].filter(Boolean).join('\n\n');
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2, p: 2, borderRadius: '20px', bgcolor: 'action.hover', alignItems: { xs: 'flex-start', sm: 'center' } }}>
      <Box sx={{ flexShrink: 0, alignSelf: 'center' }}>
        <Stamp stamp={u.stamp} size={104} />
      </Box>
      <Stack spacing={1.25} sx={{ minWidth: 0 }}>
        <Typography variant="overline" color="secondary" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
          {t('Unlocked in {place}', { place: u.stamp.label })}
        </Typography>
        {u.funFact && (
          <Typography variant="body2">
            <Box component="span" sx={{ fontWeight: 700 }}>
              {t('Did you know?')}{' '}
            </Box>
            {u.funFact.text}{' '}
            {u.funFact.url && (
              <Link href={u.funFact.url} target="_blank" rel="noreferrer" variant="caption">
                Wikipedia
              </Link>
            )}
          </Typography>
        )}
        {u.song && links && (
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <MusicIcon fontSize="small" color="secondary" />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {u.song.title} – {u.song.artist}
            </Typography>
            <Link href={links.spotify} target="_blank" rel="noreferrer" variant="caption">
              Spotify
            </Link>
            <Link href={links.youtube} target="_blank" rel="noreferrer" variant="caption">
              YouTube Music
            </Link>
            <Link href={links.apple} target="_blank" rel="noreferrer" variant="caption">
              Apple Music
            </Link>
          </Stack>
        )}
        {story && (
          <Box className="no-print">
            <ListenButton text={story} />
          </Box>
        )}
      </Stack>
    </Stack>
  );
}
