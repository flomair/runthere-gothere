import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import UploadIcon from '@mui/icons-material/UploadFileOutlined';
import {
  Alert,
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
import { useMediaQuery, type Theme } from '@mui/material';
import { Stagger, StaggerItem } from './motion';
import { type ParsedRun, parseActivityFile } from '../lib/activityFile';
import { formatDate, formatDuration, formatKm, todayIso } from '../lib/format';
import type { Progress, ProgressEntry } from '../lib/progress';
import { journeyStore, newId } from '../lib/storage';
import type { Journey } from '../lib/types';
import { fromUnit, getUnit, toUnit } from '../lib/units';

function AddEntryDialog({ open, onClose, journey }: { open: boolean; onClose: () => void; journey: Journey }) {
  const [date, setDate] = useState(todayIso());
  const [dist, setDist] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<(ParsedRun & { fileName: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = Number(dist.replace(',', '.'));
  const valid = Number.isFinite(value) && value > 0 && value < 10_000 && date >= journey.startDate;

  const reset = () => {
    setDist('');
    setNote('');
    setFile(null);
    setError(null);
  };

  const onFile = async (f: File) => {
    setError(null);
    try {
      const r = await parseActivityFile(f);
      setFile({ ...r, fileName: f.name });
      setDate(r.date);
      setDist(toUnit(r.distanceM).toFixed(2));
      setNote(r.name ?? f.name.replace(/\.(gpx|tcx|fit)$/i, ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Add a run</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Button component="label" variant="outlined" startIcon={<UploadIcon />} sx={{ borderStyle: 'dashed', py: 1.5 }}>
            {file ? file.fileName : 'Import a GPX, TCX or FIT file'}
            <input
              hidden
              type="file"
              accept=".gpx,.tcx,.fit"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = '';
              }}
            />
          </Button>
          {file && (
            <Typography variant="caption" color="text.secondary">
              {[file.movingTimeS && formatDuration(file.movingTimeS), file.elevationGainM != null && `↑ ${file.elevationGainM} m`].filter(Boolean).join(' · ') ||
                'Read from file'}
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label={getUnit() === 'mi' ? 'Miles' : 'Kilometres'} value={dist} onChange={(e) => setDist(e.target.value)} inputMode="decimal" />
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
        <Button
          onClick={() => {
            reset();
            onClose();
          }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!valid}
          onClick={() => {
            journeyStore.update(journey.id, (j) => ({
              manualEntries: [
                ...j.manualEntries,
                {
                  id: newId(),
                  date,
                  distanceM: Math.round(fromUnit(value)),
                  note: note.trim() || undefined,
                  movingTimeS: file?.movingTimeS,
                  elevationGainM: file?.elevationGainM,
                  source: file ? 'file' : undefined,
                },
              ],
            }));
            reset();
            onClose();
          }}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface Props {
  journey: Journey;
  progress: Progress;
  /** Currently highlighted entry (shown on the map and profile). */
  selectedKey?: string | null;
  onSelect?: (entry: ProgressEntry | null) => void;
}

export default function ActivityLog({ journey, progress, selectedKey, onSelect }: Props) {
  const [adding, setAdding] = useState(false);
  const rows = [...progress.entries].reverse();
  const isMobile = useMediaQuery((t: Theme) => t.breakpoints.down('sm'));

  const toggleExcluded = (id: number) =>
    journeyStore.update(journey.id, (j) => ({
      excludedActivityIds: j.excludedActivityIds.includes(id) ? j.excludedActivityIds.filter((x) => x !== id) : [...j.excludedActivityIds, id],
    }));

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Logbook</Typography>
            {rows.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                Tap a run to see the stretch it covered on the map.
              </Typography>
            )}
          </Box>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)} sx={{ flexShrink: 0 }}>
            Add run
          </Button>
        </Stack>
        {rows.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            No activities yet since {formatDate(journey.startDate)}. Go for a run, and it will show up here once it's on Strava.
          </Typography>
        ) : isMobile ? (
          <Stagger gap={0.03} sx={{ display: 'grid', gap: 1 }}>
            {rows.map((e) => {
              const selected = selectedKey === e.key;
              return (
                <StaggerItem key={e.key}>
                  <Box
                    onClick={() => !e.excluded && onSelect?.(selected ? null : e)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      p: 1.25,
                      borderRadius: '16px',
                      border: 1,
                      borderColor: selected ? 'primary.main' : 'divider',
                      bgcolor: selected ? 'action.selected' : 'transparent',
                      opacity: e.excluded ? 0.45 : 1,
                      transition: 'background-color .2s, border-color .2s',
                      '&:active': { transform: 'scale(0.99)' },
                    }}
                  >
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: '12px',
                        flexShrink: 0,
                        display: 'grid',
                        placeItems: 'center',
                        textAlign: 'center',
                        lineHeight: 1.05,
                        bgcolor: 'action.hover',
                      }}
                    >
                      <Typography sx={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1 }}>{new Date(e.date.length === 10 ? `${e.date}T12:00:00` : e.date).getDate()}</Typography>
                      <Typography variant="caption" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', lineHeight: 1 }}>
                        {new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(e.date.length === 10 ? `${e.date}T12:00:00` : e.date))}
                      </Typography>
                    </Box>
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Typography sx={{ fontWeight: 600 }} noWrap>
                        {e.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap component="div">
                        {[e.source === 'manual' ? 'manual' : e.sportType, e.movingTimeS && formatDuration(e.movingTimeS), e.elevationGainM ? `↑ ${Math.round(e.elevationGainM)} m` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                      <Typography sx={{ fontWeight: 800 }}>{formatKm(e.distanceM)}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        at {formatKm(e.cumulativeM, 0)}
                      </Typography>
                    </Box>
                    {e.activityId != null && (
                      <Checkbox size="small" checked={!e.excluded} onClick={(ev) => ev.stopPropagation()} onChange={() => toggleExcluded(e.activityId!)} sx={{ ml: -0.5 }} />
                    )}
                    {e.manualId && (
                      <IconButton
                        size="small"
                        aria-label="delete entry"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          journeyStore.update(journey.id, (j) => ({ manualEntries: j.manualEntries.filter((m) => m.id !== e.manualId) }));
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                </StaggerItem>
              );
            })}
          </Stagger>
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
                {rows.map((e) => {
                  const selected = selectedKey === e.key;
                  return (
                    <TableRow
                      key={e.key}
                      hover
                      selected={selected}
                      onClick={() => !e.excluded && onSelect?.(selected ? null : e)}
                      sx={{ opacity: e.excluded ? 0.45 : 1, cursor: e.excluded ? 'default' : 'pointer' }}
                    >
                      <TableCell padding="checkbox" onClick={(ev) => ev.stopPropagation()}>
                        {e.activityId != null && <Checkbox size="small" checked={!e.excluded} onChange={() => toggleExcluded(e.activityId!)} />}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(e.date)}</TableCell>
                      <TableCell>
                        {e.activityId != null ? (
                          <a href={`https://www.strava.com/activities/${e.activityId}`} target="_blank" rel="noopener" style={{ color: 'inherit' }} onClick={(ev) => ev.stopPropagation()}>
                            {e.label}
                          </a>
                        ) : (
                          e.label
                        )}{' '}
                        <Chip size="small" label={e.source === 'manual' ? 'manual' : e.sportType} variant="outlined" sx={{ ml: 0.5, height: 20 }} />
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          {[e.movingTimeS && formatDuration(e.movingTimeS), e.elevationGainM ? `↑ ${Math.round(e.elevationGainM)} m` : null].filter(Boolean).join(' · ')}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {formatKm(e.distanceM)}
                        {e.countedM > e.distanceM + 1 && (
                          <Typography variant="caption" color="text.secondary" component="div">
                            counts {formatKm(e.countedM)}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {formatKm(e.cumulativeM, 0)}
                      </TableCell>
                      <TableCell padding="checkbox" onClick={(ev) => ev.stopPropagation()}>
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
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardContent>
      <AddEntryDialog open={adding} onClose={() => setAdding(false)} journey={journey} />
    </Card>
  );
}
