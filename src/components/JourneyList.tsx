import { Add as AddIcon } from '../icons';
import { FileDownloadOutlined as DownloadIcon } from '../icons';
import { FileUploadOutlined as UploadIcon } from '../icons';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import { motion } from 'motion/react';
import { useRef, useState } from 'react';
import { navigate } from '../lib/nav';
import { useActivities, useMe, useMilestones } from '../lib/api';
import { formatDate, formatKm, pct } from '../lib/format';
import { computeProgress } from '../lib/progress';
import { journeyStore, useJourneys } from '../lib/storage';
import type { Journey } from '../lib/types';
import NewJourneyDialog, { type JourneyPreset } from './NewJourneyDialog';
import MiniMap from './MiniMap';
import { AnimatedBar, Stagger, StaggerItem } from './motion';
import SharedJourneys from './SharedJourneys';
import PlayStrip from './PlayStrip';
import StravaButton from './StravaButton';
import { InstallBanner } from './InstallPrompt';
import { t } from '../lib/i18n';
import HeroSurface from './HeroSurface';
import { INDIGO, ROUNDED } from '../theme';
import { Emoji } from './Emoji';

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? t('Good night') : h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening');
};

const PRESETS: JourneyPreset[] = [
  { name: 'Berlin → Vienna', from: 'Berlin', to: 'Vienna' },
  { name: 'Munich → Venice', from: 'Munich', to: 'Venice' },
  { name: 'Paris → Barcelona', from: 'Paris', to: 'Barcelona' },
  { name: 'London → Edinburgh', from: 'London', to: 'Edinburgh' },
  { name: 'Camino Francés', from: 'Saint-Jean-Pied-de-Port', to: 'Santiago de Compostela' },
];

function JourneyCard({ journey, connected, newPostcards }: { journey: Journey; connected: boolean; newPostcards: number }) {
  const { data: activities } = useActivities(journey.startDate, connected && journey.useStrava);
  const p = computeProgress(journey, activities);
  const from = journey.waypoints[0]?.name;
  const to = journey.waypoints[journey.waypoints.length - 1]?.name;
  return (
    <Card sx={{ height: '100%', '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 18px 36px -24px rgba(35, 40, 98, 0.35)' } }}>
      <CardActionArea onClick={() => navigate(`/j/${journey.id}`)} sx={{ height: '100%' }}>
        <Box sx={{ m: 1, mb: 0, borderRadius: '14px', overflow: 'hidden', isolation: 'isolate' }}>
          <MiniMap points={journey.route.points} doneM={p.doneM} height={150} />
        </Box>
        <CardContent>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" noWrap>
                {journey.name}
              </Typography>
              {from && to && `${from} → ${to}` !== journey.name && (
                <Typography variant="body2" color="text.secondary" noWrap>
                  {from} → {to}
                </Typography>
              )}
            </Box>
            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
              <Typography sx={{ fontFamily: ROUNDED, fontWeight: 800, fontSize: '1.6rem', lineHeight: 1, color: p.finished ? 'success.main' : 'secondary.main' }}>
                {p.finished ? <Emoji name="finish" size="1em" /> : pct(p.fraction)}
              </Typography>
              {newPostcards > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                  <Emoji name="postbox" /> {t('{n} new', { n: newPostcards })}
                </Typography>
              )}
            </Box>
          </Stack>
          <Box sx={{ my: 1.5 }}>
            <AnimatedBar value={p.fraction * 100} height={4} />
          </Box>
          <Typography variant="body2" color="text.secondary">
            {t('{done} of {total} · since {date}', { done: formatKm(p.doneM, 0), total: formatKm(p.totalM, 0), date: formatDate(journey.startDate) })}
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
  const connected = !!me?.strava;
  const allMilestones = useMilestones();
  const unseenBy = (id: string) => (allMilestones.data?.milestones ?? []).filter((m) => m.journeyId === id && !m.seen).length;

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
      if (!list.every((j) => j.id && j.route?.points?.length)) throw new Error(t('Not a journey export'));
      await journeyStore.import(list);
      setImportError(null);
    } catch (e) {
      setImportError(t('Import failed: {error}', { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  return (
    <Stack spacing={4}>
      <InstallBanner />
      {journeys.length > 0 ? (
        <Stack
          component={motion.section}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          direction="row"
          sx={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', pt: { xs: 1, sm: 2 } }}
        >
          <Box>
            <Typography variant="overline" color="text.secondary">
              {greeting()}
              {me?.user.name ? `, ${me.user.name.split(' ')[0]}` : ''}
            </Typography>
            <Typography variant="h3" component="h1" sx={{ fontSize: { xs: '2rem', sm: '2.6rem' }, lineHeight: 1.05 }}>
              {t('Where to next?')}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            {me?.features.strava && !connected && <StravaButton />}
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ open: true })}>
              {t('New journey')}
            </Button>
          </Stack>
        </Stack>
      ) : (
        <HeroSurface component="section" sx={{ p: { xs: 3, sm: 6 } }}>
          {/* a dotted route that draws itself, echoing the logo */}
          <Box component="svg" viewBox="0 0 400 160" aria-hidden sx={{ position: 'absolute', right: { xs: -60, sm: 24 }, bottom: { xs: 90, sm: 24 }, width: { xs: 260, sm: 380 }, opacity: 0.8, pointerEvents: 'none' }}>
            <motion.path
              d="M10 140 C 80 140, 90 90, 160 90 S 260 110, 290 60 S 360 20, 390 16"
              fill="none"
              stroke="#fff"
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray="2 12"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2.4, ease: 'easeInOut', delay: 0.3 }}
            />
            <circle cx={390} cy={16} r={6} fill="none" stroke="#fff" strokeWidth={2.5} />
          </Box>
          <Box sx={{ position: 'relative' }}>
            <Typography variant="h2" component="h1" sx={{ fontSize: { xs: '2.4rem', sm: '3.8rem' }, lineHeight: 1.02 }}>
              {['Run there.', 'Go there.'].map((w, i) => (
                <Box
                  key={w}
                  component={motion.span}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 + i * 0.18 }}
                  sx={{ display: 'block', opacity: i ? 0.72 : 1 }}
                >
                  {w}
                </Box>
              ))}
            </Typography>
            <Typography
              component={motion.p}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.8 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              sx={{ mt: 2, maxWidth: 520, fontSize: { xs: '1rem', sm: '1.1rem' }, lineHeight: 1.6 }}
            >
              {t("Pick a real route, like Berlin to Vienna. Every Strava run moves you along it. See where you'd be now, what it looks like there, and what's nearby. When you arrive, go there for real.")}
            </Typography>
            <Stack
              component={motion.div}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65, duration: 0.5 }}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{ mt: 3.5 }}
            >
              <Button
                size="large"
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setDialog({ open: true })}
                sx={{ backgroundImage: 'none', bgcolor: '#fff', color: INDIGO, boxShadow: '0 10px 24px -12px rgba(0,0,0,0.35)', '&:hover': { bgcolor: '#fff', filter: 'none' } }}
              >
                {t('Plan a journey')}
              </Button>
              {me?.features.strava && !connected && <StravaButton size="large" />}
            </Stack>
            <Stack direction="row" sx={{ mt: 3, gap: 1, overflowX: 'auto', pb: 0.5, mx: { xs: -3, sm: 0 }, px: { xs: 3, sm: 0 }, flexWrap: { sm: 'wrap' }, scrollbarWidth: 'none' }}>
              {PRESETS.map((p, i) => (
                <Chip
                  key={p.name}
                  component={motion.div}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.8 + i * 0.06 }}
                  label={p.name}
                  onClick={() => setDialog({ open: true, preset: p })}
                  sx={{ flexShrink: 0, bgcolor: 'transparent', color: '#FFFFFF', border: '1px solid rgb(255 255 255 / 22%)', '&:hover': { bgcolor: 'rgb(255 255 255 / 8%)' } }}
                />
              ))}
            </Stack>
          </Box>
        </HeroSurface>
      )}

      {me && !me.features.strava && (
        <Alert severity="info">
          {t("Strava isn't configured on this deployment yet (set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET). You can still add distances manually.")}
        </Alert>
      )}
      {importError && (
        <Alert severity="error" onClose={() => setImportError(null)}>
          {importError}
        </Alert>
      )}

      {me && journeys.length > 0 && <PlayStrip />}

      <SharedJourneys />

      <Box>
        <Stack direction="row" sx={{ alignItems: 'center', mb: 2, gap: 1 }}>
          <Typography variant="h5" sx={{ flexGrow: 1 }} noWrap>
            {t('Your journeys')}
          </Typography>
          <Button size="small" startIcon={<UploadIcon />} onClick={() => fileRef.current?.click()} aria-label="import journeys">
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              {t('Import')}
            </Box>
          </Button>
          <Button size="small" startIcon={<DownloadIcon />} onClick={exportAll} disabled={!journeys.length} aria-label="export journeys">
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              {t('Export')}
            </Box>
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
            <Box
              component="img"
              src="/logo.svg"
              alt=""
              sx={(theme) => ({
                width: 96,
                height: 96,
                mb: 1.5,
                ...theme.applyStyles('dark', { bgcolor: '#fff', borderRadius: '20px', p: '8px' }),
              })}
            />
            <Typography color="text.secondary">
              {t('No journeys yet. Plan one above, or pick one of the suggestions.')}
            </Typography>
          </Card>
        ) : (
          <Stagger sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' } }}>
            {journeys.map((j) => (
              <StaggerItem key={j.id}>
                <JourneyCard journey={j} connected={connected} newPostcards={unseenBy(j.id)} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          {t('Journeys are saved in your account and available on every device you sign in on.')}
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
