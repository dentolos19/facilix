"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ActivityIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  ArrowLeftIcon,
  BarChart3Icon,
  CircleCheckIcon,
  EyeIcon,
  HeartPulseIcon,
  InfoIcon,
  MonitorIcon,
  RefreshCwIcon,
  ScanEyeIcon,
  ShieldAlertIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  VideoIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

import { FacilityChat } from "#/components/facility-chat";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "#/components/ui/chart";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty";
import { PlatformTabs } from "#/components/ui/platform-tabs";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import type {
  AnalyticsTimeRange,
  DeviceInfo,
  DeviceTypeCount,
  EventBucket,
  FacilityAnalytics,
  RecentAlert,
  SensorMetric,
} from "#/lib/functions/analytics";
import { getFacilityAnalytics } from "#/lib/functions/analytics";
import { cn } from "#/lib/utils";

import { FacilityFeedTab } from "./-components/feed-tab";

// ─── Route ──────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/(platform)/manage/$id/")({
  component: Page,
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
});

// ─── Constants ──────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

const SEVERITY_ORDER = ["error", "warn", "info"] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatChartTime(isoKey: string, range: AnalyticsTimeRange): string {
  if (range === "24h") {
    // "2024-01-15T14:00" → "14:00"
    return isoKey.slice(11, 16);
  }
  // "2024-01-15" → "Jan 15"
  const d = new Date(isoKey + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─── Severity Indicator ─────────────────────────────────────────────────────

function SeverityDot({ severity, className }: { severity: string; className?: string }) {
  const colors: Record<string, string> = {
    error: "bg-destructive",
    warn: "bg-amber-500",
    info: "bg-muted-foreground/40",
    positive: "bg-emerald-500",
    critical: "bg-destructive",
  };
  return (
    <span
      aria-hidden
      className={cn("inline-block size-1.5 shrink-0 rounded-full", colors[severity] ?? colors.info, className)}
    />
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    error: "bg-destructive/10 text-destructive border-destructive/20",
    warn: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
    info: "bg-muted/30 text-muted-foreground border-border",
    positive:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
    critical: "bg-destructive/15 text-destructive border-destructive/30 font-semibold",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-none border px-1.5 py-0.5 font-medium text-[10px] leading-none",
        styles[severity] ?? styles.info,
      )}
    >
      <SeverityDot severity={severity} />
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendDirection,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: string;
  trendDirection?: "up" | "down";
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          {Icon && <Icon className="text-muted-foreground/60 size-3.5" />}
          {title}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-2">
        <div>
          <p className="font-heading text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          {subtitle && <p className="text-muted-foreground mt-0.5 text-[10px]">{subtitle}</p>}
        </div>
        {trend && (
          <span
            className={cn(
              "flex shrink-0 items-center gap-0.5 font-medium text-[10px] tabular-nums",
              trendDirection === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
            )}
          >
            {trendDirection === "up" ? <TrendingUpIcon className="size-3" /> : <TrendingDownIcon className="size-3" />}
            {trend}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Insight Card ───────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: FacilityAnalytics["insights"][number] }) {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    positive: CircleCheckIcon,
    info: InfoIcon,
    warn: AlertTriangleIcon,
    critical: ShieldAlertIcon,
  };
  const Icon = iconMap[insight.severity] ?? InfoIcon;

  return (
    <div className="border-border bg-card flex gap-3 rounded-none border p-3 text-xs">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          insight.severity === "positive" && "text-emerald-500",
          insight.severity === "info" && "text-muted-foreground",
          insight.severity === "warn" && "text-amber-500",
          insight.severity === "critical" && "text-destructive",
        )}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground font-medium">{insight.title}</span>
          <SeverityBadge severity={insight.severity} />
        </div>
        <p className="text-muted-foreground">{insight.description}</p>
        {insight.evidence.length > 0 && (
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {insight.evidence.map((item, i) => (
              <li className="text-muted-foreground/80 flex items-center gap-1.5" key={i}>
                <span className="bg-muted-foreground/30 size-1 rounded-full" />
                {item}
              </li>
            ))}
          </ul>
        )}
        {insight.recommendedAction && (
          <p className="text-muted-foreground/70 mt-0.5 italic">{insight.recommendedAction}</p>
        )}
      </div>
    </div>
  );
}

// ─── Event Trend Chart ──────────────────────────────────────────────────────

const eventChartConfig = {
  error: { label: "Error", color: "var(--chart-3)" },
  warn: { label: "Warning", color: "var(--chart-4)" },
  info: { label: "Info", color: "var(--chart-1)" },
} satisfies ChartConfig;

function EventTrendChart({ data, range }: { data: EventBucket[]; range: AnalyticsTimeRange }) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-xs">No events in this period</p>
      </div>
    );
  }

  return (
    <ChartContainer className="h-full w-full" config={eventChartConfig}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -16 }}>
        <defs>
          {(["info", "warn", "error"] as const).map((key) => (
            <linearGradient id={`fill-${key}`} key={key} x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.3} />
              <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <XAxis
          axisLine={false}
          className="text-[10px]"
          dataKey="time"
          tickFormatter={(v) => formatChartTime(v, range)}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis allowDecimals={false} axisLine={false} className="text-[10px]" tickLine={false} tickMargin={8} />
        <ChartTooltip
          content={<ChartTooltipContent />}
          labelFormatter={(label) => formatChartTime(label as string, range)}
        />
        {(["info", "warn", "error"] as const).map((key) => (
          <Area
            dataKey={key}
            fill={`url(#fill-${key})`}
            key={key}
            stackId="1"
            stroke={`var(--color-${key})`}
            strokeWidth={1.5}
            type="monotone"
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}

// ─── Device Composition Chart ───────────────────────────────────────────────

function DeviceCompositionChart({ data }: { data: DeviceTypeCount[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-xs">No devices configured</p>
      </div>
    );
  }

  const pieConfig = Object.fromEntries(
    data.map((d, i) => [d.type, { label: d.type, color: CHART_COLORS[i % CHART_COLORS.length] }]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer className="h-full w-full" config={pieConfig}>
      <PieChart>
        <Pie
          cx="50%"
          cy="50%"
          data={data}
          dataKey="count"
          innerRadius={44}
          nameKey="type"
          outerRadius={64}
          strokeWidth={2}
        >
          {data.map((entry, index) => (
            <Cell fill={CHART_COLORS[index % CHART_COLORS.length]} key={entry.type} />
          ))}
        </Pie>
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name) => <span className="font-mono font-medium tabular-nums">{String(value)}</span>}
            />
          }
        />
      </PieChart>
    </ChartContainer>
  );
}

// ─── Events by Severity Chart ───────────────────────────────────────────────

const severityChartConfig = {
  error: { label: "Error", color: "var(--chart-3)" },
  warn: { label: "Warning", color: "var(--chart-4)" },
  info: { label: "Info", color: "var(--chart-1)" },
} satisfies ChartConfig;

function SeverityBarChart({ data }: { data: { severity: string; count: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-xs">No events in this period</p>
      </div>
    );
  }

  // Order by severity severity
  const ordered = SEVERITY_ORDER.filter((s) => data.find((d) => d.severity === s))
    .map((s) => data.find((d) => d.severity === s)!)
    .filter(Boolean);

  return (
    <ChartContainer className="h-full w-full" config={severityChartConfig}>
      <BarChart data={ordered} margin={{ top: 4, right: 4, bottom: 4, left: -16 }}>
        <XAxis axisLine={false} className="text-[10px] capitalize" dataKey="severity" tickLine={false} tickMargin={8} />
        <YAxis allowDecimals={false} axisLine={false} className="text-[10px]" tickLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar barSize={48} dataKey="count" radius={[2, 2, 0, 0]}>
          {ordered.map((entry) => (
            <Cell fill={`var(--color-${entry.severity})`} key={entry.severity} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// ─── Recent Alerts Table ────────────────────────────────────────────────────

function RecentAlertsTable({ alerts }: { alerts: RecentAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground text-xs">No alerts recorded</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Severity</TableHead>
          <TableHead>Message</TableHead>
          <TableHead className="hidden sm:table-cell">Device</TableHead>
          <TableHead className="hidden md:table-cell">Type</TableHead>
          <TableHead className="w-36 text-right">Time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((alert) => (
          <TableRow key={alert.id}>
            <TableCell>
              <SeverityBadge severity={alert.severity} />
            </TableCell>
            <TableCell className="max-w-60">
              <span className="truncate" title={alert.message}>
                {alert.message}
              </span>
            </TableCell>
            <TableCell className="hidden truncate sm:table-cell">{alert.deviceName ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground hidden md:table-cell">{alert.type}</TableCell>
            <TableCell className="text-muted-foreground text-right tabular-nums">
              {formatTimestamp(alert.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── Device Health Table ────────────────────────────────────────────────────

function DeviceHealthTable({ devices }: { devices: DeviceInfo[] }) {
  if (devices.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground text-xs">No devices configured</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden sm:table-cell">Zone</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {devices.map((device) => (
          <TableRow key={device.id}>
            <TableCell className="truncate font-medium">{device.name}</TableCell>
            <TableCell className="text-muted-foreground">{device.type}</TableCell>
            <TableCell>
              <StatusBadge status={device.status} />
            </TableCell>
            <TableCell className="text-muted-foreground hidden sm:table-cell">{device.zoneName ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { class: string; label: string }> = {
    online: {
      class:
        "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
      label: "Online",
    },
    running: {
      class:
        "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
      label: "Running",
    },
    offline: {
      class: "bg-muted/30 text-muted-foreground border-border",
      label: "Offline",
    },
    stopped: {
      class: "bg-muted/30 text-muted-foreground border-border",
      label: "Stopped",
    },
    error: {
      class: "bg-destructive/10 text-destructive border-destructive/20",
      label: "Error",
    },
  };

  const style = styles[status] ?? {
    class: "bg-muted/30 text-muted-foreground border-border",
    label: status,
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-none border px-1.5 py-0.5 font-medium text-[10px] leading-none",
        style.class,
      )}
    >
      <span
        className={cn(
          "inline-block size-1.5 rounded-full",
          status === "online" || status === "running"
            ? "bg-emerald-500"
            : status === "error"
              ? "bg-destructive"
              : "bg-muted-foreground/30",
        )}
      />
      {style.label}
    </span>
  );
}

// ─── Sensor Metrics Table ───────────────────────────────────────────────────

function SensorMetricsTable({ metrics }: { metrics: SensorMetric[] }) {
  if (metrics.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground text-xs">No sensor readings available</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Device</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="hidden sm:table-cell">Status</TableHead>
          <TableHead className="hidden text-right md:table-cell">Battery</TableHead>
          <TableHead className="hidden text-right lg:table-cell">Last Seen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {metrics.map((m) => (
          <TableRow key={m.deviceId}>
            <TableCell className="truncate font-medium">{m.deviceName}</TableCell>
            <TableCell className="text-muted-foreground">{m.sensorType}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {m.value} {m.unit}
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              <SeverityBadge severity={m.status === "ok" ? "info" : m.status} />
            </TableCell>
            <TableCell className="hidden text-right tabular-nums md:table-cell">
              {m.batteryPct !== null ? `${Math.round(m.batteryPct)}%` : "—"}
            </TableCell>
            <TableCell className="text-muted-foreground hidden text-right lg:table-cell">
              {formatTimestamp(m.timestamp)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── Loading State ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="flex flex-col gap-6">
        {/* KPI skeleton */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-3 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Insight skeleton */}
        <Skeleton className="h-24 w-full" />

        {/* Charts skeleton */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-56 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-56 w-full" />
            </CardContent>
          </Card>
        </div>

        {/* Table skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton className="h-6 w-full" key={i} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Error State ────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <AlertCircleIcon className="text-muted-foreground/30 size-12" />
        <h2 className="font-heading text-lg font-medium">Failed to Load Analytics</h2>
        <p className="text-muted-foreground text-sm">{message}</p>
        <Button onClick={onRetry} size="sm" variant="outline">
          <RefreshCwIcon data-icon="inline-start" />
          Try Again
        </Button>
      </div>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BarChart3Icon />
          </EmptyMedia>
        </EmptyHeader>
        <EmptyTitle>No Analytics Data</EmptyTitle>
        <EmptyDescription>
          This facility has no data to display. Add devices and start monitoring to see analytics.
        </EmptyDescription>
        <EmptyContent>
          <Button asChild size="sm" variant="outline">
            <Link params={{ id: Route.useParams().id }} to="/facility/$id">
              <ArrowLeftIcon data-icon="inline-start" />
              Back to Facility
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

const TABS = [
  { id: "analytics", label: "Analytics" },
  { id: "feed", label: "Feed" },
  { id: "chat", label: "Chat" },
];

function Page() {
  const { id: facilityId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab = TABS.some((t) => t.id === tab) ? tab! : "analytics";

  const setActiveTab = (id: string) => {
    navigate({ search: { tab: id === "analytics" ? undefined : id }, replace: true });
  };

  const [data, setData] = useState<FacilityAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<AnalyticsTimeRange>("24h");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedKey, setFeedKey] = useState(0);

  const fetchAnalytics = useCallback(
    async (currentRange: AnalyticsTimeRange, silent = false) => {
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const result = await getFacilityAnalytics({
          data: { facilityId, range: currentRange },
        });
        setData(result);
        setLastUpdated(new Date());
      } catch (err) {
        const message = err instanceof Error ? err.message : "An unexpected error occurred";
        setError(message);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [facilityId],
  );

  useEffect(() => {
    if (activeTab === "analytics") {
      fetchAnalytics(range);
    }
  }, [activeTab, range, fetchAnalytics]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    if (activeTab === "feed") {
      setFeedKey((k) => k + 1);
      setIsRefreshing(false);
    } else {
      fetchAnalytics(range, true);
    }
  }, [range, fetchAnalytics, activeTab]);

  const handleRangeChange = useCallback((value: string) => {
    if (value === "24h" || value === "7d" || value === "30d") {
      setRange(value);
    }
  }, []);

  // ── Loading (analytics tab only) ──────────────────────────────────────
  if (activeTab === "analytics" && isLoading && !data) {
    return (
      <div className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden">
        <ManageHeaderShell
          facilityId={facilityId}
          facilityName={undefined}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isRefreshing={isRefreshing}
          lastUpdated={lastUpdated}
          range={range}
          onRangeChange={handleRangeChange}
          onRefresh={handleRefresh}
        />
        <LoadingSkeleton />
      </div>
    );
  }

  // ── Error (analytics tab only) ────────────────────────────────────────
  if (activeTab === "analytics" && error && !data) {
    return (
      <div className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden">
        <ManageHeaderShell
          facilityId={facilityId}
          facilityName={undefined}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isRefreshing={isRefreshing}
          lastUpdated={lastUpdated}
          range={range}
          onRangeChange={handleRangeChange}
          onRefresh={handleRefresh}
        />
        <ErrorState message={error} onRetry={() => fetchAnalytics(range)} />
      </div>
    );
  }

  // ── Empty state for analytics tab ─────────────────────────────────────
  if (activeTab === "analytics" && !data) {
    return (
      <div className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden">
        <ManageHeaderShell
          facilityId={facilityId}
          facilityName={undefined}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isRefreshing={isRefreshing}
          lastUpdated={lastUpdated}
          range={range}
          onRangeChange={handleRangeChange}
          onRefresh={handleRefresh}
        />
        <EmptyState />
      </div>
    );
  }

  // ── Feed tab (no analytics data needed) ───────────────────────────────
  if (activeTab === "feed") {
    return (
      <div className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden">
        <ManageHeaderShell
          facilityId={facilityId}
          facilityName={data?.facilityName}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isRefreshing={isRefreshing}
          lastUpdated={lastUpdated}
          range={range}
          onRangeChange={handleRangeChange}
          onRefresh={handleRefresh}
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          <FacilityFeedTab facilityId={facilityId} key={feedKey} />
        </div>
      </div>
    );
  }

  // ── Chat tab ─────────────────────────────────────────────────────────
  if (activeTab === "chat") {
    return (
      <div className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden">
        <ManageHeaderShell
          facilityId={facilityId}
          facilityName={data?.facilityName}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isRefreshing={isRefreshing}
          lastUpdated={lastUpdated}
          range={range}
          onRangeChange={handleRangeChange}
          onRefresh={handleRefresh}
        />
        <FacilityChat facilityId={facilityId} />
      </div>
    );
  }

  // ── Analytics tab content ─────────────────────────────────────────────
  // Still show content even if some data is present
  if (!data || (data.totalDevices === 0 && data.totalEventsInRange === 0)) {
    if (!isLoading) {
      if (data && data.totalDevices === 0) {
        return (
          <div className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden">
            <ManageHeaderShell
              facilityId={facilityId}
              facilityName={data.facilityName}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              isRefreshing={isRefreshing}
              lastUpdated={lastUpdated}
              range={range}
              onRangeChange={handleRangeChange}
              onRefresh={handleRefresh}
            />
            <EmptyState />
          </div>
        );
      }
    }
  }

  // ── Content ─────────────────────────────────────────────────────────
  type KpiItem = {
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: React.ComponentType<{ className?: string }>;
    trend?: string;
    trendDirection?: "up" | "down";
  };

  const kpiItems: KpiItem[] = data
    ? [
        {
          title: "Health Score",
          value: `${data.healthScore}%`,
          subtitle:
            data.overallStatus === "normal"
              ? "All systems normal"
              : data.overallStatus === "attention"
                ? "Needs attention"
                : "Critical",
          icon: HeartPulseIcon,
        },
        {
          title: "Devices Online",
          value: `${data.onlineDevices} / ${data.totalDevices}`,
          subtitle: `${data.totalDevices - data.onlineDevices} offline`,
          icon: MonitorIcon,
          trend: data.totalDevices > 0 ? `${Math.round((data.onlineDevices / data.totalDevices) * 100)}%` : undefined,
          trendDirection: data.totalDevices > 0 && data.onlineDevices / data.totalDevices >= 0.8 ? "up" : "down",
        },
        {
          title: "Active Alerts",
          value: data.totalEventsInRange.toLocaleString(),
          subtitle: `${data.eventCounts.find((e) => e.severity === "error")?.count ?? 0} errors`,
          icon: AlertTriangleIcon,
        },
        {
          title: "Sensor Warnings",
          value: (
            (data.sensorStatusCounts.find((s) => s.status === "warn")?.count ?? 0) +
            (data.sensorStatusCounts.find((s) => s.status === "error")?.count ?? 0)
          ).toString(),
          subtitle: `${data.sensorMetrics.length} sensors reporting`,
          icon: ActivityIcon,
        },
        {
          title: "CCTV Anomalies",
          value: data.anomalyCount.toLocaleString(),
          subtitle: "In selected period",
          icon: ScanEyeIcon,
          trend: data.anomalyCount > 0 ? `${data.anomalyCount}` : "None",
          trendDirection: data.anomalyCount > 0 ? "down" : undefined,
        },
        {
          title: "Recordings",
          value: data.recordingCount.toLocaleString(),
          subtitle: formatDuration(data.totalRecordingDurationSec),
          icon: VideoIcon,
        },
      ]
    : [];

  return (
    <div className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden">
      <ManageHeaderShell
        facilityId={facilityId}
        facilityName={data?.facilityName}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isRefreshing={isRefreshing}
        lastUpdated={lastUpdated}
        range={range}
        onRangeChange={handleRangeChange}
        onRefresh={handleRefresh}
      />

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="flex flex-col gap-6">
          {/* ── KPI Cards ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {kpiItems.map((kpi, i) => (
              <KpiCard key={i} {...kpi} />
            ))}
          </div>

          {/* ── AI Insights ────────────────────────────────────────────── */}
          {data && data.insights.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <EyeIcon className="text-muted-foreground size-4" />
                  AI Insights
                </CardTitle>
                <CardDescription>Deterministic operational insights generated from facility data</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {data.insights.map((insight) => (
                  <InsightCard insight={insight} key={insight.id} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Charts Section ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Event Trend */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3Icon className="text-muted-foreground size-4" />
                  Event Trend
                </CardTitle>
                <CardDescription>Events over time by severity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {data ? (
                    <EventTrendChart data={data.eventBuckets} range={range} />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Spinner className="size-6" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Device Composition / Severity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MonitorIcon className="text-muted-foreground size-4" />
                  Devices
                </CardTitle>
                <CardDescription>By type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  {data ? (
                    <DeviceCompositionChart data={data.devicesByType} />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Spinner className="size-6" />
                    </div>
                  )}
                </div>
                {/* Legend */}
                {data && data.devicesByType.length > 0 && (
                  <div className="border-border mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3">
                    {data.devicesByType.map((d, i) => (
                      <span className="text-muted-foreground flex items-center gap-1.5 text-[10px]" key={d.type}>
                        <span
                          className="inline-block size-2 rounded-none"
                          style={{
                            backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                        {d.type}
                        <span className="text-foreground font-medium tabular-nums">{d.count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Severity Bar Chart + Sensor Metrics row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangleIcon className="text-muted-foreground size-4" />
                  Events by Severity
                </CardTitle>
                <CardDescription>Count in selected period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  {data ? (
                    <SeverityBarChart data={data.eventCounts} />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Spinner className="size-6" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ActivityIcon className="text-muted-foreground size-4" />
                  Sensor Metrics
                </CardTitle>
                <CardDescription>Latest readings per sensor device</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <SensorMetricsTable metrics={data?.sensorMetrics ?? []} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Recent Alerts ──────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircleIcon className="text-muted-foreground size-4" />
                Recent Alerts
              </CardTitle>
              <CardDescription>Last 20 events across all devices</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <RecentAlertsTable alerts={data?.recentAlerts ?? []} />
              </div>
            </CardContent>
          </Card>

          {/* ── Device Health ──────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MonitorIcon className="text-muted-foreground size-4" />
                Device Health
              </CardTitle>
              <CardDescription>{data?.totalDevices ?? 0} device(s) configured</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <DeviceHealthTable devices={data?.devices ?? []} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Manage Header Shell ────────────────────────────────────────────────────

function ManageHeaderShell({
  facilityId,
  facilityName,
  activeTab,
  onTabChange,
  isRefreshing,
  lastUpdated,
  range,
  onRangeChange,
  onRefresh,
}: {
  facilityId: string;
  facilityName?: string;
  activeTab: string;
  onTabChange: (id: string) => void;
  isRefreshing: boolean;
  lastUpdated: Date | null;
  range: AnalyticsTimeRange;
  onRangeChange: (value: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-col">
      {/* Header */}
      <div className="border-border flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <Link params={{ id: facilityId }} to="/facility/$id">
          <Button aria-label="Back to facility" size="icon-sm" variant="ghost">
            <ArrowLeftIcon className="size-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="font-heading text-foreground truncate text-sm font-medium">{facilityName ?? "Manage"}</h1>
          <p className="text-muted-foreground/60 truncate text-[11px]">
            {activeTab === "analytics"
              ? "Operational analytics and AI insights"
              : activeTab === "feed"
                ? "Live facility feeds"
                : "Ask questions across facility data and media"}
            {activeTab === "analytics" && lastUpdated && (
              <span className="ml-2">· Updated {formatTimestamp(lastUpdated.toISOString())}</span>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {activeTab === "analytics" && (
            <ToggleGroup onValueChange={(v) => v && onRangeChange(v)} size="sm" type="single" value={range}>
              <ToggleGroupItem value="24h">24h</ToggleGroupItem>
              <ToggleGroupItem value="7d">7d</ToggleGroupItem>
              <ToggleGroupItem value="30d">30d</ToggleGroupItem>
            </ToggleGroup>
          )}
          {activeTab !== "chat" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Refresh"
                  disabled={isRefreshing}
                  onClick={onRefresh}
                  size="icon-sm"
                  variant="outline"
                >
                  <RefreshCwIcon className={cn("size-4", isRefreshing && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <PlatformTabs activeTab={activeTab} onChange={onTabChange} tabs={TABS} />
    </div>
  );
}
