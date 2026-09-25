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
    const t = setTimeout(() => {
      setSearching(true);
      setError(null);
      searchTrails(q)
        .then((r) => !cancelled && setResults(r))
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => !cancelled && setSearching(false));
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const load = async (t: TrailSearchResult, rev: boolean) => {
    setSelected(t);
    setReverse(rev);
    setLoading(true);
    setError(null);
    onRoute(null);
    try {
      const r = await loadTrailRoute(t.osmId, rev);
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
            Other trail
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button size="small" startIcon={<SwapIcon />} disabled={loading} onClick={() => load(selected, !reverse)}>
            Reverse direction
          </Button>
        </Stack>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {selected.name} {selected.ref && <Chip size="small" label={selected.ref} sx={{ ml: 0.5 }} />}
        </Typography>
        {loading && (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', color: 'text.secondary' }}>
            <CircularProgress size={18} />
            <Typography variant="body2">Loading the trail from OpenStreetMap. Long trails can take up to a minute…</Typography>
          </Stack>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <TextField
        placeholder="Search a trail: Rennsteig, E5, Camino…"
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
                {picked.blurb} Pick the matching route below. Long trails are often split into sections or variants.
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
          !searching && <Typography color="text.secondary">No trails found. Try another name or its reference, e.g. "E1".</Typography>
        )
      ) : (
        <Stack spacing={2.5}>
          {TRAIL_RECOMMENDATIONS.map((cat) => (
            <Box key={cat.title}>
              <Typography variant="subtitle2">{cat.title}</Typography>
              <Typography variant="caption" color="text.secondary">
                {cat.subtitle}
              </Typography>
              <Box sx={{ display: 'grid', gap: 1, mt: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                {cat.trails.map((t) => (
                  <Card key={t.name}>
                    <CardActionArea
                      sx={{ p: 1.5, height: '100%', display: 'block' }}
                      onClick={() => {
                        setQuery(t.query);
                        setPicked(t);
                      }}
                    >
                      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {t.name}
                        </Typography>
                        <Typography variant="caption" color="primary" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          ~{t.km.toLocaleString()} km
                        </Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" component="div">
                        {t.region} · ≈{Math.max(1, Math.round(t.km / WEEKLY_KM))} weeks at {WEEKLY_KM} km/week
                      </Typography>
                      <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                        {t.blurb}
                      </Typography>
                    </CardActionArea>
                  </Card>
                ))}
              </Box>
            </Box>
          ))}
          <Typography variant="caption" color="text.secondary">
            Trails come from OpenStreetMap hiking relations (via Waymarked Trails). Any waymarked route mapped there can be searched.
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}
