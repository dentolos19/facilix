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

function addGrid(
  decorations: DecorationItem[],
  room: RoomDescriptor,
  devices: DevicePlacement[],
  kind: string,
  columns: number,
  rows: number,
  options: { inset?: number; rotation?: number; scale?: number } = {},
): void {
  for (const position of gridPositions(room.rect, columns, rows, options.inset)) {
    addDecoration(decorations, room, devices, kind, position, options.rotation, options.scale);
  }
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
      const columns = Math.max(1, Math.min(4, Math.floor((room.rect.width - 1) / 2.3)));
      const rows = Math.max(1, Math.min(3, Math.floor((room.rect.depth - 1) / 4.4)));
      addGrid(decorations, room, devices, "vehicle", columns, rows, {
        inset: 1.1,
        rotation: wide ? 0 : Math.PI / 2,
        scale: 1,
      });
      break;
    }
    case "office": {
      const desks = gridPositions(room.rect, 2, room.rect.depth > 5 ? 2 : 1, 1.1);
      for (const position of desks) {
        addDecoration(decorations, room, devices, "desk", position, deskRotation);
        addDecoration(
          decorations,
          room,
          devices,
          "chair",
          { x: position.x, z: position.z + (wide ? 0.75 : 0) },
          deskRotation,
        );
      }
      addGrid(decorations, room, devices, "cabinet", 1, 1, { inset: 0.55, scale: 0.9 });
      break;
    }
    case "meeting-room": {
      addDecoration(decorations, room, devices, "conferenceTable", center, deskRotation, 1.15);
      const chairs = [
        { x: center.x - 1.05, z: center.z },
        { x: center.x + 1.05, z: center.z },
        { x: center.x, z: center.z - 0.9 },
        { x: center.x, z: center.z + 0.9 },
      ];
      for (const position of chairs) addDecoration(decorations, room, devices, "chair", position);
      break;
    }
    case "break-room": {
      addGrid(decorations, room, devices, "table", 1, 1, { inset: 1.2 });
      const chairs = gridPositions(room.rect, 2, 2, 1.05);
      for (const position of chairs) addDecoration(decorations, room, devices, "chair", position);
      addGrid(decorations, room, devices, "counter", 1, 1, { inset: 0.55 });
      break;
    }
    case "lobby": {
      addDecoration(decorations, room, devices, "receptionDesk", center, deskRotation);
      addGrid(decorations, room, devices, "sofa", 2, 1, { inset: 0.9, rotation: deskRotation });
      addGrid(decorations, room, devices, "plant", 2, 2, { inset: 0.6, scale: 0.9 });
      break;
    }
    case "warehouse": {
      addGrid(decorations, room, devices, "rack", wide ? 3 : 2, wide ? 2 : 3, {
        inset: 0.9,
        rotation: deskRotation,
      });
      addGrid(decorations, room, devices, "pallet", 2, 1, { inset: 1.25 });
      break;
    }
    case "loading-bay": {
      addGrid(decorations, room, devices, "pallet", 2, 2, { inset: 1 });
      addGrid(decorations, room, devices, "crate", 3, 1, { inset: 1.15, scale: 0.85 });
      break;
    }
    case "storage": {
      addGrid(decorations, room, devices, "rack", 2, 2, { inset: 0.85, rotation: deskRotation, scale: 0.9 });
      addGrid(decorations, room, devices, "crate", 2, 1, { inset: 1.1, scale: 0.8 });
      break;
    }
    case "factory-floor": {
      addGrid(decorations, room, devices, "machine", wide ? 3 : 2, wide ? 2 : 3, {
        inset: 1.1,
        rotation: deskRotation,
      });
      addGrid(decorations, room, devices, "pallet", 2, 1, { inset: 1.3 });
      break;
    }
    case "server-room": {
      addGrid(decorations, room, devices, "serverRack", wide ? 3 : 2, wide ? 2 : 3, {
        inset: 0.7,
        rotation: deskRotation,
      });
      break;
    }
    case "laboratory": {
      addGrid(decorations, room, devices, "labBench", 2, 1, { inset: 1, rotation: deskRotation });
      addGrid(decorations, room, devices, "stool", 2, 2, { inset: 1.15 });
      addGrid(decorations, room, devices, "cabinet", 1, 1, { inset: 0.6, scale: 0.9 });
      break;
    }
    case "generic": {
      addDecoration(decorations, room, devices, "desk", center, deskRotation);
      addGrid(decorations, room, devices, "chair", 2, 1, { inset: 1.1 });
      addGrid(decorations, room, devices, "plant", 1, 1, { inset: 0.55, scale: 0.8 });
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
