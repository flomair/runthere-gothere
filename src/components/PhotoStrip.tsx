import { Close as CloseIcon } from '../icons';
import { OpenInNew as OpenInNewIcon } from '../icons';
import { Box, Chip, Dialog, IconButton, Link, Skeleton, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useState } from 'react';
import { formatDate, formatKm } from '../lib/format';
import type { Photo } from '../lib/types';
import { t } from '../lib/i18n';

export default function PhotoStrip({ photos: recent, historic, loading }: { photos: Photo[] | undefined; historic?: Photo[]; loading: boolean }) {
  const [open, setOpen] = useState<Photo | null>(null);
  const [era, setEra] = useState<'now' | 'then'>('now');
  const photos = era === 'then' && historic?.length ? historic : recent;
  const eraSwitch = historic && historic.length > 0 && (
    <ToggleButtonGroup size="small" exclusive value={era} onChange={(_, v) => v && setEra(v)} sx={{ mb: 1.5 }}>
      <ToggleButton value="now">{t('Today')}</ToggleButton>
      <ToggleButton value="then">{t('Then ({n} historic)', { n: historic.length })}</ToggleButton>
    </ToggleButtonGroup>
  );

  if (loading) {
    return (
      <Stack direction="row" spacing={1.5} sx={{ overflow: 'hidden' }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" width={240} height={170} sx={{ flexShrink: 0 }} />
        ))}
      </Stack>
    );
  }
  if (!photos?.length) {
    return (
      <Typography color="text.secondary" variant="body2">
        {t('No geotagged photos within 10 km. Try the satellite layer on the map or Street View.')}
      </Typography>
    );
  }

  return (
    <>
      {eraSwitch}
      <Box
        sx={{
          display: 'grid',
          gridAutoFlow: 'column',
          gridAutoColumns: { xs: '78%', sm: '260px' },
          gap: 1.5,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          pb: 1,
        }}
      >
        {photos.map((p) => (
          <Box
            key={p.id}
            component="button"
            onClick={() => setOpen(p)}
            sx={{
              all: 'unset',
              cursor: 'pointer',
              position: 'relative',
              borderRadius: '16px',
              overflow: 'hidden',
              height: 180,
              scrollSnapAlign: 'start',
              bgcolor: 'action.hover',
              '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main' },
              '& img': { transition: 'transform .3s' },
              '&:hover img': { transform: 'scale(1.04)' },
            }}
          >
            <img src={p.thumbUrl} alt={p.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <Box sx={{ position: 'absolute', inset: 'auto 0 0 0', p: 1.25, color: '#fff', background: 'linear-gradient(transparent, rgb(0 0 0 / 75%))' }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                {p.title}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>
                {p.takenAt ? formatDate(p.takenAt, { year: 'numeric', month: 'short' }) : t('date unknown')} ·{' '}
                {t('{km} away', { km: formatKm(p.distanceM) })}
              </Typography>
            </Box>
            <Chip
              size="small"
              label={p.source === 'mapillary' ? t('Street level') : 'Wikimedia'}
              sx={{ position: 'absolute', top: 8, left: 8, bgcolor: 'rgb(0 0 0 / 55%)', color: '#fff', height: 22 }}
            />
          </Box>
        ))}
      </Box>

      <Dialog open={!!open} onClose={() => setOpen(null)} maxWidth="lg" fullWidth>
        {open && (
          <Box sx={{ position: 'relative', bgcolor: '#000' }}>
            <IconButton onClick={() => setOpen(null)} sx={{ position: 'absolute', top: 8, right: 8, color: '#fff', bgcolor: 'rgb(0 0 0 / 40%)' }} aria-label="close">
              <CloseIcon />
            </IconButton>
            <Box component="img" src={open.fullUrl} alt={open.title} sx={{ display: 'block', width: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
            <Box sx={{ p: 2, bgcolor: 'background.paper' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {open.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {[open.takenAt && formatDate(open.takenAt), open.author && t('by {author}', { author: open.author }), open.license].filter(Boolean).join(' · ')}
              </Typography>
              <Link href={open.pageUrl} target="_blank" rel="noopener" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                {t('View on {site}', { site: open.source === 'mapillary' ? 'Mapillary' : 'Wikimedia Commons' })} <OpenInNewIcon fontSize="inherit" />
              </Link>
            </Box>
          </Box>
        )}
      </Dialog>
    </>
  );
}
