"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  ArrowUpRightIcon,
  Building2Icon,
  HeartPulseIcon,
  MapPinnedIcon,
  MonitorCheckIcon,
} from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Button } from "#/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "#/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import type { AnalyticsTimeRange, EventBucket } from "#/lib/functions/analytics";

import { PlatformPageHeader } from "./-components/platform-page-header";
import {
  ChartEmpty,
  DashboardControls,
  FacilityStatus,
  formatChartTime,
  formatTimestamp,
  MetricCard,
  PortfolioEmpty,
  PortfolioError,
  PortfolioLoading,
  RANGE_LABELS,
  SeverityBadge,
} from "./-components/portfolio-dashboard-shared";
import { type PortfolioFacility, usePortfolioAnalytics } from "./-components/use-portfolio-analytics";

export const Route = createFileRoute("/(platform)/(dashboard)/overview")({
  component: RouteComponent,
});

const eventChartConfig = {
  info: { label: "Information", color: "var(--chart-1)" },
  warn: { label: "Warning", color: "var(--chart-4)" },
  error: { label: "Critical", color: "var(--chart-3)" },
} satisfies ChartConfig;

const STATUS_PRIORITY = { critical: 0, attention: 1, normal: 2 } as const;

function aggregateEventBuckets(facilities: PortfolioFacility[]) {
  const buckets = new Map<string, EventBucket>();

  for (const { analytics } of facilities) {
    for (const bucket of analytics.eventBuckets) {
      const current = buckets.get(bucket.time) ?? { time: bucket.time, info: 0, warn: 0, error: 0 };
      current.info += bucket.info;
      current.warn += bucket.warn;
      current.error += bucket.error;
      buckets.set(bucket.time, current);
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.time.localeCompare(b.time));
}

function getSeverityCount(facility: PortfolioFacility, severity: string) {
  return facility.analytics.eventCounts.find((item) => item.severity === severity)?.count ?? 0;
}

function RouteComponent() {
  const [range, setRange] = useState<AnalyticsTimeRange>("24h");
  const { facilities, isLoading, isRefreshing, error, lastUpdated, refresh } = usePortfolioAnalytics(range);

  const totalDevices = facilities.reduce((total, item) => total + item.analytics.totalDevices, 0);
  const onlineDevices = facilities.reduce((total, item) => total + item.analytics.onlineDevices, 0);
  const totalZones = facilities.reduce((total, item) => total + item.analytics.zoneCount, 0);
  const normalFacilities = facilities.filter((item) => item.analytics.overallStatus === "normal").length;
  const priorityEvents = facilities.reduce(
    (total, item) => total + getSeverityCount(item, "warn") + getSeverityCount(item, "error"),
    0,
  );
  const averageHealth = facilities.length
    ? Math.round(facilities.reduce((total, item) => total + item.analytics.healthScore, 0) / facilities.length)
    : 0;
  const eventBuckets = aggregateEventBuckets(facilities);
  const rankedFacilities = [...facilities].sort(
    (a, b) =>
      STATUS_PRIORITY[a.analytics.overallStatus] - STATUS_PRIORITY[b.analytics.overallStatus] ||
      a.analytics.healthScore - b.analytics.healthScore,
  );
  const recentPriorityEvents = facilities
    .flatMap(({ facility, analytics }) =>
      analytics.recentAlerts
        .filter((alert) => alert.severity === "warn" || alert.severity === "error")
        .map((alert) => ({ ...alert, facilityId: facility.id, facilityName: facility.name })),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PlatformPageHeader
        className="flex-col items-stretch sm:flex-row sm:items-center"
        description="Portfolio health, device coverage, and activity across your facilities"
        title="Overview"
      >
        <DashboardControls
          isRefreshing={isRefreshing}
          lastUpdated={lastUpdated}
          onRangeChange={setRange}
          onRefresh={refresh}
          range={range}
        />
      </PlatformPageHeader>

      {isLoading && facilities.length === 0 ? (
        <PortfolioLoading />
      ) : error && facilities.length === 0 ? (
        <PortfolioError message={error} onRetry={refresh} />
      ) : facilities.length === 0 ? (
        <PortfolioEmpty />
      ) : (
        <>
          {error ? <p className="text-destructive text-xs">Refresh failed: {error}</p> : null}

          <section aria-label="Portfolio metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              detail={`${normalFacilities} of ${facilities.length} facilities operating normally`}
              icon={HeartPulseIcon}
              label="Portfolio Health"
              value={`${averageHealth}%`}
            />
            <MetricCard
              detail={`${totalDevices - onlineDevices} devices need attention`}
              icon={MonitorCheckIcon}
              label="Device Availability"
              value={`${onlineDevices} / ${totalDevices}`}
            />
            <MetricCard
              detail={`${RANGE_LABELS[range].toLowerCase()} across all facilities`}
              icon={AlertTriangleIcon}
              label="Priority Events"
              value={priorityEvents.toLocaleString()}
            />
            <MetricCard
              detail={`${totalZones} monitored zones`}
              icon={Building2Icon}
              label="Facilities in Scope"
              value={facilities.length.toLocaleString()}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Operational Event Volume</CardTitle>
                <CardDescription>
                  All facility events grouped by severity for {RANGE_LABELS[range].toLowerCase()}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {eventBuckets.length === 0 ? (
                    <ChartEmpty />
                  ) : (
                    <ChartContainer className="h-full min-h-64 w-full" config={eventChartConfig}>
                      <AreaChart
                        accessibilityLayer
                        data={eventBuckets}
                        margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                      >
                        <defs>
                          {(["info", "warn", "error"] as const).map((key) => (
                            <linearGradient id={`overview-${key}`} key={key} x1="0" x2="0" y1="0" y2="1">
                              <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.28} />
                              <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.02} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid vertical={false} />
                        <XAxis
                          axisLine={false}
                          dataKey="time"
                          tickFormatter={(value) => formatChartTime(value, range)}
                          tickLine={false}
                          tickMargin={8}
                        />
                        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tickMargin={8} />
                        <ChartTooltip
                          content={<ChartTooltipContent />}
                          labelFormatter={(value) => formatChartTime(String(value), range)}
                        />
                        {(["info", "warn", "error"] as const).map((key) => (
                          <Area
                            dataKey={key}
                            fill={`url(#overview-${key})`}
                            key={key}
                            stackId="events"
                            stroke={`var(--color-${key})`}
                            strokeWidth={1.5}
                            type="monotone"
                          />
                        ))}
                      </AreaChart>
                    </ChartContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Attention Queue</CardTitle>
                <CardDescription>Latest warnings and critical events across the portfolio.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {recentPriorityEvents.length === 0 ? (
                  <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
                    <HeartPulseIcon className="size-5 text-emerald-500" />
                    <p className="font-medium">No priority events</p>
                    <p className="text-muted-foreground max-w-52 text-[10px]">
                      All recent facility events are informational.
                    </p>
                  </div>
                ) : (
                  recentPriorityEvents.map((event) => (
                    <Link
                      className="hover:bg-muted/50 focus-visible:ring-ring grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 px-2 py-2 outline-none focus-visible:ring-1"
                      key={event.id}
                      params={{ id: event.facilityId }}
                      search={{ tab: "logs" }}
                      to="/manage/$id"
                    >
                      <SeverityBadge severity={event.severity} />
                      <span className="truncate font-medium">{event.message}</span>
                      <span className="text-muted-foreground col-start-2 truncate text-[10px]">
                        {event.facilityName} · {formatTimestamp(event.createdAt)}
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle>Facility Readiness</CardTitle>
                <CardDescription>Health, coverage, and current activity for every facility in scope.</CardDescription>
                <CardAction className="text-muted-foreground flex items-center gap-1 text-[10px]">
                  <MapPinnedIcon className="size-3.5" />
                  {totalZones} zones
                </CardAction>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Facility</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Health</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Devices</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Priority Events</TableHead>
                      <TableHead className="hidden lg:table-cell">Latest Activity</TableHead>
                      <TableHead className="w-10">
                        <span className="sr-only">Open</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankedFacilities.map(({ facility, analytics }) => {
                      const latestEvent = analytics.recentAlerts[0];
                      const facilityPriorityEvents =
                        getSeverityCount({ facility, analytics }, "warn") +
                        getSeverityCount({ facility, analytics }, "error");

                      return (
                        <TableRow key={facility.id}>
                          <TableCell className="font-medium">{facility.name}</TableCell>
                          <TableCell>
                            <FacilityStatus status={analytics.overallStatus} />
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{analytics.healthScore}%</TableCell>
                          <TableCell className="hidden text-right tabular-nums sm:table-cell">
                            {analytics.onlineDevices} / {analytics.totalDevices}
                          </TableCell>
                          <TableCell className="hidden text-right tabular-nums md:table-cell">
                            {facilityPriorityEvents}
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden lg:table-cell">
                            {latestEvent ? formatTimestamp(latestEvent.createdAt) : "No activity"}
                          </TableCell>
                          <TableCell>
                            <Button
                              aria-label={`Open ${facility.name} analytics`}
                              asChild
                              size="icon-xs"
                              variant="ghost"
                            >
                              <Link params={{ id: facility.id }} to="/manage/$id">
                                <ArrowUpRightIcon />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
