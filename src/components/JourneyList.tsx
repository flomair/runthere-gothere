import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import UploadIcon from '@mui/icons-material/FileUploadOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { useRef, useState } from 'react';
import { navigate } from '../lib/nav';
import { useActivities, useMe } from '../lib/api';
import { formatDate, formatKm, pct } from '../lib/format';
import { computeProgress } from '../lib/progress';
import { journeyStore, useJourneys } from '../lib/storage';
import type { Journey } from '../lib/types';
import NewJourneyDialog, { type JourneyPreset } from './NewJourneyDialog';
import RouteSketch from './RouteSketch';
import StravaButton from './StravaButton';

const PRESETS: JourneyPreset[] = [
  { name: 'Berlin → Vienna', from: 'Berlin', to: 'Vienna' },
  { name: 'Munich → Venice', from: 'Munich', to: 'Venice' },
  { name: 'Paris → Barcelona', from: 'Paris', to: 'Barcelona' },
  { name: 'London → Edinburgh', from: 'London', to: 'Edinburgh' },
  { name: 'Camino Francés', from: 'Saint-Jean-Pied-de-Port', to: 'Santiago de Compostela' },
];

function JourneyCard({ journey, connected }: { journey: Journey; connected: boolean }) {
  const { data: activities } = useActivities(journey.startDate, connected && journey.useStrava);
  const p = computeProgress(journey, activities);
  const from = journey.waypoints[0]?.name;
  const to = journey.waypoints[journey.waypoints.length - 1]?.name;
  return (
    <Card sx={{ height: '100%' }}>
      <CardActionArea onClick={() => navigate(`/j/${journey.id}`)} sx={{ height: '100%' }}>
        <Box sx={{ px: 2, pt: 2, color: 'text.primary', bgcolor: 'action.hover' }}>
          <RouteSketch points={journey.route.points} doneM={p.doneM} height={130} />
        </Box>
        <CardContent>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" noWrap>
                {journey.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {from && to ? `${from} → ${to}` : journey.route.provider}
              </Typography>
            </Box>
            {p.finished ? <Chip label="Arrived 🎉" color="success" size="small" /> : <Chip label={pct(p.fraction)} size="small" color="primary" />}
          </Stack>
          <LinearProgress variant="determinate" value={p.fraction * 100} sx={{ my: 1.5, height: 8, borderRadius: 4 }} />
          <Typography variant="body2" color="text.secondary">
            {formatKm(p.doneM, 0)} of {formatKm(p.totalM, 0)} · since {formatDate(journey.startDate)}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default function JourneyList() {
  const journeys = useJourneys();
  const { data: me } = useMe();
  const [dialog, setDialog] = useState<{ open: boolean; preset?: JourneyPreset }>({ open: false });
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const connected = !!me?.athlete;

  const exportAll = () => {
    const blob = new Blob([JSON.stringify(journeys, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: 'runthere-gothere-journeys.json',
    });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      const list = (Array.isArray(data) ? data : [data]) as Journey[];
      if (!list.every((j) => j.id && j.route?.points?.length)) throw new Error('Not a journey export');
      journeyStore.import(list);
      setImportError(null);
    } catch (e) {
      setImportError(`Import failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <Stack spacing={4}>
      <Box
        sx={{
          borderRadius: 4,
          p: { xs: 3, sm: 5 },
          color: '#fff',
          background:
            'radial-gradient(circle at 85% 20%, rgb(255 255 255 / 18%), transparent 40%), linear-gradient(135deg, #fc4c02 0%, #d83b01 45%, #1d3557 100%)',
        }}
      >
        <Typography variant="h3" component="h1" sx={{ fontSize: { xs: '2rem', sm: '3rem' } }}>
          Run there. Go there.
        </Typography>
        <Typography sx={{ mt: 1.5, maxWidth: 620, opacity: 0.92, fontSize: { sm: '1.15rem' } }}>
          Pick a real route, like Berlin to Vienna. Every Strava run moves you along it. See where you'd be now,
          what it looks like there, the weather and what's nearby. When you arrive, go there for real.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 3 }}>
          <Button
            size="large"
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDialog({ open: true })}
            sx={{ bgcolor: '#fff', color: '#d83b01', '&:hover': { bgcolor: '#ffe8de' } }}
          >
            Plan a journey
          </Button>
          {me?.features.strava && !connected && (
            <StravaButton size="large" sx={{ bgcolor: 'rgb(0 0 0 / 25%)', color: '#fff', '&:hover': { bgcolor: 'rgb(0 0 0 / 35%)' } }} />
          )}
        </Stack>
        <Stack direction="row" sx={{ mt: 3, flexWrap: 'wrap', gap: 1 }}>
          {PRESETS.map((p) => (
            <Chip
              key={p.name}
              label={p.name}
              onClick={() => setDialog({ open: true, preset: p })}
              sx={{ bgcolor: 'rgb(255 255 255 / 16%)', color: '#fff', '&:hover': { bgcolor: 'rgb(255 255 255 / 28%)' } }}
            />
          ))}
        </Stack>
      </Box>

      {me && !me.features.strava && (
        <Alert severity="info">
          Strava isn't configured on this deployment yet (set <code>STRAVA_CLIENT_ID</code>,{' '}
          <code>STRAVA_CLIENT_SECRET</code> and <code>SESSION_SECRET</code>). You can still add distances manually.
        </Alert>
      )}
      {importError && (
        <Alert severity="error" onClose={() => setImportError(null)}>
          {importError}
        </Alert>
      )}

      <Box>
        <Stack direction="row" sx={{ alignItems: 'center', mb: 2, gap: 1 }}>
          <Typography variant="h5" sx={{ flexGrow: 1 }}>
            Your journeys
          </Typography>
          <Button size="small" startIcon={<UploadIcon />} onClick={() => fileRef.current?.click()}>
            Import
          </Button>
          <Button size="small" startIcon={<DownloadIcon />} onClick={exportAll} disabled={!journeys.length}>
            Export
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = '';
            }}
          />
        </Stack>
        {journeys.length === 0 ? (
          <Card sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
            <Typography color="text.secondary">
              No journeys yet. Plan one above, or pick one of the suggestions.
            </Typography>
          </Card>
        ) : (
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' } }}>
            {journeys.map((j) => (
              <JourneyCard key={j.id} journey={j} connected={connected} />
            ))}
          </Box>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          Journeys are saved in this browser. Use Export / Import to move them to another device.
        </Typography>
      </Box>

      <NewJourneyDialog
        open={dialog.open}
        preset={dialog.preset}
        onClose={() => setDialog({ open: false })}
        stravaConnected={connected}
      />
    </Stack>
  );
}
