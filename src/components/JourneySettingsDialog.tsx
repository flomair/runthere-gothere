import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { journeyStore } from '../lib/storage';
import { type Journey, SPORT_TYPES } from '../lib/types';
import { t } from '../lib/i18n';

export default function JourneySettingsDialog({ open, onClose, journey }: { open: boolean; onClose: () => void; journey: Journey }) {
  const [name, setName] = useState(journey.name);
  const [startDate, setStartDate] = useState(journey.startDate);
  const [sportTypes, setSportTypes] = useState(journey.sportTypes);
  const [useStrava, setUseStrava] = useState(journey.useStrava);
  const [countElevation, setCountElevation] = useState(!!journey.countElevation);
  const [saving, setSaving] = useState(!!journey.savings);
  const [perKm, setPerKm] = useState(String(journey.savings?.perKm ?? 1));
  const [currency, setCurrency] = useState(journey.savings?.currency ?? 'EUR');
  useEffect(() => {
    if (open) {
      setName(journey.name);
      setStartDate(journey.startDate);
      setSportTypes(journey.sportTypes);
      setUseStrava(journey.useStrava);
      setCountElevation(!!journey.countElevation);
      setSaving(!!journey.savings);
      setPerKm(String(journey.savings?.perKm ?? 1));
      setCurrency(journey.savings?.currency ?? 'EUR');
    }
  }, [open, journey]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('Journey settings')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField label={t('Name')} value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label={t('Count activities from')} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t('Activities that count')}
            </Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
              {SPORT_TYPES.map((s) => {
                const on = sportTypes.includes(s.value);
                return (
                  <Chip
                    key={s.value}
                    label={t(s.label)}
                    color={on ? 'primary' : 'default'}
                    variant={on ? 'filled' : 'outlined'}
                    onClick={() => setSportTypes((cur) => (on ? cur.filter((x) => x !== s.value) : [...cur, s.value]))}
                  />
                );
              })}
            </Stack>
          </Box>
          <FormControlLabel control={<Switch checked={useStrava} onChange={(e) => setUseStrava(e.target.checked)} />} label={t('Use my Strava activities')} />
          <FormControlLabel
            control={<Switch checked={countElevation} onChange={(e) => setCountElevation(e.target.checked)} />}
            label={
              <Box>
                {t('Count climbing as distance')}
                <Typography variant="caption" color="text.secondary" component="div">
                  {t('Every 100 m of ascent counts as 1 km extra ("effort km"). Hilly runs get you over the Alps faster.')}
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            control={<Switch checked={saving} onChange={(e) => setSaving(e.target.checked)} />}
            label={
              <Box>
                {t('Savings jar')}
                <Typography variant="caption" color="text.secondary" component="div">
                  {t('Put money aside for every kilometre, e.g. for the real trip. Shows the saved total.')}
                </Typography>
              </Box>
            }
          />
          {saving && (
            <Stack direction="row" spacing={1.5}>
              <TextField
                label={t('Amount per km')}
                type="number"
                value={perKm}
                onChange={(e) => setPerKm(e.target.value)}
                slotProps={{ htmlInput: { min: 0, step: 0.1 }, input: { endAdornment: <InputAdornment position="end">/ km</InputAdornment> } }}
                sx={{ flexGrow: 1 }}
              />
              <TextField select label={t('Currency')} value={currency} onChange={(e) => setCurrency(e.target.value)} sx={{ width: 120 }}>
                {['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK'].map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button
          variant="contained"
          disabled={!sportTypes.length || !startDate || (saving && !(Number(perKm) >= 0))}
          onClick={() => {
            const savings = saving ? { perKm: Math.max(0, Number(perKm) || 0), currency } : undefined;
            journeyStore.update(journey.id, { name: name.trim() || journey.name, startDate, sportTypes, useStrava, countElevation, savings });
            onClose();
          }}
        >
          {t('Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
