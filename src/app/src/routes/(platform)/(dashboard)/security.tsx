"use client";

import { createFileRoute } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";

import { PlatformPageHeader } from "./-components/platform-page-header";

export const Route = createFileRoute("/(platform)/(dashboard)/security")({
  component: RouteComponent,
});

const RECENT_LOGS = [
  { id: "LOG-1009", time: "09:41:18", personnel: "NA", role: "NA", activity: "Person loitering near Loading Bay B" },
  {
    id: "LOG-1003",
    time: "08:26:33",
    personnel: "Sarah Lim",
    role: "Quality Inspector",
    activity: "Attempted to enter restricted Operations zone",
  },
  { id: "LOG-1006", time: "09:02:41", personnel: "NA", role: "NA", activity: "Fire detected in operations zone" },
];

function RouteComponent() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PlatformPageHeader description="Security alerts and incident logs across all facilities" title="Security" />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6 pb-4">
            <p className="font-heading text-3xl font-bold tabular-nums">20</p>
          </CardContent>
          <CardHeader className="pt-0">
            <CardTitle className="text-xs">Pending Security Alerts</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardContent className="pt-6 pb-4">
            <p className="font-heading text-3xl font-bold tabular-nums">50</p>
          </CardContent>
          <CardHeader className="pt-0">
            <CardTitle className="text-xs">Total Alerts (24h)</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-sm font-medium tracking-tight">Recent Pending Security Logs</h2>
          <Button size="sm" variant="outline">
            View All
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Log ID</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="hidden sm:table-cell">Personnel</TableHead>
              <TableHead className="hidden md:table-cell">Role</TableHead>
              <TableHead>Activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {RECENT_LOGS.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-mono text-xs">{log.id}</TableCell>
                <TableCell className="tabular-nums">{log.time}</TableCell>
                <TableCell className="hidden sm:table-cell">{log.personnel}</TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">{log.role}</TableCell>
                <TableCell>{log.activity}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
