import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import L from 'leaflet';
import { useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import { simplifyToMax } from '../../shared/geo';
import { useBookmarks } from '../lib/api';
import { formatDate } from '../lib/format';
import { navigate } from '../lib/nav';
import type { Bookmark, Journey } from '../lib/types';
import { Reveal, Stagger, StaggerItem } from './motion';
import { t } from '../lib/i18n';

const KIND_ICON: Record<Bookmark['kind'], string> = { wiki: '📖', place: '⭐', spot: '📍' };

const pin = (html: string) => L.divIcon({ className: '', html: `<div class="rtgt-marker start">${html}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
const GOAL = L.divIcon({ className: '', html: '<div class="rtgt-marker goal">🏁</div>', iconSize: [34, 34], iconAnchor: [17, 17] });

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const daysUntil = (ymd: string) => Math.ceil((new Date(`${ymd}T00:00:00`).getTime() - Date.now()) / 86_400_000);

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/** KML with the route and every saved place; opens in Google Maps / Earth, Organic Maps, OsmAnd … */
export function buildKml(journey: Journey, bookmarks: Bookmark[]): string {
  const line = simplifyToMax(journey.route.points, 5000)
    .map(([lat, lon]) => `${lon.toFixed(5)},${lat.toFixed(5)}`)
    .join(' ');
  const marks = bookmarks
    .map(
      (b) => `    <Placemark>
      <name>${esc(`${KIND_ICON[b.kind]} ${b.title}`)}</name>
      <description>${esc([b.subtitle, b.url].filter(Boolean).join('\n'))}</description>
      <Point><coordinates>${b.lon},${b.lat}</coordinates></Point>
    </Placemark>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(journey.name)}</name>
    <Style id="route"><LineStyle><color>ff024cfc</color><width>4</width></LineStyle></Style>
    <Placemark>
      <name>${esc(journey.name)}</name>
      <styleUrl>#route</styleUrl>
      <LineString><tessellate>1</tessellate><coordinates>${line}</coordinates></LineString>
    </Placemark>
${marks}
  </Document>
</kml>
`;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button variant="outlined" href={href} target="_blank" rel="noopener" endIcon={<OpenInNewIcon fontSize="small" />} sx={{ justifyContent: 'space-between' }}>
      {children}
    </Button>
  );
}

export default function TripPage({ journey }: { journey: Journey }) {
  const bm = useBookmarks(journey.id);
  const bookmarks = bm.data ?? [];
  const dest = journey.waypoints[journey.waypoints.length - 1];
  const destName = dest?.name ?? t('your destination');
  const [dlat, dlon] = dest ? [dest.lat, dest.lon] : journey.route.points[journey.route.points.length - 1];
  const event = journey.event;
  // arrive the day before the race and leave the day after; otherwise a weekend four weeks out
  const checkin = event ? addDays(event.date, -1) : iso(new Date(Date.now() + 28 * 86_400_000));
  const checkout = event ? addDays(event.date, 1) : addDays(checkin, 2);
  const q = encodeURIComponent(destName);
  const route = useMemo(() => simplifyToMax(journey.route.points, 1500), [journey.route.points]);
  const bounds = useMemo(() => L.latLngBounds([...route, ...bookmarks.map((b) => [b.lat, b.lon] as [number, number])]), [route, bookmarks]);

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <IconButton onClick={() => navigate(`/j/${journey.id}`)} aria-label="back to journey">
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" color="primary" sx={{ fontWeight: 700 }}>
            {t('Go there')}
          </Typography>
          <Typography variant="h4" component="h1" sx={{ lineHeight: 1.1 }}>
            {t('Plan the real trip to {place}', { place: destName })}
          </Typography>
        </Box>
      </Stack>

      <Stagger>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'start' }}>
          <StaggerItem>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {event ? t('🏅 The race') : t('🗓️ When')}
                </Typography>
                {event ? (
                  <Stack spacing={1}>
                    <Typography sx={{ fontWeight: 700, fontSize: '1.2rem' }}>{event.name}</Typography>
                    <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Chip label={formatDate(event.date)} />
                      {daysUntil(event.date) >= 0 && <Chip color="primary" label={daysUntil(event.date) === 0 ? t('Race day!') : t('in {n} days', { n: daysUntil(event.date) })} />}
                    </Stack>
                    {event.url && (
                      <Box>
                        <LinkButton href={event.url}>{t('Race website')}</LinkButton>
                      </Box>
                    )}
                    <Typography variant="body2" color="text.secondary">
                      {t('Stay suggestion: {from} – {to}', { from: formatDate(checkin), to: formatDate(checkout) })}
                    </Typography>
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {t('No race set. Add one under Goals to see a countdown and matching travel dates. The links below use a weekend four weeks from now.')}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </StaggerItem>

          <StaggerItem>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1.5 }}>
                  {t('🚆 Getting there & staying')}
                </Typography>
                <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                  <LinkButton href={`https://www.google.com/maps/dir/?api=1&destination=${dlat},${dlon}&travelmode=transit`}>{t('Train & bus')}</LinkButton>
                  <LinkButton href={`https://www.google.com/travel/flights?q=${encodeURIComponent(`flights to ${destName} on ${checkin}`)}`}>{t('Flights')}</LinkButton>
                  <LinkButton href={`https://www.booking.com/searchresults.html?ss=${q}&checkin=${checkin}&checkout=${checkout}&group_adults=1`}>Booking.com</LinkButton>
                  <LinkButton href={`https://www.airbnb.com/s/${q}/homes?checkin=${checkin}&checkout=${checkout}&adults=1`}>Airbnb</LinkButton>
                </Box>
              </CardContent>
            </Card>
          </StaggerItem>
        </Box>
      </Stagger>

      <Reveal>
        <Card sx={{ overflow: 'hidden' }}>
          <CardContent sx={{ pb: 1 }}>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="h6" sx={{ flexGrow: 1 }}>
                🔖 {t('Saved places')} {bookmarks.length > 0 && <Chip size="small" label={bookmarks.length} sx={{ ml: 0.5 }} />}
              </Typography>
              <Button startIcon={<DownloadIcon />} onClick={() => download(`${journey.name.replace(/[^\w-]+/g, '_')}.kml`, buildKml(journey, bookmarks), 'application/vnd.google-earth.kml+xml')}>
                {t('KML for Google My Maps')}
              </Button>
            </Stack>
          </CardContent>
          <MapContainer bounds={bounds} boundsOptions={{ padding: [30, 30] }} style={{ height: 380, width: '100%' }} scrollWheelZoom={false}>
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Polyline positions={route} pathOptions={{ color: '#fc4c02', weight: 4, opacity: 0.8 }} />
            <Marker position={[dlat, dlon]} icon={GOAL} />
            {bookmarks.map((b) => (
              <Marker key={b.id} position={[b.lat, b.lon]} icon={pin(KIND_ICON[b.kind])}>
                <Tooltip direction="top" offset={[0, -12]}>
                  {b.title}
                </Tooltip>
              </Marker>
            ))}
          </MapContainer>
          <CardContent>
            {bm.error && <Alert severity="error">{t('Could not load saved places: {error}', { error: bm.error.message })}</Alert>}
            {bm.isLoading ? (
              <Skeleton variant="rounded" height={120} />
            ) : bookmarks.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('Nothing saved yet. In Explore, tap the bookmark icon next to a place, a Wikipedia article or the spot itself, and it appears here for the real trip.')}
              </Typography>
            ) : (
              <List dense disablePadding>
                {bookmarks.map((b) => (
                  <ListItem
                    key={b.id}
                    disablePadding
                    secondaryAction={
                      <IconButton edge="end" aria-label={`remove ${b.title}`} onClick={() => bm.remove(b.id)}>
                        <DeleteOutlinedIcon />
                      </IconButton>
                    }
                  >
                    <ListItemButton component="a" href={b.url ?? `https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lon}`} target="_blank" rel="noopener" sx={{ borderRadius: '12px' }}>
                      <Box sx={{ fontSize: 22, mr: 1.5 }} aria-hidden>
                        {KIND_ICON[b.kind]}
                      </Box>
                      <ListItemText
                        primary={b.title}
                        secondary={b.subtitle}
                        slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { sx: { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } } }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      </Reveal>
    </Stack>
  );
}
