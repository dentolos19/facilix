import { cn } from "#/lib/utils";

type Tab = { id: string; label: string };

interface PlatformTabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
}

/**
 * Horizontal tab bar matching the device detail page style.
 * Used by Manage and other full-page detail views.
 */
export function PlatformTabs({ tabs, activeTab, onChange }: PlatformTabsProps) {
  return (
    <div className="flex shrink-0 border-b border-border">
      {tabs.map((tab) => (
        <button
          className={cn(
            "relative px-3 py-2 text-[11px] font-medium tracking-wider uppercase transition-colors",
            activeTab === tab.id ? "text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground",
          )}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          type="button"
        >
          {tab.label}
          {activeTab === tab.id && <span className="absolute right-0 bottom-0 left-0 h-px bg-foreground" />}
        </button>
      ))}
    </div>
  );
}
