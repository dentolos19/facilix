"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2Icon, ImagePlusIcon, Loader2Icon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { MonitoringStatusIndicator, monitoringStatusLabel } from "#/components/status-indicator";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field";
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
import { hasAdminRole, useSession } from "#/lib/auth/client";
import { createFacility, getFacilities } from "#/lib/functions/facility";
import { generateFacilityLayoutFromFile } from "#/lib/functions/facility-layout";
import { getMonitoringStatuses } from "#/lib/functions/server";
import type { MonitoringStatus } from "#/lib/monitoring/types";
import { getShowAllFacilitiesPreference } from "#/lib/preferences";
import type { CanvasItemLayout, CanvasLayoutData, PlacedItem } from "#/routes/(platform)/facility.$id/-helpers/types";

import { PlatformPageHeader } from "./-components/platform-page-header";

export const Route = createFileRoute("/(platform)/(dashboard)/dashboard")({
  component: Page,
});

interface Facility {
  id: string;
  name: string;
  data: CanvasLayoutData;
  isMember: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function isZoneLayout(item: CanvasItemLayout) {
  return item.width > 48 || item.height > 48;
}

function FacilityLayoutPreview({ data }: { data: CanvasLayoutData }) {
  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="bg-muted/20 text-muted-foreground/50 flex h-40 items-center justify-center border-b text-[10px]">
        No layout yet
      </div>
    );
  }

  const bounds = items.reduce(
    (result, item) => {
      const zone = isZoneLayout(item);
      const left = zone ? item.x : item.x - item.width / 2;
      const top = zone ? item.y : item.y - item.height / 2;
      return {
        minX: Math.min(result.minX, left),
        minY: Math.min(result.minY, top),
        maxX: Math.max(result.maxX, left + item.width),
        maxY: Math.max(result.maxY, top + item.height),
      };
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const padding = Math.max(16, Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.08);
  const viewBox = `${bounds.minX - padding} ${bounds.minY - padding} ${bounds.maxX - bounds.minX + padding * 2} ${bounds.maxY - bounds.minY + padding * 2}`;

  return (
    <div className="bg-muted/20 relative h-40 overflow-hidden border-b">
      <div className="absolute inset-0 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] bg-[size:12px_12px] opacity-40" />
      <svg aria-hidden="true" className="relative size-full p-3" preserveAspectRatio="xMidYMid meet" viewBox={viewBox}>
        {items.map((item) => {
          if (isZoneLayout(item)) {
            return (
              <rect
                className="fill-blue-500/10 stroke-blue-500/60"
                height={item.height}
                key={item.id}
                rx={2}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                width={item.width}
                x={item.x}
                y={item.y}
              />
            );
          }

          return (
            <circle
              className="stroke-background fill-emerald-500"
              cx={item.x}
              cy={item.y}
              key={item.id}
              r={Math.max(4, item.width / 2)}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      <span className="bg-background/85 text-muted-foreground absolute right-2 bottom-2 border px-1.5 py-0.5 text-[9px] backdrop-blur-sm">
        {items.length} {items.length === 1 ? "item" : "items"}
      </span>
    </div>
  );
}

function Page() {
  const { data: session, isPending: isSessionPending } = useSession();
  const isAdmin = hasAdminRole(session?.user);
  const userId = session?.user.id;
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [newFacilityName, setNewFacilityName] = useState("");
  const [newFacilityLayoutImage, setNewFacilityLayoutImage] = useState<File | null>(null);
  const [showAllFacilities, setShowAllFacilities] = useState(false);
  const [preferenceUserId, setPreferenceUserId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, MonitoringStatus>>({});
  const isPreferenceLoaded = !isAdmin || preferenceUserId === userId;

  useEffect(() => {
    if (isSessionPending) return;

    if (isAdmin && userId) {
      setShowAllFacilities(getShowAllFacilitiesPreference(userId));
      setPreferenceUserId(userId);
      return;
    }

    setShowAllFacilities(false);
    setPreferenceUserId(null);
  }, [isAdmin, isSessionPending, userId]);

  const fetchFacilities = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getFacilities({ data: { includeAll: isAdmin && showAllFacilities } });
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
  }, [isAdmin, showAllFacilities]);

  useEffect(() => {
    if (isSessionPending || !isPreferenceLoaded) return;
    void fetchFacilities();
  }, [fetchFacilities, isPreferenceLoaded, isSessionPending]);

  const handleCreateFacility = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!newFacilityName.trim()) {
        toast.error("Please enter a facility name");
        return;
      }

      setIsCreating(true);

      try {
        let initialItems: PlacedItem[] | undefined;

        if (newFacilityLayoutImage) {
          initialItems = (await generateFacilityLayoutFromFile(newFacilityLayoutImage)).items;
        }

        const facility = await createFacility({ data: { initialItems, name: newFacilityName.trim() } });
        setFacilities((prev) => [...prev, facility]);
        setNewFacilityName("");
        setNewFacilityLayoutImage(null);
        setIsSheetOpen(false);
        toast.success(initialItems ? "Facility and layout created" : "Facility created successfully");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create facility");
      } finally {
        setIsCreating(false);
      }
    },
    [newFacilityLayoutImage, newFacilityName],
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
              <div className="flex flex-1 flex-col gap-5 p-4">
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
                <Field>
                  <FieldLabel htmlFor="facility-layout-image">Layout image</FieldLabel>
                  <Input
                    accept="image/jpeg,image/png,image/webp"
                    disabled={isCreating}
                    id="facility-layout-image"
                    onChange={(event) => setNewFacilityLayoutImage(event.target.files?.[0] ?? null)}
                    type="file"
                  />
                  <FieldDescription>
                    Optional. Upload a JPEG, PNG, or WebP floorplan up to 8 MB to build the initial layout.
                  </FieldDescription>
                  {newFacilityLayoutImage && (
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <ImagePlusIcon className="size-3.5" />
                      {newFacilityLayoutImage.name}
                    </p>
                  )}
                </Field>
              </div>

              <SheetFooter>
                <Button disabled={isCreating || !newFacilityName.trim()} type="submit">
                  {isCreating ? (
                    <>
                      <Loader2Icon className="animate-spin" />
                      {newFacilityLayoutImage ? "Generating layout..." : "Creating..."}
                    </>
                  ) : newFacilityLayoutImage ? (
                    "Create Facility and Layout"
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {facilities.map((facility) => {
            const status = statuses[facility.id] ?? "stopped";
            return (
              <Link
                className="focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none"
                key={facility.id}
                params={{ id: facility.id }}
                to="/facility/$id"
              >
                <Card className="hover:bg-muted/50 relative h-full gap-0 pt-0 transition-colors">
                  {!facility.isMember && (
                    <span className="bg-background/90 absolute top-2 left-2 z-10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 backdrop-blur-sm dark:text-amber-300">
                      External
                    </span>
                  )}
                  <FacilityLayoutPreview data={facility.data} />
                  <CardHeader className="pt-4">
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="p-0 pb-4">
          <Skeleton className="h-40 w-full rounded-none" />
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
