import PlaceIcon from '@mui/icons-material/PlaceOutlined';
import { Autocomplete, Box, CircularProgress, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { geocode } from '../lib/api';
import type { GeoResult } from '../lib/types';

interface Props {
  label: string;
  value: GeoResult | null;
  onChange: (v: GeoResult | null) => void;
  /** Text to search for automatically on mount (e.g. from a preset). */
  initialQuery?: string;
  autoFocus?: boolean;
}

export default function PlaceField({ label, value, onChange, initialQuery, autoFocus }: Props) {
  const [input, setInput] = useState(initialQuery ?? '');
  const [options, setOptions] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // resolve a preset query to its best match once
  useEffect(() => {
    if (!initialQuery || value) return;
    let cancelled = false;
    geocode(initialQuery)
      .then((r) => {
        if (!cancelled && r[0]) onChange(r[0]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  useEffect(() => {
    const q = input.trim();
    if (q.length < 2 || q === value?.name || q === value?.displayName) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      geocode(q)
        .then((r) => {
          if (!cancelled) {
            setOptions(r);
            setError(null);
          }
        })
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => !cancelled && setLoading(false));
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [input, value]);

  return (
    <Autocomplete<GeoResult>
      value={value}
      onChange={(_, v) => onChange(v)}
      inputValue={input}
      onInputChange={(_, v) => setInput(v)}
      options={value && !options.includes(value) ? [value, ...options] : options}
      filterOptions={(x) => x}
      getOptionLabel={(o) => o.name}
      getOptionKey={(o) => `${o.lat},${o.lon},${o.displayName}`}
      isOptionEqualToValue={(a, b) => a.lat === b.lat && a.lon === b.lon}
      loading={loading}
      noOptionsText={input.trim().length < 2 ? 'Type a city, address or landmark' : 'No matches'}
      renderOption={({ key, ...props }, o) => (
        <li key={key} {...props}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', minWidth: 0 }}>
            <PlaceIcon color="action" fontSize="small" />
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap>{o.name}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap component="div">
                {o.displayName}
              </Typography>
            </Box>
          </Box>
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          autoFocus={autoFocus}
          error={!!error}
          helperText={error ?? (value ? value.displayName : undefined)}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={18} /> : null}
                  {params.slotProps.input.endAdornment}
                </>
              ),
            },
            formHelperText: { sx: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
          }}
        />
      )}
    />
  );
}
