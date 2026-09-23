import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { formatDate, formatDuration, formatKm, todayIso } from '../lib/format';
import type { Progress } from '../lib/progress';
import { journeyStore, newId } from '../lib/storage';
import type { Journey } from '../lib/types';

function AddEntryDialog({ open, onClose, journey }: { open: boolean; onClose: () => void; journey: Journey }) {
  const [date, setDate] = useState(todayIso());
  const [km, setKm] = useState('');
  const [note, setNote] = useState('');
  const value = Number(km.replace(',', '.'));
  const valid = Number.isFinite(value) && value > 0 && value < 10_000 && date >= journey.startDate;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Add distance manually</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Kilometres" value={km} onChange={(e) => setKm(e.target.value)} inputMode="decimal" autoFocus />
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            error={date < journey.startDate}
            helperText={date < journey.startDate ? 'Before the journey started' : undefined}
          />
          <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Treadmill, forgot my watch…" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!valid}
          onClick={() => {
            journeyStore.update(journey.id, (j) => ({
              manualEntries: [...j.manualEntries, { id: newId(), date, distanceM: value * 1000, note: note.trim() || undefined }],
            }));
            setKm('');
            setNote('');
            onClose();
          }}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ActivityLog({ journey, progress }: { journey: Journey; progress: Progress }) {
  const [adding, setAdding] = useState(false);
  const rows = [...progress.entries].reverse();

  const toggleExcluded = (id: number) =>
    journeyStore.update(journey.id, (j) => ({
      excludedActivityIds: j.excludedActivityIds.includes(id)
        ? j.excludedActivityIds.filter((x) => x !== id)
        : [...j.excludedActivityIds, id],
    }));

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Logbook
          </Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
            Add distance
          </Button>
        </Stack>
        {rows.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            No activities yet since {formatDate(journey.startDate)}. Go for a run, and it will show up here once it's on Strava.
          </Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Tooltip title="Counts toward the journey">
                      <span>✓</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Activity</TableCell>
                  <TableCell align="right">Distance</TableCell>
                  <TableCell align="right">Along route</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.key} sx={{ opacity: e.excluded ? 0.45 : 1 }}>
                    <TableCell padding="checkbox">
                      {e.activityId != null && <Checkbox size="small" checked={!e.excluded} onChange={() => toggleExcluded(e.activityId!)} />}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(e.date)}</TableCell>
                    <TableCell>
                      {e.activityId != null ? (
                        <a href={`https://www.strava.com/activities/${e.activityId}`} target="_blank" rel="noopener" style={{ color: 'inherit' }}>
                          {e.label}
                        </a>
                      ) : (
                        e.label
                      )}{' '}
                      <Chip size="small" label={e.source === 'manual' ? 'manual' : e.sportType} variant="outlined" sx={{ ml: 0.5, height: 20 }} />
                      {e.movingTimeS ? (
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          {formatDuration(e.movingTimeS)}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {formatKm(e.distanceM)}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatKm(e.cumulativeM, 0)}
                    </TableCell>
                    <TableCell padding="checkbox">
                      {e.manualId && (
                        <IconButton
                          size="small"
                          aria-label="delete entry"
                          onClick={() => journeyStore.update(journey.id, (j) => ({ manualEntries: j.manualEntries.filter((m) => m.id !== e.manualId) }))}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardContent>
      <AddEntryDialog open={adding} onClose={() => setAdding(false)} journey={journey} />
    </Card>
  );
}
