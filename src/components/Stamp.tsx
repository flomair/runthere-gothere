import { Box } from '@mui/material';
import { useId } from 'react';
import { flag } from '../lib/api';
import { formatDate } from '../lib/format';
import type { CityUnlocks } from '../lib/types';

/** A passport stamp for a reached city: ink ring, city name around the edge, date and flag inside. */
export default function Stamp({ stamp, size = 120 }: { stamp: CityUnlocks['stamp']; size?: number }) {
  const id = useId().replace(/:/g, '');
  const ink = `hsl(${stamp.hue} 55% 42%)`;
  const label = stamp.label.toUpperCase().slice(0, 22);
  // a little tilt, stable per city, like a real hand stamp
  const tilt = ((stamp.hue % 17) - 8) * 1.2;
  return (
    <Box component="svg" viewBox="0 0 120 120" sx={{ width: size, height: size, transform: `rotate(${tilt}deg)`, display: 'block' }} role="img" aria-label={`${stamp.label} ${stamp.date}`}>
      <defs>
        <path id={`arc-${id}`} d="M 60 60 m -41 0 a 41 41 0 1 1 82 0 a 41 41 0 1 1 -82 0" />
      </defs>
      <circle cx="60" cy="60" r="56" fill="none" stroke={ink} strokeWidth="3" opacity="0.9" />
      <circle cx="60" cy="60" r="50" fill="none" stroke={ink} strokeWidth="1" strokeDasharray="2 3" opacity="0.8" />
      <circle cx="60" cy="60" r="32" fill={ink} opacity="0.1" />
      <text fontSize={label.length > 14 ? 9 : 11} fontWeight="800" letterSpacing="1.5" fill={ink} fontFamily="ui-rounded, 'SF Pro Rounded', Nunito, sans-serif">
        <textPath href={`#arc-${id}`} startOffset="50%" textAnchor="middle">
          {label}
        </textPath>
      </text>
      <text x="60" y="58" textAnchor="middle" fontSize="20">
        {stamp.countryCode ? flag(stamp.countryCode) : '📍'}
      </text>
      <text x="60" y="76" textAnchor="middle" fontSize="9" fontWeight="700" fill={ink} fontFamily="ui-rounded, 'SF Pro Rounded', Nunito, sans-serif">
        {formatDate(stamp.date, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
      </text>
    </Box>
  );
}
