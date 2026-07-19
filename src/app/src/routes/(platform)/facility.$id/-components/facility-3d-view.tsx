"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { CuboidIcon } from "lucide-react";
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  buildSceneDescriptor,
  type DecorationItem,
  type DevicePlacement,
  DEVICE_MARKER_HEIGHT,
  DEVICE_MARKER_RADIUS,
  DEVICE_POLE_RADIUS,
  type RoomDescriptor,
  type WallSegment,
} from "../-helpers/scene-geometry";
import type { PlacedItem } from "../-helpers/types";

// ─── Zone furniture ─────────────────────────────────────────────────────

interface BoxPartProps {
  size: [number, number, number];
  position: [number, number, number];
  color: string;
  metalness?: number;
  roughness?: number;
}

function BoxPart({ size, position, color, metalness = 0, roughness = 0.65 }: BoxPartProps) {
  return (
    <mesh castShadow position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  );
}

function DecorationMesh({ item }: { item: DecorationItem }) {
  const { kind, position, rotation, scale } = item;

  return (
    <group position={[position.x, position.y, position.z]} rotation={[0, rotation, 0]} scale={scale}>
      {kind === "vehicle" && (
        <>
          <BoxPart color="#2563eb" position={[0, 0.35, 0]} size={[1.65, 0.45, 0.82]} metalness={0.25} />
          <BoxPart
            color="#93c5fd"
            position={[-0.05, 0.7, 0]}
            size={[0.82, 0.32, 0.72]}
            metalness={0.45}
            roughness={0.15}
          />
          {([-0.55, 0.55] as const).flatMap((x) =>
            ([-0.42, 0.42] as const).map((z) => (
              <mesh castShadow key={`${x}-${z}`} position={[x, 0.18, z]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.18, 0.18, 0.12, 12]} />
                <meshStandardMaterial color="#18181b" roughness={0.8} />
              </mesh>
            )),
          )}
        </>
      )}
      {kind === "desk" && (
        <>
          <BoxPart color="#a16207" position={[0, 0.74, 0]} size={[1.25, 0.12, 0.65]} roughness={0.55} />
          {([-0.5, 0.5] as const).flatMap((x) =>
            ([-0.24, 0.24] as const).map((z) => (
              <BoxPart color="#713f12" key={`${x}-${z}`} position={[x, 0.35, z]} size={[0.08, 0.7, 0.08]} />
            )),
          )}
        </>
      )}
      {kind === "conferenceTable" && (
        <>
          <BoxPart color="#0f766e" position={[0, 0.76, 0]} size={[2.4, 0.13, 1.05]} roughness={0.45} />
          <BoxPart color="#115e59" position={[0, 0.36, 0]} size={[0.35, 0.72, 0.48]} metalness={0.2} />
        </>
      )}
      {kind === "table" && (
        <>
          <BoxPart color="#a16207" position={[0, 0.7, 0]} size={[1.25, 0.12, 1.0]} />
          <BoxPart color="#713f12" position={[0, 0.34, 0]} size={[0.14, 0.68, 0.14]} />
        </>
      )}
      {kind === "chair" && (
        <>
          <BoxPart color="#475569" position={[0, 0.42, 0]} size={[0.48, 0.12, 0.48]} />
          <BoxPart color="#475569" position={[0, 0.72, 0.19]} size={[0.48, 0.55, 0.1]} />
          <BoxPart color="#334155" position={[0, 0.2, 0]} size={[0.1, 0.4, 0.1]} metalness={0.25} />
        </>
      )}
      {kind === "stool" && (
        <>
          <mesh castShadow position={[0, 0.58, 0]}>
            <cylinderGeometry args={[0.27, 0.27, 0.12, 16]} />
            <meshStandardMaterial color="#ea580c" roughness={0.5} />
          </mesh>
          <BoxPart color="#475569" position={[0, 0.28, 0]} size={[0.09, 0.56, 0.09]} metalness={0.3} />
        </>
      )}
      {(kind === "rack" || kind === "serverRack") && (
        <>
          <BoxPart
            color={kind === "serverRack" ? "#111827" : "#57534e"}
            position={[0, 0.9, 0]}
            size={[0.9, 1.8, 0.5]}
            metalness={0.25}
          />
          {kind === "serverRack" &&
            [0.45, 0.9, 1.35].map((y) => (
              <BoxPart color="#22d3ee" key={y} position={[0, y, 0.26]} size={[0.65, 0.03, 0.02]} metalness={0.5} />
            ))}
        </>
      )}
      {kind === "machine" && (
        <>
          <BoxPart color="#64748b" position={[0, 0.52, 0]} size={[1.15, 1.04, 0.82]} metalness={0.35} />
          <BoxPart color="#f59e0b" position={[0.28, 1.08, 0]} size={[0.26, 0.2, 0.48]} metalness={0.2} />
        </>
      )}
      {kind === "labBench" && (
        <>
          <BoxPart color="#e2e8f0" position={[0, 0.78, 0]} size={[1.45, 0.14, 0.65]} metalness={0.1} />
          <BoxPart color="#94a3b8" position={[0, 0.38, 0]} size={[1.1, 0.7, 0.42]} metalness={0.2} />
          <mesh castShadow position={[0.4, 0.94, 0]}>
            <cylinderGeometry args={[0.11, 0.11, 0.28, 12]} />
            <meshStandardMaterial color="#0ea5e9" transparent opacity={0.75} />
          </mesh>
        </>
      )}
      {kind === "receptionDesk" && (
        <>
          <BoxPart color="#166534" position={[0, 0.6, 0]} size={[1.8, 1.2, 0.58]} roughness={0.45} />
          <BoxPart color="#86efac" position={[0, 1.23, 0]} size={[1.95, 0.1, 0.68]} metalness={0.1} />
        </>
      )}
      {kind === "sofa" && (
        <>
          <BoxPart color="#0f766e" position={[0, 0.33, 0]} size={[1.25, 0.42, 0.6]} />
          <BoxPart color="#115e59" position={[0, 0.66, 0.24]} size={[1.25, 0.5, 0.12]} />
        </>
      )}
      {kind === "counter" && <BoxPart color="#94a3b8" position={[0, 0.55, 0]} size={[1.5, 1.1, 0.5]} metalness={0.2} />}
      {kind === "cabinet" && (
        <BoxPart color="#78716c" position={[0, 0.65, 0]} size={[0.85, 1.3, 0.5]} metalness={0.1} />
      )}
      {kind === "crate" && <BoxPart color="#b45309" position={[0, 0.28, 0]} size={[0.55, 0.55, 0.55]} />}
      {kind === "pallet" && <BoxPart color="#b45309" position={[0, 0.1, 0]} size={[1.05, 0.2, 0.8]} />}
      {kind === "plant" && (
        <>
          <mesh castShadow position={[0, 0.16, 0]}>
            <cylinderGeometry args={[0.18, 0.23, 0.32, 12]} />
            <meshStandardMaterial color="#92400e" />
          </mesh>
          <mesh castShadow position={[0, 0.58, 0]}>
            <sphereGeometry args={[0.34, 12, 12]} />
            <meshStandardMaterial color="#16a34a" roughness={0.8} />
          </mesh>
        </>
      )}
    </group>
  );
}

function DecorationsGroup({ decorations }: { decorations: DecorationItem[] }) {
  return decorations.map((item, index) => <DecorationMesh item={item} key={`${item.kind}-${index}`} />);
}

// ─── Room rendering ─────────────────────────────────────────────────────

function WallMesh({ seg }: { seg: WallSegment }) {
  const isHorizontal = seg.start.z === seg.end.z;
  const length = isHorizontal ? Math.abs(seg.end.x - seg.start.x) : Math.abs(seg.end.z - seg.start.z);
  if (length < 0.02) return null;

  const centerX = (seg.start.x + seg.end.x) / 2;
  const centerZ = (seg.start.z + seg.end.z) / 2;
  const y = seg.bottomY + seg.height / 2;

  if (seg.type === "wall" || seg.type === "wallAboveOpening") {
    return (
      <mesh position={[centerX, y, centerZ]} rotation={isHorizontal ? [0, 0, 0] : [0, Math.PI / 2, 0]}>
        <boxGeometry args={[length, seg.height, seg.thickness]} />
        <meshStandardMaterial color="#d4d4d8" roughness={0.6} />
      </mesh>
    );
  }

  if (seg.type === "windowOpening") {
    return (
      <mesh position={[centerX, y, centerZ]} rotation={isHorizontal ? [0, 0, 0] : [0, Math.PI / 2, 0]}>
        <boxGeometry args={[length, seg.height, 0.04]} />
        <meshStandardMaterial color="#a1a1aa" roughness={0.1} metalness={0.2} transparent opacity={0.5} />
      </mesh>
    );
  }

  return null;
}

function RoomMesh({
  room,
  onSelectRoom,
  selected,
  isDark,
  onPointerOver,
  onPointerMove,
  onPointerOut,
}: {
  room: RoomDescriptor;
  onSelectRoom?: (id: string) => void;
  selected?: boolean;
  isDark: boolean;
  onPointerOver?: (id: string) => void;
  onPointerMove?: (e: { clientX: number; clientY: number }) => void;
  onPointerOut?: () => void;
}) {
  return (
    <group>
      <mesh
        position={[
          room.rect.x + room.rect.width / 2,
          room.floor.y + room.floor.thickness / 2,
          room.rect.z + room.rect.depth / 2,
        ]}
        onClick={(e) => {
          e.stopPropagation();
          onSelectRoom?.(room.id);
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          onPointerMove?.({ clientX: e.nativeEvent.clientX, clientY: e.nativeEvent.clientY });
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onPointerOut?.();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onPointerOver?.(room.id);
        }}
        receiveShadow
      >
        <boxGeometry args={[room.rect.width, room.floor.thickness, room.rect.depth]} />
        <meshStandardMaterial color={isDark ? "#27272a" : "#e4e4e7"} />
      </mesh>

      {room.walls.map((seg, i) => (
        <WallMesh key={`${room.id}-wall-${i}`} seg={seg} />
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

// ─── Device rendering ───────────────────────────────────────────────────

function DeviceMesh({
  device,
  onSelect,
  selected,
  onPointerOver,
  onPointerMove,
  onPointerOut,
}: {
  device: DevicePlacement;
  onSelect?: (id: string) => void;
  selected?: boolean;
  onPointerOver?: (id: string) => void;
  onPointerMove?: (e: { clientX: number; clientY: number }) => void;
  onPointerOut?: () => void;
}) {
  const col = device.iconColor || "#10b981";
  const isCCTV = device.type === "CCTV";
  const isSensor = device.type === "Sensor";
  const markerColor =
    device.status === "online"
      ? "#22c55e"
      : device.status === "error" || device.status === "offline"
        ? "#ef4444"
        : "#9ca3af";

  return (
    <group
      position={[device.position.x, 0, device.position.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(device.id);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        onPointerMove?.({ clientX: e.nativeEvent.clientX, clientY: e.nativeEvent.clientY });
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onPointerOut?.();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onPointerOver?.(device.id);
      }}
    >
      <mesh position={[0, device.position.y / 2, 0]}>
        <cylinderGeometry args={[DEVICE_POLE_RADIUS, DEVICE_POLE_RADIUS, device.position.y, 6]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>

      <mesh position={[0, DEVICE_MARKER_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[DEVICE_MARKER_RADIUS, DEVICE_MARKER_RADIUS * 1.2, DEVICE_MARKER_HEIGHT, 16]} />
        <meshStandardMaterial color={markerColor} />
      </mesh>

      <mesh position={[0, device.position.y + DEVICE_MARKER_RADIUS, 0]}>
        {isCCTV ? (
          <sphereGeometry args={[DEVICE_MARKER_RADIUS * 0.9, 16, 16]} />
        ) : isSensor ? (
          <boxGeometry args={[DEVICE_MARKER_RADIUS * 1.2, DEVICE_MARKER_RADIUS * 1.2, DEVICE_MARKER_RADIUS * 1.2]} />
        ) : (
          <cylinderGeometry
            args={[DEVICE_MARKER_RADIUS * 0.8, DEVICE_MARKER_RADIUS * 0.8, DEVICE_MARKER_RADIUS * 2, 6]}
          />
        )}
        <meshStandardMaterial color={col} />
      </mesh>

      {selected && (
        <mesh position={[0, DEVICE_MARKER_HEIGHT + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[DEVICE_MARKER_RADIUS + 0.05, DEVICE_MARKER_RADIUS + 0.12, 32]} />
          <meshStandardMaterial color="#3b82f6" transparent opacity={0.8} depthWrite={false} side={2} />
        </mesh>
      )}
    </group>
  );
}

// ─── Camera helpers ─────────────────────────────────────────────────────

function CameraSetup({ bounds }: { bounds: { x: number; z: number; width: number; depth: number } }) {
  const { camera } = useThree();

  const cx = bounds.x + bounds.width / 2;
  const cz = bounds.z + bounds.depth / 2;
  const dist = Math.max(bounds.width, bounds.depth) * 1.8;
  const initialDist = Math.max(dist, 6);

  useEffect(() => {
    camera.position.set(cx + initialDist * 0.6, initialDist * 0.5, cz + initialDist * 0.6);
    camera.lookAt(cx, 1.5, cz);
  }, [camera, cx, cz, initialDist]);

  return null;
}

function ThemeBackground({ isDark }: { isDark: boolean }) {
  const { gl } = useThree();

  useEffect(() => {
    gl.setClearColor(isDark ? "#09090b" : "#fafafa");
  }, [gl, isDark]);

  return null;
}

// ─── Scene content ──────────────────────────────────────────────────────

interface SceneContentProps {
  placedItems: PlacedItem[];
  facilityId: string;
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
  onHoverItem: (id: string | null) => void;
  onHoverMove: (x: number, y: number) => void;
  isDark: boolean;
  readOnly: boolean;
}

function SceneContent({
  placedItems,
  facilityId,
  selectedItemId,
  onSelectItem,
  onHoverItem,
  onHoverMove,
  isDark,
  readOnly,
}: SceneContentProps) {
  const descriptor = useMemo(() => buildSceneDescriptor(placedItems, facilityId), [placedItems, facilityId]);

  const cameraCfg = useMemo(() => {
    const b = descriptor.bounds;
    return {
      target: [b.x + b.width / 2, 1.5, b.z + b.depth / 2] as [number, number, number],
      distance: Math.max(b.width, b.depth) * 1.8,
    };
  }, [descriptor]);

  return (
    <>
      <ThemeBackground isDark={isDark} />
      <CameraSetup bounds={descriptor.bounds} />

      <ambientLight intensity={isDark ? 0.3 : 0.5} />
      <directionalLight
        position={[10, 20, 5]}
        intensity={isDark ? 1 : 1.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      {descriptor.rooms.map((room) => (
        <RoomMesh
          isDark={isDark}
          key={room.id}
          onPointerMove={(e) => onHoverMove(e.clientX, e.clientY)}
          onPointerOut={() => onHoverItem(null)}
          onPointerOver={() => onHoverItem(room.id)}
          onSelectRoom={readOnly ? (id) => onSelectItem(id) : undefined}
          room={room}
          selected={selectedItemId === room.id}
        />
      ))}

      {descriptor.devices.map((device) => (
        <DeviceMesh
          device={device}
          key={device.id}
          onPointerMove={(e) => onHoverMove(e.clientX, e.clientY)}
          onPointerOut={() => onHoverItem(null)}
          onPointerOver={() => onHoverItem(device.id)}
          onSelect={onSelectItem}
          selected={selectedItemId === device.id}
        />
      ))}

      <DecorationsGroup decorations={descriptor.decorations} />

      {descriptor.rooms.length > 0 && (
        <mesh
          position={[
            descriptor.bounds.x + descriptor.bounds.width / 2,
            -0.01,
            descriptor.bounds.z + descriptor.bounds.depth / 2,
          ]}
          receiveShadow
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[descriptor.bounds.width + 2, descriptor.bounds.depth + 2]} />
          <meshStandardMaterial color={isDark ? "#18181b" : "#d4d4d4"} depthWrite={false} />
        </mesh>
      )}

      <OrbitControls
        makeDefault
        target={cameraCfg.target}
        maxPolarAngle={Math.PI / 2 + 0.3}
        minDistance={2}
        maxDistance={cameraCfg.distance * 3}
      />
    </>
  );
}

// ─── Loading fallback ───────────────────────────────────────────────────

function SceneLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <span className="text-muted-foreground/50 text-xs">Loading 3D view…</span>
    </div>
  );
}

// ─── Error boundary ─────────────────────────────────────────────────────

interface ErrorBoundaryState {
  error: Error | null;
}

class SceneErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-muted-foreground text-xs">Failed to render 3D view.</span>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

// ─── Public component ───────────────────────────────────────────────────

export interface Facility3DViewProps {
  placedItems: PlacedItem[];
  facilityId: string;
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
  onHoverItem: (id: string | null) => void;
  onHoverMove: (x: number, y: number) => void;
  isDark: boolean;
  readOnly?: boolean;
}

export function Facility3DView({
  placedItems,
  facilityId,
  selectedItemId,
  onSelectItem,
  onHoverItem,
  onHoverMove,
  isDark,
  readOnly = false,
}: Facility3DViewProps) {
  const [webglError, setWebglError] = useState(false);

  if (webglError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <CuboidIcon className="text-muted-foreground/40 size-8" />
        <span className="text-muted-foreground text-xs">WebGL is not available in this browser.</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <SceneErrorBoundary
        fallback={
          <div className="flex h-full w-full flex-col items-center justify-center gap-3">
            <CuboidIcon className="text-muted-foreground/40 size-8" />
            <span className="text-muted-foreground text-xs">3D view failed to load.</span>
          </div>
        }
      >
        <Suspense fallback={<SceneLoading />}>
          <Canvas
            frameloop="demand"
            dpr={[1, 1.5]}
            performance={{ min: 0.5, max: 1 }}
            onCreated={(state) => {
              const canvas = state.gl.domElement;
              canvas.addEventListener("webglcontextlost", (e) => {
                e.preventDefault();
                setWebglError(true);
              });
              canvas.addEventListener("webglcontextrestored", () => {
                setWebglError(false);
              });
            }}
            onPointerMissed={() => {
              onSelectItem(null);
              onHoverItem(null);
            }}
          >
            <SceneContent
              facilityId={facilityId}
              isDark={isDark}
              onHoverItem={onHoverItem}
              onHoverMove={onHoverMove}
              onSelectItem={onSelectItem}
              placedItems={placedItems}
              readOnly={readOnly}
              selectedItemId={selectedItemId}
            />
          </Canvas>
        </Suspense>
      </SceneErrorBoundary>
    </div>
  );
}
