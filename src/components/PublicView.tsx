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
            <Box sx={{ borderRadius: { xs: '26px', sm: '32px' }, p: { xs: 2.5, sm: 4 }, color: '#fff', background: 'linear-gradient(135deg, #ff7a3d 0%, #fc4c02 38%, #d9345f 72%, #1d3557 130%)' }}>
              <Typography variant="overline" sx={{ opacity: 0.9 }}>
                {data.ownerFirstName} is running
              </Typography>
              <Typography variant="h3" component="h1" sx={{ fontSize: { xs: '1.8rem', sm: '2.6rem' } }}>
                {data.from} → {data.to}
              </Typography>
              <Typography sx={{ fontWeight: 800, fontSize: { xs: '2.2rem', sm: '3rem' }, mt: 1 }}>
                <CountUp value={data.doneM / 1000} format={(n) => formatKm(n * 1000, 0)} />{' '}
                <Box component="span" sx={{ fontSize: '1rem', fontWeight: 600, opacity: 0.85 }}>
                  of {formatKm(data.totalM, 0)}
                </Box>
              </Typography>
              <Box sx={{ my: 1.5 }}>
                <AnimatedBar value={(data.doneM / data.totalM) * 100} color="linear-gradient(90deg, #ffd3b8, #fff)" />
              </Box>
              {data.place && <Typography sx={{ opacity: 0.92 }}>📍 Now near {data.place}</Typography>}
            </Box>
            <Card sx={{ overflow: 'hidden', p: 0 }}>
              <PublicMap data={data} />
            </Card>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
              Updated {formatDate(data.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })} · Map © OpenStreetMap contributors
            </Typography>
            <Button variant="contained" href="/" sx={{ alignSelf: 'center' }}>
              Start your own journey
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
      <Polyline positions={ahead} pathOptions={{ color: '#1d3557', weight: 4, opacity: 0.55, dashArray: '6 8' }} />
      <Polyline positions={done} pathOptions={{ color: '#fc4c02', weight: 6 }} />
      <Marker position={data.position} icon={L.divIcon({ className: '', html: '<div class="rtgt-marker me">🏃</div>', iconSize: [34, 34], iconAnchor: [17, 17] })}>
        <Tooltip permanent direction="top" offset={[0, -18]}>
          {data.ownerFirstName}
        </Tooltip>
      </Marker>
    </MapContainer>
  );
}
