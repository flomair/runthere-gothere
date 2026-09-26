import { OpenInNew as OpenInNewIcon } from '../icons';
import { Star as StarIcon } from '../icons';
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
import BookmarkButton from './BookmarkButton';
import { locale, t } from '../lib/i18n';
import { HIGHLIGHT } from '../theme';

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
          {t(w.label)} · {t('feels {c}°', { c: Math.round(data.apparentC) })} · {t('wind {v} km/h', { v: Math.round(data.windKmh) })}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('Local time {time}', { time: localTime })}
          {data.today ? ` · ${t('{min}–{max}°C today', { min: Math.round(data.today.minC), max: Math.round(data.today.maxC) })}` : ''}
        </Typography>
      </Box>
    </Stack>
  );
}

export function WikipediaList({ items, loading, journeyId }: { items: SurroundingsResponse['wikipedia'] | undefined; loading: boolean; journeyId?: string }) {
  if (loading) return <Skeleton variant="rounded" height={160} />;
  if (!items?.length) return <Typography color="text.secondary" variant="body2">{t('No Wikipedia articles within 10 km.')}</Typography>;
  return (
    <List dense disablePadding>
      {items.slice(0, 6).map((a) => (
        <ListItem
          key={a.title}
          disablePadding
          secondaryAction={
            journeyId && a.lat != null && a.lon != null ? (
              <BookmarkButton journeyId={journeyId} item={{ kind: 'wiki', title: a.title, subtitle: a.extract.slice(0, 200), url: a.url, lat: a.lat, lon: a.lon }} />
            ) : undefined
          }
        >
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
  journeyId,
}: {
  items: SurroundingsResponse['places'] | undefined;
  loading: boolean;
  enabled: boolean;
  point: LatLon;
  journeyId?: string;
}) {
  const mapsSearch = (q: string) => `https://www.google.com/maps/search/${encodeURIComponent(q)}/@${point[0]},${point[1]},14z`;
  if (!enabled) {
    return (
      <Stack spacing={1}>
        <Typography variant="body2" color="text.secondary">
          {t('Set GOOGLE_PLACES_API_KEY to see top-rated places with reviews here. Until then, browse on Google Maps:')}
        </Typography>
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
          {['Sights', 'Cafés', 'Restaurants', 'Bakeries'].map((q) => (
            <Button key={q} size="small" variant="outlined" href={mapsSearch(q)} target="_blank" endIcon={<OpenInNewIcon fontSize="small" />}>
              {t(q)}
            </Button>
          ))}
        </Stack>
      </Stack>
    );
  }
  if (loading) return <Skeleton variant="rounded" height={160} />;
  if (!items?.length) return <Typography color="text.secondary" variant="body2">{t('No rated places nearby.')}</Typography>;
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
              <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              {p.rating != null && (
                <Stack direction="row" sx={{ alignItems: 'center', gap: 0.25 }}>
                  <StarIcon sx={{ color: HIGHLIGHT, fontSize: 18 }} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {p.rating.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    ({p.ratingCount ?? 0})
                  </Typography>
                </Stack>
              )}
              {journeyId && p.lat != null && p.lon != null && (
                <BookmarkButton journeyId={journeyId} item={{ kind: 'place', title: p.name, subtitle: p.type, url: p.mapsUrl, lat: p.lat, lon: p.lon }} />
              )}
              </Stack>
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
