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
import { useQueryClient } from '@tanstack/react-query';
import {
  STYLE_LABELS,
  deleteAiKey,
  loadNarration,
  narrationKey,
  saveAiKey,
  saveNarratorSettings,
  streamNarration,
  testAiKey,
  useNarratorSettings,
} from '../lib/narrator';
import type { NarrateRequest, NarrationStyle } from '../lib/types';
import { t } from '../lib/i18n';

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

function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useNarratorSettings();
  const voices = useVoices();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const stored = me?.ai ?? null;
  const [key, setKey] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [result, setResult] = useState<{ busy: boolean; ok?: boolean; text?: string }>({ busy: false });
  useEffect(() => {
    if (open) {
      setKey('');
      setWorkspace(stored?.workspaceId ?? '');
      setResult({ busy: false });
    }
  }, [open, stored?.workspaceId]);
  const preferred = voices.filter((v) => v.lang.toLowerCase().startsWith(lang()));
  const list = preferred.length ? [...preferred, ...voices.filter((v) => !preferred.includes(v))] : voices;

  const run = async (fn: () => ReturnType<typeof testAiKey>, okText: (model: string) => string) => {
    setResult({ busy: true });
    const r = await fn();
    setResult({ busy: false, ok: r.ok, text: r.ok ? okText(r.model) : r.error });
    await qc.invalidateQueries({ queryKey: ['me'] });
    if (r.ok) setKey('');
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('Narrator settings')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Box>
            <Typography variant="subtitle2">{t('Your Anthropic API key')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {stored ? (
                <>
                  {t('Saved:')} <code>{stored.masked}</code>
                  {stored.workspaceId ? ` · workspace ${stored.workspaceId}` : ''}. {t('Stored encrypted in your account and used only for your stories.')}
                </>
              ) : (
                t('Each person uses their own key (console.anthropic.com → API Keys). It is checked, then stored encrypted in your account.')
              )}
            </Typography>
          </Box>
          <TextField
            label={stored ? t('Replace with a new key') : t('API key')}
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-api03-…"
            autoComplete="off"
          />
          <TextField
            label={t('Workspace ID (only for organization-level keys)')}
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            placeholder="wrkspc_…"
            autoComplete="off"
            size="small"
            helperText={t('Leave empty unless Anthropic says the key is not scoped to a workspace.')}
          />
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              loading={result.busy}
              disabled={!key.trim()}
              onClick={() => run(() => saveAiKey(key, workspace), (m) => t('Saved. The key works with {model}.', { model: m }))}
            >
              {t('Check & save key')}
            </Button>
            {stored && (
              <Button variant="outlined" disabled={result.busy} onClick={() => run(testAiKey, (m) => t('Your saved key works with {model}.', { model: m }))}>
                {t('Test saved key')}
              </Button>
            )}
            {stored && (
              <Button
                color="error"
                disabled={result.busy}
                onClick={async () => {
                  if (!confirm(t('Remove your saved API key?'))) return;
                  await deleteAiKey();
                  setResult({ busy: false });
                  await qc.invalidateQueries({ queryKey: ['me'] });
                }}
              >
                {t('Remove key')}
              </Button>
            )}
          </Stack>
          {result.text && (
            <Alert severity={result.ok ? 'success' : 'error'} sx={{ wordBreak: 'break-word' }}>
              {result.text}
            </Alert>
          )}
          <TextField select label={t('Style')} value={s.style} onChange={(e) => saveNarratorSettings({ style: e.target.value as NarrationStyle })}>
            {Object.entries(STYLE_LABELS).map(([v, l]) => (
              <MenuItem key={v} value={v}>
                {t(l)}
              </MenuItem>
            ))}
          </TextField>
          {list.length > 0 && (
            <TextField select label={t('Voice for reading aloud (this device)')} value={s.voiceURI ?? ''} onChange={(e) => saveNarratorSettings({ voiceURI: e.target.value || null })}>
              <MenuItem value="">{t('Browser default')}</MenuItem>
              {list.map((v) => (
                <MenuItem key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </MenuItem>
              ))}
            </TextField>
          )}
          <Box>
            <Typography variant="body2" gutterBottom>
              {t('Speaking rate: {rate}×', { rate: s.rate.toFixed(1) })}
            </Typography>
            <Slider min={0.6} max={1.6} step={0.1} value={s.rate} onChange={(_, v) => saveNarratorSettings({ rate: v as number })} />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          {t('Done')}
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
  const key = narrationKey(journeyId, request.lat, request.lon, settings.style);
  const [text, setText] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // new point or style → show the saved story for it, if any
  useEffect(() => {
    let cancelled = false;
    setText('');
    setSavedAt(null);
    setError(null);
    abortRef.current?.abort();
    loadNarration(key)
      .then((n) => {
        if (!cancelled && n) {
          setText(n.text);
          setSavedAt(n.at);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const canRun = !!me?.ai;

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
      const full = await streamNarration({ ...request, style: settings.style, language: lang(), saveKey: key }, setText, ac.signal);
      if (full.trim() && !full.includes('\n\n[')) setSavedAt(new Date().toISOString());
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
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1.5 }}>
          <AutoStoriesIcon color="primary" />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t(STYLE_LABELS[settings.style])} · {me?.features.googlePlaces ? t('written by Claude from live weather, Wikipedia, Google places and your progress') : t('written by Claude from live weather, Wikipedia and your progress')}
            </Typography>
          </Box>
          <Tooltip title={t('Narrator settings')}>
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
          <Alert severity="info" sx={{ mb: 2 }} action={<Button onClick={() => setSettingsOpen(true)}>{t('Add key')}</Button>}>
            {t('Add your Anthropic API key to get a written or spoken description of where you are.')}
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
              {t("Let the narrator describe this spot: what you'd see, the weather right now, and a detour into its history.")}
            </Typography>
          )
        )}

        <Stack direction="row" sx={{ gap: 1, mt: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="contained" onClick={generate} loading={busy} startIcon={<AutoStoriesIcon />}>
            {text ? t('Tell it again') : t('Tell me about this place')}
          </Button>
          {text && !busy && 'speechSynthesis' in window && (
            <Button variant="outlined" onClick={speak} startIcon={speaking ? <StopIcon /> : <VolumeUpIcon />}>
              {speaking ? t('Stop') : t('Read aloud')}
            </Button>
          )}
          {savedAt && !busy && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              {t('Written {when}', { when: formatDate(savedAt, { dateStyle: 'medium', timeStyle: 'short' }) })}
            </Typography>
          )}
        </Stack>
      </CardContent>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Card>
  );
}
