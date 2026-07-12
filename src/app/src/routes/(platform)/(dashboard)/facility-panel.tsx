"use client";

import { createFileRoute } from "@tanstack/react-router";
import { Cctv } from "lucide-react";

import { Button } from "#/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#/components/ui/tooltip";

import { PlatformPageHeader } from "./-components/platform-page-header";

export const Route = createFileRoute("/(platform)/(dashboard)/facility-panel")({
  component: RouteComponent,
});

const HOTSPOTS = [
  { id: 1, label: "Parking-1", top: "18%", left: "15%" },
  { id: 2, label: "Parking-2", top: "65%", left: "15%" },
  { id: 3, label: "Operations-1", top: "40%", left: "24%" },
  { id: 4, label: "Operations-2", top: "78%", left: "37%" },
  { id: 5, label: "Operations-3", top: "78%", left: "67%" },
  { id: 6, label: "Operations-4", top: "52%", left: "47%" },
  { id: 7, label: "Operations-5", top: "43%", left: "76%" },
  { id: 8, label: "Admin-1", top: "14%", left: "25%" },
  { id: 9, label: "Admin-2", top: "28%", left: "42%" },
  { id: 10, label: "Dry Storage-1", top: "14%", left: "46%" },
  { id: 11, label: "Cold Room-1", top: "14%", left: "59%" },
  { id: 12, label: "Packaging-1", top: "14%", left: "76%" },
  { id: 13, label: "Packaging-2", top: "25%", left: "68%" },
  { id: 14, label: "Loading Bay A-1", top: "25%", left: "80%" },
  { id: 15, label: "Loading Bay B-1", top: "65%", left: "80%" },
];

function RouteComponent() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PlatformPageHeader
        description="Visual floor plan with camera positions and zone status"
        title="Facility Panel"
      />

      <div className="flex flex-1 items-center justify-center">
        <div className="relative inline-block">
          <img alt="Facility Panel" className="h-auto w-full max-w-4xl" src="assets/blueprint.png" />

          <TooltipProvider>
            {HOTSPOTS.map((spot) => (
              <Tooltip key={spot.id}>
                <TooltipTrigger asChild>
                  <Button
                    className="absolute size-8 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm"
                    onClick={() => console.log(`Clicked ${spot.label}`)}
                    size="icon"
                    style={{ top: spot.top, left: spot.left }}
                    variant="secondary"
                  >
                    <Cctv />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{spot.label}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
