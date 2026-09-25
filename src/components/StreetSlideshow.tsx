import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { Box, CircularProgress, Dialog, IconButton, Link, Stack, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { type LatLon, positionAt } from '../../shared/geo';
import { api } from '../lib/api';
import { formatDate, formatKm } from '../lib/format';
import { useT } from '../lib/i18n';
import type { Photo } from '../lib/types';

export type SlideRange = 'last' | 'next';

const STRETCH_M = 10_000;
const FRAMES = 20;
const SLIDE_MS = 4500;

interface Props {
  open: boolean;
  onClose: () => void;
  points: LatLon[];
  cum: number[];
  /** Distance covered, in route metres. */
  doneM: number;
  /** Journey length as shown elsewhere (route geometry can differ slightly). */
  journeyM: number;
  title: string;
}

/** Evenly spaced route positions for a range, in route metres. */
export function slidePositions(range: SlideRange, doneM: number, totalM: number, stretchM = STRETCH_M, count = FRAMES): number[] {
  const [from, to] = range === 'last' ? [Math.max(0, doneM - stretchM), doneM] : [doneM, Math.min(totalM, doneM + stretchM)];
  if (to - from < 1) return [from];
  return Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1));
}

interface Frame {
  atM: number;
  photo: Photo;
}

export default function StreetSlideshow({ open, onClose, points, cum, doneM, journeyM, title }: Props) {
  const t = useT();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const totalM = cum[cum.length - 1] ?? 0;
  const [range, setRange] = useState<SlideRange>(doneM > 0 ? 'last' : 'next');
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);

  const positions = useMemo(() => slidePositions(range, doneM, totalM, (STRETCH_M * totalM) / Math.max(1, journeyM)), [range, doneM, totalM, journeyM]);
  const q = useQuery({
    queryKey: ['along', range, Math.round(positions[0]), Math.round(positions[positions.length - 1])],
    enabled: open,
    staleTime: 6 * 3600_000,
    queryFn: async () => {
      const pts = positions.map((m) => positionAt(points, cum, m).point.map((v) => Math.round(v * 1e5) / 1e5));
      const r = await api<{ frames: { i: number; photo: Photo | null }[] }>('/api/photos/along', { method: 'POST', json: { points: pts } });
      return r.frames.filter((f) => f.photo).map((f) => ({ atM: positions[f.i], photo: f.photo! })) as Frame[];
    },
  });
  const frames = q.data ?? [];
  const frame = frames[Math.min(idx, frames.length - 1)];

  useEffect(() => setIdx(0), [range]);

  // auto-advance; preload the next image so the crossfade never shows a blank
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const next = frames[(idx + 1) % frames.length];
    const img = new Image();
    img.src = next.photo.fullUrl;
    const id = setTimeout(() => setIdx((i) => (i + 1 < frames.length ? i + 1 : (setPlaying(false), i))), SLIDE_MS);
    return () => clearTimeout(id);
  }, [playing, idx, frames]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(frames.length - 1, i + 1));
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
      else if (e.key === ' ') setPlaying((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, frames.length]);

  const km = (m: number) => formatKm((m / Math.max(1, totalM)) * journeyM);
  const glass = { bgcolor: 'rgb(0 0 0 / 50%)', backdropFilter: 'blur(8px)', color: '#fff' } as const;

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="lg" slotProps={{ paper: { sx: { bgcolor: '#000', height: fullScreen ? '100%' : '85vh', overflow: 'hidden' } } }}>
      <Box sx={{ position: 'relative', flex: 1, minHeight: 0, color: '#fff' }}>
        <AnimatePresence initial={false}>
          {frame && (
            <motion.div key={frame.photo.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9 }} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
              {/* slow Ken Burns drift */}
              <motion.img
                src={frame.photo.fullUrl}
                alt={frame.photo.title}
                initial={{ scale: 1.02, x: 0 }}
                animate={{ scale: 1.1, x: idx % 2 ? -18 : 18 }}
                transition={{ duration: SLIDE_MS / 1000 + 1.5, ease: 'linear' }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {q.isLoading && (
          <Stack sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress color="inherit" />
            <Typography>{t('Collecting photos along the route…')}</Typography>
          </Stack>
        )}
        {!q.isLoading && frames.length === 0 && (
          <Stack sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', p: 4, textAlign: 'center' }}>
            <Typography variant="h6">{q.error ? t('Could not load photos') : t('No photos along this stretch yet')}</Typography>
            <Typography sx={{ opacity: 0.75 }}>{q.error ? q.error.message : t('Try the other stretch, or look again when you are further along.')}</Typography>
          </Stack>
        )}

        {/* top bar */}
        <Stack direction="row" sx={{ position: 'absolute', top: 10, left: 10, right: 10, gap: 1, alignItems: 'flex-start' }}>
          <Box sx={{ ...glass, px: 1.5, py: 0.75, borderRadius: '14px', minWidth: 0, flexGrow: 1, maxWidth: 520 }}>
            <Typography variant="overline" sx={{ lineHeight: 1.4, opacity: 0.8, display: 'block' }}>
              {t('Along the route')} · {title}
            </Typography>
            {frame ? (
              <>
                <Typography sx={{ fontWeight: 700, lineHeight: 1.25 }}>
                  {km(frame.atM)}
                  {frame.photo.takenAt ? ` · ${formatDate(frame.photo.takenAt, { year: 'numeric', month: 'short' })}` : ''}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.85, display: 'block' }} noWrap>
                  <Link href={frame.photo.pageUrl} target="_blank" rel="noopener" color="inherit" underline="hover">
                    {frame.photo.source === 'mapillary' ? 'Mapillary' : 'Wikimedia Commons'}
                    {frame.photo.author ? ` · ${frame.photo.author}` : ''}
                    {frame.photo.license ? ` · ${frame.photo.license}` : ''}
                  </Link>
                </Typography>
              </>
            ) : null}
          </Box>
          <IconButton onClick={onClose} aria-label={t('Close')} sx={{ ...glass, '&:hover': { bgcolor: 'rgb(0 0 0 / 70%)' } }}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {/* side arrows */}
        {frames.length > 1 && (
          <>
            <IconButton aria-label={t('Previous')} onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} sx={{ ...glass, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', '&.Mui-disabled': { opacity: 0.3, color: '#fff' } }}>
              <ChevronLeftIcon />
            </IconButton>
            <IconButton aria-label={t('Next')} onClick={() => setIdx((i) => Math.min(frames.length - 1, i + 1))} disabled={idx >= frames.length - 1} sx={{ ...glass, position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', '&.Mui-disabled': { opacity: 0.3, color: '#fff' } }}>
              <ChevronRightIcon />
            </IconButton>
          </>
        )}

        {/* bottom bar: progress segments, play, range */}
        <Box sx={{ ...glass, position: 'absolute', left: { xs: 8, sm: 16 }, right: { xs: 8, sm: 16 }, bottom: { xs: 8, sm: 16 }, p: 1.25, borderRadius: '18px' }}>
          <Stack direction="row" sx={{ gap: 0.5, mb: 1 }}>
            {frames.map((f, i) => (
              <Box key={f.photo.id} onClick={() => setIdx(i)} sx={{ flex: 1, height: 4, borderRadius: 2, bgcolor: 'rgb(255 255 255 / 30%)', overflow: 'hidden', cursor: 'pointer' }}>
                <Box
                  key={i === idx ? `on-${idx}-${playing}` : 'off'}
                  component={motion.div}
                  initial={{ width: i < idx ? '100%' : '0%' }}
                  animate={{ width: i < idx ? '100%' : i === idx ? (playing ? '100%' : '50%') : '0%' }}
                  transition={{ duration: i === idx && playing ? SLIDE_MS / 1000 : 0.2, ease: 'linear' }}
                  sx={{ height: '100%', bgcolor: 'primary.main' }}
                />
              </Box>
            ))}
          </Stack>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <IconButton aria-label={playing ? t('Pause') : t('Play')} onClick={() => (idx >= frames.length - 1 ? (setIdx(0), setPlaying(true)) : setPlaying((p) => !p))} disabled={frames.length < 2} sx={{ color: '#fff', bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}>
              {playing ? <PauseIcon /> : <PlayArrowIcon />}
            </IconButton>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={range}
              onChange={(_, v) => v && setRange(v)}
              sx={{ '& .MuiToggleButton-root': { color: 'rgb(255 255 255 / 75%)', borderColor: 'rgb(255 255 255 / 25%)', py: 0.25 }, '& .Mui-selected': { color: '#fff !important', bgcolor: 'rgb(252 76 2 / 55%) !important' } }}
            >
              <ToggleButton value="last" disabled={doneM <= 0}>
                {t('Last 10 km')}
              </ToggleButton>
              <ToggleButton value="next" disabled={doneM >= totalM}>
                {t('Next 10 km')}
              </ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" sx={{ opacity: 0.75, ml: 'auto' }}>
              {frames.length ? `${Math.min(idx + 1, frames.length)} / ${frames.length}` : ''}
            </Typography>
          </Stack>
        </Box>
      </Box>
    </Dialog>
  );
}
