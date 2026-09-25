import AutoStoriesIcon from '@mui/icons-material/AutoStoriesOutlined';
import SettingsIcon from '@mui/icons-material/SettingsOutlined';
import StopIcon from '@mui/icons-material/StopCircleOutlined';
import VolumeUpIcon from '@mui/icons-material/VolumeUpOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Slider,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Fragment, useEffect, useRef, useState } from 'react';
import { lang, useMe } from '../lib/api';
import { formatDate } from '../lib/format';
import {
  STYLE_LABELS,
  authHeaders,
  loadNarration,
  narrationKey,
  saveNarratorSettings,
  storeNarration,
  streamNarration,
  useNarratorSettings,
} from '../lib/narrator';
import type { NarrateRequest, NarrationStyle } from '../lib/types';

function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  return voices;
}

/** Render plain text with *italic* spans and paragraphs. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <Typography key={i} sx={{ mb: 2, lineHeight: 1.75, fontFamily: '"Georgia", "Iowan Old Style", serif', fontSize: '1.05rem' }}>
          {para.split(/(\*[^*\n]+\*)/g).map((part, j) =>
            /^\*[^*]+\*$/.test(part) ? (
              <Box key={j} component="em" sx={{ fontWeight: 600, color: 'primary.main' }}>
                {part.slice(1, -1)}
              </Box>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            ),
          )}
        </Typography>
      ))}
    </>
  );
}

function SettingsDialog({ open, onClose, serverKey }: { open: boolean; onClose: () => void; serverKey: boolean }) {
  const s = useNarratorSettings();
  const voices = useVoices();
  const [key, setKey] = useState(s.apiKey);
  const [workspace, setWorkspace] = useState(s.workspaceId);
  const [test, setTest] = useState<{ busy: boolean; ok?: boolean; text?: string }>({ busy: false });
  useEffect(() => {
    setKey(s.apiKey);
    setWorkspace(s.workspaceId);
    setTest({ busy: false });
  }, [s.apiKey, s.workspaceId, open]);

  const runTest = async () => {
    setTest({ busy: true });
    try {
      const res = await fetch('/api/ai-check', { method: 'POST', headers: authHeaders(key, workspace) });
      const r = (await res.json()) as { ok: boolean; source?: string; masked?: string; model?: string; error?: string };
      setTest({
        busy: false,
        ok: r.ok,
        text: r.ok ? `Works: ${r.source === 'yours' ? 'your key' : "the server's key"} (${r.masked}) can use ${r.model}.` : r.error,
      });
    } catch (e) {
      setTest({ busy: false, ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };
  const preferred = voices.filter((v) => v.lang.toLowerCase().startsWith(lang()));
  const list = preferred.length ? [...preferred, ...voices.filter((v) => !preferred.includes(v))] : voices;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Narrator settings</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Your Anthropic API key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-…"
            autoComplete="off"
            helperText={
              serverKey
                ? 'Optional: this deployment already has a key. Add yours to use your own account. Leave empty to use the server key.'
                : 'Stored only in this browser. It is sent along with narration requests and never saved on the server. Get a key at console.anthropic.com.'
            }
          />
          {key.trim() && (
            <TextField
              label="Workspace ID (only for organization-level keys)"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              placeholder="wrkspc_…"
              autoComplete="off"
              size="small"
              helperText="Leave empty unless Anthropic says the key is not scoped to a workspace. Find the ID under Console → Settings → Workspaces."
            />
          )}
          <Box>
            <Button size="small" variant="outlined" onClick={runTest} loading={test.busy} disabled={!key.trim() && !serverKey}>
              {key.trim() ? 'Test this key' : "Test the server's key"}
            </Button>
            {test.text && (
              <Alert severity={test.ok ? 'success' : 'error'} sx={{ mt: 1.5, wordBreak: 'break-word' }}>
                {test.text}
              </Alert>
            )}
          </Box>
          <TextField select label="Style" value={s.style} onChange={(e) => saveNarratorSettings({ style: e.target.value as NarrationStyle })}>
            {Object.entries(STYLE_LABELS).map(([v, l]) => (
              <MenuItem key={v} value={v}>
                {l}
              </MenuItem>
            ))}
          </TextField>
          {list.length > 0 && (
            <TextField select label="Voice for reading aloud" value={s.voiceURI ?? ''} onChange={(e) => saveNarratorSettings({ voiceURI: e.target.value || null })}>
              <MenuItem value="">Browser default</MenuItem>
              {list.map((v) => (
                <MenuItem key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </MenuItem>
              ))}
            </TextField>
          )}
          <Box>
            <Typography variant="body2" gutterBottom>
              Speaking rate: {s.rate.toFixed(1)}×
            </Typography>
            <Slider min={0.6} max={1.6} step={0.1} value={s.rate} onChange={(_, v) => saveNarratorSettings({ rate: v as number })} />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        {s.apiKey && (
          <Button color="error" onClick={() => saveNarratorSettings({ apiKey: '', workspaceId: '' })}>
            Remove key
          </Button>
        )}
        <Button
          variant="contained"
          onClick={() => {
            saveNarratorSettings({ apiKey: key.trim(), workspaceId: workspace.trim() });
            onClose();
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface Props {
  journeyId: string;
  request: Omit<NarrateRequest, 'style' | 'language'>;
  title: string;
}

export default function NarratorCard({ journeyId, request, title }: Props) {
  const settings = useNarratorSettings();
  const { data: me } = useMe();
  const voices = useVoices();
  const serverKey = !!me?.features.ai;
  const key = narrationKey(journeyId, request.lat, request.lon, settings.style);
  const [text, setText] = useState<string>(() => loadNarration(key)?.text ?? '');
  const [savedAt, setSavedAt] = useState<string | null>(() => loadNarration(key)?.at ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // new point or style → show the saved story for it, if any
  useEffect(() => {
    const saved = loadNarration(key);
    setText(saved?.text ?? '');
    setSavedAt(saved?.at ?? null);
    setError(null);
    abortRef.current?.abort();
  }, [key]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const canRun = serverKey || !!settings.apiKey;

  const generate = async () => {
    if (!canRun) {
      setSettingsOpen(true);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(null);
    setText('');
    try {
      const full = await streamNarration({ ...request, style: settings.style, language: lang() }, settings, setText, ac.signal);
      if (full.trim()) {
        storeNarration(key, full);
        setSavedAt(new Date().toISOString());
      }
    } catch (e) {
      if (!ac.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const speak = () => {
    if (!('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text.replace(/\*/g, ''));
    u.lang = navigator.language;
    u.rate = settings.rate;
    const v = voices.find((x) => x.voiceURI === settings.voiceURI);
    if (v) u.voice = v;
    u.onend = u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  };

  return (
    <Card sx={{ borderColor: 'primary.main', borderWidth: 1.5 }}>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1.5 }}>
          <AutoStoriesIcon color="primary" />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {STYLE_LABELS[settings.style]} · written by Claude from live weather, Wikipedia{me?.features.googlePlaces ? ', Google places' : ''} and your progress
            </Typography>
          </Box>
          <Tooltip title="Narrator settings">
            <IconButton onClick={() => setSettingsOpen(true)} aria-label="narrator settings">
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {!canRun && (
          <Alert severity="info" sx={{ mb: 2 }} action={<Button onClick={() => setSettingsOpen(true)}>Add key</Button>}>
            Add your Anthropic API key to get a written or spoken description of where you are.
          </Alert>
        )}

        {text ? (
          <Box sx={{ maxHeight: 520, overflowY: 'auto', pr: 1 }}>
            <Prose text={text} />
            {busy && <Box component="span" sx={{ display: 'inline-block', width: 8, height: 18, bgcolor: 'primary.main', animation: 'rtgt-blink 1s steps(2) infinite', '@keyframes rtgt-blink': { to: { opacity: 0 } } }} />}
          </Box>
        ) : (
          canRun && (
            <Typography color="text.secondary" sx={{ mb: 1 }}>
              Let the narrator describe this spot: what you'd see, the weather right now, and a detour into its history.
            </Typography>
          )
        )}

        <Stack direction="row" sx={{ gap: 1, mt: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="contained" onClick={generate} loading={busy} startIcon={<AutoStoriesIcon />}>
            {text ? 'Tell it again' : 'Tell me about this place'}
          </Button>
          {text && !busy && 'speechSynthesis' in window && (
            <Button variant="outlined" onClick={speak} startIcon={speaking ? <StopIcon /> : <VolumeUpIcon />}>
              {speaking ? 'Stop' : 'Read aloud'}
            </Button>
          )}
          {savedAt && !busy && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              Written {formatDate(savedAt, { dateStyle: 'medium', timeStyle: 'short' })}
            </Typography>
          )}
        </Stack>
      </CardContent>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} serverKey={serverKey} />
    </Card>
  );
}
