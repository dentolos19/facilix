"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertOctagonIcon,
  AlertTriangleIcon,
  ArrowUpRightIcon,
  Building2Icon,
  CctvIcon,
  EyeIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { StatusBadge } from "#/components/status-indicator";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "#/components/ui/chart";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import type { AnalyticsTimeRange, RecentAlert } from "#/lib/functions/analytics";

import { PlatformPageHeader } from "./-components/platform-page-header";
import {
  ChartEmpty,
  DashboardControls,
  FacilityStatus,
  formatTimestamp,
  humanizeEventType,
  MetricCard,
  PortfolioEmpty,
  PortfolioError,
  PortfolioLoading,
  RANGE_LABELS,
  SeverityBadge,
} from "./-components/portfolio-dashboard-shared";
import { type PortfolioFacility, usePortfolioAnalytics } from "./-components/use-portfolio-analytics";

export const Route = createFileRoute("/(platform)/(dashboard)/security")({
  component: RouteComponent,
});

type SeverityFilter = "all" | "error" | "warn";

interface PortfolioAlert extends RecentAlert {
  facilityId: string;
  facilityName: string;
}

const alertChartConfig = {
  warning: { label: "Warning", color: "var(--chart-4)" },
  critical: { label: "Critical", color: "var(--chart-3)" },
} satisfies ChartConfig;

function getSeverityCount(facility: PortfolioFacility, severity: string) {
  return facility.analytics.eventCounts.find((item) => item.severity === severity)?.count ?? 0;
}

function getCctvDevices(facility: PortfolioFacility) {
  return facility.analytics.devices.filter((device) => device.type === "CCTV");
}

function isOnline(status: string) {
  return status === "online" || status === "running";
}

function RouteComponent() {
  const [range, setRange] = useState<AnalyticsTimeRange>("24h");
  const [facilityFilter, setFacilityFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const { facilities, isLoading, isRefreshing, error, lastUpdated, refresh } = usePortfolioAnalytics(range);

  const scopedFacilities =
    facilityFilter === "all" || !facilities.some((item) => item.facility.id === facilityFilter)
      ? facilities
      : facilities.filter((item) => item.facility.id === facilityFilter);

  const criticalCount = scopedFacilities.reduce((total, item) => total + getSeverityCount(item, "error"), 0);
  const warningCount = scopedFacilities.reduce((total, item) => total + getSeverityCount(item, "warn"), 0);
  const anomalyCount = scopedFacilities.reduce((total, item) => total + item.analytics.anomalyCount, 0);
  const totalCameras = scopedFacilities.reduce((total, item) => total + getCctvDevices(item).length, 0);
  const onlineCameras = scopedFacilities.reduce(
    (total, item) => total + getCctvDevices(item).filter((device) => isOnline(device.status)).length,
    0,
  );
  const affectedFacilities = scopedFacilities.filter((item) => {
    const priorityEvents = getSeverityCount(item, "error") + getSeverityCount(item, "warn");
    return priorityEvents > 0 || getCctvDevices(item).some((device) => !isOnline(device.status));
  }).length;

  const alerts = scopedFacilities
    .flatMap(({ facility, analytics }): PortfolioAlert[] =>
      analytics.recentAlerts
        .filter((alert) => alert.severity === "warn" || alert.severity === "error")
        .map((alert) => ({ ...alert, facilityId: facility.id, facilityName: facility.name })),
    )
    .filter((alert) => severityFilter === "all" || alert.severity === severityFilter)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const facilityAlertVolume = scopedFacilities
    .map((item) => ({
      facilityId: item.facility.id,
      facility: item.facility.name,
      warning: getSeverityCount(item, "warn"),
      critical: getSeverityCount(item, "error"),
    }))
    .filter((item) => item.warning > 0 || item.critical > 0)
    .sort((a, b) => b.critical - a.critical || b.warning - a.warning)
    .slice(0, 8);

  const coverageGaps = scopedFacilities
    .flatMap(({ facility, analytics }) =>
      analytics.devices
        .filter((device) => device.type === "CCTV" && !isOnline(device.status))
        .map((device) => ({ ...device, facilityId: facility.id, facilityName: facility.name })),
    )
    .sort((a, b) => a.facilityName.localeCompare(b.facilityName) || a.name.localeCompare(b.name));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PlatformPageHeader
        className="flex-col items-stretch sm:flex-row sm:items-center"
        description="Alert triage, camera coverage, and security posture across your facilities"
        title="Security"
      >
        <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
          <DashboardControls
            isRefreshing={isRefreshing}
            lastUpdated={lastUpdated}
            onRangeChange={setRange}
            onRefresh={refresh}
            range={range}
          />
          <Select onValueChange={setFacilityFilter} value={facilityFilter}>
            <SelectTrigger aria-label="Filter by facility" className="max-w-48" size="sm">
              <Building2Icon />
              <SelectValue placeholder="All facilities" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectGroup>
                <SelectItem value="all">All facilities</SelectItem>
                {facilities.map(({ facility }) => (
                  <SelectItem key={facility.id} value={facility.id}>
                    {facility.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
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

          <section aria-label="Security metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <MetricCard
              detail={RANGE_LABELS[range]}
              icon={AlertOctagonIcon}
              label="Critical Events"
              value={criticalCount.toLocaleString()}
            />
            <MetricCard
              detail={RANGE_LABELS[range]}
              icon={AlertTriangleIcon}
              label="Warnings"
              value={warningCount.toLocaleString()}
            />
            <MetricCard
              detail="CCTV anomalies detected"
              icon={EyeIcon}
              label="Visual Anomalies"
              value={anomalyCount.toLocaleString()}
            />
            <MetricCard
              detail={`${totalCameras - onlineCameras} unavailable`}
              icon={CctvIcon}
              label="Camera Coverage"
              value={`${onlineCameras} / ${totalCameras}`}
            />
            <MetricCard
              detail={`${scopedFacilities.length - affectedFacilities} currently clear`}
              icon={ShieldCheckIcon}
              label="Facilities Affected"
              value={`${affectedFacilities} / ${scopedFacilities.length}`}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Alert Volume by Facility</CardTitle>
                <CardDescription>Highest-volume facilities for {RANGE_LABELS[range].toLowerCase()}.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {facilityAlertVolume.length === 0 ? (
                    <ChartEmpty label="No warning or critical events in this period" />
                  ) : (
                    <ChartContainer className="h-full min-h-64 w-full" config={alertChartConfig}>
                      <BarChart
                        accessibilityLayer
                        data={facilityAlertVolume}
                        layout="vertical"
                        margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
                      >
                        <CartesianGrid horizontal={false} />
                        <XAxis allowDecimals={false} axisLine={false} tickLine={false} type="number" />
                        <YAxis
                          axisLine={false}
                          dataKey="facility"
                          tickFormatter={(value) => String(value).slice(0, 18)}
                          tickLine={false}
                          type="category"
                          width={112}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="warning" fill="var(--color-warning)" radius={0} stackId="alerts" />
                        <Bar dataKey="critical" fill="var(--color-critical)" radius={0} stackId="alerts" />
                      </BarChart>
                    </ChartContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Camera Coverage Gaps</CardTitle>
                <CardDescription>CCTV devices that are not currently online.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {coverageGaps.length === 0 ? (
                  <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
                    <ShieldCheckIcon className="size-5 text-emerald-500" />
                    <p className="font-medium">Camera coverage is healthy</p>
                    <p className="text-muted-foreground max-w-52 text-[10px]">
                      All configured cameras are currently online.
                    </p>
                  </div>
                ) : (
                  coverageGaps.slice(0, 8).map((device) => (
                    <Link
                      className="hover:bg-muted/50 focus-visible:ring-ring flex items-center gap-2 px-2 py-2 outline-none focus-visible:ring-1"
                      key={device.id}
                      params={{ id: device.id }}
                      to="/device/$id"
                    >
                      <CctvIcon className="text-muted-foreground size-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{device.name}</span>
                        <span className="text-muted-foreground block truncate text-[10px]">
                          {device.facilityName} · {device.zoneName ?? "Unassigned zone"}
                        </span>
                      </span>
                      <StatusBadge status={device.status} />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle>Alert Queue</CardTitle>
                <CardDescription>Latest warning and critical events requiring operator review.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ToggleGroup
                  aria-label="Filter alerts by severity"
                  onValueChange={(value) => {
                    if (value === "all" || value === "error" || value === "warn") setSeverityFilter(value);
                  }}
                  size="sm"
                  spacing={0}
                  type="single"
                  value={severityFilter}
                  variant="outline"
                >
                  <ToggleGroupItem value="all">All</ToggleGroupItem>
                  <ToggleGroupItem value="error">Critical</ToggleGroupItem>
                  <ToggleGroupItem value="warn">Warning</ToggleGroupItem>
                </ToggleGroup>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Severity</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead className="hidden sm:table-cell">Facility</TableHead>
                      <TableHead className="hidden md:table-cell">Source</TableHead>
                      <TableHead className="hidden lg:table-cell">Type</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                      <TableHead className="w-10">
                        <span className="sr-only">Open</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.length === 0 ? (
                      <TableRow>
                        <TableCell className="text-muted-foreground h-24 text-center" colSpan={7}>
                          No alerts match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      alerts.slice(0, 25).map((alert) => (
                        <TableRow key={alert.id}>
                          <TableCell>
                            <SeverityBadge severity={alert.severity} />
                          </TableCell>
                          <TableCell className="max-w-72 font-medium">
                            <span className="line-clamp-2">{alert.message}</span>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">{alert.facilityName}</TableCell>
                          <TableCell className="text-muted-foreground hidden md:table-cell">
                            {alert.deviceName ?? "Facility system"}
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden lg:table-cell">
                            {humanizeEventType(alert.type)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-right whitespace-nowrap tabular-nums">
                            {formatTimestamp(alert.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Button
                              aria-label={`Open source for ${alert.message}`}
                              asChild
                              size="icon-xs"
                              variant="ghost"
                            >
                              {alert.deviceId ? (
                                <Link params={{ id: alert.deviceId }} to="/device/$id">
                                  <ArrowUpRightIcon />
                                </Link>
                              ) : (
                                <Link params={{ id: alert.facilityId }} search={{ tab: "logs" }} to="/manage/$id">
                                  <ArrowUpRightIcon />
                                </Link>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle>Facility Security Posture</CardTitle>
                <CardDescription>Security activity and camera availability by facility.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Facility</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Critical</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Warnings</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Anomalies</TableHead>
                      <TableHead className="hidden text-right lg:table-cell">Cameras Online</TableHead>
                      <TableHead className="w-10">
                        <span className="sr-only">Open logs</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scopedFacilities.map(({ facility, analytics }) => {
                      const cameras = analytics.devices.filter((device) => device.type === "CCTV");
                      return (
                        <TableRow key={facility.id}>
                          <TableCell className="font-medium">{facility.name}</TableCell>
                          <TableCell>
                            <FacilityStatus status={analytics.overallStatus} />
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {getSeverityCount({ facility, analytics }, "error")}
                          </TableCell>
                          <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
                            {getSeverityCount({ facility, analytics }, "warn")}
                          </TableCell>
                          <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">
                            {analytics.anomalyCount}
                          </TableCell>
                          <TableCell className="hidden text-right tabular-nums lg:table-cell">
                            {cameras.filter((device) => isOnline(device.status)).length} / {cameras.length}
                          </TableCell>
                          <TableCell>
                            <Button aria-label={`Open ${facility.name} logs`} asChild size="icon-xs" variant="ghost">
                              <Link params={{ id: facility.id }} search={{ tab: "logs" }} to="/manage/$id">
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
