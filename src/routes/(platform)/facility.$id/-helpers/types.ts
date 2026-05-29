import type { PlacedItem, PlacedItemType } from "#/lib/types";

export type EditMode = "monitor" | "edit";

export interface LogEntry {
  id: string;
  deviceId: string;
  deviceName: string;
  deviceType: PlacedItemType;
  timestamp: Date;
  level: "info" | "warn" | "error";
  message: string;
}

export interface CanvasEditorProps {
  readOnly?: boolean;
  placedItems: PlacedItem[];
  selectedItemId: string | null;
  onAddItem: (type: PlacedItemType, x: number, y: number) => void;
  onUpdateItem: (id: string, patch: Partial<Pick<PlacedItem, "x" | "y" | "width" | "height">>) => void;
  onSelectItem: (id: string | null) => void;
}

export interface PropertiesPanelProps {
  editMode: EditMode;
  placedItems: PlacedItem[];
  selectedItemId: string | null;
  onUpdateItem: (
    id: string,
    data: Partial<Pick<PlacedItem, "name" | "notes"> & { props: Record<string, string | number> }>,
  ) => void;
  onUpdateLayout: (id: string, patch: Partial<Pick<PlacedItem, "width" | "height">>) => void;
  onDeleteItem: (id: string) => void;
}
