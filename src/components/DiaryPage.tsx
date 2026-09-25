import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoStoriesIcon from '@mui/icons-material/AutoStoriesOutlined';
import PrintIcon from '@mui/icons-material/PrintOutlined';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, IconButton, Stack, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { flag, useActivities, useJourneyStories, useMe, useMilestoneActions, useMilestones } from '../lib/api';
import { formatDate, formatKm } from '../lib/format';
import { navigate } from '../lib/nav';
import { computeProgress } from '../lib/progress';
import type { Journey, Milestone } from '../lib/types';

const KIND_ICON: Record<Milestone['kind'], string> = { waypoint: '📍', distance: '🏃', halfway: '⚖️', border: '🛂', finish: '🏁' };

function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) => (
        <Typography key={i} sx={{ mb: 1.5, lineHeight: 1.75, fontFamily: '"Georgia", "Iowan Old Style", serif', fontSize: '1.05rem' }}>
          {p.replace(/\*/g, '')}
        </Typography>
      ))}
    </>
  );
}

function MilestoneChapter({ m, canWrite }: { m: Milestone; canWrite: boolean }) {
  const { writePostcard } = useMilestoneActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card sx={{ breakInside: 'avoid', overflow: 'hidden' }}>
      {m.photo && (
        <Box sx={{ position: 'relative' }}>
          <Box component="img" src={m.photo.url} alt="" loading="lazy" sx={{ width: '100%', height: { xs: 200, sm: 280 }, objectFit: 'cover', display: 'block' }} />
          {m.photo.credit && (
            <Typography variant="caption" sx={{ position: 'absolute', right: 8, bottom: 6, color: '#fff', textShadow: '0 1px 3px rgb(0 0 0 / 70%)' }}>
              {m.photo.credit}
            </Typography>
          )}
        </Box>
      )}
      <CardContent>
        <Typography variant="overline" color="primary" sx={{ fontWeight: 700 }}>
          {KIND_ICON[m.kind]} {formatDate(m.reachedAt)} · {formatKm(m.atM, 0)}
        </Typography>
        <Typography variant="h5" component="h2" sx={{ mb: 0.5 }}>
          {m.kind === 'border' && m.countryCode ? `${flag(m.countryCode)} ` : ''}
          {m.title}
        </Typography>
        {m.place && (
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {m.place.name}, {m.place.context}
          </Typography>
        )}
        {m.postcard ? (
          <Prose text={m.postcard.text} />
        ) : (
          <Box className="no-print">
            {error && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {error}
              </Alert>
            )}
            <Button
              size="small"
              variant="outlined"
              disabled={!canWrite}
              loading={busy}
              startIcon={<AutoStoriesIcon />}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await writePostcard(m.id);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {canWrite ? 'Write the postcard' : 'Add your AI key to get postcards'}
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

export default function DiaryPage({ journey }: { journey: Journey }) {
  const { data: me } = useMe();
  const milestones = useMilestones(journey.id);
  const stories = useJourneyStories(journey.id);
  const { markSeen } = useMilestoneActions();
  const { data: activities } = useActivities(journey.startDate, !!me?.strava && journey.useStrava);
  const progress = useMemo(() => computeProgress(journey, activities), [journey, activities]);

  useEffect(() => {
    if (milestones.data?.milestones.some((m) => !m.seen)) void markSeen(journey.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones.data]);

  // chapters: milestones in route order; stories slotted in by date
  const items = useMemo(() => {
    const ms = milestones.data?.milestones ?? [];
    const st = (stories.data ?? []).map((s) => ({ type: 'story' as const, at: s.at, key: s.key, text: s.text }));
    const all: ({ type: 'milestone'; at: string; m: Milestone } | { type: 'story'; at: string; key: string; text: string })[] = [
      ...ms.map((m) => ({ type: 'milestone' as const, at: m.reachedAt, m })),
      ...st,
    ];
    return all.sort((a, b) => a.at.localeCompare(b.at));
  }, [milestones.data, stories.data]);

  const countries = milestones.data?.countries ?? [];
  const reachedCountries = new Set([countries[0], ...(milestones.data?.milestones ?? []).filter((m) => m.kind === 'border').map((m) => m.countryCode)]);
  const from = journey.waypoints[0]?.name ?? 'Start';
  const to = journey.waypoints[journey.waypoints.length - 1]?.name ?? 'Finish';

  return (
    <Stack spacing={3} className="diary">
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }} className="no-print">
        <IconButton onClick={() => navigate(`/j/${journey.id}`)} aria-label="back to journey">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Travel diary
        </Typography>
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
          Print / save as PDF
        </Button>
      </Stack>

      <Box sx={{ textAlign: 'center', py: { xs: 2, sm: 4 } }}>
        <Typography variant="overline" color="primary" sx={{ fontWeight: 700 }}>
          A virtual journey on foot
        </Typography>
        <Typography variant="h3" component="h1" sx={{ fontSize: { xs: '2rem', sm: '3rem' } }}>
          {journey.name}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          {from} → {to} · {formatKm(journey.route.totalM, 0)} · since {formatDate(journey.startDate)}
        </Typography>
        {countries.length > 0 && (
          <Stack direction="row" sx={{ justifyContent: 'center', gap: 1, mt: 2, flexWrap: 'wrap' }}>
            {countries.map((c) => (
              <Chip
                key={c}
                label={`${flag(c)} ${new Intl.DisplayNames([navigator.language], { type: 'region' }).of(c) ?? c}`}
                variant={reachedCountries.has(c) ? 'filled' : 'outlined'}
                sx={{ opacity: reachedCountries.has(c) ? 1 : 0.5 }}
              />
            ))}
          </Stack>
        )}
        <Typography sx={{ mt: 2 }}>
          <strong>{formatKm(progress.doneM, 0)}</strong> covered in <strong>{progress.entries.filter((e) => !e.excluded).length}</strong> runs
          {progress.finished && progress.finishedOn ? `, arrived ${formatDate(progress.finishedOn)}` : ''}.
        </Typography>
      </Box>

      {milestones.isLoading || stories.isLoading ? (
        <CircularProgress sx={{ mx: 'auto' }} />
      ) : items.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
          <Typography color="text.secondary">
            The first chapter is written when you reach your first milestone: the next town on the route, 100 km, or a border.
          </Typography>
        </Card>
      ) : (
        <Stack spacing={3}>
          {items.map((it) =>
            it.type === 'milestone' ? (
              <MilestoneChapter key={it.m.id} m={it.m} canWrite={!!me?.ai} />
            ) : (
              <Card key={it.key} variant="outlined" sx={{ breakInside: 'avoid', bgcolor: 'action.hover' }}>
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    📖 Story · {formatDate(it.at)}
                  </Typography>
                  <Divider sx={{ mb: 1.5 }} />
                  <Prose text={it.text} />
                </CardContent>
              </Card>
            ),
          )}
        </Stack>
      )}
    </Stack>
  );
}
