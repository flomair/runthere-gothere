import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoStoriesIcon from '@mui/icons-material/AutoStoriesOutlined';
import MoreIcon from '@mui/icons-material/MoreVert';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Badge, Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { flag } from '../lib/api';
import { formatDate, formatKm } from '../lib/format';
import { navigate } from '../lib/nav';
import type { Progress } from '../lib/progress';
import type { Journey } from '../lib/types';
import { toUnit } from '../lib/units';
import { CountUp } from './motion';
import HeroSurface from './HeroSurface';
import { ROUNDED } from '../theme';
import { locale, t } from '../lib/i18n';
import { currentLeg, legWaypoints, legsOf } from '../../shared/legs';

function Ring({ fraction, size = 132 }: { fraction: number; size?: number }) {
  const reduce = useReducedMotion();
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={8} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.min(1, fraction)) }}
          transition={reduce ? { duration: 0 } : { duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <Box>
          <Typography sx={{ fontFamily: ROUNDED, fontWeight: 800, fontSize: size > 110 ? '2.1rem' : '1.6rem', lineHeight: 1 }}>
            <CountUp value={fraction * 100} format={(n) => `${n.toLocaleString(locale(), { maximumFractionDigits: fraction < 0.1 ? 1 : 0, minimumFractionDigits: fraction < 0.1 ? 1 : 0 })}%`} />
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.85 }}>
            {t('done')}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" sx={{ opacity: 0.6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', fontSize: '0.66rem', display: 'block' }} noWrap>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 600, fontSize: { xs: '1.15rem', sm: '1.4rem' }, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }} noWrap>
        {children}
      </Typography>
    </Box>
  );
}

/** A little copy of the iOS countdown widget: event name, days to go, date, trophy. */
function RaceTile({ event }: { event: NonNullable<Journey['event']> }) {
  const d = Math.ceil((new Date(`${event.date}T09:00:00`).getTime() - Date.now()) / 86_400_000);
  return (
    <Box
      component={motion.a}
      href={event.url || undefined}
      target="_blank"
      rel="noopener"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.35, type: 'spring', stiffness: 260, damping: 22 }}
      sx={{
        display: { xs: 'none', sm: 'flex' },
        flexDirection: 'column',
        flexShrink: 0,
        width: 150,
        height: 150,
        p: 1.75,
        borderRadius: '26px',
        color: 'inherit',
        textDecoration: 'none',
        bgcolor: 'rgba(255,255,255,0.16)',
        border: '1px solid rgba(255,255,255,0.22)',
        backdropFilter: 'blur(10px)',
        position: 'relative',
      }}
    >
      <Typography noWrap sx={{ fontFamily: ROUNDED, fontWeight: 700, fontSize: '0.95rem' }}>
        {event.name}
      </Typography>
      <Typography sx={{ fontFamily: ROUNDED, fontWeight: 900, fontSize: d > 999 ? '2.4rem' : '3.2rem', lineHeight: 1, mt: 0.5, letterSpacing: '-0.03em' }}>
        {d > 0 ? d : d === 0 ? '🏁' : '✓'}
      </Typography>
      <Box sx={{ mt: 'auto' }}>
        <Typography sx={{ fontFamily: ROUNDED, fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.1 }}>{d > 0 ? t('days') : d === 0 ? t('today!') : t('done')}</Typography>
        <Typography sx={{ fontSize: '0.75rem', opacity: 0.85 }}>{formatDate(event.date)}</Typography>
      </Box>
      <Box component="span" aria-hidden sx={{ position: 'absolute', right: 14, bottom: 12, fontSize: 20 }}>
        🏆
      </Box>
    </Box>
  );
}

/** Compact race line for phones. */
function RaceLine({ event }: { event: NonNullable<Journey['event']> }) {
  const d = Math.ceil((new Date(`${event.date}T09:00:00`).getTime() - Date.now()) / 86_400_000);
  return (
    <Box sx={{ display: { xs: 'inline-flex', sm: 'none' }, alignItems: 'baseline', gap: 0.75, mt: 1, px: 1.25, py: 0.5, borderRadius: '14px', bgcolor: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.22)' }}>
      <Typography component="span" sx={{ fontFamily: ROUNDED, fontWeight: 900, fontSize: '1.3rem', lineHeight: 1 }}>
        {d > 0 ? d : '🏁'}
      </Typography>
      <Typography component="span" sx={{ fontFamily: ROUNDED, fontWeight: 700, fontSize: '0.8rem' }} noWrap>
        {d > 0 ? t('days') : t('today!')} · {event.name}
      </Typography>
    </Box>
  );
}

interface Props {
  journey: Journey;
  progress: Progress;
  countries: string[];
  reachedCountries: Set<string | undefined>;
  unseen: number;
  syncing: boolean;
  onSync?: () => void;
  onMenu: (el: HTMLElement) => void;
}

export default function JourneyHero({ journey, progress, countries, reachedCountries, unseen, syncing, onSync, onMenu }: Props) {
  const legs = legsOf(journey);
  const legWps = legWaypoints(journey, legs.length - 1);
  // with several legs the header shows the current one: "Leg 2 · Prague → Vienna"
  const from = (legs.length > 1 ? legWps[0] : journey.waypoints[0])?.name;
  const to = journey.waypoints[journey.waypoints.length - 1]?.name;
  const unitLabel = formatKm(0, 0).replace(/^[\d.,\s]+/, '');
  return (
    <HeroSurface sx={{ p: { xs: 2, sm: 3.5 } }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, position: 'relative', mb: { xs: 1, sm: 2 }, ml: -1 }}>
        <IconButton onClick={() => navigate('/')} aria-label="back to journeys" sx={{ color: 'inherit' }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="overline" sx={{ opacity: 0.9, flexGrow: 1, lineHeight: 1.2 }} noWrap>
          {journey.trail ? `${t('Trail')}${journey.trail.ref ? ` · ${journey.trail.ref}` : ''}` : t('Journey')} · {t('since {date}', { date: formatDate(journey.startDate) })}
        </Typography>
        {onSync && (
          <Tooltip title={t('Sync Strava')}>
            <IconButton onClick={onSync} disabled={syncing} aria-label="sync strava" sx={{ color: 'inherit' }}>
              <RefreshIcon sx={{ animation: syncing ? 'spin 1s linear infinite' : undefined, '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={t('Travel diary')}>
          <IconButton onClick={() => navigate(`/j/${journey.id}/diary`)} aria-label="travel diary" sx={{ color: 'inherit' }}>
            <Badge badgeContent={unseen} invisible={!unseen} sx={{ '& .MuiBadge-badge': { bgcolor: '#fff', color: '#5B5BF0', fontWeight: 800 } }}>
              <AutoStoriesIcon />
            </Badge>
          </IconButton>
        </Tooltip>
        <IconButton onClick={(e) => onMenu(e.currentTarget)} aria-label="journey menu" sx={{ color: 'inherit' }}>
          <MoreIcon />
        </IconButton>
      </Stack>

      <Stack direction="row" sx={{ gap: { xs: 2, sm: 3.5 }, alignItems: 'center', position: 'relative' }}>
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
          <Ring fraction={progress.fraction} />
        </Box>
        <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
          <Ring fraction={progress.fraction} size={96} />
        </Box>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="h3" component="h1" sx={{ fontSize: { xs: '1.55rem', sm: '2.5rem' }, lineHeight: 1.1, overflowWrap: 'anywhere' }}>
            {journey.name}
          </Typography>
          <Typography sx={{ opacity: 0.9, mt: 0.5, fontSize: { xs: '0.85rem', sm: '1rem' } }} noWrap>
            {legs.length > 1 ? `${t('Leg {n}', { n: legs.length })} · ` : ''}
            {from && to ? `${from} → ${to}` : journey.route.provider} · {formatKm(legs.length > 1 ? currentLeg(journey).totalM : journey.route.totalM, 0)}
          </Typography>
          {journey.event && <RaceLine event={journey.event} />}
          {countries.length > 1 && (
            <Stack direction="row" sx={{ gap: 0.5, mt: 1 }}>
              {countries.map((c) => (
                <Box key={c} component="span" title={c} sx={{ fontSize: 18, lineHeight: 1, opacity: reachedCountries.has(c) ? 1 : 0.4 }}>
                  {flag(c)}
                </Box>
              ))}
            </Stack>
          )}
        </Box>
        {journey.event && <RaceTile event={journey.event} />}
      </Stack>

      <Box
        sx={{
          position: 'relative',
          mt: { xs: 2, sm: 3 },
          display: 'grid',
          gap: { xs: 1.5, sm: 2 },
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          p: { xs: 1.5, sm: 2 },
          borderRadius: '18px',
          bgcolor: 'rgba(255,255,255,0.14)',
          border: '1px solid rgba(255,255,255,0.18)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <Stat label={t('Covered')}>
          <CountUp value={toUnit(progress.doneM)} format={(n) => `${n.toLocaleString(locale(), { minimumFractionDigits: n < 100 ? 1 : 0, maximumFractionDigits: n < 100 ? 1 : 0 })} ${unitLabel}`} />
        </Stat>
        <Stat label={t('To go')}>
          <CountUp value={toUnit(progress.remainingM)} format={(n) => `${n.toLocaleString(locale(), { minimumFractionDigits: n < 100 ? 1 : 0, maximumFractionDigits: n < 100 ? 1 : 0 })} ${unitLabel}`} />
        </Stat>
        <Stat label={t('Weekly pace')}>
          <CountUp value={toUnit(progress.weeklyAvgM)} format={(n) => `${n.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${unitLabel}`} />
        </Stat>
        <Stat label={progress.finished ? t('Arrived') : t('Arrival at pace')}>
          {progress.finished ? (progress.finishedOn ? formatDate(progress.finishedOn) : '🎉') : progress.eta ? formatDate(progress.eta) : '—'}
        </Stat>
      </Box>
    </HeroSurface>
  );
}
