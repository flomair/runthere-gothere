import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Box, Button, Card, CardContent, Skeleton, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { LatLon } from '../../shared/geo';
import { useMe, usePhotos, useSurroundings } from '../lib/api';
import type { NarrateRequest } from '../lib/types';
import BookmarkButton from './BookmarkButton';
import NarratorCard from './NarratorCard';
import { Reveal } from './motion';
import PhotoStrip from './PhotoStrip';
import { PlacesList, WeatherBadge, WikipediaList } from './SurroundingsPanel';

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', mb: 1.5 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {title}
          </Typography>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

interface Props {
  journeyId: string;
  point: LatLon;
  /** e.g. "You are here" / "In 25 km" */
  eyebrow: string;
  narrate: Omit<NarrateRequest, 'style' | 'language' | 'lat' | 'lon' | 'photoTitles'>;
}

export default function LocationExplorer({ journeyId, point, eyebrow, narrate }: Props) {
  const { data: me } = useMe();
  const photos = usePhotos(point);
  const env = useSurroundings(point);
  const [lat, lon] = point;
  const place = env.data?.place;

  return (
    <Stack spacing={2}>
      <Card sx={{ overflow: 'hidden' }}>
        <CardContent>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" color="primary" sx={{ fontWeight: 700 }}>
                {eyebrow}
              </Typography>
              {env.isLoading ? (
                <Skeleton width={220} height={40} />
              ) : (
                <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="h4" component="h2" sx={{ lineHeight: 1.15 }}>
                    {place?.name || `${lat.toFixed(3)}, ${lon.toFixed(3)}`}
                  </Typography>
                  <BookmarkButton
                    journeyId={journeyId}
                    size="medium"
                    item={{ kind: 'spot', title: place?.name || `${lat.toFixed(3)}, ${lon.toFixed(3)}`, subtitle: place?.context, url: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`, lat, lon }}
                  />
                </Stack>
              )}
              <Typography color="text.secondary">{place?.context}</Typography>
            </Box>
            {env.isLoading ? <Skeleton variant="rounded" width={220} height={64} /> : <WeatherBadge data={env.data?.weather ?? null} />}
          </Box>
          <Stack direction="row" sx={{ gap: 1, mt: 2, flexWrap: 'wrap' }}>
            <Button size="small" variant="outlined" target="_blank" href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`} endIcon={<OpenInNewIcon fontSize="small" />}>
              Street View
            </Button>
            <Button size="small" variant="outlined" target="_blank" href={`https://www.mapillary.com/app/?lat=${lat}&lng=${lon}&z=16`} endIcon={<OpenInNewIcon fontSize="small" />}>
              Mapillary
            </Button>
            <Button size="small" variant="outlined" target="_blank" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`} endIcon={<OpenInNewIcon fontSize="small" />}>
              Google Maps
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Reveal>
      <Section title="What it looks like">
        <PhotoStrip photos={photos.data?.photos} historic={photos.data?.historic} loading={photos.isLoading} />
      </Section>
      </Reveal>

      <Reveal>
      <NarratorCard
        journeyId={journeyId}
        title={`The story of ${place?.name ?? 'this place'}`}
        request={{ ...narrate, lat, lon, photoTitles: photos.data?.photos.map((p) => p.title) }}
      />
      </Reveal>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'start' }}>
        <Section title="Wikipedia nearby">
          <WikipediaList items={env.data?.wikipedia} loading={env.isLoading} journeyId={journeyId} />
        </Section>
        <Section title="Top places around">
          <PlacesList items={env.data?.places} loading={env.isLoading} enabled={!!me?.features.googlePlaces} point={point} journeyId={journeyId} />
        </Section>
      </Box>
    </Stack>
  );
}
