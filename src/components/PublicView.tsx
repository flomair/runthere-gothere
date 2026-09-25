import { Alert, Box, Button, Card, CircularProgress, Container, Stack, Typography } from '@mui/material';
import L from 'leaflet';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import { cumulativeDistances, splitRoute } from '../../shared/geo';
import { formatDate, formatKm } from '../lib/format';
import { loadPublic } from '../lib/groups';
import type { PublicJourney } from '../lib/types';
import { AnimatedBar, CountUp } from './motion';
import { t } from '../lib/i18n';
import { EMBER, INK } from '../theme';
import HeroSurface from './HeroSurface';

/** Read-only journey page for public share links (no sign-in). */
export default function PublicView({ token }: { token: string }) {
  const [data, setData] = useState<PublicJourney | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadPublic(token).then(setData).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [token]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: { xs: 2, sm: 5 } }}>
      <Container maxWidth="md">
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25, mb: 3 }}>
          <Box component="img" src="/logo.svg" alt="" sx={{ width: 36, height: 36 }} />
          <Typography variant="h6">Run There · Go There</Typography>
        </Stack>
        {error ? (
          <Alert severity="warning">{error}</Alert>
        ) : !data ? (
          <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 8 }} />
        ) : (
          <Stack spacing={2.5} component={motion.div} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <HeroSurface sx={{ p: { xs: 2.5, sm: 4 } }} seed={2}>
              <Typography variant="overline" sx={{ opacity: 0.9 }}>
                {t('{name} is running', { name: data.ownerFirstName })}
              </Typography>
              <Typography variant="h3" component="h1" sx={{ fontSize: { xs: '1.8rem', sm: '2.6rem' } }}>
                {data.from} → {data.to}
              </Typography>
              <Typography sx={{ fontFamily: '"Fraunces", Georgia, serif', fontWeight: 600, fontSize: { xs: '2.4rem', sm: '3.2rem' }, mt: 1 }}>
                <CountUp value={data.doneM / 1000} format={(n) => formatKm(n * 1000, 0)} />{' '}
                <Box component="span" sx={{ fontSize: '1rem', fontWeight: 600, opacity: 0.85 }}>
                  {t('of {km}', { km: formatKm(data.totalM, 0) })}
                </Box>
              </Typography>
              <Box sx={{ my: 1.5 }}>
                <AnimatedBar value={(data.doneM / data.totalM) * 100} color="var(--rtgt-ember)" />
              </Box>
              {data.place && <Typography sx={{ opacity: 0.92 }}>📍 {t('Now near {place}', { place: data.place })}</Typography>}
            </HeroSurface>
            <Card sx={{ overflow: 'hidden', p: 0 }}>
              <PublicMap data={data} />
            </Card>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
              {t('Updated {when} · Map © OpenStreetMap contributors', { when: formatDate(data.updatedAt, { dateStyle: 'medium', timeStyle: 'short' }) })}
            </Typography>
            <Button variant="contained" href="/" sx={{ alignSelf: 'center' }}>
              {t('Start your own journey')}
            </Button>
          </Stack>
        )}
      </Container>
    </Box>
  );
}

function PublicMap({ data }: { data: PublicJourney }) {
  const cum = cumulativeDistances(data.points);
  const scale = cum[cum.length - 1] / data.totalM;
  const { done, ahead } = splitRoute(data.points, cum, data.doneM * scale);
  return (
    <MapContainer bounds={L.latLngBounds(data.points)} boundsOptions={{ padding: [30, 30] }} style={{ height: 420, width: '100%' }}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Polyline positions={ahead} pathOptions={{ color: INK, weight: 3, opacity: 0.6, dashArray: '2 7', lineCap: 'round' }} />
      <Polyline positions={done} pathOptions={{ color: '#fff', weight: 8, opacity: 0.9 }} />
      <Polyline positions={done} pathOptions={{ color: EMBER, weight: 4.5 }} />
      <Marker position={data.position} icon={L.divIcon({ className: '', html: '<div class="rtgt-marker me">🏃</div>', iconSize: [34, 34], iconAnchor: [17, 17] })}>
        <Tooltip permanent direction="top" offset={[0, -18]}>
          {data.ownerFirstName}
        </Tooltip>
      </Marker>
    </MapContainer>
  );
}
