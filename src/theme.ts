import { alpha, createTheme } from '@mui/material/styles';

/**
 * Colour concept "Widget": taken from the iOS countdown widget look.
 *  - A blue → violet gradient (SKY → ORCHID) for hero surfaces and main buttons, with white text.
 *  - Indigo for headings and icons on light backgrounds.
 *  - Violet (between the two) is reserved for *you*: your position, the covered route, progress.
 *    Violet barely occurs on map tiles, so your route always stands out on the map.
 *  - Mint marks destinations, finishes and success.
 * Rounded, heavy numerals (SF Pro Rounded on Apple devices, Nunito elsewhere) like the widget.
 */
export const SKY = '#3F7CF6';
export const ORCHID = '#A259E8';
export const WIDGET_GRADIENT = `linear-gradient(135deg, ${SKY} 0%, #6A67F0 52%, ${ORCHID} 100%)`;
export const ROUNDED = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, -apple-system, sans-serif';
export const INDIGO = '#232862';
export const VIOLET = '#5B5BF0';
export const MINT = '#149A80';
/** Selected run / rating stars. */
export const HIGHLIGHT = '#E8B03A';
/** Only for the "Connect with Strava" button (Strava brand guidelines). */
export const STRAVA_ORANGE = '#fc4c02';

/** Theme-aware tokens as CSS variables (see styles.css) for SVG, canvas-free markup and inline styles. */
export const C = {
  brand: 'var(--rtgt-brand)',
  you: 'var(--rtgt-you)',
  dest: 'var(--rtgt-dest)',
  track: 'var(--rtgt-track)',
  heroBg: 'var(--rtgt-hero-bg)',
};

/** The widget gradient with a soft sheen – used for the hero cards. */
export const HERO_SURFACE = `radial-gradient(90% 70% at 0% 0%, rgba(255,255,255,0.18) 0%, transparent 60%), ${WIDGET_GRADIENT}`;

const SANS = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: INDIGO, light: '#383E86', dark: '#15183F', contrastText: '#fff' },
        secondary: { main: VIOLET, light: '#7B7BF4', dark: '#4a48d8', contrastText: '#fff' },
        success: { main: MINT, contrastText: '#fff' },
        info: { main: '#3D6FA8' },
        background: { default: '#F4F5FA', paper: '#FFFFFF' },
        text: { primary: '#14162B', secondary: '#5F6480' },
        divider: 'rgba(35, 40, 98, 0.09)',
        action: { hover: 'rgba(35, 40, 98, 0.045)', selected: 'rgba(35, 40, 98, 0.08)' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#E7E9FF', light: '#FFFFFF', dark: '#C5C8F0', contrastText: '#0A0B14' },
        secondary: { main: '#9A8CFF', light: '#C9C6FF', dark: '#8479F3', contrastText: '#0A0B14' },
        success: { main: '#4FD1B5', contrastText: '#0A0B14' },
        info: { main: '#7FA7D6' },
        background: { default: '#0A0B14', paper: '#141627' },
        text: { primary: '#EDEEF8', secondary: '#9A9DB8' },
        divider: 'rgba(255, 255, 255, 0.08)',
        action: { hover: 'rgba(255, 255, 255, 0.05)', selected: 'rgba(255, 255, 255, 0.09)' },
      },
    },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: SANS,
    h1: { fontFamily: ROUNDED, fontWeight: 800, letterSpacing: '-0.025em' },
    h2: { fontFamily: ROUNDED, fontWeight: 800, letterSpacing: '-0.025em' },
    h3: { fontFamily: ROUNDED, fontWeight: 800, letterSpacing: '-0.025em' },
    h4: { fontFamily: ROUNDED, fontWeight: 800, letterSpacing: '-0.025em' },
    h5: { fontFamily: ROUNDED, fontWeight: 750, letterSpacing: '-0.015em' },
    h6: { fontFamily: ROUNDED, fontWeight: 750, letterSpacing: '-0.01em', fontSize: '1.1rem' },
    subtitle2: { fontWeight: 650 },
    overline: { fontWeight: 650, letterSpacing: '0.12em', fontSize: '0.7rem' },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', fontFeatureSettings: '"cv11", "ss01"' },
        '::selection': { background: alpha(VIOLET, 0.22) },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 20,
          border: '1px solid',
          borderColor: theme.vars ? theme.vars.palette.divider : theme.palette.divider,
          boxShadow: '0 1px 2px rgba(35, 40, 98, 0.04)',
          backgroundImage: 'none',
          transition: 'box-shadow .3s ease, transform .3s ease, border-color .3s ease',
          ...theme.applyStyles('dark', { boxShadow: 'none' }),
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
          transition: 'transform .15s ease, background-color .2s ease, box-shadow .2s ease',
          '&:active': { transform: 'scale(0.97)' },
          variants: [
            { props: { size: 'small' }, style: { paddingInline: 12 } },
            { props: { size: 'large' }, style: { paddingInline: 24, minHeight: 48 } },
            { props: { variant: 'outlined' }, style: { borderColor: 'var(--mui-palette-divider)', '&:hover': { borderColor: 'currentColor' } } },
            // main actions wear the widget gradient: a pill with white text
            {
              props: { variant: 'contained', color: 'primary' },
              style: {
                backgroundImage: WIDGET_GRADIENT,
                color: '#fff',
                boxShadow: '0 8px 18px -10px rgb(91 91 240 / 80%)',
                '&:hover': { filter: 'brightness(1.06)', boxShadow: '0 10px 22px -10px rgb(91 91 240 / 85%)' },
                '&.Mui-disabled': { backgroundImage: 'none' },
              },
            },
          ],
        },
      },
    },
    MuiIconButton: { styleOverrides: { root: { transition: 'background-color .2s ease, transform .15s ease', '&:active': { transform: 'scale(0.92)' } } } },
    MuiAvatar: { styleOverrides: { colorDefault: { backgroundColor: 'var(--rtgt-you)', color: '#fff', fontWeight: 600 } } },
    MuiBadge: { styleOverrides: { colorPrimary: { backgroundColor: 'var(--rtgt-you)', color: '#fff' }, colorSecondary: { backgroundColor: 'var(--rtgt-you)', color: '#fff' } } },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: 999,
          variants: [
            // filled chips: soft violet tint
            { props: { variant: 'filled', color: 'default' }, style: { backgroundColor: 'rgb(91 91 240 / 12%)', color: 'var(--rtgt-you-text)' } },
            { props: { variant: 'filled', color: 'primary' }, style: { backgroundImage: WIDGET_GRADIENT, color: '#fff' } },
          ],
        },
        outlined: { borderColor: 'var(--mui-palette-divider)' },
      },
    },
    MuiToggleButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, fontSize: '0.95rem', minHeight: 44 } } },
    MuiTabs: { styleOverrides: { indicator: { height: 2, borderRadius: 2 } } },
    MuiLinearProgress: { styleOverrides: { root: { borderRadius: 99, height: 6 }, bar: { borderRadius: 99 } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 24 } } },
    MuiAppBar: { defaultProps: { elevation: 0 } },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 14, alignItems: 'center' },
        standard: { border: '1px solid var(--mui-palette-divider)' },
      },
    },
    MuiTooltip: { styleOverrides: { tooltip: { borderRadius: 8, fontWeight: 500 } } },
    MuiTextField: { defaultProps: { variant: 'outlined' } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12 } } },
  },
});
