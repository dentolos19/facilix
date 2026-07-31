import type { PlacedItem } from "./types";
import { getZoneTypeConfig, type ZoneType } from "./zone-types";

export const CANVAS_SCALE = 0.05;

const ROOM_HEIGHT = 3.2;
const WALL_THICKNESS = 0.15;
const FLOOR_THICKNESS = 0.1;

const DOOR_WIDTH = 1.0;
const DOOR_HEIGHT = 2.4;

const WINDOW_WIDTH = 1.2;
const WINDOW_HEIGHT = 1.5;
const WINDOW_SILL = 1.0;

const CCTV_HEIGHT = 2.8;
const SENSOR_HEIGHT = 1.6;
const SIGNAL_HEIGHT = 2.2;
export const DEVICE_MARKER_RADIUS = 0.2;
export const DEVICE_MARKER_HEIGHT = 0.3;
export const DEVICE_POLE_RADIUS = 0.06;

const DECOR_MARGIN = 0.8;
const DECOR_DEVICE_CLEARANCE = 0.5;
const DECOR_DOOR_CLEARANCE = 0.6;
const DECOR_MIN_ROOM = 1.2;

// ─── Primitives ──────────────────────────────────────────────────────────

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Rect {
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface RoomDescriptor {
  id: string;
  name: string;
  zoneType: ZoneType;
  hasWalls: boolean;
  rect: Rect;
  walls: WallSegment[];
  floor: FloorDescriptor;
  ceiling: CeilingDescriptor;
}

export interface WallSegment {
  type: "wall" | "doorOpening" | "windowOpening" | "wallAboveOpening";
  start: Vec2;
  end: Vec2;
  height: number;
  thickness: number;
  bottomY: number;
}

export interface FloorDescriptor {
  rect: Rect;
  thickness: number;
  y: number;
}

export interface CeilingDescriptor {
  rect: Rect;
  thickness: number;
  y: number;
}

export interface DevicePlacement {
  id: string;
  type: "CCTV" | "Sensor" | "Signal";
  name: string;
  position: Vec3;
  canvasX: number;
  canvasY: number;
  iconColor: string;
  iconShape: string;
  status: string;
}

export interface DecorationItem {
  kind: string;
  position: Vec3;
  rotation: number;
  scale: number;
}

export interface SceneDescriptor {
  rooms: RoomDescriptor[];
  devices: DevicePlacement[];
  decorations: DecorationItem[];
  bounds: Rect;
}

// ─── Coordinate helpers ─────────────────────────────────────────────────

export function canvasToWorld(canvasX: number, canvasY: number): { worldX: number; worldZ: number } {
  return {
    worldX: canvasX * CANVAS_SCALE,
    worldZ: -canvasY * CANVAS_SCALE,
  };
}

export function canvasRectToWorld(canvasX: number, canvasY: number, canvasW: number, canvasH: number): Rect {
  const topLeft = canvasToWorld(canvasX, canvasY);
  const botRight = canvasToWorld(canvasX + canvasW, canvasY + canvasH);
  return {
    x: topLeft.worldX,
    z: botRight.worldZ,
    width: botRight.worldX - topLeft.worldX,
    depth: topLeft.worldZ - botRight.worldZ,
  };
}

export function rectEdges(r: Rect): { left: number; right: number; top: number; bottom: number } {
  return { left: r.x, right: r.x + r.width, top: r.z, bottom: r.z + r.depth };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.z < b.z + b.depth && a.z + a.depth > b.z;
}

function overlapLength(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return Math.max(0, end - start);
}

function approximatelyEqual(a: number, b: number, epsilon = 0.01): boolean {
  return Math.abs(a - b) < epsilon;
}

// ─── Wall generation ────────────────────────────────────────────────────

function makeWallSegment(start: Vec2, end: Vec2, thickness: number, bottomY: number, height: number): WallSegment {
  return { type: "wall", start, end, thickness, bottomY, height };
}

function makeOpening(
  type: "doorOpening" | "windowOpening",
  start: Vec2,
  end: Vec2,
  thickness: number,
  bottomY: number,
  height: number,
): WallSegment {
  return { type, start, end, thickness, bottomY, height };
}

function makeWallAboveOpening(start: Vec2, end: Vec2, thickness: number, bottomY: number, height: number): WallSegment {
  return { type: "wallAboveOpening", start, end, thickness, bottomY, height };
}

/** Returns the canonical exterior edge for a room (first non-shared edge, preferring bottom). */
function selectExteriorEdge(
  roomId: string,
  _r: Rect,
  sharedEdgeMap: Map<string, Set<string>>,
): "top" | "bottom" | "left" | "right" | null {
  const shared = sharedEdgeMap.get(roomId);
  const order: ("bottom" | "top" | "right" | "left")[] = ["bottom", "top", "right", "left"];
  for (const edge of order) {
    if (!shared?.has(edge)) return edge;
  }
  return null;
}

type EdgeName = "top" | "bottom" | "left" | "right";

function edgeToCoords(edgeName: EdgeName, r: Rect): { start: Vec2; end: Vec2 } {
  switch (edgeName) {
    case "top":
      return { start: { x: r.x, z: r.z }, end: { x: r.x + r.width, z: r.z } };
    case "bottom":
      return { start: { x: r.x, z: r.z + r.depth }, end: { x: r.x + r.width, z: r.z + r.depth } };
    case "left":
      return { start: { x: r.x, z: r.z }, end: { x: r.x, z: r.z + r.depth } };
    case "right":
      return { start: { x: r.x + r.width, z: r.z }, end: { x: r.x + r.width, z: r.z + r.depth } };
  }
}

function buildWallSegments(
  start: Vec2,
  end: Vec2,
  openings: { start: Vec2; end: Vec2; type: "doorOpening" | "windowOpening" }[],
  thickness: number,
  bottomY: number,
  height: number,
): WallSegment[] {
  const isHorizontal = approximatelyEqual(start.z, end.z);
  const length = isHorizontal ? end.x - start.x : end.z - start.z;
  if (length <= 0.01) return [];

  // Deduplicate and sort openings.
  const deduped = openings
    .filter((o) => {
      const oStart = isHorizontal ? o.start.x : o.start.z;
      const oEnd = isHorizontal ? o.end.x : o.end.z;
      return oEnd > oStart;
    })
    .sort((a, b) => {
      const aPos = isHorizontal ? a.start.x : a.start.z;
      const bPos = isHorizontal ? b.start.x : b.start.z;
      return aPos - bPos;
    });

  // Merge overlapping openings.
  const merged: typeof deduped = [];
  for (const o of deduped) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const prevEnd = isHorizontal ? prev.end.x : prev.end.z;
      const oStart = isHorizontal ? o.start.x : o.start.z;
      if (oStart <= prevEnd + 0.01) {
        const oEnd = isHorizontal ? o.end.x : o.end.z;
        const newEnd = Math.max(prevEnd, oEnd);
        if (isHorizontal) {
          prev.end = { x: newEnd, z: prev.end.z };
        } else {
          prev.end = { x: prev.end.x, z: newEnd };
        }
        continue;
      }
    }
    merged.push({ ...o, start: { ...o.start }, end: { ...o.end } });
  }

  const segments: WallSegment[] = [];
  let cursor = isHorizontal ? start.x : start.z;
  const totalEnd = isHorizontal ? end.x : end.z;

  for (const opening of merged) {
    const openStart = isHorizontal ? opening.start.x : opening.start.z;
    const openEnd = isHorizontal ? opening.end.x : opening.end.z;
    const clippedStart = Math.max(openStart, cursor);

    if (clippedStart > cursor + 0.01) {
      const segStart = isHorizontal ? { x: cursor, z: start.z } : { x: start.x, z: cursor };
      const segEnd = isHorizontal ? { x: clippedStart, z: end.z } : { x: end.x, z: clippedStart };
      segments.push(makeWallSegment(segStart, segEnd, thickness, bottomY, height));
    }

    const clippedEnd = Math.min(openEnd, totalEnd);
    if (clippedEnd > clippedStart + 0.01) {
      const openStartPt = isHorizontal ? { x: clippedStart, z: start.z } : { x: start.x, z: clippedStart };
      const openEndPt = isHorizontal ? { x: clippedEnd, z: end.z } : { x: end.x, z: clippedEnd };

      if (opening.type === "doorOpening") {
        // Door opening: empty gap + wall above.
        segments.push(makeOpening("doorOpening", openStartPt, openEndPt, thickness, bottomY, DOOR_HEIGHT));
        const aboveHeight = height - (bottomY + DOOR_HEIGHT);
        if (aboveHeight > 0.05) {
          segments.push(makeWallAboveOpening(openStartPt, openEndPt, thickness, bottomY + DOOR_HEIGHT, aboveHeight));
        }
      } else {
        // Window opening: wall below + window gap + wall above.
        const sillY = WINDOW_SILL;
        if (sillY > 0.05) {
          segments.push(makeWallSegment(openStartPt, openEndPt, thickness, bottomY, sillY));
        }
        segments.push(makeOpening("windowOpening", openStartPt, openEndPt, thickness, bottomY + sillY, WINDOW_HEIGHT));
        const aboveHeight = height - (bottomY + sillY + WINDOW_HEIGHT);
        if (aboveHeight > 0.05) {
          segments.push(
            makeWallAboveOpening(openStartPt, openEndPt, thickness, bottomY + sillY + WINDOW_HEIGHT, aboveHeight),
          );
        }
      }
    }

    cursor = Math.max(cursor, clippedEnd);
  }

  if (cursor < totalEnd - 0.01) {
    const segStart = isHorizontal ? { x: cursor, z: start.z } : { x: start.x, z: cursor };
    segments.push(makeWallSegment(segStart, end, thickness, bottomY, height));
  }

  return segments;
}

function resolveZoneType(zone: PlacedItem): ZoneType {
  const configuredType = getZoneTypeConfig(zone.props.zoneType).value;
  if (configuredType !== "generic") return configuredType;

  // Existing layouts predate the persisted Zone Type field, so retain their intended scene treatment.
  const name = zone.name.toLowerCase();
  if (name.includes("car park") || name.includes("parking")) return "car-park";
  if (name.includes("factory")) return "factory-floor";
  if (name.includes("warehouse")) return "warehouse";
  if (name.includes("loading")) return "loading-bay";
  if (name.includes("storage")) return "storage";
  if (name.includes("lobby") || name.includes("reception")) return "lobby";
  if (name.includes("meeting") || name.includes("conference")) return "meeting-room";
  if (name.includes("break") || name.includes("kitchen")) return "break-room";
  if (name.includes("server") || name.includes("data center")) return "server-room";
  if (name.includes("laboratory") || name.includes("lab")) return "laboratory";
  if (name.includes("office")) return "office";
  return "generic";
}

function generateRoom(zone: PlacedItem): RoomDescriptor {
  const rect = canvasRectToWorld(zone.x, zone.y, zone.width, zone.height);
  const zoneType = resolveZoneType(zone);

  return {
    id: zone.id,
    name: zone.name || "Room",
    zoneType,
    hasWalls: zoneType !== "car-park",
    rect,
    walls: [],
    floor: {
      rect: { x: rect.x, z: rect.z, width: rect.width, depth: rect.depth },
      thickness: FLOOR_THICKNESS,
      y: 0,
    },
    ceiling: {
      rect: { x: rect.x, z: rect.z, width: rect.width, depth: rect.depth },
      thickness: 0.1,
      y: ROOM_HEIGHT,
    },
  };
}

// ─── Shared edge detection (coordinate-matched) ────────────────────────

interface SharedEdge {
  roomA: string;
  roomB: string;
  edgeA: EdgeName;
  edgeB: EdgeName;
  overlapRect: Rect;
}

function detectSharedEdges(rooms: RoomDescriptor[]): SharedEdge[] {
  const shared: SharedEdge[] = [];

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      const rA = a.rect;
      const rB = b.rect;

      const aRight = rA.x + rA.width;
      const aLeft = rA.x;
      const aTop = rA.z;
      const aBottom = rA.z + rA.depth;
      const bRight = rB.x + rB.width;
      const bLeft = rB.x;
      const bTop = rB.z;
      const bBottom = rB.z + rB.depth;

      // A.right vs B.left.
      if (approximatelyEqual(aRight, bLeft)) {
        const overlapH = overlapLength(aTop, aBottom, bTop, bBottom);
        if (overlapH > 0.05) {
          shared.push({
            roomA: a.id,
            roomB: b.id,
            edgeA: "right",
            edgeB: "left",
            overlapRect: {
              x: aRight,
              z: Math.max(aTop, bTop),
              width: WALL_THICKNESS,
              depth: overlapH,
            },
          });
        }
      }
      // A.left vs B.right.
      if (approximatelyEqual(aLeft, bRight)) {
        const overlapH = overlapLength(aTop, aBottom, bTop, bBottom);
        if (overlapH > 0.05) {
          shared.push({
            roomA: a.id,
            roomB: b.id,
            edgeA: "left",
            edgeB: "right",
            overlapRect: {
              x: bRight,
              z: Math.max(aTop, bTop),
              width: WALL_THICKNESS,
              depth: overlapH,
            },
          });
        }
      }
      // A.bottom vs B.top.
      if (approximatelyEqual(aBottom, bTop)) {
        const overlapW = overlapLength(aLeft, aRight, bLeft, bRight);
        if (overlapW > 0.05) {
          shared.push({
            roomA: a.id,
            roomB: b.id,
            edgeA: "bottom",
            edgeB: "top",
            overlapRect: {
              x: Math.max(aLeft, bLeft),
              z: aBottom,
              width: overlapW,
              depth: WALL_THICKNESS,
            },
          });
        }
      }
      // A.top vs B.bottom.
      if (approximatelyEqual(aTop, bBottom)) {
        const overlapW = overlapLength(aLeft, aRight, bLeft, bRight);
        if (overlapW > 0.05) {
          shared.push({
            roomA: a.id,
            roomB: b.id,
            edgeA: "top",
            edgeB: "bottom",
            overlapRect: {
              x: Math.max(aLeft, bLeft),
              z: bBottom,
              width: overlapW,
              depth: WALL_THICKNESS,
            },
          });
        }
      }
    }
  }

  return shared;
}

// ─── Zone-specific furniture layouts ─────────────────────────────────────

function gridPositions(rect: Rect, columns: number, rows: number, inset = DECOR_MARGIN): Vec2[] {
  const usableWidth = rect.width - inset * 2;
  const usableDepth = rect.depth - inset * 2;
  if (usableWidth <= 0 || usableDepth <= 0) return [];

  const positions: Vec2[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      positions.push({
        x: rect.x + inset + (usableWidth * (column + 0.5)) / columns,
        z: rect.z + inset + (usableDepth * (row + 0.5)) / rows,
      });
    }
  }
  return positions;
}

function adaptiveGridPositions(
  rect: Rect,
  footprintWidth: number,
  footprintDepth: number,
  options: { gap?: number; inset?: number; maxColumns?: number; maxRows?: number } = {},
): Vec2[] {
  const gap = options.gap ?? 0.45;
  const inset = options.inset ?? DECOR_MARGIN;
  const usableWidth = rect.width - inset * 2;
  const usableDepth = rect.depth - inset * 2;
  if (usableWidth <= 0 || usableDepth <= 0) return [];

  const columns = Math.max(
    1,
    Math.min(options.maxColumns ?? 6, Math.floor((usableWidth + gap) / (footprintWidth + gap))),
  );
  const rows = Math.max(1, Math.min(options.maxRows ?? 5, Math.floor((usableDepth + gap) / (footprintDepth + gap))));

  return gridPositions(rect, columns, rows, inset);
}

function cornerPositions(rect: Rect, inset = 0.5): Vec2[] {
  return [
    { x: rect.x + inset, z: rect.z + inset },
    { x: rect.x + rect.width - inset, z: rect.z + rect.depth - inset },
    { x: rect.x + rect.width - inset, z: rect.z + inset },
    { x: rect.x + inset, z: rect.z + rect.depth - inset },
  ];
}

function edgePositions(
  rect: Rect,
  edge: "top" | "bottom" | "left" | "right",
  spacing: number,
  options: { inset?: number; max?: number; wallOffset?: number } = {},
): Vec2[] {
  const inset = options.inset ?? 0.75;
  const max = options.max ?? 5;
  const wallOffset = options.wallOffset ?? 0.5;
  const horizontal = edge === "top" || edge === "bottom";
  const edgeLength = horizontal ? rect.width : rect.depth;
  const usableLength = edgeLength - inset * 2;
  if (usableLength <= 0) return [];

  const count = Math.max(1, Math.min(max, Math.floor((usableLength + spacing * 0.3) / spacing)));
  return Array.from({ length: count }, (_, index) => {
    const offset = inset + (usableLength * (index + 0.5)) / count;
    if (horizontal) {
      return {
        x: rect.x + offset,
        z: edge === "top" ? rect.z + wallOffset : rect.z + rect.depth - wallOffset,
      };
    }
    return {
      x: edge === "left" ? rect.x + wallOffset : rect.x + rect.width - wallOffset,
      z: rect.z + offset,
    };
  });
}

function offsetPosition(position: Vec2, localX: number, localZ: number, rotation: number): Vec2 {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: position.x + localX * cos - localZ * sin,
    z: position.z + localX * sin + localZ * cos,
  };
}

function addDecoration(
  decorations: DecorationItem[],
  room: RoomDescriptor,
  devices: DevicePlacement[],
  kind: string,
  position: Vec2,
  rotation = 0,
  scale = 1,
): void {
  const nearDevice = devices.some((device) => {
    const dx = position.x - device.position.x;
    const dz = position.z - device.position.z;
    return Math.hypot(dx, dz) < DECOR_DEVICE_CLEARANCE;
  });

  const nearDoor = room.walls.some((wall) => {
    if (wall.type !== "doorOpening") return false;
    const dx = position.x - (wall.start.x + wall.end.x) / 2;
    const dz = position.z - (wall.start.z + wall.end.z) / 2;
    return Math.hypot(dx, dz) < DECOR_DOOR_CLEARANCE;
  });

  if (!nearDevice && !nearDoor) {
    decorations.push({ kind, position: { x: position.x, y: 0, z: position.z }, rotation, scale });
  }
}

function addAdaptiveGrid(
  decorations: DecorationItem[],
  room: RoomDescriptor,
  devices: DevicePlacement[],
  kind: string,
  footprintWidth: number,
  footprintDepth: number,
  options: {
    gap?: number;
    inset?: number;
    maxColumns?: number;
    maxRows?: number;
    rotation?: number;
    scale?: number;
  } = {},
): Vec2[] {
  const positions = adaptiveGridPositions(room.rect, footprintWidth, footprintDepth, options);
  for (const position of positions) {
    addDecoration(decorations, room, devices, kind, position, options.rotation, options.scale);
  }
  return positions;
}

function addCornerAccents(
  decorations: DecorationItem[],
  room: RoomDescriptor,
  devices: DevicePlacement[],
  kinds: string[],
  scale = 0.85,
): void {
  const area = room.rect.width * room.rect.depth;
  const count = Math.min(kinds.length, Math.max(1, Math.min(4, Math.floor(area / 14))));
  cornerPositions(room.rect)
    .slice(0, count)
    .forEach((position, index) => {
      addDecoration(decorations, room, devices, kinds[index], position, 0, scale);
    });
}

function buildZoneDecorations(room: RoomDescriptor, devices: DevicePlacement[]): DecorationItem[] {
  if (room.rect.width < DECOR_MIN_ROOM || room.rect.depth < DECOR_MIN_ROOM) return [];

  const decorations: DecorationItem[] = [];
  const center = {
    x: room.rect.x + room.rect.width / 2,
    z: room.rect.z + room.rect.depth / 2,
  };
  const wide = room.rect.width >= room.rect.depth;
  const deskRotation = wide ? 0 : Math.PI / 2;

  switch (room.zoneType) {
    case "car-park": {
      addAdaptiveGrid(decorations, room, devices, "vehicle", wide ? 2.35 : 2.65, wide ? 2.65 : 2.35, {
        gap: 0.35,
        inset: 1.1,
        maxColumns: 6,
        maxRows: 4,
        rotation: wide ? 0 : Math.PI / 2,
      });
      addCornerAccents(decorations, room, devices, ["safetyCone", "safetyCone", "safetyCone", "safetyCone"], 0.8);
      break;
    }
    case "office": {
      const desks = adaptiveGridPositions(room.rect, 1.55, 1.55, {
        gap: 0.25,
        inset: 0.9,
        maxColumns: 6,
        maxRows: 5,
      });
      for (const position of desks) {
        addDecoration(decorations, room, devices, "desk", position, deskRotation);
        addDecoration(
          decorations,
          room,
          devices,
          "chair",
          offsetPosition(position, 0, 0.68, deskRotation),
          deskRotation,
        );
      }
      addCornerAccents(decorations, room, devices, ["cabinet", "plant", "plant", "wasteBin"], 0.85);
      break;
    }
    case "meeting-room": {
      const tableScale = Math.max(0.8, Math.min(1.5, Math.min(room.rect.width / 5.5, room.rect.depth / 4.2)));
      addDecoration(decorations, room, devices, "conferenceTable", center, deskRotation, tableScale);

      const sideChairCount = Math.max(2, Math.min(4, Math.floor(tableScale * 2.6)));
      for (let index = 0; index < sideChairCount; index++) {
        const along =
          sideChairCount === 1 ? 0 : -0.82 * tableScale + (1.64 * tableScale * index) / (sideChairCount - 1);
        addDecoration(
          decorations,
          room,
          devices,
          "chair",
          offsetPosition(center, along, -0.82 * tableScale, deskRotation),
          deskRotation,
          0.9,
        );
        addDecoration(
          decorations,
          room,
          devices,
          "chair",
          offsetPosition(center, along, 0.82 * tableScale, deskRotation),
          deskRotation + Math.PI,
          0.9,
        );
      }
      addDecoration(
        decorations,
        room,
        devices,
        "chair",
        offsetPosition(center, -1.38 * tableScale, 0, deskRotation),
        deskRotation + Math.PI / 2,
        0.9,
      );
      addDecoration(
        decorations,
        room,
        devices,
        "chair",
        offsetPosition(center, 1.38 * tableScale, 0, deskRotation),
        deskRotation - Math.PI / 2,
        0.9,
      );
      addCornerAccents(decorations, room, devices, ["plant", "plant", "cabinet", "wasteBin"], 0.82);
      break;
    }
    case "break-room": {
      const tables = adaptiveGridPositions(room.rect, 2.5, 2.45, { inset: 1.25, maxColumns: 3, maxRows: 3 });
      for (const position of tables) {
        addDecoration(decorations, room, devices, "table", position, deskRotation, 0.9);
        addDecoration(
          decorations,
          room,
          devices,
          "chair",
          offsetPosition(position, 0, -0.72, deskRotation),
          deskRotation,
          0.82,
        );
        addDecoration(
          decorations,
          room,
          devices,
          "chair",
          offsetPosition(position, 0, 0.72, deskRotation),
          deskRotation + Math.PI,
          0.82,
        );
      }
      for (const position of edgePositions(room.rect, wide ? "top" : "left", 2.1, { max: 3, wallOffset: 0.38 })) {
        addDecoration(decorations, room, devices, "counter", position, wide ? 0 : Math.PI / 2, 0.85);
      }
      addCornerAccents(decorations, room, devices, ["plant", "wasteBin", "plant", "cabinet"], 0.78);
      break;
    }
    case "lobby": {
      const receptionPosition = wide ? { x: center.x, z: room.rect.z + 0.85 } : { x: room.rect.x + 0.85, z: center.z };
      addDecoration(decorations, room, devices, "receptionDesk", receptionPosition, deskRotation, 0.95);
      const sofaEdge = wide ? "bottom" : "right";
      for (const position of edgePositions(room.rect, sofaEdge, 2.05, { max: 4, wallOffset: 0.65 })) {
        addDecoration(decorations, room, devices, "sofa", position, deskRotation, 0.9);
      }
      addDecoration(decorations, room, devices, "table", center, deskRotation, 0.55);
      addCornerAccents(decorations, room, devices, ["plant", "plant", "plant", "plant"], 0.9);
      break;
    }
    case "warehouse": {
      addAdaptiveGrid(decorations, room, devices, "rack", wide ? 1.85 : 1.55, wide ? 1.55 : 1.85, {
        gap: 0.3,
        inset: 1.05,
        maxColumns: 7,
        maxRows: 5,
        rotation: deskRotation,
      });
      addCornerAccents(decorations, room, devices, ["pallet", "crate", "pallet", "crate"], 0.82);
      break;
    }
    case "loading-bay": {
      addAdaptiveGrid(decorations, room, devices, "pallet", 1.65, 1.45, {
        gap: 0.3,
        inset: 1,
        maxColumns: 6,
        maxRows: 5,
      });
      for (const position of edgePositions(room.rect, wide ? "bottom" : "right", 1.4, { max: 6, wallOffset: 0.45 })) {
        addDecoration(decorations, room, devices, "crate", position, 0, 0.78);
      }
      addCornerAccents(decorations, room, devices, ["barrel", "safetyCone", "barrel", "safetyCone"], 0.82);
      break;
    }
    case "storage": {
      addAdaptiveGrid(decorations, room, devices, "rack", wide ? 1.55 : 1.4, wide ? 1.4 : 1.55, {
        gap: 0.25,
        inset: 0.85,
        maxColumns: 5,
        maxRows: 4,
        rotation: deskRotation,
        scale: 0.9,
      });
      addCornerAccents(decorations, room, devices, ["crate", "crate", "pallet", "wasteBin"], 0.75);
      break;
    }
    case "factory-floor": {
      addAdaptiveGrid(decorations, room, devices, "machine", 2.2, 2.05, {
        gap: 0.35,
        inset: 1.15,
        maxColumns: 6,
        maxRows: 5,
        rotation: deskRotation,
      });
      for (const position of edgePositions(room.rect, wide ? "bottom" : "right", 1.65, { max: 6, wallOffset: 0.55 })) {
        addDecoration(decorations, room, devices, "pallet", position, deskRotation, 0.8);
      }
      addCornerAccents(decorations, room, devices, ["safetyCone", "barrel", "safetyCone", "wasteBin"], 0.8);
      break;
    }
    case "server-room": {
      addAdaptiveGrid(decorations, room, devices, "serverRack", wide ? 1.45 : 1.3, wide ? 1.3 : 1.45, {
        gap: 0.25,
        inset: 0.72,
        maxColumns: 6,
        maxRows: 5,
        rotation: deskRotation,
      });
      addCornerAccents(decorations, room, devices, ["cabinet", "wasteBin", "cabinet", "wasteBin"], 0.7);
      break;
    }
    case "laboratory": {
      const benches = adaptiveGridPositions(room.rect, wide ? 1.8 : 1.65, wide ? 1.65 : 1.8, {
        gap: 0.3,
        inset: 0.9,
        maxColumns: 5,
        maxRows: 4,
      });
      for (const position of benches) {
        addDecoration(decorations, room, devices, "labBench", position, deskRotation);
        addDecoration(
          decorations,
          room,
          devices,
          "stool",
          offsetPosition(position, 0, 0.72, deskRotation),
          deskRotation,
          0.85,
        );
      }
      addCornerAccents(decorations, room, devices, ["cabinet", "plant", "cabinet", "wasteBin"], 0.78);
      break;
    }
    case "generic": {
      const desks = adaptiveGridPositions(room.rect, 1.55, 1.35, {
        gap: 0.25,
        inset: 0.75,
        maxColumns: 4,
        maxRows: 4,
      });
      for (const position of desks) {
        addDecoration(decorations, room, devices, "desk", position, deskRotation, 0.9);
        addDecoration(
          decorations,
          room,
          devices,
          "chair",
          offsetPosition(position, 0, 0.68, deskRotation),
          deskRotation,
          0.82,
        );
      }
      addCornerAccents(decorations, room, devices, ["plant", "cabinet", "plant", "wasteBin"], 0.78);
      break;
    }
  }

  return decorations;
}

// ─── Main scene builder ─────────────────────────────────────────────────

export function buildSceneDescriptor(placedItems: PlacedItem[], _facilityId: string): SceneDescriptor {
  const zones = placedItems.filter((i) => i.type === "Zone");
  const devices = placedItems.filter(
    (i): i is PlacedItem & { type: "CCTV" | "Sensor" | "Signal" } =>
      i.type === "CCTV" || i.type === "Sensor" || i.type === "Signal",
  );

  const rooms = zones.map(generateRoom);

  const sharedEdges = detectSharedEdges(rooms);

  // Build per-room shared edge sets.
  const sharedEdgeMap = new Map<string, Set<string>>();
  for (const se of sharedEdges) {
    if (!sharedEdgeMap.has(se.roomA)) sharedEdgeMap.set(se.roomA, new Set());
    if (!sharedEdgeMap.has(se.roomB)) sharedEdgeMap.set(se.roomB, new Set());
    sharedEdgeMap.get(se.roomA)!.add(se.edgeA);
    sharedEdgeMap.get(se.roomB)!.add(se.edgeB);
  }

  // Collect door openings per shared-edge pair.
  const sharedDoorOpenings = new Map<string, { start: Vec2; end: Vec2 }>();

  for (const se of sharedEdges) {
    const key = `${se.roomA}|${se.edgeA}|${se.roomB}|${se.edgeB}`;
    const r = se.overlapRect;
    const midX = r.x + r.width / 2;
    const midZ = r.z + r.depth / 2;
    const hw = DOOR_WIDTH / 2;

    const isHorizontal = r.depth < r.width;
    if (isHorizontal) {
      sharedDoorOpenings.set(key, {
        start: { x: midX - hw, z: midZ },
        end: { x: midX + hw, z: midZ },
      });
    } else {
      sharedDoorOpenings.set(key, {
        start: { x: midX, z: midZ - hw },
        end: { x: midX, z: midZ + hw },
      });
    }
  }

  // Determine which rooms have shared edges per side.
  function isEdgeShared(roomId: string, edge: EdgeName): boolean {
    return sharedEdgeMap.get(roomId)?.has(edge) ?? false;
  }

  // Build walls for each room.
  for (const room of rooms) {
    if (!room.hasWalls) continue;
    const r = room.rect;
    const allWalls: WallSegment[] = [];

    for (const edgeName of ["top", "bottom", "left", "right"] as EdgeName[]) {
      const wallCoords = edgeToCoords(edgeName, r);
      const isHorizontal = edgeName === "top" || edgeName === "bottom";
      const shared = isEdgeShared(room.id, edgeName);

      // Collect door openings for this edge.
      const doorOpenings: { start: Vec2; end: Vec2; type: "doorOpening" }[] = [];
      if (shared) {
        for (const [pairKey, door] of sharedDoorOpenings) {
          const parts = pairKey.split("|");
          if (parts[0] === room.id && parts[1] === edgeName) {
            doorOpenings.push({ ...door, start: { ...door.start }, end: { ...door.end }, type: "doorOpening" });
          } else if (parts[2] === room.id && parts[3] === edgeName) {
            doorOpenings.push({ ...door, start: { ...door.start }, end: { ...door.end }, type: "doorOpening" });
          }
        }
      }

      // Collect window openings (only on non-shared edges).
      const windowOpenings: { start: Vec2; end: Vec2; type: "windowOpening" }[] = [];
      if (!shared) {
        const wallLength = isHorizontal ? r.width : r.depth;
        if (wallLength > WINDOW_WIDTH * 3) {
          const fourth = wallLength / 4;
          const offset = isHorizontal ? r.x : r.z;
          for (let w = 0; w < 3; w++) {
            const center = offset + fourth * (w + 1);
            const winStart = center - WINDOW_WIDTH / 2;
            const winEnd = center + WINDOW_WIDTH / 2;
            if (isHorizontal) {
              windowOpenings.push({
                start: { x: winStart, z: wallCoords.start.z },
                end: { x: winEnd, z: wallCoords.end.z },
                type: "windowOpening",
              });
            } else {
              windowOpenings.push({
                start: { x: wallCoords.start.x, z: winStart },
                end: { x: wallCoords.end.x, z: winEnd },
                type: "windowOpening",
              });
            }
          }
        } else if (wallLength > WINDOW_WIDTH * 1.5) {
          const center = isHorizontal ? r.x + r.width / 2 : r.z + r.depth / 2;
          const winStart = center - WINDOW_WIDTH / 2;
          const winEnd = center + WINDOW_WIDTH / 2;
          if (isHorizontal) {
            windowOpenings.push({
              start: { x: winStart, z: wallCoords.start.z },
              end: { x: winEnd, z: wallCoords.end.z },
              type: "windowOpening",
            });
          } else {
            windowOpenings.push({
              start: { x: wallCoords.start.x, z: winStart },
              end: { x: wallCoords.end.x, z: winEnd },
              type: "windowOpening",
            });
          }
        }
      }

      const allOpenings = [...doorOpenings, ...windowOpenings];
      const segs = buildWallSegments(wallCoords.start, wallCoords.end, allOpenings, WALL_THICKNESS, 0, ROOM_HEIGHT);
      allWalls.push(...segs);
    }

    room.walls = allWalls;
  }

  // Add exterior doors to rooms that have no exterior entrance yet.
  for (const room of rooms) {
    if (!room.hasWalls) continue;
    const r = room.rect;
    const exteriorEdge = selectExteriorEdge(room.id, r, sharedEdgeMap);
    if (!exteriorEdge) continue;

    const wallCoords = edgeToCoords(exteriorEdge, r);
    const isHorizontal = exteriorEdge === "top" || exteriorEdge === "bottom";
    const wallLength = isHorizontal
      ? Math.abs(wallCoords.end.x - wallCoords.start.x)
      : Math.abs(wallCoords.end.z - wallCoords.start.z);

    if (wallLength < DOOR_WIDTH + 0.5) continue;

    const center = isHorizontal ? r.x + r.width / 2 : r.z + r.depth / 2;
    const hw = DOOR_WIDTH / 2;
    const doorOpen: { start: Vec2; end: Vec2; type: "doorOpening" } = isHorizontal
      ? {
          start: { x: center - hw, z: wallCoords.start.z },
          end: { x: center + hw, z: wallCoords.end.z },
          type: "doorOpening",
        }
      : {
          start: { x: wallCoords.start.x, z: center - hw },
          end: { x: wallCoords.end.x, z: center + hw },
          type: "doorOpening",
        };

    // Collect existing window openings on this edge to preserve them.
    const existingWindows: { start: Vec2; end: Vec2; type: "windowOpening" }[] = [];
    for (const w of room.walls) {
      if (w.type !== "windowOpening") continue;
      const onEdge = isHorizontal
        ? approximatelyEqual(w.start.z, wallCoords.start.z) && approximatelyEqual(w.end.z, wallCoords.start.z)
        : approximatelyEqual(w.start.x, wallCoords.start.x) && approximatelyEqual(w.end.x, wallCoords.start.x);
      if (onEdge) {
        existingWindows.push({ start: { ...w.start }, end: { ...w.end }, type: "windowOpening" });
      }
    }

    const allOpenings = [doorOpen, ...existingWindows];
    const newSegs = buildWallSegments(wallCoords.start, wallCoords.end, allOpenings, WALL_THICKNESS, 0, ROOM_HEIGHT);

    // Remove old segments on this edge.
    room.walls = room.walls.filter((w) => {
      if (
        w.type === "doorOpening" ||
        w.type === "windowOpening" ||
        w.type === "wall" ||
        w.type === "wallAboveOpening"
      ) {
        const onEdge = isHorizontal
          ? approximatelyEqual(w.start.z, wallCoords.start.z) && approximatelyEqual(w.end.z, wallCoords.start.z)
          : approximatelyEqual(w.start.x, wallCoords.start.x) && approximatelyEqual(w.end.x, wallCoords.start.x);
        return !onEdge;
      }
      return true;
    });
    room.walls.push(...newSegs);
  }

  // Build device placements.
  const devicePlacements: DevicePlacement[] = devices.map((d) => {
    const world = canvasToWorld(d.x, d.y);
    const height = d.type === "CCTV" ? CCTV_HEIGHT : d.type === "Sensor" ? SENSOR_HEIGHT : SIGNAL_HEIGHT;

    return {
      id: d.id,
      type: d.type,
      name: d.name || d.type,
      position: { x: world.worldX, y: height, z: world.worldZ },
      canvasX: d.x,
      canvasY: d.y,
      iconColor: String(d.props.iconColor ?? "#10b981"),
      iconShape: String(d.props.iconShape ?? "camera"),
      status: d.status,
    };
  });

  const decorations = rooms.flatMap((room) => buildZoneDecorations(room, devicePlacements));

  // Compute bounds including rooms and devices.
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;

  for (const room of rooms) {
    const r = room.rect;
    minX = Math.min(minX, r.x - WALL_THICKNESS);
    minZ = Math.min(minZ, r.z - WALL_THICKNESS);
    maxX = Math.max(maxX, r.x + r.width + WALL_THICKNESS);
    maxZ = Math.max(maxZ, r.z + r.depth + WALL_THICKNESS);
  }

  for (const d of devicePlacements) {
    minX = Math.min(minX, d.position.x - 1);
    minZ = Math.min(minZ, d.position.z - 1);
    maxX = Math.max(maxX, d.position.x + 1);
    maxZ = Math.max(maxZ, d.position.z + 1);
  }

  if (!isFinite(minX)) {
    minX = -5;
    minZ = -5;
    maxX = 5;
    maxZ = 5;
  }

  const padding = 2;
  const bounds: Rect = {
    x: minX - padding,
    z: minZ - padding,
    width: maxX - minX + padding * 2,
    depth: maxZ - minZ + padding * 2,
  };

  return { rooms, devices: devicePlacements, decorations, bounds };
}
