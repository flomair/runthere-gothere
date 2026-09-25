import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StarIcon from '@mui/icons-material/Star';
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Link,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import type { LatLon } from '../../shared/geo';
import { describeWeatherCode } from '../../shared/weather';
import { formatKm } from '../lib/format';
import type { SurroundingsResponse } from '../lib/types';

const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : formatKm(m));

export function WeatherBadge({ data }: { data: SurroundingsResponse['weather'] }) {
  if (!data) return null;
  const w = describeWeatherCode(data.weatherCode, data.isDay);
  const localTime = data.time.slice(11, 16);
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
      <Box sx={{ fontSize: 40, lineHeight: 1 }} aria-hidden>
        {w.emoji}
      </Box>
      <Box>
        <Typography variant="h5" component="div" sx={{ lineHeight: 1.1 }}>
          {Math.round(data.temperatureC)}°C
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {w.label} · feels {Math.round(data.apparentC)}° · wind {Math.round(data.windKmh)} km/h
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Local time {localTime}
          {data.today ? ` · ${Math.round(data.today.minC)}–${Math.round(data.today.maxC)}°C today` : ''}
        </Typography>
      </Box>
    </Stack>
  );
}

export function WikipediaList({ items, loading }: { items: SurroundingsResponse['wikipedia'] | undefined; loading: boolean }) {
  if (loading) return <Skeleton variant="rounded" height={160} />;
  if (!items?.length) return <Typography color="text.secondary" variant="body2">No Wikipedia articles within 10 km.</Typography>;
  return (
    <List dense disablePadding>
      {items.slice(0, 6).map((a) => (
        <ListItem key={a.title} disablePadding>
          <ListItemButton component="a" href={a.url} target="_blank" rel="noopener" sx={{ borderRadius: '12px', alignItems: 'flex-start' }}>
            <ListItemAvatar>
              <Avatar variant="rounded" src={a.thumbUrl} sx={{ width: 56, height: 56, mr: 1.5 }}>
                W
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={
                <>
                  {a.title}{' '}
                  <Typography component="span" variant="caption" color="text.secondary">
                    · {km(a.distanceM)}
                  </Typography>
                </>
              }
              secondary={a.extract}
              slotProps={{
                primary: { sx: { fontWeight: 600 } },
                secondary: { sx: { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } },
              }}
            />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}

export function PlacesList({
  items,
  loading,
  enabled,
  point,
}: {
  items: SurroundingsResponse['places'] | undefined;
  loading: boolean;
  enabled: boolean;
  point: LatLon;
}) {
  const mapsSearch = (q: string) => `https://www.google.com/maps/search/${encodeURIComponent(q)}/@${point[0]},${point[1]},14z`;
  if (!enabled) {
    return (
      <Stack spacing={1}>
        <Typography variant="body2" color="text.secondary">
          Set <code>GOOGLE_PLACES_API_KEY</code> to see top-rated places with reviews here. Until then, browse on Google Maps:
        </Typography>
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
          {['Sights', 'Cafés', 'Restaurants', 'Bakeries'].map((q) => (
            <Button key={q} size="small" variant="outlined" href={mapsSearch(q)} target="_blank" endIcon={<OpenInNewIcon fontSize="small" />}>
              {q}
            </Button>
          ))}
        </Stack>
      </Stack>
    );
  }
  if (loading) return <Skeleton variant="rounded" height={160} />;
  if (!items?.length) return <Typography color="text.secondary" variant="body2">No rated places nearby.</Typography>;
  return (
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
      {items.map((p) => (
        <Card key={p.id} variant="outlined">
          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
              <Box sx={{ minWidth: 0 }}>
                <Link href={p.mapsUrl} target="_blank" rel="noopener" underline="hover" sx={{ fontWeight: 600 }} color="inherit">
                  {p.name}
                </Link>
                <Typography variant="caption" color="text.secondary" component="div">
                  {[p.type, km(p.distanceM)].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
              {p.rating != null && (
                <Stack direction="row" sx={{ alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
                  <StarIcon sx={{ color: '#f4b400', fontSize: 18 }} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {p.rating.toFixed(1)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    ({p.ratingCount ?? 0})
                  </Typography>
                </Stack>
              )}
            </Stack>
            {p.review && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                “{p.review.text}” {p.review.author && `— ${p.review.author}`}
                {p.review.when && `, ${p.review.when}`}
              </Typography>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
