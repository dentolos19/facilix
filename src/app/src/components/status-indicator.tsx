import { CircleCheckIcon, CircleXIcon, Loader2Icon } from "lucide-react";

import type { MonitoringStatus } from "#/lib/monitoring/types";
import { cn } from "#/lib/utils";

const STATUS_LABELS: Record<MonitoringStatus, string> = {
  running: "Running",
  starting: "Starting\u2026",
  stopping: "Stopping\u2026",
  stopped: "Stopped",
  error: "Error",
};

const STATUS_COLORS: Record<MonitoringStatus, string> = {
  running: "text-emerald-500",
  starting: "text-amber-500",
  stopping: "text-amber-500",
  stopped: "text-muted-foreground/30",
  error: "text-red-500",
};

export function monitoringStatusLabel(status: MonitoringStatus): string {
  return STATUS_LABELS[status];
}

export function monitoringStatusColor(status: MonitoringStatus): string {
  return STATUS_COLORS[status];
}

interface MonitoringStatusIndicatorProps {
  status: MonitoringStatus;
  className?: string;
}

export function MonitoringStatusIndicator({ status, className }: MonitoringStatusIndicatorProps) {
  if (status === "stopped") {
    return (
      <span
        aria-label={STATUS_LABELS[status]}
        className={cn("size-2.5 shrink-0 rounded-full bg-muted-foreground/25", className)}
        role="status"
      />
    );
  }

  const isTransitioning = status === "starting" || status === "stopping";
  const Icon = status === "running" ? CircleCheckIcon : status === "error" ? CircleXIcon : Loader2Icon;

  return (
    <Icon
      aria-label={STATUS_LABELS[status]}
      className={cn("size-3.5 shrink-0", STATUS_COLORS[status], isTransitioning && "animate-spin", className)}
      role="status"
    />
  );
}

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const STATUS_BADGE_STYLES: Record<string, { bg: string; dot: string; label: string }> = {
  online: {
    bg: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
    dot: "bg-emerald-500",
    label: "Online",
  },
  running: {
    bg: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
    dot: "bg-emerald-500",
    label: "Running",
  },
  offline: {
    bg: "bg-muted/30 text-muted-foreground border-border",
    dot: "bg-muted-foreground/30",
    label: "Offline",
  },
  stopped: {
    bg: "bg-muted/30 text-muted-foreground border-border",
    dot: "bg-muted-foreground/30",
    label: "Stopped",
  },
  error: {
    bg: "bg-destructive/10 text-destructive border-destructive/20",
    dot: "bg-destructive",
    label: "Error",
  },
  degraded: {
    bg: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
    dot: "bg-amber-500",
    label: "Degraded",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_BADGE_STYLES[status] ?? {
    bg: "bg-muted/30 text-muted-foreground border-border",
    dot: "bg-muted-foreground/50",
    label: status,
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-none border px-1.5 py-0.5 font-medium text-[10px] leading-none",
        style.bg,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {style.label}
    </span>
  );
}
