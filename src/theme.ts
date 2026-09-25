import { alpha, createTheme } from '@mui/material/styles';

/**
 * Colour concept, taken from the logo:
 *  - Ink (the navy footprints) carries the brand: text, buttons, hero surfaces.
 *  - Ember (the orange route) is reserved for *you*: your position, the covered route, progress.
 *  - Lagoon (the teal pin) marks destinations, finishes and success.
 * Neutrals are warm paper tones so photos and maps stay the most colourful thing on screen.
 */
export const INK = '#14223A';
export const EMBER = '#EF5A28';
export const LAGOON = '#1F8F83';
/** Selected run / rating stars. */
export const HIGHLIGHT = '#E8B03A';
/** Only for the "Connect with Strava" button (Strava brand guidelines). */
export const STRAVA_ORANGE = '#fc4c02';

/** Theme-aware tokens as CSS variables (see styles.css) for SVG, canvas-free markup and inline styles. */
export const C = {
  ink: 'var(--rtgt-ink)',
  ember: 'var(--rtgt-ember)',
  lagoon: 'var(--rtgt-lagoon)',
  track: 'var(--rtgt-track)',
  heroBg: 'var(--rtgt-hero-bg)',
};

/** Deep ink surface with a faint ember glow – used for the hero cards. */
export const HERO_SURFACE = `radial-gradient(120% 90% at 100% 0%, ${alpha(EMBER, 0.28)} 0%, transparent 55%), radial-gradient(90% 80% at 0% 100%, ${alpha(LAGOON, 0.22)} 0%, transparent 60%), ${INK}`;

const SERIF = '"Fraunces", "Iowan Old Style", Georgia, serif';
const SANS = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: INK, light: '#2B3B57', dark: '#0B1526', contrastText: '#fff' },
        secondary: { main: EMBER, light: '#F47B52', dark: '#C9441A', contrastText: '#fff' },
        success: { main: LAGOON, contrastText: '#fff' },
        info: { main: '#3D6FA8' },
        background: { default: '#F7F5F0', paper: '#FFFFFF' },
        text: { primary: '#14171C', secondary: '#5E6570' },
        divider: 'rgba(20, 34, 58, 0.09)',
        action: { hover: 'rgba(20, 34, 58, 0.045)', selected: 'rgba(20, 34, 58, 0.08)' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#E8ECF2', light: '#FFFFFF', dark: '#C5CCD6', contrastText: '#0D1117' },
        secondary: { main: '#FF7B4B', light: '#FF9A74', dark: '#E0602F', contrastText: '#0D1117' },
        success: { main: '#4FC1B0', contrastText: '#0D1117' },
        info: { main: '#7FA7D6' },
        background: { default: '#0D1117', paper: '#151B23' },
        text: { primary: '#ECEFF3', secondary: '#9AA3AE' },
        divider: 'rgba(255, 255, 255, 0.08)',
        action: { hover: 'rgba(255, 255, 255, 0.05)', selected: 'rgba(255, 255, 255, 0.09)' },
      },
    },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: SANS,
    h1: { fontFamily: SERIF, fontWeight: 600, letterSpacing: '-0.02em', fontVariationSettings: '"opsz" 144' },
    h2: { fontFamily: SERIF, fontWeight: 600, letterSpacing: '-0.02em', fontVariationSettings: '"opsz" 144' },
    h3: { fontFamily: SERIF, fontWeight: 600, letterSpacing: '-0.015em', fontVariationSettings: '"opsz" 96' },
    h4: { fontFamily: SERIF, fontWeight: 600, letterSpacing: '-0.01em', fontVariationSettings: '"opsz" 72' },
    h5: { fontWeight: 650, letterSpacing: '-0.015em' },
    h6: { fontWeight: 650, letterSpacing: '-0.01em', fontSize: '1.1rem' },
    subtitle2: { fontWeight: 650 },
    overline: { fontWeight: 650, letterSpacing: '0.12em', fontSize: '0.7rem' },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', fontFeatureSettings: '"cv11", "ss01"' },
        '::selection': { background: alpha(EMBER, 0.22) },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 20,
          border: '1px solid',
          borderColor: theme.vars ? theme.vars.palette.divider : theme.palette.divider,
          boxShadow: '0 1px 2px rgba(20, 34, 58, 0.04)',
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
          ],
        },
      },
    },
    MuiIconButton: { styleOverrides: { root: { transition: 'background-color .2s ease, transform .15s ease', '&:active': { transform: 'scale(0.92)' } } } },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 999 },
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
