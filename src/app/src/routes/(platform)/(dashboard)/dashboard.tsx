"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2Icon, Loader2Icon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { MonitoringStatusIndicator, monitoringStatusLabel } from "#/components/status-indicator";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty";
import { Field, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "#/components/ui/sheet";
import { Skeleton } from "#/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { createFacility, getFacilities } from "#/lib/functions/facility";
import { getMonitoringStatuses } from "#/lib/functions/server";
import type { MonitoringStatus } from "#/lib/monitoring/types";

import { PlatformPageHeader } from "./-components/platform-page-header";

export const Route = createFileRoute("/(platform)/(dashboard)/dashboard")({
  component: Page,
});

interface Facility {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

function Page() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [newFacilityName, setNewFacilityName] = useState("");
  const [statuses, setStatuses] = useState<Record<string, MonitoringStatus>>({});

  const fetchFacilities = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getFacilities();
      const facilities = data as Facility[];
      setFacilities(facilities);

      const ids = facilities.map((f) => f.id);
      if (ids.length > 0) {
        try {
          const results = await getMonitoringStatuses({ data: { facilityIds: ids } });
          const statusMap: Record<string, MonitoringStatus> = {};
          for (const entry of results) {
            statusMap[entry.id] = entry.status;
          }
          setStatuses(statusMap);
        } catch {
          // Statuses are non-critical.
        }
      }
    } catch {
      setError("Failed to load facilities. Please try again.");
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
      } catch {
        toast.error("Failed to create facility");
      } finally {
        setIsCreating(false);
      }
    },
    [newFacilityName],
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PlatformPageHeader description="Manage your facilities and their devices" title="Facilities">
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
      </PlatformPageHeader>

      {isLoading ? (
        <FacilityGridSkeleton />
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12">
          <p className="text-destructive text-sm font-medium">{error}</p>
          <Button onClick={fetchFacilities} size="sm" variant="outline">
            <RefreshCwIcon />
            Retry
          </Button>
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
                className="focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none"
                key={facility.id}
                params={{ id: facility.id }}
                to="/facility/$id"
              >
                <Card className="hover:bg-muted/50 transition-colors">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2Icon className="text-muted-foreground size-4" />
                      {facility.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <p className="text-muted-foreground text-xs">Created {facility.createdAt.toLocaleDateString()}</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center">
                            <MonitoringStatusIndicator status={status} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Monitoring: {monitoringStatusLabel(status)}</TooltipContent>
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

function FacilityGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-4 w-3/4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-3 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
