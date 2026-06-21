import { ScrollArea } from "#/components/ui/scroll-area";

import { PLACEABLE_ITEMS } from "../-helpers/constants";

/** Component palette shown in edit mode. */
export function ComponentPalette() {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4">
        <div className="space-y-1">
          <h3 className="font-heading text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Components
          </h3>
          <p className="text-muted-foreground/60 text-[11px] leading-relaxed">
            Drag items onto the canvas to place them.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          {PLACEABLE_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className="group hover:bg-muted/80 flex cursor-grab items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs transition-all hover:shadow-sm active:scale-[0.98] active:cursor-grabbing"
                draggable
                key={item.label}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", item.label);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                type="button"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.bgColor} transition-colors group-hover:scale-105`}
                >
                  <Icon className={`h-4 w-4 ${item.color}`} />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-foreground/90 font-medium">{item.label}</span>
                  <span className="text-muted-foreground/60 text-[10px] leading-tight">{item.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}
