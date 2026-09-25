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

function Ring({ fraction, size = 132 }: { fraction: number; size?: number }) {
  const reduce = useReducedMotion();
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffd3b8" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={10} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth={10}
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
          <Typography sx={{ fontFamily: 'var(--display, inherit)', fontWeight: 800, fontSize: size > 110 ? '1.9rem' : '1.4rem', lineHeight: 1 }}>
            <CountUp value={fraction * 100} format={(n) => `${n.toFixed(fraction < 0.1 ? 1 : 0)}%`} />
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.85 }}>
            done
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', display: 'block' }} noWrap>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.15rem', sm: '1.35rem' }, lineHeight: 1.25 }} noWrap>
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
    <Box
      component={motion.div}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: { xs: '26px', sm: '32px' },
        color: '#fff',
        p: { xs: 2, sm: 3.5 },
        background: 'linear-gradient(135deg, #ff7a3d 0%, #fc4c02 38%, #d9345f 72%, #1d3557 130%)',
        boxShadow: '0 20px 40px -20px rgba(252, 76, 2, 0.55)',
      }}
    >
      {/* soft moving light */}
      <Box
        component={motion.div}
        aria-hidden
        animate={{ x: ['-10%', '12%', '-10%'], y: ['-8%', '10%', '-8%'] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        sx={{
          position: 'absolute',
          width: '70%',
          height: '140%',
          top: '-40%',
          right: '-20%',
          background: 'radial-gradient(closest-side, rgba(255,255,255,0.22), transparent)',
          pointerEvents: 'none',
        }}
      />
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, position: 'relative', mb: { xs: 1, sm: 2 }, ml: -1 }}>
        <IconButton onClick={() => navigate('/')} aria-label="back to journeys" sx={{ color: 'inherit' }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="overline" sx={{ opacity: 0.9, flexGrow: 1, lineHeight: 1.2 }} noWrap>
          {journey.trail ? `Trail${journey.trail.ref ? ` · ${journey.trail.ref}` : ''}` : 'Journey'} · since {formatDate(journey.startDate)}
        </Typography>
        {onSync && (
          <Tooltip title="Sync Strava">
            <IconButton onClick={onSync} disabled={syncing} aria-label="sync strava" sx={{ color: 'inherit' }}>
              <RefreshIcon sx={{ animation: syncing ? 'spin 1s linear infinite' : undefined, '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Travel diary">
          <IconButton onClick={() => navigate(`/j/${journey.id}/diary`)} aria-label="travel diary" sx={{ color: 'inherit' }}>
            <Badge badgeContent={unseen} invisible={!unseen} sx={{ '& .MuiBadge-badge': { bgcolor: '#fff', color: '#d9345f', fontWeight: 800 } }}>
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
          bgcolor: 'rgba(255,255,255,0.14)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <Stat label="Covered">
          <CountUp value={toUnit(progress.doneM)} format={(n) => `${n.toFixed(n < 100 ? 1 : 0)} ${unitLabel}`} />
        </Stat>
        <Stat label="To go">
          <CountUp value={toUnit(progress.remainingM)} format={(n) => `${n.toFixed(n < 100 ? 1 : 0)} ${unitLabel}`} />
        </Stat>
        <Stat label="Weekly pace">
          <CountUp value={toUnit(progress.weeklyAvgM)} format={(n) => `${n.toFixed(1)} ${unitLabel}`} />
        </Stat>
        <Stat label={progress.finished ? 'Arrived' : 'Arrival at pace'}>
          {progress.finished ? (progress.finishedOn ? formatDate(progress.finishedOn) : '🎉') : progress.eta ? formatDate(progress.eta) : '—'}
        </Stat>
      </Box>
    </Box>
  );
}
