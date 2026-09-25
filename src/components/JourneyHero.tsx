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
import { EMBER } from '../theme';
import { locale, t } from '../lib/i18n';

function Ring({ fraction, size = 132 }: { fraction: number; size?: number }) {
  const reduce = useReducedMotion();
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={6} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={EMBER}
          strokeWidth={6}
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
          <Typography sx={{ fontFamily: '"Fraunces", Georgia, serif', fontWeight: 600, fontSize: size > 110 ? '2rem' : '1.5rem', lineHeight: 1 }}>
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
  const from = journey.waypoints[0]?.name;
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
            <Badge badgeContent={unseen} invisible={!unseen} sx={{ '& .MuiBadge-badge': { bgcolor: EMBER, color: '#fff', fontWeight: 700 } }}>
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
            {from && to ? `${from} → ${to}` : journey.route.provider} · {formatKm(journey.route.totalM, 0)}
          </Typography>
          {journey.event && (
            <Box
              component={motion.div}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mt: 1, px: 1.25, py: 0.4, borderRadius: 99, bgcolor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', fontWeight: 600, fontSize: '0.82rem' }}
            >
              🏅 {journey.event.name} ·{' '}
              {(() => {
                const d = Math.ceil((new Date(`${journey.event.date}T09:00:00`).getTime() - Date.now()) / 86_400_000);
                return d > 0 ? t('{n} days', { n: d }) : d === 0 ? t('today!') : t('done');
              })()}
            </Box>
          )}
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
          bgcolor: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
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
