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
  Box,
  Divider,
  IconButton,
  Link,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
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
import StravaButton from './StravaButton';
import InstallMobileIcon from '@mui/icons-material/InstallMobile';

export default function AppHeader() {
  const { data: me } = useMe();
  const strava = useStravaActions();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { mode, systemMode, setMode } = useColorScheme();
  const effective = mode === 'system' ? systemMode : mode;
  const close = () => setAnchor(null);
  const installAction = useInstallAction();

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
            <Box component="span" sx={{ color: 'primary.main', mx: 0.75 }}>
              ·
            </Box>
            Go There
          </Typography>
        </Link>

        <Tooltip title={effective === 'dark' ? 'Light mode' : 'Dark mode'}>
          <IconButton onClick={() => setMode(effective === 'dark' ? 'light' : 'dark')} aria-label="toggle color mode">
            {effective === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Tooltip>

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
                      primary={syncing ? 'Syncing…' : 'Sync Strava now'}
                      secondary={me.strava.lastSyncAt ? `last: ${formatDate(me.strava.lastSyncAt, { dateStyle: 'short', timeStyle: 'short' })}` : undefined}
                    />
                  </MenuItem>,
                  <MenuItem
                    key="disconnect"
                    onClick={async () => {
                      close();
                      if (confirm('Disconnect Strava? Runs already synced stay; new runs stop arriving.')) await strava.disconnect();
                    }}
                  >
                    <ListItemIcon>
                      <LinkOffIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary="Disconnect Strava" secondary={[me.strava.athlete.firstname, me.strava.athlete.lastname].filter(Boolean).join(' ')} />
                  </MenuItem>,
                ]
              ) : me.features.strava ? (
                <Box sx={{ px: 2, py: 1 }}>
                  <StravaButton size="small" fullWidth />
                </Box>
              ) : null}
              <MenuItem onClick={() => setUnit(getUnit() === 'km' ? 'mi' : 'km')}>
                <ListItemIcon>
                  <StraightenIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={getUnit() === 'km' ? 'Show miles' : 'Show kilometres'} secondary={`currently ${getUnit()}`} />
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
                  <ListItemText primary="Install app" secondary="Home screen, full screen, works offline" />
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
                  <ListItemText primary="Admin" secondary="Who can use the app, Strava sync" />
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
                Sign out
              </MenuItem>
            </Menu>
          </>
        )}
      </Toolbar>
      {installAction.dialog}
    </AppBar>
  );
}
