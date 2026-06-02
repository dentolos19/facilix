"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2Icon,
  CircleCheckIcon,
  CircleXIcon,
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty.tsx";
import { Field, FieldLabel } from "#/components/ui/field.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "#/components/ui/sheet.tsx";
import { Spinner } from "#/components/ui/spinner.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip.tsx";
import { createFacility, getFacilities } from "#/lib/functions/facility";
import { getMonitoringStatuses } from "#/lib/functions/monitoring";
import type { MonitoringStatus } from "#/lib/monitoring/types";

export const Route = createFileRoute("/(platform)/dashboard")({
  component: Page,
});

/** Map monitoring status to a human-readable label. */
function statusLabel(status: MonitoringStatus): string {
  switch (status) {
    case "running":
      return "Running";
    case "starting":
      return "Starting…";
    case "stopping":
      return "Stopping…";
    case "stopped":
      return "Stopped";
    case "error":
      return "Error";
  }
}

/** Colour helper for the status dot. */
function statusColor(status: MonitoringStatus): string {
  switch (status) {
    case "running":
      return "text-emerald-500";
    case "starting":
    case "stopping":
      return "text-amber-500";
    case "error":
      return "text-red-500";
    case "stopped":
      return "text-muted-foreground/30";
  }
}

function StatusIndicator({ status }: { status: MonitoringStatus }) {
  const Icon =
    status === "running"
      ? CircleCheckIcon
      : status === "error"
        ? CircleXIcon
        : status === "stopped"
          ? MinusIcon
          : Loader2Icon;

  return (
    <Icon
      className={`size-3.5 shrink-0 ${statusColor(status)} ${status === "starting" || status === "stopping" ? "animate-spin" : ""}`}
    />
  );
}

interface Facility {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

function Page() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [newFacilityName, setNewFacilityName] = useState("");

  // ── Monitoring statuses keyed by facility ID ─────────────────────────
  const [statuses, setStatuses] = useState<Record<string, MonitoringStatus>>({});
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;

  const fetchFacilities = useCallback(async () => {
    try {
      const data = await getFacilities();
      setFacilities(data as Facility[]);

      // After loading facilities, fetch their monitoring statuses
      const ids = (data as Facility[]).map((f) => f.id);
      if (ids.length > 0) {
        try {
          const results = await getMonitoringStatuses({ data: { facilityIds: ids } });
          const statusMap: Record<string, MonitoringStatus> = {};
          for (const entry of results) {
            statusMap[entry.id] = entry.status;
          }
          setStatuses(statusMap);
        } catch {
          // Non-critical; statuses remain empty
        }
      }
    } catch (error) {
      toast.error("Failed to load facilities");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFacilities();
  }, [fetchFacilities]);

  const handleCreateFacility = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!newFacilityName.trim()) {
        toast.error("Please enter a facility name");
        return;
      }

      setIsCreating(true);

      try {
        const facility = await createFacility({ data: { name: newFacilityName.trim() } });
        setFacilities((prev) => [...prev, facility]);
        setNewFacilityName("");
        setIsSheetOpen(false);
        toast.success("Facility created successfully");
      } catch (error) {
        toast.error("Failed to create facility");
      } finally {
        setIsCreating(false);
      }
    },
    [newFacilityName],
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-lg font-medium tracking-tight">Facilities</h1>
          <p className="text-xs text-muted-foreground">Manage your facilities and their devices</p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/settings">
            <Button aria-label="Settings" size="icon-sm" variant="ghost">
              <SettingsIcon className="size-4" />
            </Button>
          </Link>
          <Sheet onOpenChange={setIsSheetOpen} open={isSheetOpen}>
            <SheetTrigger asChild>
              <Button size="sm">
                <PlusIcon />
                New Facility
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Create Facility</SheetTitle>
                <SheetDescription>Add a new facility to manage devices and monitoring.</SheetDescription>
              </SheetHeader>

              <form className="flex flex-1 flex-col" onSubmit={handleCreateFacility}>
                <div className="flex-1 p-4">
                  <Field>
                    <FieldLabel>Name</FieldLabel>
                    <Input
                      autoFocus
                      disabled={isCreating}
                      onChange={(e) => setNewFacilityName(e.target.value)}
                      placeholder="e.g., Main Warehouse"
                      value={newFacilityName}
                    />
                  </Field>
                </div>

                <SheetFooter>
                  <Button disabled={isCreating || !newFacilityName.trim()} type="submit">
                    {isCreating ? (
                      <>
                        <Loader2Icon className="animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Facility"
                    )}
                  </Button>
                </SheetFooter>
              </form>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <Spinner className="size-6" />
        </div>
      ) : facilities.length === 0 ? (
        <Empty className="flex-1 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2Icon />
            </EmptyMedia>
            <EmptyTitle>No facilities yet</EmptyTitle>
            <EmptyDescription>
              Get started by creating your first facility to manage devices and monitoring.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setIsSheetOpen(true)} size="sm">
              <PlusIcon />
              Create Facility
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {facilities.map((facility) => {
            const status = statuses[facility.id] ?? "stopped";
            return (
              <Link
                className="focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                key={facility.id}
                params={{ id: facility.id }}
                to="/facility/$id"
              >
                <Card className="transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2Icon className="size-4 text-muted-foreground" />
                      {facility.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">Created {facility.createdAt.toLocaleDateString()}</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center">
                            <StatusIndicator status={status} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Monitoring: {statusLabel(status)}</TooltipContent>
                      </Tooltip>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
