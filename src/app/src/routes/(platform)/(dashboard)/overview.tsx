"use client";

import { createFileRoute } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";

import { ChartLineDefault } from "./-components/chart-line-default";
import { PlatformPageHeader } from "./-components/platform-page-header";

export const Route = createFileRoute("/(platform)/(dashboard)/overview")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PlatformPageHeader description="Real-time operational summary across all facilities" title="Overview" />

      <section>
        <h2 className="font-heading mb-4 text-sm font-medium tracking-tight">General</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Current Personnel on Site" value="15" />
          <StatCard label="Loading Bays in Use" value="4/6" />
        </div>
      </section>

      <ChartLineDefault />

      <section>
        <h2 className="font-heading mb-4 text-sm font-medium tracking-tight">Alerts</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Pending Security Alerts" value="20" />
          <StatCard label="PPE Violations" value="5" />
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6 pb-4">
        <p className="font-heading text-3xl font-bold tabular-nums">{value}</p>
      </CardContent>
      <CardHeader className="pt-0">
        <CardTitle className="text-xs">{label}</CardTitle>
      </CardHeader>
    </Card>
  );
}
