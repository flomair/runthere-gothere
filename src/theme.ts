import { alpha, createTheme } from '@mui/material/styles';

export const STRAVA_ORANGE = '#fc4c02';
export const ACCENT_GRADIENT = 'linear-gradient(135deg, #ff6a2b 0%, #fc4c02 45%, #e8336b 100%)';
const DISPLAY = '"Plus Jakarta Sans", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const BODY = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: STRAVA_ORANGE, contrastText: '#fff' },
        secondary: { main: '#1d3557' },
        background: { default: '#f5f3ef', paper: '#ffffff' },
        text: { primary: '#15171a', secondary: '#5d636b' },
        divider: 'rgba(21, 23, 26, 0.08)',
      },
    },
    dark: {
      palette: {
        primary: { main: '#ff6a2b', contrastText: '#fff' },
        secondary: { main: '#8ecae6' },
        background: { default: '#0c0e11', paper: '#15181c' },
        text: { primary: '#f1f2f4', secondary: '#9aa1ab' },
        divider: 'rgba(255, 255, 255, 0.08)',
      },
    },
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: BODY,
    h1: { fontFamily: DISPLAY, fontWeight: 800, letterSpacing: '-0.035em' },
    h2: { fontFamily: DISPLAY, fontWeight: 800, letterSpacing: '-0.03em' },
    h3: { fontFamily: DISPLAY, fontWeight: 800, letterSpacing: '-0.03em' },
    h4: { fontFamily: DISPLAY, fontWeight: 800, letterSpacing: '-0.02em' },
    h5: { fontFamily: DISPLAY, fontWeight: 700, letterSpacing: '-0.015em' },
    h6: { fontFamily: DISPLAY, fontWeight: 700, letterSpacing: '-0.01em' },
    overline: { fontWeight: 700, letterSpacing: '0.08em' },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.005em' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
        '::selection': { background: alpha(STRAVA_ORANGE, 0.25) },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 20,
          border: '1px solid',
          borderColor: theme.vars ? theme.vars.palette.divider : theme.palette.divider,
          boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04), 0 8px 24px -12px rgba(16, 24, 40, 0.12)',
          backgroundImage: 'none',
          transition: 'box-shadow .25s ease, transform .25s ease, border-color .25s ease',
          ...theme.applyStyles('dark', { boxShadow: '0 1px 0 rgba(255,255,255,0.03) inset, 0 12px 32px -16px rgba(0,0,0,0.6)' }),
        }),
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 999,
          paddingInline: 18,
          variants: [
            { props: { size: 'small' }, style: { paddingInline: 12 } },
            {
              props: { variant: 'contained', color: 'primary' },
              style: {
                backgroundImage: ACCENT_GRADIENT,
                boxShadow: `0 6px 16px -6px ${alpha(STRAVA_ORANGE, 0.55)}`,
                transition: 'transform .15s ease, box-shadow .2s ease, filter .2s ease',
                '&:hover': { filter: 'brightness(1.05)', boxShadow: `0 10px 22px -8px ${alpha(STRAVA_ORANGE, 0.6)}` },
                '&:active': { transform: 'scale(0.97)' },
                '&.Mui-disabled': { backgroundImage: 'none' },
              },
            },
          ],
        },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600, borderRadius: 999 } } },
    MuiToggleButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 700, fontSize: '0.95rem', minHeight: 44 } } },
    MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: 3 } } },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 99, height: 8 },
        bar: { borderRadius: 99, backgroundImage: ACCENT_GRADIENT },
      },
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 24 } } },
    MuiAppBar: { defaultProps: { elevation: 0 } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 16, alignItems: 'center' } } },
    MuiTooltip: { styleOverrides: { tooltip: { borderRadius: 10, fontWeight: 500 } } },
  },
});
