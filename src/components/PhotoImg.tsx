import { Box, Skeleton, type SxProps, type Theme } from '@mui/material';
import { usePhotoUrl } from '../lib/uploads';

/** A photo from the user's private storage (loaded through a short-lived signed link). */
export default function PhotoImg({ path, alt = '', sx, height = 160 }: { path: string; alt?: string; sx?: SxProps<Theme>; height?: number | string }) {
  const q = usePhotoUrl(path);
  if (!q.data) return <Skeleton variant="rounded" height={height} sx={sx} animation={q.isError ? false : 'pulse'} />;
  return <Box component="img" src={q.data} alt={alt} loading="lazy" sx={{ width: '100%', height, objectFit: 'cover', display: 'block', ...sx }} />;
}
