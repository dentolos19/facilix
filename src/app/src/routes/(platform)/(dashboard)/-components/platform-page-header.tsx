import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

interface PlatformPageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

export function PlatformPageHeader({ title, description, children, className }: PlatformPageHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="font-heading text-lg font-medium tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
