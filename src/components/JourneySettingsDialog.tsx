import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { journeyStore } from '../lib/storage';
import { type Journey, SPORT_TYPES } from '../lib/types';

export default function JourneySettingsDialog({ open, onClose, journey }: { open: boolean; onClose: () => void; journey: Journey }) {
  const [name, setName] = useState(journey.name);
  const [startDate, setStartDate] = useState(journey.startDate);
  const [sportTypes, setSportTypes] = useState(journey.sportTypes);
  const [useStrava, setUseStrava] = useState(journey.useStrava);
  useEffect(() => {
    if (open) {
      setName(journey.name);
      setStartDate(journey.startDate);
      setSportTypes(journey.sportTypes);
      setUseStrava(journey.useStrava);
    }
  }, [open, journey]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Journey settings</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Count activities from" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Activities that count
            </Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
              {SPORT_TYPES.map((s) => {
                const on = sportTypes.includes(s.value);
                return (
                  <Chip
                    key={s.value}
                    label={s.label}
                    color={on ? 'primary' : 'default'}
                    variant={on ? 'filled' : 'outlined'}
                    onClick={() => setSportTypes((cur) => (on ? cur.filter((x) => x !== s.value) : [...cur, s.value]))}
                  />
                );
              })}
            </Stack>
          </Box>
          <FormControlLabel control={<Switch checked={useStrava} onChange={(e) => setUseStrava(e.target.checked)} />} label="Use my Strava activities" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!sportTypes.length || !startDate}
          onClick={() => {
            journeyStore.update(journey.id, { name: name.trim() || journey.name, startDate, sportTypes, useStrava });
            onClose();
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
