import TerrainIcon from '@mui/icons-material/Terrain';
import { Box, Card, CardContent, Skeleton, Stack, Typography, useTheme } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { profileStats } from '../../shared/geo';
import { formatKm } from '../lib/format';
import { locale, t } from '../lib/i18n';
import { C, HIGHLIGHT } from '../theme';

interface Props {
  profile?: { stepM: number; elevations: number[] };
  loading: boolean;
  error?: string | null;
  doneM: number;
  /** Optional highlighted stretch (a selected run). */
  highlight?: { fromM: number; toM: number } | null;
  peekM?: number | null;
}

const H = 180;
const PAD = { l: 44, r: 8, t: 10, b: 22 };

export default function ElevationProfile({ profile, loading, error, doneM, highlight, peekM }: Props) {
  const theme = useTheme();
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // draw in real pixels so text stays readable and the chart keeps its height on phones
  const [W, setW] = useState(1000);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [profile]);

  const geo = useMemo(() => {
    if (!profile?.elevations.length) return null;
    const e = profile.elevations;
    const stats = profileStats(e);
    const span = Math.max(50, stats.maxM - stats.minM);
    const lo = Math.max(0, stats.minM - span * 0.1);
    const hi = stats.maxM + span * 0.1;
    const totalM = profile.stepM * (e.length - 1);
    const x = (m: number) => PAD.l + (m / totalM) * (W - PAD.l - PAD.r);
    const y = (el: number) => PAD.t + (1 - (el - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    const line = e.map((el, i) => `${i ? 'L' : 'M'}${x(i * profile.stepM).toFixed(1)},${y(el).toFixed(1)}`).join('');
    const area = (fromM: number, toM: number) => {
      const i0 = Math.max(0, Math.floor(fromM / profile.stepM));
      const i1 = Math.min(e.length - 1, Math.ceil(toM / profile.stepM));
      if (i1 <= i0) return '';
      let d = `M${x(i0 * profile.stepM)},${H - PAD.b}`;
      for (let i = i0; i <= i1; i++) d += `L${x(i * profile.stepM).toFixed(1)},${y(e[i]).toFixed(1)}`;
      return `${d}L${x(i1 * profile.stepM)},${H - PAD.b}Z`;
    };
    const ticks = [lo, (lo + hi) / 2, hi].map((v) => Math.round(v / 10) * 10);
    const elevAt = (m: number) => {
      const f = Math.max(0, Math.min(e.length - 1, m / profile.stepM));
      const i = Math.floor(f);
      return i >= e.length - 1 ? e[e.length - 1] : e[i] + (e[i + 1] - e[i]) * (f - i);
    };
    return { stats, x, y, line, area, ticks, totalM, elevAt };
  }, [profile, W]);

  const ink = theme.vars ? 'var(--mui-palette-text-secondary)' : theme.palette.text.secondary;
  const grid = theme.vars ? 'var(--mui-palette-divider)' : theme.palette.divider;

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          <TerrainIcon color="primary" />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t('Elevation profile')}
          </Typography>
          {geo && (
            <Typography variant="body2" color="text.secondary">
              ↑ {Math.round(geo.stats.ascentM).toLocaleString(locale())} m · ↓ {Math.round(geo.stats.descentM).toLocaleString(locale())} m · {t('highest {m} m', { m: Math.round(geo.stats.maxM) })}
            </Typography>
          )}
        </Stack>
        {loading ? (
          <Skeleton variant="rounded" height={160} />
        ) : error ? (
          <Typography color="text.secondary" variant="body2">
            {t("Elevation data isn't available right now ({error}).", { error: String(error) })}
          </Typography>
        ) : geo ? (
          <Box ref={boxRef} sx={{ position: 'relative' }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              width="100%"
              height={H}
              role="img"
              aria-label={t('Elevation profile: {up} m of climbing, highest point {max} m', { up: Math.round(geo.stats.ascentM), max: Math.round(geo.stats.maxM) })}
              style={{ display: 'block', touchAction: 'none' }}
              onPointerMove={(ev) => {
                const r = svgRef.current!.getBoundingClientRect();
                const px = ((ev.clientX - r.left) / r.width) * W;
                const m = ((px - PAD.l) / (W - PAD.l - PAD.r)) * geo.totalM;
                setHover(m >= 0 && m <= geo.totalM ? m : null);
              }}
              onPointerLeave={() => setHover(null)}
            >
              {geo.ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(t)} y2={geo.y(t)} stroke={grid} strokeWidth={1} />
                  <text x={PAD.l - 6} y={geo.y(t) + 4} textAnchor="end" fontSize={12} fill={ink}>
                    {t} m
                  </text>
                </g>
              ))}
              {/* remaining part: neutral; covered part: ember (you) */}
              <path d={geo.area(0, geo.totalM)} fill={grid} opacity={0.9} />
              <path d={geo.area(0, doneM)} opacity={0.22} style={{ fill: C.you }} />
              {highlight && <path d={geo.area(highlight.fromM, highlight.toM)} fill={HIGHLIGHT} opacity={0.55} />}
              <path d={geo.line} fill="none" stroke={ink} strokeWidth={2} strokeLinejoin="round" opacity={0.7} />
              {/* you */}
              <line x1={geo.x(doneM)} x2={geo.x(doneM)} y1={PAD.t} y2={H - PAD.b} strokeWidth={1.5} style={{ stroke: C.you }} />
              <circle cx={geo.x(doneM)} cy={geo.y(geo.elevAt(doneM))} r={5} strokeWidth={2} style={{ fill: C.you, stroke: 'var(--mui-palette-background-paper)' }} />
              <text x={Math.min(W - 34, geo.x(doneM) + 6)} y={PAD.t + 12} fontSize={12} fontWeight={650} style={{ fill: C.you }}>
                {t('you')}
              </text>
              {peekM != null && (
                <circle cx={geo.x(peekM)} cy={geo.y(geo.elevAt(peekM))} r={5} fill="#3D6FA8" stroke="#fff" strokeWidth={2} />
              )}
              <text x={PAD.l} y={H - 6} fontSize={12} fill={ink}>
                0
              </text>
              <text x={W - PAD.r} y={H - 6} fontSize={12} fill={ink} textAnchor="end">
                {formatKm(geo.totalM, 0)}
              </text>
              {hover != null && (
                <g pointerEvents="none">
                  <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.t} y2={H - PAD.b} stroke={ink} strokeDasharray="3 3" />
                  <circle cx={geo.x(hover)} cy={geo.y(geo.elevAt(hover))} r={4} fill={ink} />
                </g>
              )}
            </svg>
            {hover != null && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: `${Math.min(80, (geo.x(hover) / W) * 100)}%`,
                  transform: 'translateX(8px)',
                  bgcolor: 'background.paper',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: '8px',
                  px: 1,
                  py: 0.5,
                  pointerEvents: 'none',
                  boxShadow: 2,
                }}
              >
                <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>
                  {Math.round(geo.elevAt(hover))} m
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('at {km}', { km: formatKm(hover) })} · {hover > doneM ? t('{km} ahead', { km: formatKm(hover - doneM) }) : t('behind you')}
                </Typography>
              </Box>
            )}
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );
}
