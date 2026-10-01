import { useEffect, useState } from 'react';

/**
 * Returns a short-lived class when a live number changes: green when it rises, red when it falls.
 * Alternating a/b suffixes restart the animation for consecutive ticks in the same direction.
 */
export function useTickFlash(value: number | null | undefined) {
  const [seen, setSeen] = useState<{ value: number | null | undefined; dir: 'up' | 'down'; count: number }>({ value, dir: 'up', count: 0 });
  const [settled, setSettled] = useState(0);
  // Adjusting state while rendering (not in an effect) keeps the flash in the same frame as the new value.
  if (value !== seen.value) {
    const moved = value != null && seen.value != null && value !== seen.value;
    setSeen({ value, dir: moved && value > seen.value! ? 'up' : moved ? 'down' : seen.dir, count: moved ? seen.count + 1 : seen.count });
  }
  useEffect(() => {
    if (!seen.count) return;
    const timer = window.setTimeout(() => setSettled(seen.count), 800);
    return () => window.clearTimeout(timer);
  }, [seen.count]);
  return seen.count && settled !== seen.count ? `tick-flash tick-${seen.dir}-${seen.count % 2 ? 'a' : 'b'}` : '';
}
