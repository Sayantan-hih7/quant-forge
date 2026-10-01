import type { ReactNode } from 'react';
import { useTickFlash } from '../hooks/useTickFlash';

export function Flash({ value, children, className = '' }: { value: number | null | undefined; children: ReactNode; className?: string }) {
  const flash = useTickFlash(value);
  return <span className={`${className} ${flash}`.trim() || undefined}>{children}</span>;
}
