import { cn } from "#/lib/utils";

type Tab = { id: string; label: string };

interface DeviceTabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
}

export function DeviceTabs({ tabs, activeTab, onChange }: DeviceTabsProps) {
  return (
    <div className="flex border-border border-b">
      {tabs.map((tab) => (
        <button
          className={cn(
            "relative px-3 py-2 font-medium text-[11px] uppercase tracking-wider transition-colors",
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
