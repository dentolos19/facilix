import type { RoomDescriptor, WallSegment } from "#/routes/(platform)/facility.$id/-helpers/scene-geometry";

import { ModelPart } from "./model-part";

const LIGHT_FLOOR_COLORS: Record<RoomDescriptor["zoneType"], string> = {
  generic: "#e5e7eb",
  office: "#e9e7f5",
  "car-park": "#d6d3d1",
  "factory-floor": "#dfe3e8",
  warehouse: "#e4dfd5",
  "loading-bay": "#ddd6ce",
  storage: "#e2e0dc",
  lobby: "#e3eee7",
  "meeting-room": "#deedf0",
  "break-room": "#e8eedc",
  "server-room": "#d8dce2",
  laboratory: "#e7eaed",
};

const DARK_FLOOR_COLORS: Record<RoomDescriptor["zoneType"], string> = {
  generic: "#27272a",
  office: "#2e2a3b",
  "car-park": "#292827",
  "factory-floor": "#282d33",
  warehouse: "#302c26",
  "loading-bay": "#312b26",
  storage: "#2c2b29",
  lobby: "#26332a",
  "meeting-room": "#243238",
  "break-room": "#2d3425",
  "server-room": "#202631",
  laboratory: "#2a2f34",
};

function Wall({ segment, isDark }: { segment: WallSegment; isDark: boolean }) {
  const isHorizontal = segment.start.z === segment.end.z;
  const length = isHorizontal ? Math.abs(segment.end.x - segment.start.x) : Math.abs(segment.end.z - segment.start.z);
  if (length < 0.02) return null;

  const centerX = (segment.start.x + segment.end.x) / 2;
  const centerZ = (segment.start.z + segment.end.z) / 2;
  const y = segment.bottomY + segment.height / 2;
  const rotation: [number, number, number] = isHorizontal ? [0, 0, 0] : [0, Math.PI / 2, 0];

  if (segment.type === "wall" || segment.type === "wallAboveOpening") {
    return (
      <mesh castShadow position={[centerX, y, centerZ]} receiveShadow rotation={rotation}>
        <boxGeometry args={[length, segment.height, segment.thickness]} />
        <meshStandardMaterial color={isDark ? "#3f3f46" : "#e4e4e7"} roughness={0.72} />
      </mesh>
    );
  }

  if (segment.type !== "windowOpening") return null;

  const frameColor = isDark ? "#71717a" : "#f4f4f5";
  return (
    <group position={[centerX, y, centerZ]} rotation={rotation}>
      <mesh receiveShadow>
        <boxGeometry args={[length - 0.08, segment.height - 0.08, 0.035]} />
        <meshPhysicalMaterial
          color={isDark ? "#7dd3fc" : "#bae6fd"}
          metalness={0.05}
          opacity={0.32}
          roughness={0.08}
          transparent
        />
      </mesh>
      <ModelPart
        color={frameColor}
        position={[0, segment.height / 2, 0]}
        size={[length + 0.08, 0.08, 0.11]}
        metalness={0.25}
        radius={0.01}
        roughness={0.38}
      />
      <ModelPart
        color={frameColor}
        position={[0, -segment.height / 2, 0]}
        size={[length + 0.08, 0.08, 0.16]}
        metalness={0.25}
        radius={0.01}
        roughness={0.38}
      />
      <ModelPart
        color={frameColor}
        position={[-length / 2, 0, 0]}
        size={[0.08, segment.height, 0.11]}
        metalness={0.25}
        radius={0.01}
        roughness={0.38}
      />
      <ModelPart
        color={frameColor}
        position={[length / 2, 0, 0]}
        size={[0.08, segment.height, 0.11]}
        metalness={0.25}
        radius={0.01}
        roughness={0.38}
      />
      <ModelPart
        color={frameColor}
        position={[0, 0, 0]}
        size={[0.045, segment.height - 0.08, 0.08]}
        metalness={0.25}
        radius={0.006}
        roughness={0.38}
      />
    </group>
  );
}

interface RoomProps {
  room: RoomDescriptor;
  onSelectRoom?: (id: string) => void;
  selected?: boolean;
  isDark: boolean;
  onPointerOver?: (id: string) => void;
  onPointerMove?: (event: { clientX: number; clientY: number }) => void;
  onPointerOut?: () => void;
}

export function Room({ room, onSelectRoom, selected, isDark, onPointerOver, onPointerMove, onPointerOut }: RoomProps) {
  return (
    <group>
      <mesh
        position={[
          room.rect.x + room.rect.width / 2,
          room.floor.y + room.floor.thickness / 2,
          room.rect.z + room.rect.depth / 2,
        ]}
        onClick={(event) => {
          event.stopPropagation();
          onSelectRoom?.(room.id);
        }}
        onPointerMove={(event) => {
          event.stopPropagation();
          onPointerMove?.({ clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY });
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          onPointerOut?.();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          onPointerOver?.(room.id);
        }}
        receiveShadow
      >
        <boxGeometry args={[room.rect.width, room.floor.thickness, room.rect.depth]} />
        <meshStandardMaterial
          color={isDark ? DARK_FLOOR_COLORS[room.zoneType] : LIGHT_FLOOR_COLORS[room.zoneType]}
          metalness={room.zoneType === "factory-floor" || room.zoneType === "server-room" ? 0.12 : 0.02}
          roughness={room.zoneType === "laboratory" || room.zoneType === "lobby" ? 0.48 : 0.76}
        />
      </mesh>

      {room.walls.map((segment, index) => (
        <Wall isDark={isDark} key={`${room.id}-wall-${index}`} segment={segment} />
      ))}

      {selected && (
        <mesh
          position={[
            room.rect.x + room.rect.width / 2,
            room.floor.y + room.floor.thickness + 0.005,
            room.rect.z + room.rect.depth / 2,
          ]}
        >
          <boxGeometry args={[room.rect.width, 0.01, room.rect.depth]} />
          <meshStandardMaterial color="#3b82f6" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
