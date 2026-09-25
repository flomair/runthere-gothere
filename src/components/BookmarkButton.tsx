import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import BookmarkAddedIcon from '@mui/icons-material/BookmarkAdded';
import { IconButton, Tooltip } from '@mui/material';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useBookmarks } from '../lib/api';
import type { Bookmark } from '../lib/types';
import { t } from '../lib/i18n';

type Item = Omit<Bookmark, 'id' | 'createdAt' | 'journeyId'>;

/** Toggle that saves a place to the journey's trip planner. */
export default function BookmarkButton({ journeyId, item, size = 'small' }: { journeyId: string; item: Item; size?: 'small' | 'medium' }) {
  const bm = useBookmarks(journeyId);
  const [busy, setBusy] = useState(false);
  const saved = bm.find(item.title, item.lat, item.lon);
  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      if (saved) await bm.remove(saved.id);
      else await bm.add(item);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Tooltip title={saved ? t('Saved for the real trip · click to remove') : t('Save for the real trip')}>
      <IconButton size={size} onClick={toggle} disabled={busy || bm.isLoading} color={saved ? 'primary' : 'default'} aria-pressed={!!saved} aria-label="Save for the real trip">
        <motion.span key={saved ? 'on' : 'off'} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }} style={{ display: 'inline-flex' }}>
          {saved ? <BookmarkAddedIcon fontSize="small" /> : <BookmarkAddOutlinedIcon fontSize="small" />}
        </motion.span>
      </IconButton>
    </Tooltip>
  );
}
