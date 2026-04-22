import type { ReactNode } from "react";

/**
 * PageHeader — eyebrow + title + optional right slot. Used at the top
 * of every route so nav-to-content rhythm is consistent.
 */
interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, right }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-fg-muted text-sm mt-2 max-w-readable">
            {description}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}
