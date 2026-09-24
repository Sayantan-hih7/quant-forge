import type { ReactNode } from "react";
interface PanelProps {
  title: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}
export function Panel({ title, extra, children, className = "" }: PanelProps) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-heading">
        <h2>{title}</h2>
        {extra}
      </header>
      {children}
    </section>
  );
}
