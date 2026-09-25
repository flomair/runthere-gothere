import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import HikingIcon from '@mui/icons-material/Hiking';
import SearchIcon from '@mui/icons-material/Search';
import SwapIcon from '@mui/icons-material/SwapHoriz';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  CircularProgress,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { TRAIL_RECOMMENDATIONS, type TrailRecommendation, loadTrailRoute, searchTrails } from '../lib/trails';
import type { TrailRoute, TrailSearchResult } from '../lib/types';
import { locale, t } from '../lib/i18n';

const WEEKLY_KM = 30;

interface Props {
  onRoute: (route: TrailRoute | null) => void;
  onName: (name: string) => void;
}

export default function TrailPicker({ onRoute, onName }: Props) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<TrailRecommendation | null>(null);
  const [results, setResults] = useState<TrailSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<TrailSearchResult | null>(null);
  const [reverse, setReverse] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      setError(null);
      searchTrails(q)
        .then((r) => !cancelled && setResults(r))
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => !cancelled && setSearching(false));
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const load = async (trail: TrailSearchResult, rev: boolean) => {
    setSelected(trail);
    setReverse(rev);
    setLoading(true);
    setError(null);
    onRoute(null);
    try {
      const r = await loadTrailRoute(trail.osmId, rev);
      onRoute(r);
      onName(r.trail.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSelected(null);
    onRoute(null);
    setError(null);
  };

  if (selected) {
    return (
      <Stack spacing={1.5}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <Button size="small" startIcon={<ArrowBackIcon />} onClick={reset}>
            {t('Other trail')}
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button size="small" startIcon={<SwapIcon />} disabled={loading} onClick={() => load(selected, !reverse)}>
            {t('Reverse direction')}
          </Button>
        </Stack>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {selected.name} {selected.ref && <Chip size="small" label={selected.ref} sx={{ ml: 0.5 }} />}
        </Typography>
        {loading && (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', color: 'text.secondary' }}>
            <CircularProgress size={18} />
            <Typography variant="body2">{t('Loading the trail from OpenStreetMap. Long trails can take up to a minute…')}</Typography>
          </Stack>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <TextField
        placeholder={t('Search a trail: Rennsteig, E5, Camino…')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPicked(null);
        }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: searching ? <CircularProgress size={18} /> : undefined,
          },
        }}
      />
      {error && <Alert severity="error">{error}</Alert>}

      {results ? (
        results.length ? (
          <Box>
            {picked && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {t(picked.blurb)} {t('Pick the matching route below. Long trails are often split into sections or variants.')}
              </Typography>
            )}
            <List dense disablePadding sx={{ maxHeight: 320, overflowY: 'auto' }}>
              {results.map((r) => (
                <ListItemButton key={r.osmId} onClick={() => load(r, picked?.reverse ?? false)} sx={{ borderRadius: '12px' }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <HikingIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <>
                        {r.name} {r.ref && <Chip size="small" label={r.ref} variant="outlined" sx={{ height: 20, ml: 0.5 }} />}
                        {r.network && <Chip size="small" label={r.network} sx={{ height: 20, ml: 0.5 }} />}
                      </>
                    }
                    secondary={r.itinerary}
                    slotProps={{ secondary: { noWrap: true } }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>
        ) : (
          !searching && <Typography color="text.secondary">{t('No trails found. Try another name or its reference, e.g. "E1".')}</Typography>
        )
      ) : (
        <Stack spacing={2.5}>
          {TRAIL_RECOMMENDATIONS.map((cat) => (
            <Box key={cat.title}>
              <Typography variant="subtitle2">{t(cat.title)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {t(cat.subtitle)}
              </Typography>
              <Box sx={{ display: 'grid', gap: 1, mt: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                {cat.trails.map((tr) => (
                  <Card key={tr.name}>
                    <CardActionArea
                      sx={{ p: 1.5, height: '100%', display: 'block' }}
                      onClick={() => {
                        setQuery(tr.query);
                        setPicked(tr);
                      }}
                    >
                      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {tr.name}
                        </Typography>
                        <Typography variant="caption" color="primary" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          ~{tr.km.toLocaleString(locale())} km
                        </Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" component="div">
                        {tr.region} · {t('≈{n} weeks at {w} km/week', { n: Math.max(1, Math.round(tr.km / WEEKLY_KM)), w: WEEKLY_KM })}
                      </Typography>
                      <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                        {t(tr.blurb)}
                      </Typography>
                    </CardActionArea>
                  </Card>
                ))}
              </Box>
            </Box>
          ))}
          <Typography variant="caption" color="text.secondary">
            {t('Trails come from OpenStreetMap hiking relations (via Waymarked Trails). Any waymarked route mapped there can be searched.')}
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}
