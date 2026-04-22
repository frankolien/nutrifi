import { useEffect, useRef, useState } from "react";

/**
 * AnimatedNumber — count-up / smooth number transitions.
 *
 * Drops into any place a number is rendered. On each `value` change
 * it eases from the previous render over `durationMs`. RAF-based so
 * it stays 60fps without React re-render churn — we only commit the
 * final update back to state when the tween completes (intermediate
 * frames mutate DOM text directly for zero GC pressure).
 *
 * This is the single biggest "feels alive" trick Jupiter uses; every
 * number on this site that can change should render through here.
 */
interface AnimatedNumberProps {
  value: number;
  format: (v: number) => string;
  durationMs?: number;
  className?: string;
}

const DEFAULT_DURATION = 450;
const EASE = (t: number) => 1 - Math.pow(1 - t, 3); // cubic out

export function AnimatedNumber({
  value,
  format,
  durationMs = DEFAULT_DURATION,
  className,
}: AnimatedNumberProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const fromRef = useRef(value);
  const targetRef = useRef(value);
  const [mounted, setMounted] = useState(false);

  // First paint: show the value immediately without animating.
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const el = spanRef.current;
    if (!el) return;

    const from = fromRef.current;
    const to = value;
    targetRef.current = to;

    if (from === to) return;

    let start: number | null = null;
    let raf = 0;

    const tick = (ts: number) => {
      if (start == null) start = ts;
      const elapsed = ts - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = EASE(t);
      const current = from + (to - from) * eased;

      // Only direct-mutate text — avoids re-rendering parent every frame.
      if (el) el.textContent = format(current);

      if (t < 1 && targetRef.current === to) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        if (el) el.textContent = format(to);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return (
    <span ref={spanRef} className={className}>
      {format(value)}
    </span>
  );
}
