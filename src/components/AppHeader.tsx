import AdminIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import LogoutIcon from '@mui/icons-material/Logout';
import StraightenIcon from '@mui/icons-material/Straighten';
import SyncIcon from '@mui/icons-material/Sync';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Divider,
  IconButton,
  Link,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Switch,
  Toolbar,
  Tooltip,
  Typography,
  useColorScheme,
} from '@mui/material';
import { useState } from 'react';
import { useMe, useStravaActions } from '../lib/api';
import { signOutUser } from '../lib/firebase';
import { formatDate } from '../lib/format';
import { navigate } from '../lib/nav';
import { getUnit, setUnit } from '../lib/units';
import { useInstallAction } from './InstallPrompt';
import { usePush } from '../lib/push';
import { vapidKey } from '../lib/firebase';
import NotificationsIcon from '@mui/icons-material/NotificationsOutlined';
import TranslateIcon from '@mui/icons-material/Translate';
import { getLang, setLang, t } from '../lib/i18n';
import StravaButton from './StravaButton';
import InstallMobileIcon from '@mui/icons-material/InstallMobile';
import CollectionsIcon from '@mui/icons-material/CollectionsBookmarkOutlined';
import QuestIcon from '@mui/icons-material/SportsKabaddiOutlined';
import GiftIcon from '@mui/icons-material/CardGiftcardOutlined';
import { usePlayCount } from './PlayStrip';

export default function AppHeader() {
  const { data: me } = useMe();
  const strava = useStravaActions();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { mode, systemMode, setMode } = useColorScheme();
  const effective = mode === 'system' ? systemMode : mode;
  const close = () => setAnchor(null);
  const installAction = useInstallAction();
  const push = usePush();
  const playCount = usePlayCount();

  return (
    <AppBar
      position="sticky"
      color="inherit"
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        pt: 'env(safe-area-inset-top)',
        backdropFilter: 'saturate(180%) blur(16px)',
        bgcolor: 'color-mix(in srgb, var(--mui-palette-background-default) 72%, transparent)',
      }}
    >
      <Toolbar sx={{ gap: 1, minHeight: { xs: 56, sm: 64 } }}>
        <Link
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
          underline="none"
          color="inherit"
          sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexGrow: 1, minWidth: 0 }}
        >
          <Box
            component="img"
            src="/logo.svg"
            alt=""
            sx={(theme) => ({
              width: 38,
              height: 38,
              flexShrink: 0,
              // the navy footprints need a light tile on dark backgrounds
              ...theme.applyStyles('dark', { bgcolor: '#fff', borderRadius: '10px', p: '3px' }),
            })}
          />
          <Typography variant="h6" noWrap sx={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>
            Run There
            <Box component="span" sx={{ color: 'secondary.main', mx: 0.75 }}>
              ·
            </Box>
            Go There
          </Typography>
        </Link>

        <Tooltip title={effective === 'dark' ? t('Light mode') : t('Dark mode')}>
          <IconButton onClick={() => setMode(effective === 'dark' ? 'light' : 'dark')} aria-label="toggle color mode" sx={{ display: { xs: 'none', sm: 'inline-flex' }, width: 40, height: 40, bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' } }}>
            {effective === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Tooltip>

        {me && (
          <Tooltip title={t('Challenges & gifts')}>
            <IconButton
              onClick={() => navigate('/play')}
              aria-label="challenges and gifts"
              sx={{ width: 40, height: 40, color: '#fff', backgroundImage: 'linear-gradient(135deg, #7B5CF0, #A259E8 55%, #D65DB1)', boxShadow: '0 6px 16px -8px rgba(162, 89, 232, 0.9)', '&:hover': { filter: 'brightness(1.08)' } }}
            >
              <Badge color="error" badgeContent={playCount} invisible={!playCount} overlap="circular" sx={{ '& .MuiBadge-badge': { border: '2px solid var(--mui-palette-background-default)' } }}>
                <GiftIcon />
              </Badge>
            </IconButton>
          </Tooltip>
        )}

        {me && !me.strava && me.features.strava && (
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <StravaButton size="small" />
          </Box>
        )}

        {me && (
          <>
            <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="account menu">
              <Avatar src={me.user.picture} alt={me.user.name} sx={{ width: 32, height: 32 }} />
            </IconButton>
            <Menu anchorEl={anchor} open={!!anchor} onClose={close} slotProps={{ paper: { sx: { minWidth: 260 } } }}>
              <Box sx={{ px: 2, py: 1 }}>
                <Typography sx={{ fontWeight: 600 }}>{me.user.name ?? me.user.email}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {me.user.email}
                </Typography>
              </Box>
              <Divider />
              {me.strava ? (
                [
                  <MenuItem
                    key="sync"
                    disabled={syncing}
                    onClick={async () => {
                      setSyncing(true);
                      try {
                        await strava.sync();
                      } finally {
                        setSyncing(false);
                        close();
                      }
                    }}
                  >
                    <ListItemIcon>
                      <SyncIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={syncing ? t('Syncing…') : t('Sync Strava now')}
                      secondary={me.strava.lastSyncAt ? t('last: {when}', { when: formatDate(me.strava.lastSyncAt, { dateStyle: 'short', timeStyle: 'short' }) }) : undefined}
                    />
                  </MenuItem>,
                  <MenuItem
                    key="disconnect"
                    onClick={async () => {
                      close();
                      if (confirm(t('Disconnect Strava? Runs already synced stay; new runs stop arriving.'))) await strava.disconnect();
                    }}
                  >
                    <ListItemIcon>
                      <LinkOffIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={t('Disconnect Strava')} secondary={[me.strava.athlete.firstname, me.strava.athlete.lastname].filter(Boolean).join(' ')} />
                  </MenuItem>,
                ]
              ) : me.features.strava ? (
                <Box sx={{ px: 2, py: 1 }}>
                  <StravaButton size="small" fullWidth />
                </Box>
              ) : null}
              <MenuItem onClick={() => setMode(effective === 'dark' ? 'light' : 'dark')} sx={{ display: { sm: 'none' } }}>
                <ListItemIcon>{effective === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}</ListItemIcon>
                <ListItemText primary={effective === 'dark' ? t('Light mode') : t('Dark mode')} />
              </MenuItem>
              <MenuItem onClick={() => setUnit(getUnit() === 'km' ? 'mi' : 'km')}>
                <ListItemIcon>
                  <StraightenIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={getUnit() === 'km' ? t('Show miles') : t('Show kilometres')} secondary={t('currently {unit}', { unit: getUnit() })} />
              </MenuItem>
              <MenuItem onClick={() => setLang(getLang() === 'de' ? 'en' : 'de')}>
                <ListItemIcon>
                  <TranslateIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={getLang() === 'de' ? 'Switch to English' : 'Auf Deutsch umstellen'} secondary={getLang() === 'de' ? 'Sprache: Deutsch' : 'Language: English'} />
              </MenuItem>
              {(push.status !== 'unsupported' || me.user.isAdmin) && (
                <MenuItem
                  disabled={push.busy || push.status === 'unsupported' || push.status === 'denied'}
                  onClick={async () => {
                    const wasOn = push.status === 'on';
                    if (push.status === 'needs-install') {
                      close();
                      installAction.run();
                      return;
                    }
                    await push.toggle();
                    if (!wasOn) void push.test().catch(() => undefined);
                  }}
                >
                  <ListItemIcon>
                    <NotificationsIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={t('Notifications')}
                    secondary={
                      push.error ??
                      {
                        on: t('On for this device'),
                        off: t('Milestones, kudos and comments'),
                        denied: t('Blocked in the browser settings'),
                        'needs-install': t('Install the app first (Share → Add to Home Screen)'),
                        unsupported: vapidKey ? t('Not supported in this browser') : t('Needs VITE_FIREBASE_VAPID_KEY (see README)'),
                      }[push.status]
                    }
                    slotProps={{ secondary: { sx: { whiteSpace: 'normal', color: push.error ? 'error.main' : undefined } } }}
                  />
                  <Switch edge="end" size="small" checked={push.status === 'on'} tabIndex={-1} sx={{ ml: 1 }} />
                </MenuItem>
              )}
              <MenuItem
                onClick={() => {
                  close();
                  navigate('/play');
                }}
              >
                <ListItemIcon>
                  <QuestIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={t('Challenges & gifts')} secondary={t('Challenge friends, answer challenges')} />
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  navigate('/collection');
                }}
              >
                <ListItemIcon>
                  <CollectionsIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={t('My collection')} secondary={t('Passport stamps and claimed rewards')} />
              </MenuItem>
              {installAction.available && (
                <MenuItem
                  onClick={() => {
                    close();
                    installAction.run();
                  }}
                >
                  <ListItemIcon>
                    <InstallMobileIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={t('Install app')} secondary={t('Home screen, full screen, works offline')} />
                </MenuItem>
              )}
              {me.user.isAdmin && (
                <MenuItem
                  onClick={() => {
                    close();
                    navigate('/admin');
                  }}
                >
                  <ListItemIcon>
                    <AdminIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={t('Admin')} secondary={t('Who can use the app, Strava sync')} />
                </MenuItem>
              )}
              <Divider />
              <MenuItem
                onClick={() => {
                  close();
                  void signOutUser();
                }}
              >
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                {t('Sign out')}
              </MenuItem>
            </Menu>
          </>
        )}
      </Toolbar>
      {installAction.dialog}
    </AppBar>
  );
}
