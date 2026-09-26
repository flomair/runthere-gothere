import { ArrowBack as ArrowBackIcon } from '../icons';
import { Box, Card, CardContent, Chip, CircularProgress, IconButton, Link, Stack, Typography } from '@mui/material';
import { useMemo } from 'react';
import { isCityMilestone } from '../../shared/rewards';
import { useMe, useMilestones, useUnlockBackfill } from '../lib/api';
import { useQuests } from '../lib/quests';
import { questTitle } from '../../shared/quests';
import { formatDate, formatKm } from '../lib/format';
import { getLang, t } from '../lib/i18n';
import { navigate } from '../lib/nav';
import { useRewards } from '../lib/rewards';
import { useJourneys } from '../lib/storage';
import { ROUNDED } from '../theme';
import PhotoImg from './PhotoImg';
import Stamp from './Stamp';
import { Reveal } from './motion';
import { Emoji, EmojiText } from './Emoji';

/** Everything collected on the road: passport stamps from every journey and the gallery of claimed rewards. */
export default function CollectionPage() {
  const journeys = useJourneys();
  const milestonesQ = useMilestones();
  const rewardsQ = useRewards();
  useUnlockBackfill(milestonesQ.data?.milestones, 4);
  const { data: me } = useMe();
  const questsQ = useQuests();
  const badges = (questsQ.data ?? []).filter((q) => q.badge && q.winnerUid === me?.user.uid);
  const names = useMemo(() => new Map(journeys.map((j) => [j.id, j.name])), [journeys]);

  const stamps = useMemo(
    () =>
      (milestonesQ.data?.milestones ?? [])
        .filter((m) => isCityMilestone(m) && m.unlocks)
        .sort((a, b) => b.reachedAt.localeCompare(a.reachedAt)),
    [milestonesQ.data],
  );
  const pendingStamps = (milestonesQ.data?.milestones ?? []).filter((m) => isCityMilestone(m) && !m.unlocks).length;
  const claimed = useMemo(
    () => (rewardsQ.data ?? []).filter((r) => r.status === 'claimed').sort((a, b) => (b.claimedAt ?? '').localeCompare(a.claimedAt ?? '')),
    [rewardsQ.data],
  );

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <IconButton onClick={() => navigate('/')} aria-label="back">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1, fontFamily: ROUNDED, fontWeight: 800 }}>
          {t('My collection')}
        </Typography>
      </Stack>

      <Card>
        <CardContent>
          <Stack direction="row" sx={{ alignItems: 'baseline', gap: 1, mb: 2 }}>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              {t('Passport')}
            </Typography>
            <Chip size="small" label={t('{n} stamps', { n: stamps.length })} />
          </Stack>
          {milestonesQ.isLoading ? (
            <CircularProgress size={28} />
          ) : stamps.length === 0 ? (
            <Typography color="text.secondary">
              {pendingStamps ? t('Stamping your passport…') : t('Every city you run to adds a stamp to your passport.')}
            </Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 2, justifyItems: 'center' }}>
              {stamps.map((m) => (
                <Box key={m.id} sx={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => navigate(`/j/${m.journeyId}/diary`)} title={names.get(m.journeyId)}>
                  <Stamp stamp={m.unlocks!.stamp} size={104} />
                  <Typography variant="caption" color="text.secondary" component="div" noWrap sx={{ maxWidth: 118 }}>
                    {names.get(m.journeyId) ?? ''}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction="row" sx={{ alignItems: 'baseline', gap: 1, mb: 2 }}>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              {t('Quest badges')}
            </Typography>
            <Chip size="small" label={badges.length === 1 ? t('1 badge') : t('{n} badges', { n: badges.length })} />
          </Stack>
          {badges.length === 0 ? (
            <Typography color="text.secondary">
              {t('Complete a side quest to earn a badge.')}{' '}
              <Link component="button" onClick={() => navigate('/quests')}>
                {t('Side quests')}
              </Link>
            </Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 2 }}>
              {badges.map((q) => (
                <Box key={q.id} sx={{ textAlign: 'center' }}>
                  <Box
                    sx={{
                      width: 84,
                      height: 84,
                      mx: 'auto',
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 38,
                      background: 'linear-gradient(135deg, #3F7CF6, #6A67F0 50%, #A259E8)',
                      boxShadow: '0 0 0 4px rgb(162 89 232 / 22%), 0 6px 16px rgb(35 40 98 / 25%)',
                    }}
                  >
                    <Box component="span" sx={{ color: '#fff', lineHeight: 0 }}><EmojiText text={q.badge!.emoji} size={40} /></Box>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, mt: 1, lineHeight: 1.25 }}>
                    {questTitle(q, getLang())}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="div">
                    {q.from.uid === me?.user.uid ? t('vs. {name}', { name: q.to.name }) : t('from {name}', { name: q.from.name })} · {q.resolvedAt ? formatDate(q.resolvedAt) : ''}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction="row" sx={{ alignItems: 'baseline', gap: 1, mb: 2 }}>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              {t('Rewards gallery')}
            </Typography>
            <Chip size="small" label={t('{n} claimed', { n: claimed.length })} />
          </Stack>
          {rewardsQ.isLoading ? (
            <CircularProgress size={28} />
          ) : claimed.length === 0 ? (
            <Typography color="text.secondary">{t('Rewards you claim show up here, with their photos.')}</Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(auto-fill, minmax(200px, 1fr))' }, gap: 1.5 }}>
              {claimed.map((r, i) => (
                <Reveal key={r.id} delay={Math.min(i, 8) * 0.04}>
                  <Card variant="outlined" sx={{ overflow: 'hidden', height: '100%' }}>
                    {r.claimPhoto || r.photo ? (
                      <PhotoImg path={(r.claimPhoto || r.photo)!} alt={r.title} height={150} />
                    ) : (
                      <Box sx={{ height: 150, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #3F7CF6, #6A67F0 50%, #A259E8)' }}><Emoji name="gift" size={52} color="#fff" idle /></Box>
                    )}
                    <Box sx={{ p: 1.5 }}>
                      <Typography sx={{ fontWeight: 700 }} noWrap>
                        {r.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" component="div">
                        {formatKm(r.atM, 0)} · {r.claimedAt ? formatDate(r.claimedAt) : ''}
                      </Typography>
                      <Link component="button" variant="caption" onClick={() => navigate(`/j/${r.journeyId}`)} sx={{ textAlign: 'left' }}>
                        {names.get(r.journeyId) ?? ''}
                      </Link>
                      {r.claimNote && (
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {r.claimNote}
                        </Typography>
                      )}
                    </Box>
                  </Card>
                </Reveal>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
