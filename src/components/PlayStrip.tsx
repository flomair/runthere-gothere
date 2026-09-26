import { useQuery } from '@tanstack/react-query';
import { Box, Button, Stack, Typography } from '@mui/material';
import { motion } from 'motion/react';
import { type ReactNode, useMemo, useState } from 'react';
import { questFraction, questTitle } from '../../shared/quests';
import { rewardState } from '../../shared/rewards';
import { api, useActivities, useMe } from '../lib/api';
import { formatKm, pct } from '../lib/format';
import { getLang, t } from '../lib/i18n';
import { navigate } from '../lib/nav';
import { computeProgress } from '../lib/progress';
import { useQuestActions, useQuests } from '../lib/quests';
import { useRewards } from '../lib/rewards';
import { useJourneys } from '../lib/storage';
import type { Journey, PlaySummary, Quest, Reward } from '../lib/types';
import { ROUNDED } from '../theme';
import { QuestDialog } from './QuestsCard';
import { Emoji, type EmojiName } from './Emoji';

export function usePlay() {
  return useQuery({ queryKey: ['play'], queryFn: () => api<PlaySummary>('/api/play'), staleTime: 60_000 });
}

/** Link to a journey's gifts tab. */
export const giftsUrl = (journeyId: string) => `/j/${journeyId}?s=gifts`;

const G = {
  challenge: 'linear-gradient(135deg, #7B5CF0 0%, #A259E8 55%, #D65DB1 100%)',
  gift: 'linear-gradient(135deg, #F5C451 0%, #E8B03A 45%, #D9772B 100%)',
  quest: 'linear-gradient(135deg, #3F7CF6 0%, #6A67F0 52%, #A259E8 100%)',
  reward: 'linear-gradient(135deg, #1FB597 0%, #149A80 60%, #0F7C8C 100%)',
  stage: 'linear-gradient(135deg, #232862 0%, #3D3F9E 60%, #6A67F0 100%)',
  bucket: 'linear-gradient(135deg, #D65DB1 0%, #E8B03A 100%)',
  cta: 'var(--mui-palette-background-paper)',
};

function Tile({ bg, eyebrow, title, sub, children, onClick, progress, emoji, light, delay = 0 }: { bg: string; eyebrow: string; title: string; sub?: ReactNode; children?: ReactNode; onClick?: () => void; progress?: number; emoji: EmojiName; light?: boolean; delay?: number }) {
  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 320, damping: 28 }}
      whileHover={onClick ? { y: -3 } : undefined}
      onClick={onClick}
      className="ai-hover"
      sx={{
        position: 'relative',
        flex: '0 0 auto',
        width: { xs: 236, sm: 'auto' },
        minHeight: 150,
        p: 2,
        borderRadius: '24px',
        background: bg,
        color: light ? 'text.primary' : '#fff',
        border: light ? '1.5px dashed' : 'none',
        borderColor: 'divider',
        cursor: onClick ? 'pointer' : 'default',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: light ? 'none' : '0 14px 30px -18px rgba(35, 40, 98, 0.55)',
        scrollSnapAlign: 'start',
      }}
    >
      <Box
        component={motion.div}
        aria-hidden
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: delay + 0.1, type: 'spring', stiffness: 260, damping: 18 }}
        sx={{ position: 'absolute', right: 14, top: 14, pointerEvents: 'none', opacity: light ? 1 : 0.95 }}
      >
        <Emoji name={emoji} size={44} color={light ? undefined : '#fff'} strokeWidth={1.6} idle />
      </Box>
      <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', opacity: 0.85, pr: 7 }} noWrap>{eyebrow}</Typography>
      <Typography sx={{ fontFamily: ROUNDED, fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.2, mt: 0.5, pr: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {title}
      </Typography>
      {sub && (
        <Typography variant="body2" sx={{ opacity: 0.92, mt: 0.5 }} component="div">
          {sub}
        </Typography>
      )}
      <Box sx={{ flexGrow: 1 }} />
      {progress != null && (
        <Box sx={{ mt: 1.25, height: 6, borderRadius: 3, bgcolor: light ? 'action.hover' : 'rgb(255 255 255 / 28%)', overflow: 'hidden' }}>
          <Box component={motion.div} initial={{ width: 0 }} animate={{ width: `${Math.max(3, Math.min(100, progress * 100))}%` }} transition={{ duration: 0.9, delay: delay + 0.2 }} sx={{ height: '100%', bgcolor: light ? 'secondary.main' : '#fff', borderRadius: 3 }} />
        </Box>
      )}
      {children && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.25 }} onClick={(e) => e.stopPropagation()}>
          {children}
        </Stack>
      )}
    </Box>
  );
}

const white = { bgcolor: '#fff', color: '#232862', backgroundImage: 'none', boxShadow: 'none', '&:hover': { bgcolor: '#fff', filter: 'brightness(0.96)' } };
const ghost = { color: '#fff', borderColor: 'rgb(255 255 255 / 60%)', '&:hover': { borderColor: '#fff', bgcolor: 'rgb(255 255 255 / 10%)' } };

function daysLeft(iso?: string) {
  return iso ? Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000)) : null;
}

/**
 * Challenges and gifts at a glance: challenges waiting for an answer, running quests, gifts owed,
 * rewards ready to claim, the next reward on the route, mystery draws and race stages.
 * With `journey`, only that journey's rewards are shown (and accepting attaches quests to it).
 */
export default function PlayStrip({ journey, doneM, title = true, max }: { journey?: Journey; doneM?: number; title?: boolean; max?: number }) {
  const { data: me } = useMe();
  const uid = me?.user.uid ?? '';
  const journeys = useJourneys();
  const quests = useQuests();
  const rewards = useRewards(journey?.id);
  const play = usePlay();
  const { respond } = useQuestActions();
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const earliest = journeys.map((j) => j.startDate).sort()[0] ?? '2000-01-01';
  const acts = useActivities(earliest, !journey && !!me?.strava && journeys.length > 0);

  // where each journey stands, to tell which rewards are unlocked and how far the next one is
  const done = useMemo(() => {
    const m = new Map<string, number>();
    if (journey && doneM != null) m.set(journey.id, doneM);
    else for (const j of journeys) m.set(j.id, computeProgress(j, acts.data).doneM);
    return m;
  }, [journey, doneM, journeys, acts.data]);
  const nameOf = (id: string) => journeys.find((j) => j.id === id)?.name ?? '';

  const all = quests.data ?? [];
  const incoming = all.filter((q) => q.status === 'offered' && q.from.uid !== uid);
  const running = all.filter((q) => q.status === 'accepted' && (!journey || q.journeyId === journey.id || q.from.uid === uid));
  const owedToMe = all.filter((q) => q.status === 'won' && q.winnerUid === uid && q.to.uid === uid && q.gift.fulfillment.status !== 'fulfilled');
  const iOwe = all.filter((q) => q.status === 'won' && q.from.uid === uid && q.gift.fulfillment.status !== 'fulfilled');
  const rs = (rewards.data ?? []).map((r) => ({ r, state: rewardState(r, done.get(r.journeyId) ?? 0) }));
  const claimable = rs.filter((x) => x.state === 'unlocked').map((x) => x.r);
  const nextByJourney = new Map<string, Reward>();
  for (const { r, state } of rs) if (state === 'locked' && (!nextByJourney.has(r.journeyId) || r.atM < nextByJourney.get(r.journeyId)!.atM)) nextByJourney.set(r.journeyId, r);
  const draws = play.data?.draws ?? [];
  const stages = play.data?.stages ?? [];
  const targetJourney = journey?.id ?? journeys[0]?.id;

  const act = async (q: Quest, a: 'accept' | 'decline' | 'delivered') => {
    setBusy(q.id + a);
    try {
      await respond(q.id, a, a === 'accept' ? targetJourney : undefined);
    } finally {
      setBusy(null);
    }
  };

  let i = 0;
  const d = () => Math.min(i++, 8) * 0.05;
  const tiles: ReactNode[] = [];
  for (const q of incoming)
    tiles.push(
      <Tile key={`in-${q.id}`} bg={G.challenge} emoji="swords" eyebrow={t('{name} challenges you', { name: q.from.name })} title={questTitle(q, getLang())} sub={<><Emoji name="gift" color="inherit" /> {q.gift.text}{q.penalty ? <><br /><Emoji name="devil" color="inherit" /> {q.penalty}</> : null}</>} delay={d()}>
        <Button size="small" variant="contained" sx={white} loading={busy === q.id + 'accept'} onClick={() => act(q, 'accept')}>
          {t('Accept')}
        </Button>
        <Button size="small" variant="outlined" sx={ghost} loading={busy === q.id + 'decline'} onClick={() => act(q, 'decline')}>
          {t('Decline')}
        </Button>
      </Tile>,
    );
  for (const r of claimable)
    tiles.push(
      <Tile key={`claim-${r.id}`} bg={G.gift} emoji="gift" eyebrow={t('Reward unlocked!')} title={r.title} sub={journey ? t('Treat yourself – you ran there.') : nameOf(r.journeyId)} onClick={() => navigate(giftsUrl(r.journeyId))} delay={d()}>
        <Button size="small" variant="contained" sx={white} onClick={() => navigate(giftsUrl(r.journeyId))}>
          {t('Claim it')}
        </Button>
      </Tile>,
    );
  for (const q of owedToMe)
    tiles.push(<Tile key={`owed-${q.id}`} bg={G.gift} emoji="medal" eyebrow={t('{name} owes you', { name: q.from.name })} title={q.gift.text} sub={t('You completed {quest}', { quest: questTitle(q, getLang()) })} onClick={() => navigate('/play')} delay={d()} />);
  for (const q of iOwe)
    tiles.push(
      <Tile key={`owe-${q.id}`} bg={G.gift} emoji="ribbon" eyebrow={t('You owe {name}', { name: q.to.name })} title={q.gift.text} sub={t('{name} completed your challenge', { name: q.to.name })} delay={d()}>
        <Button size="small" variant="contained" sx={white} loading={busy === q.id + 'delivered'} onClick={() => act(q, 'delivered')}>
          {t('Gift delivered')}
        </Button>
      </Tile>,
    );
  for (const s of draws)
    tiles.push(
      <Tile key={`draw-${s.groupId}`} bg={G.bucket} emoji="bucket" eyebrow={s.groupName} title={s.count === 1 ? t('A mystery draw is waiting') : t('{n} mystery draws are waiting', { n: s.count })} sub={t('Reach into the surprise bucket')} onClick={() => navigate(`/g/${s.groupId}`)} delay={d()}>
        <Button size="small" variant="contained" sx={white} onClick={() => navigate(`/g/${s.groupId}`)}>
          {t('Draw!')}
        </Button>
      </Tile>,
    );
  for (const q of running) {
    const iAmFrom = q.from.uid === uid;
    const left = daysLeft(q.endsAt);
    tiles.push(
      <Tile
        key={`run-${q.id}`}
        bg={G.quest}
        emoji="runner"
        eyebrow={iAmFrom ? t('{name} is on your quest', { name: q.to.name }) : t('Quest from {name}', { name: q.from.name })}
        title={questTitle(q, getLang())}
        sub={<>{left != null ? t('{n} days left', { n: left }) : ''} · <Emoji name="gift" color="inherit" /> {q.gift.text}</>}
        progress={q.type === 'race' && iAmFrom ? (q.progress?.rival ?? 0) / (q.progress?.target || 1) : questFraction(q)}
        onClick={() => navigate(journey ? giftsUrl(journey.id) : '/play')}
        delay={d()}
      />,
    );
  }
  for (const s of stages)
    tiles.push(
      <Tile
        key={`stage-${s.id}`}
        bg={G.stage}
        emoji="flag"
        eyebrow={`${t('Race stage')} · ${s.groupName}`}
        title={s.name}
        sub={
          <>
            {s.status === 'scheduled' ? t('Starts in {n} days', { n: daysLeft(`${s.startDate}T00:00:00Z`) ?? 0 }) : s.rank ? t('You are #{rank} of {of} · {pct}', { rank: s.rank, of: s.of, pct: pct(s.effort ?? 0) }) : ''}
            <br /><Emoji name="trophy" color="inherit" /> {s.prize}
          </>
        }
        progress={s.status === 'running' ? Math.min(1, (s.effort ?? 0) / 1.5) : undefined}
        onClick={() => navigate(`/g/${s.groupId}`)}
        delay={d()}
      />,
    );
  for (const [jid, r] of nextByJourney) {
    const pos = done.get(jid) ?? 0;
    tiles.push(
      <Tile
        key={`next-${r.id}`}
        bg={G.reward}
        emoji="gift"
        eyebrow={journey ? t('Next reward') : `${t('Next reward')} · ${nameOf(jid)}`}
        title={r.title}
        sub={t('{km} to go', { km: formatKm(r.atM - pos, 0) })}
        progress={pos / (r.atM || 1)}
        onClick={() => navigate(giftsUrl(jid))}
        delay={d()}
      />,
    );
  }
  // always offer the two ways to add more fun
  tiles.push(<Tile key="cta-q" bg={G.cta} light emoji="swords" eyebrow={t('Side quest')} title={t('Challenge a friend')} sub={t('A distance, a habit, a race or a time – with a gift for the winner.')} onClick={() => setDialog(true)} delay={d()} />);
  if (targetJourney && !nextByJourney.has(targetJourney))
    tiles.push(<Tile key="cta-r" bg={G.cta} light emoji="gift" eyebrow={t('Reward')} title={t('Pin a treat on your route')} sub={t('It unlocks when you run there.')} onClick={() => navigate(giftsUrl(targetJourney))} delay={d()} />);

  return (
    <Box component="section" aria-label={t('Challenges & gifts')}>
      {title && (
        <Stack direction="row" sx={{ alignItems: 'baseline', mb: 1.25, gap: 1 }}>
          <Typography variant="h5" sx={{ flexGrow: 1 }}>
            {t('Challenges & gifts')}
          </Typography>
          <Button size="small" onClick={() => navigate(journey ? giftsUrl(journey.id) : '/play')}>
            {t('See all')}
          </Button>
        </Stack>
      )}
      <Box
        sx={{
          display: { xs: 'flex', sm: 'grid' },
          gridTemplateColumns: { sm: 'repeat(auto-fill, minmax(230px, 1fr))' },
          gap: 1.5,
          overflowX: { xs: 'auto', sm: 'visible' },
          scrollSnapType: 'x mandatory',
          scrollPaddingInline: '12px',
          mx: { xs: -1.5, sm: 0 },
          px: { xs: 1.5, sm: 0 },
          pb: 1,
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {max ? tiles.slice(0, max) : tiles}
      </Box>
      <QuestDialog open={dialog} onClose={() => setDialog(false)} />
    </Box>
  );
}

/** How many things wait for the user's action (for the header badge). */
export function usePlayCount(): number {
  const { data: me } = useMe();
  const quests = useQuests();
  const rewards = useRewards();
  const play = usePlay();
  const uid = me?.user.uid;
  if (!uid) return 0;
  const q = quests.data ?? [];
  return (
    q.filter((x) => x.status === 'offered' && x.from.uid !== uid).length +
    q.filter((x) => x.status === 'won' && x.from.uid === uid && x.gift.fulfillment.status !== 'fulfilled').length +
    (rewards.data ?? []).filter((r) => r.status === 'unlocked').length +
    (play.data?.draws ?? []).reduce((s, d) => s + d.count, 0)
  );
}
