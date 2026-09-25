import SportsIcon from '@mui/icons-material/SportsScore';
import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, lang, realLocation, useCoachPlan, useMe } from '../lib/api';
import { formatDate } from '../lib/format';
import type { CoachPlan, WorkoutType } from '../lib/types';
import { CountUp, Stagger, StaggerItem } from './motion';
import { t } from '../lib/i18n';

const LOOK: Record<WorkoutType, { emoji: string; color: string; label: string }> = {
  easy: { emoji: '🙂', color: '#1F8F83', label: 'Easy' },
  long: { emoji: '🛣️', color: '#EF5A28', label: 'Long' },
  tempo: { emoji: '⚡', color: '#C2477A', label: 'Tempo' },
  intervals: { emoji: '🔁', color: '#7A5AC8', label: 'Intervals' },
  recovery: { emoji: '🌿', color: '#5C7A29', label: 'Recovery' },
  rest: { emoji: '😴', color: '#8A94A3', label: 'Rest' },
  cross: { emoji: '🚴', color: '#3D6FA8', label: 'Cross' },
};

export default function CoachCard({ journeyId }: { journeyId: string }) {
  const { data: me } = useMe();
  const { data: plan } = useCoachPlan(journeyId);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const todayIdx = (new Date().getDay() + 6) % 7;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const loc = await realLocation();
      const r = await api<{ plan: CoachPlan }>('/api/coach', { method: 'POST', json: { journeyId, lang: lang(), ...(loc ?? {}) } });
      qc.setQueryData(['coach', journeyId], r.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <SportsIcon color="primary" />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
              {t('Your coach')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {plan ? t('Week of {week} · written {when}', { week: formatDate(plan.weekOf), when: formatDate(plan.createdAt, { dateStyle: 'medium', timeStyle: 'short' }) }) : t('A weekly plan from your recent runs, your goal and the weather where you are.')}
            </Typography>
          </Box>
          <Button variant={plan ? 'outlined' : 'contained'} onClick={generate} loading={busy} disabled={!me?.ai}>
            {plan ? t('New plan') : t('Plan my week')}
          </Button>
        </Stack>
        {!me?.ai && <Alert severity="info">{t('Add your Anthropic API key in the narrator settings (Explore → story card → ⚙︎) to get weekly plans.')}</Alert>}
        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}
        {plan && (
          <>
            <Stack direction="row" sx={{ alignItems: 'baseline', gap: 1, mb: 1 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1.8rem' }}>
                <CountUp value={plan.targetKm} format={(n) => `${n.toFixed(0)} km`} />
              </Typography>
              <Typography color="text.secondary">{t('this week')}</Typography>
            </Stack>
            <Typography sx={{ mb: 2 }}>{plan.summary}</Typography>
            <Stagger gap={0.05} sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(7, 1fr)' } }}>
              {plan.days.map((d, i) => {
                const look = LOOK[d.type] ?? LOOK.easy;
                const today = i === todayIdx;
                return (
                  <StaggerItem
                    key={d.day}
                    sx={{
                      p: 1.25,
                      borderRadius: '14px',
                      border: 2,
                      borderColor: today ? 'primary.main' : 'transparent',
                      bgcolor: 'action.hover',
                      position: 'relative',
                      overflow: 'hidden',
                      '&::before': { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: look.color },
                    }}
                  >
                    <Stack direction={{ xs: 'row', sm: 'column' }} sx={{ gap: { xs: 1.5, sm: 0.5 }, alignItems: { xs: 'center', sm: 'flex-start' } }}>
                      <Box sx={{ minWidth: { xs: 44, sm: 0 } }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: today ? 'primary.main' : 'text.secondary' }}>
                          {formatDate(new Date(2024, 0, 1 + i), { weekday: 'short' })}
                          {today ? ` · ${t('today')}` : ''}
                        </Typography>
                        <Typography sx={{ fontSize: 22, lineHeight: 1.2 }}>{look.emoji}</Typography>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Chip size="small" label={d.type === 'rest' ? t('Rest') : `${t(look.label)} · ${d.distanceKm} km`} sx={{ bgcolor: look.color, color: '#fff', height: 22, mb: 0.5 }} />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {d.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {d.details}
                        </Typography>
                      </Box>
                    </Stack>
                  </StaggerItem>
                );
              })}
            </Stagger>
            <Typography variant="body2" sx={{ mt: 2, fontStyle: 'italic' }}>
              💡 {plan.tip}
            </Typography>
          </>
        )}
      </CardContent>
    </Card>
  );
}
