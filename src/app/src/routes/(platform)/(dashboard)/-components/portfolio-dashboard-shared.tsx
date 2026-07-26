import { Link } from "@tanstack/react-router";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BarChart3Icon,
  Building2Icon,
  RefreshCwIcon,
  type LucideIcon,
} from "lucide-react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "#/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty";
import { Skeleton } from "#/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import type { AnalyticsTimeRange, OverallStatus } from "#/lib/functions/analytics";
import { cn } from "#/lib/utils";

export const RANGE_LABELS: Record<AnalyticsTimeRange, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

export function formatTimestamp(value: string | Date) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatChartTime(value: string, range: AnalyticsTimeRange) {
  if (range === "24h") return value.slice(11, 16);
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function humanizeEventType(type: string) {
  return type
    .split(":")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" · ");
}

export function DashboardControls({
  range,
  isRefreshing,
  lastUpdated,
  onRangeChange,
  onRefresh,
}: {
  range: AnalyticsTimeRange;
  isRefreshing: boolean;
  lastUpdated: Date | null;
  onRangeChange: (range: AnalyticsTimeRange) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {lastUpdated ? (
        <span className="text-muted-foreground hidden text-[10px] tabular-nums lg:inline">
          Updated {formatTimestamp(lastUpdated)}
        </span>
      ) : null}
      <ToggleGroup
        aria-label="Analytics time range"
        onValueChange={(value) => {
          if (value === "24h" || value === "7d" || value === "30d") onRangeChange(value);
        }}
        size="sm"
        spacing={0}
        type="single"
        value={range}
        variant="outline"
      >
        <ToggleGroupItem aria-label="Last 24 hours" value="24h">
          24h
        </ToggleGroupItem>
        <ToggleGroupItem aria-label="Last 7 days" value="7d">
          7d
        </ToggleGroupItem>
        <ToggleGroupItem aria-label="Last 30 days" value="30d">
          30d
        </ToggleGroupItem>
      </ToggleGroup>
      <Button
        aria-label="Refresh facility data"
        disabled={isRefreshing}
        onClick={onRefresh}
        size="icon-sm"
        variant="outline"
      >
        <RefreshCwIcon className={cn(isRefreshing && "animate-spin")} />
      </Button>
    </div>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="text-muted-foreground/60 size-3.5" />
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="text-muted-foreground mt-0.5 text-[10px]">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function FacilityStatus({ status }: { status: OverallStatus }) {
  const styles: Record<OverallStatus, { className: string; dot: string; label: string }> = {
    normal: {
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400",
      dot: "bg-emerald-500",
      label: "Normal",
    },
    attention: {
      className:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400",
      dot: "bg-amber-500",
      label: "Attention",
    },
    critical: {
      className: "border-destructive/20 bg-destructive/10 text-destructive",
      dot: "bg-destructive",
      label: "Critical",
    },
  };
  const style = styles[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-none border px-1.5 py-0.5 font-medium text-[10px] leading-none",
        style.className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {style.label}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const isCritical = severity === "error";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-none border px-1.5 py-0.5 font-medium text-[10px] leading-none",
        isCritical
          ? "border-destructive/20 bg-destructive/10 text-destructive"
          : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400",
      )}
    >
      <span className={cn("size-1.5 rounded-full", isCritical ? "bg-destructive" : "bg-amber-500")} />
      {isCritical ? "Critical" : "Warning"}
    </span>
  );
}

export function PortfolioLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} size="sm">
            <CardHeader>
              <Skeleton className="h-3 w-24" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function PortfolioError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Empty className="min-h-80 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertCircleIcon />
        </EmptyMedia>
        <EmptyTitle>Facility data is unavailable</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onRetry} size="sm" variant="outline">
          <RefreshCwIcon data-icon="inline-start" />
          Try Again
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function PortfolioEmpty() {
  return (
    <Empty className="min-h-80 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Building2Icon />
        </EmptyMedia>
        <EmptyTitle>No facilities to summarize</EmptyTitle>
        <EmptyDescription>Create a facility and add monitoring devices to populate this page.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild size="sm" variant="outline">
          <Link to="/dashboard">
            View Facilities
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function ChartEmpty({ label = "No events in this period" }: { label?: string }) {
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-xs">
      <BarChart3Icon className="size-5 opacity-40" />
      <span>{label}</span>
    </div>
  );
}
