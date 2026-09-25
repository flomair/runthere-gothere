import { Box, type BoxProps } from '@mui/material';
import { AnimatePresence, animate, motion, useInView, useReducedMotion } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

export const MotionBox = motion.create(Box);

const EASE = [0.22, 1, 0.36, 1] as const;

/** Fades and lifts children in when they scroll into view. */
export function Reveal({ children, delay = 0, y = 16, ...rest }: { children: ReactNode; delay?: number; y?: number } & BoxProps) {
  return (
    <MotionBox
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.55, ease: EASE, delay }}
      {...(rest as object)}
    >
      {children}
    </MotionBox>
  );
}

/** Container whose direct <StaggerItem> children animate in one after another. */
export function Stagger({ children, gap = 0.06, ...rest }: { children: ReactNode; gap?: number } & BoxProps) {
  return (
    <MotionBox
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-40px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
      {...(rest as object)}
    >
      {children}
    </MotionBox>
  );
}

export function StaggerItem({ children, ...rest }: { children: ReactNode } & BoxProps) {
  return (
    <MotionBox
      variants={{ hidden: { opacity: 0, y: 18, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: EASE } } }}
      {...(rest as object)}
    >
      {children}
    </MotionBox>
  );
}

/** Page-level enter/exit transition keyed by route. */
export function PageTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={routeKey}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.32, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** Counts from 0 (or the previous value) to `value` when visible. */
export function CountUp({ value, format, duration = 1.1 }: { value: number; format: (n: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setShown(value);
      return;
    }
    const controls = animate(from.current, value, { duration, ease: EASE, onUpdate: setShown });
    from.current = value;
    return () => controls.stop();
  }, [inView, value, reduce, duration]);
  return <span ref={ref}>{format(shown)}</span>;
}

/** A progress bar that fills with a spring when it comes into view. */
export function AnimatedBar({ value, height = 10, color }: { value: number; height?: number; color?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <Box ref={ref} sx={{ height, borderRadius: 99, bgcolor: 'action.hover', overflow: 'hidden', position: 'relative' }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: inView ? `${Math.max(0, Math.min(100, value))}%` : 0 }}
        transition={{ type: 'spring', stiffness: 60, damping: 18, mass: 1 }}
        style={{
          height: '100%',
          borderRadius: 99,
          background: color ?? 'linear-gradient(90deg, #ff8a4c 0%, #fc4c02 55%, #e8336b 100%)',
          boxShadow: '0 0 12px rgba(252, 76, 2, 0.35)',
        }}
      />
    </Box>
  );
}
