"use client";

import { OrbitControls, RoundedBox } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { CuboidIcon } from "lucide-react";
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Object3D } from "three";

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
  emissive?: string;
  emissiveIntensity?: number;
  metalness?: number;
  radius?: number;
  rotation?: [number, number, number];
  roughness?: number;
}

function BoxPart({
  size,
  position,
  color,
  emissive,
  emissiveIntensity,
  metalness = 0,
  radius,
  rotation,
  roughness = 0.65,
}: BoxPartProps) {
  const cornerRadius = radius ?? Math.min(0.035, ...size.map((dimension) => dimension / 5));

  return (
    <RoundedBox
      args={size}
      castShadow
      position={position}
      radius={cornerRadius}
      receiveShadow
      rotation={rotation}
      smoothness={2}
    >
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        metalness={metalness}
        roughness={roughness}
      />
    </RoundedBox>
  );
}

function DecorationMesh({ item }: { item: DecorationItem }) {
  const { kind, position, rotation, scale } = item;

  return (
    <group position={[position.x, position.y, position.z]} rotation={[0, rotation, 0]} scale={scale}>
      {kind === "vehicle" && (
        <>
          <BoxPart
            color="#1d4ed8"
            position={[0, 0.35, 0]}
            size={[1.72, 0.42, 0.84]}
            metalness={0.35}
            roughness={0.32}
          />
          <BoxPart
            color="#2563eb"
            position={[0.61, 0.58, 0]}
            size={[0.48, 0.22, 0.78]}
            metalness={0.3}
            roughness={0.3}
          />
          <BoxPart
            color="#172554"
            position={[-0.15, 0.7, 0]}
            size={[0.78, 0.34, 0.7]}
            metalness={0.55}
            roughness={0.12}
          />
          <BoxPart
            color="#0f172a"
            position={[0.27, 0.7, 0]}
            rotation={[0, 0, -0.38]}
            size={[0.04, 0.28, 0.66]}
            metalness={0.5}
            roughness={0.08}
          />
          <BoxPart
            color="#f8fafc"
            emissive="#fef3c7"
            emissiveIntensity={1.2}
            position={[0.87, 0.43, -0.25]}
            size={[0.035, 0.12, 0.18]}
            radius={0.01}
          />
          <BoxPart
            color="#f8fafc"
            emissive="#fef3c7"
            emissiveIntensity={1.2}
            position={[0.87, 0.43, 0.25]}
            size={[0.035, 0.12, 0.18]}
            radius={0.01}
          />
          <BoxPart
            color="#94a3b8"
            position={[0.9, 0.26, 0]}
            size={[0.05, 0.08, 0.7]}
            metalness={0.8}
            roughness={0.25}
          />
          {([-0.55, 0.55] as const).flatMap((x) =>
            ([-0.42, 0.42] as const).map((z) => (
              <mesh castShadow key={`${x}-${z}`} position={[x, 0.18, z]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.19, 0.19, 0.13, 16]} />
                <meshStandardMaterial color="#18181b" roughness={0.8} />
                <mesh position={[0, 0.07, 0]}>
                  <cylinderGeometry args={[0.09, 0.09, 0.01, 12]} />
                  <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.25} />
                </mesh>
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
          <BoxPart
            color="#1e293b"
            position={[0, 1.02, -0.12]}
            size={[0.5, 0.34, 0.05]}
            metalness={0.15}
            roughness={0.3}
          />
          <BoxPart
            color="#38bdf8"
            emissive="#0284c7"
            emissiveIntensity={0.35}
            position={[0, 1.02, -0.15]}
            size={[0.43, 0.27, 0.015]}
            radius={0.005}
            roughness={0.18}
          />
          <BoxPart color="#475569" position={[0, 0.84, -0.12]} size={[0.06, 0.22, 0.06]} metalness={0.4} />
          <BoxPart color="#334155" position={[0, 0.82, 0.08]} size={[0.42, 0.025, 0.16]} radius={0.006} />
        </>
      )}
      {kind === "conferenceTable" && (
        <>
          <BoxPart color="#0f766e" position={[0, 0.76, 0]} radius={0.1} size={[2.4, 0.13, 1.05]} roughness={0.45} />
          <BoxPart color="#115e59" position={[0, 0.36, 0]} size={[0.35, 0.72, 0.48]} metalness={0.2} />
          <BoxPart color="#99f6e4" position={[0, 0.83, 0]} size={[0.46, 0.018, 0.2]} radius={0.008} roughness={0.2} />
        </>
      )}
      {kind === "table" && (
        <>
          <BoxPart color="#a16207" position={[0, 0.7, 0]} size={[1.25, 0.12, 1.0]} />
          {([-0.48, 0.48] as const).flatMap((x) =>
            ([-0.35, 0.35] as const).map((z) => (
              <BoxPart color="#713f12" key={`${x}-${z}`} position={[x, 0.34, z]} size={[0.09, 0.68, 0.09]} />
            )),
          )}
        </>
      )}
      {kind === "chair" && (
        <>
          <BoxPart color="#475569" position={[0, 0.42, 0]} size={[0.48, 0.12, 0.48]} />
          <BoxPart color="#475569" position={[0, 0.72, 0.19]} size={[0.48, 0.55, 0.1]} />
          {([-0.17, 0.17] as const).flatMap((x) =>
            ([-0.16, 0.16] as const).map((z) => (
              <BoxPart
                color="#334155"
                key={`${x}-${z}`}
                position={[x, 0.2, z]}
                size={[0.055, 0.4, 0.055]}
                metalness={0.25}
              />
            )),
          )}
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
            color={kind === "serverRack" ? "#0f172a" : "#57534e"}
            position={[0, 0.9, 0]}
            size={[0.9, 1.8, 0.5]}
            metalness={0.4}
            roughness={0.38}
          />
          {[0.32, 0.65, 0.98, 1.31, 1.64].map((y) => (
            <BoxPart
              color={kind === "serverRack" ? "#1e293b" : "#a8a29e"}
              key={y}
              position={[0, y, 0.263]}
              size={[0.7, 0.18, 0.025]}
              metalness={0.55}
              radius={0.006}
              roughness={0.3}
            />
          ))}
          {kind === "serverRack" &&
            [0.36, 0.69, 1.02, 1.35, 1.68].map((y) => (
              <BoxPart
                color="#22d3ee"
                emissive="#0891b2"
                emissiveIntensity={1.5}
                key={y}
                position={[0.25, y, 0.282]}
                radius={0.004}
                size={[0.1, 0.025, 0.012]}
              />
            ))}
        </>
      )}
      {kind === "machine" && (
        <>
          <BoxPart color="#334155" position={[0, 0.14, 0]} size={[1.24, 0.28, 0.9]} metalness={0.55} roughness={0.42} />
          <BoxPart color="#64748b" position={[0, 0.65, 0]} size={[1.15, 0.82, 0.82]} metalness={0.4} roughness={0.38} />
          <BoxPart
            color="#0f172a"
            position={[0, 0.69, 0.42]}
            size={[0.74, 0.4, 0.035]}
            metalness={0.35}
            roughness={0.28}
          />
          <BoxPart
            color="#38bdf8"
            emissive="#0284c7"
            emissiveIntensity={0.7}
            position={[0, 0.74, 0.442]}
            size={[0.54, 0.2, 0.012]}
            radius={0.004}
            roughness={0.15}
          />
          <BoxPart color="#f59e0b" position={[0.28, 1.13, 0]} size={[0.3, 0.22, 0.48]} metalness={0.2} />
          <mesh castShadow position={[-0.35, 1.15, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.18, 16]} />
            <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.8} roughness={0.3} />
          </mesh>
        </>
      )}
      {kind === "labBench" && (
        <>
          <BoxPart color="#e2e8f0" position={[0, 0.78, 0]} size={[1.45, 0.14, 0.65]} metalness={0.1} />
          <BoxPart color="#94a3b8" position={[0, 0.38, 0]} size={[1.1, 0.7, 0.42]} metalness={0.2} />
          <mesh position={[-0.38, 0.86, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.16, 0.025, 8, 20]} />
            <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.22} />
          </mesh>
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
          <BoxPart color="#14532d" position={[0, 0.62, 0.3]} size={[1.35, 0.62, 0.035]} radius={0.01} roughness={0.3} />
        </>
      )}
      {kind === "sofa" && (
        <>
          <BoxPart color="#0f766e" position={[0, 0.33, 0]} size={[1.25, 0.42, 0.6]} />
          <BoxPart color="#115e59" position={[0, 0.66, 0.24]} size={[1.25, 0.5, 0.12]} />
          <BoxPart color="#134e4a" position={[-0.61, 0.46, 0]} size={[0.14, 0.5, 0.64]} />
          <BoxPart color="#134e4a" position={[0.61, 0.46, 0]} size={[0.14, 0.5, 0.64]} />
          <BoxPart
            color="#14b8a6"
            position={[0, 0.52, 0.06]}
            size={[1.02, 0.08, 0.46]}
            radius={0.04}
            roughness={0.72}
          />
        </>
      )}
      {kind === "counter" && (
        <>
          <BoxPart color="#64748b" position={[0, 0.55, 0]} size={[1.5, 1.1, 0.5]} metalness={0.25} />
          <BoxPart
            color="#e2e8f0"
            position={[0, 1.13, 0]}
            size={[1.62, 0.08, 0.62]}
            metalness={0.18}
            roughness={0.28}
          />
        </>
      )}
      {kind === "cabinet" && (
        <>
          <BoxPart color="#78716c" position={[0, 0.65, 0]} size={[0.85, 1.3, 0.5]} metalness={0.1} />
          <BoxPart color="#57534e" position={[-0.21, 0.66, 0.258]} size={[0.015, 1.05, 0.015]} radius={0.003} />
          <BoxPart color="#57534e" position={[0.21, 0.66, 0.258]} size={[0.015, 1.05, 0.015]} radius={0.003} />
          <BoxPart
            color="#d6d3d1"
            position={[-0.07, 0.66, 0.273]}
            size={[0.025, 0.18, 0.018]}
            metalness={0.8}
            radius={0.003}
          />
          <BoxPart
            color="#d6d3d1"
            position={[0.07, 0.66, 0.273]}
            size={[0.025, 0.18, 0.018]}
            metalness={0.8}
            radius={0.003}
          />
        </>
      )}
      {kind === "crate" && (
        <>
          <BoxPart color="#b45309" position={[0, 0.28, 0]} size={[0.55, 0.55, 0.55]} roughness={0.82} />
          {[-0.22, 0, 0.22].map((y) => (
            <BoxPart
              color="#78350f"
              key={y}
              position={[0, 0.28 + y, 0.285]}
              size={[0.58, 0.045, 0.025]}
              radius={0.006}
              roughness={0.85}
            />
          ))}
        </>
      )}
      {kind === "pallet" && (
        <>
          {[-0.34, 0, 0.34].map((z) => (
            <BoxPart
              color="#b45309"
              key={z}
              position={[0, 0.16, z]}
              size={[1.05, 0.11, 0.14]}
              radius={0.012}
              roughness={0.88}
            />
          ))}
          {[-0.38, 0, 0.38].map((x) => (
            <BoxPart
              color="#78350f"
              key={x}
              position={[x, 0.06, 0]}
              size={[0.14, 0.12, 0.76]}
              radius={0.01}
              roughness={0.9}
            />
          ))}
        </>
      )}
      {kind === "plant" && (
        <>
          <mesh castShadow position={[0, 0.16, 0]}>
            <cylinderGeometry args={[0.18, 0.23, 0.32, 12]} />
            <meshStandardMaterial color="#92400e" />
          </mesh>
          <mesh castShadow position={[0, 0.47, 0]}>
            <cylinderGeometry args={[0.035, 0.055, 0.45, 8]} />
            <meshStandardMaterial color="#3f6212" roughness={0.9} />
          </mesh>
          {[
            [-0.16, 0.6, 0.05, -0.5],
            [0.16, 0.68, -0.04, 0.5],
            [-0.08, 0.79, -0.1, -0.25],
            [0.08, 0.87, 0.08, 0.25],
          ].map(([x, y, z, rot], index) => (
            <mesh castShadow key={index} position={[x, y, z]} rotation={[0, 0, rot]} scale={[0.68, 1, 0.42]}>
              <sphereGeometry args={[0.25, 10, 8]} />
              <meshStandardMaterial color={index % 2 === 0 ? "#15803d" : "#22c55e"} roughness={0.84} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

function DecorationsGroup({ decorations }: { decorations: DecorationItem[] }) {
  return decorations.map((item, index) => <DecorationMesh item={item} key={`${item.kind}-${index}`} />);
}

// ─── Room rendering ─────────────────────────────────────────────────────

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

function WallMesh({ seg, isDark }: { seg: WallSegment; isDark: boolean }) {
  const isHorizontal = seg.start.z === seg.end.z;
  const length = isHorizontal ? Math.abs(seg.end.x - seg.start.x) : Math.abs(seg.end.z - seg.start.z);
  if (length < 0.02) return null;

  const centerX = (seg.start.x + seg.end.x) / 2;
  const centerZ = (seg.start.z + seg.end.z) / 2;
  const y = seg.bottomY + seg.height / 2;

  if (seg.type === "wall" || seg.type === "wallAboveOpening") {
    return (
      <mesh
        castShadow
        position={[centerX, y, centerZ]}
        receiveShadow
        rotation={isHorizontal ? [0, 0, 0] : [0, Math.PI / 2, 0]}
      >
        <boxGeometry args={[length, seg.height, seg.thickness]} />
        <meshStandardMaterial color={isDark ? "#3f3f46" : "#e4e4e7"} roughness={0.72} />
      </mesh>
    );
  }

  if (seg.type === "windowOpening") {
    return (
      <group position={[centerX, y, centerZ]} rotation={isHorizontal ? [0, 0, 0] : [0, Math.PI / 2, 0]}>
        <mesh receiveShadow>
          <boxGeometry args={[length - 0.08, seg.height - 0.08, 0.035]} />
          <meshPhysicalMaterial
            color={isDark ? "#7dd3fc" : "#bae6fd"}
            metalness={0.05}
            opacity={0.32}
            roughness={0.08}
            transparent
          />
        </mesh>
        <BoxPart
          color={isDark ? "#71717a" : "#f4f4f5"}
          position={[0, seg.height / 2, 0]}
          size={[length + 0.08, 0.08, 0.11]}
          metalness={0.25}
          radius={0.01}
          roughness={0.38}
        />
        <BoxPart
          color={isDark ? "#71717a" : "#f4f4f5"}
          position={[0, -seg.height / 2, 0]}
          size={[length + 0.08, 0.08, 0.16]}
          metalness={0.25}
          radius={0.01}
          roughness={0.38}
        />
        <BoxPart
          color={isDark ? "#71717a" : "#f4f4f5"}
          position={[-length / 2, 0, 0]}
          size={[0.08, seg.height, 0.11]}
          metalness={0.25}
          radius={0.01}
          roughness={0.38}
        />
        <BoxPart
          color={isDark ? "#71717a" : "#f4f4f5"}
          position={[length / 2, 0, 0]}
          size={[0.08, seg.height, 0.11]}
          metalness={0.25}
          radius={0.01}
          roughness={0.38}
        />
        <BoxPart
          color={isDark ? "#71717a" : "#f4f4f5"}
          position={[0, 0, 0]}
          size={[0.045, seg.height - 0.08, 0.08]}
          metalness={0.25}
          radius={0.006}
          roughness={0.38}
        />
      </group>
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
        <meshStandardMaterial
          color={isDark ? DARK_FLOOR_COLORS[room.zoneType] : LIGHT_FLOOR_COLORS[room.zoneType]}
          metalness={room.zoneType === "factory-floor" || room.zoneType === "server-room" ? 0.12 : 0.02}
          roughness={room.zoneType === "laboratory" || room.zoneType === "lobby" ? 0.48 : 0.76}
        />
      </mesh>

      {room.walls.map((seg, i) => (
        <WallMesh isDark={isDark} key={`${room.id}-wall-${i}`} seg={seg} />
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
      <mesh castShadow position={[0, device.position.y / 2, 0]}>
        <cylinderGeometry args={[DEVICE_POLE_RADIUS, DEVICE_POLE_RADIUS * 1.15, device.position.y, 10]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
      </mesh>

      <mesh castShadow position={[0, DEVICE_MARKER_HEIGHT / 2, 0]} receiveShadow>
        <cylinderGeometry args={[DEVICE_MARKER_RADIUS, DEVICE_MARKER_RADIUS * 1.2, DEVICE_MARKER_HEIGHT, 16]} />
        <meshStandardMaterial color={markerColor} emissive={markerColor} emissiveIntensity={0.18} roughness={0.52} />
      </mesh>

      {isCCTV && (
        <group position={[0, device.position.y + 0.08, 0]}>
          <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.13, 0.13, 0.18, 18]} />
            <meshStandardMaterial color="#64748b" metalness={0.68} roughness={0.28} />
          </mesh>
          <BoxPart
            color={col}
            position={[0, 0, 0.2]}
            radius={0.055}
            size={[0.3, 0.24, 0.48]}
            metalness={0.32}
            roughness={0.35}
          />
          <BoxPart
            color="#334155"
            position={[0, 0.12, 0.22]}
            radius={0.018}
            size={[0.37, 0.035, 0.57]}
            metalness={0.48}
            roughness={0.3}
          />
          <mesh position={[0, 0, 0.45]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.09, 0.09, 0.035, 20]} />
            <meshPhysicalMaterial color="#020617" clearcoat={0.9} metalness={0.55} roughness={0.08} />
          </mesh>
          <mesh position={[0, 0, 0.47]}>
            <circleGeometry args={[0.045, 20]} />
            <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.85} roughness={0.12} />
          </mesh>
        </group>
      )}

      {isSensor && (
        <group position={[0, device.position.y + 0.08, 0]}>
          <BoxPart
            color={col}
            position={[0, 0, 0]}
            radius={0.055}
            size={[0.38, 0.46, 0.22]}
            metalness={0.12}
            roughness={0.45}
          />
          <BoxPart
            color="#e2e8f0"
            position={[0, 0.05, 0.116]}
            radius={0.025}
            size={[0.27, 0.24, 0.018]}
            roughness={0.24}
          />
          <BoxPart
            color={markerColor}
            emissive={markerColor}
            emissiveIntensity={1.25}
            position={[0, 0.15, 0.13]}
            radius={0.008}
            size={[0.08, 0.025, 0.012]}
          />
          {[-0.07, 0, 0.07].map((x) => (
            <BoxPart color="#64748b" key={x} position={[x, -0.05, 0.13]} radius={0.003} size={[0.025, 0.08, 0.012]} />
          ))}
        </group>
      )}

      {!isCCTV && !isSensor && (
        <group position={[0, device.position.y + 0.08, 0]}>
          <BoxPart
            color={col}
            position={[0, 0, 0]}
            radius={0.045}
            size={[0.42, 0.32, 0.26]}
            metalness={0.22}
            roughness={0.4}
          />
          {[-0.13, 0.13].map((x) => (
            <group key={x} position={[x, 0.33, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.025, 0.025, 0.62, 10]} />
                <meshStandardMaterial color="#64748b" metalness={0.75} roughness={0.25} />
              </mesh>
              <mesh position={[0, 0.31, 0]}>
                <sphereGeometry args={[0.04, 12, 10]} />
                <meshStandardMaterial color={markerColor} emissive={markerColor} emissiveIntensity={0.85} />
              </mesh>
            </group>
          ))}
          <BoxPart color="#0f172a" position={[0, 0, 0.136]} radius={0.015} size={[0.24, 0.12, 0.018]} roughness={0.2} />
          <BoxPart
            color={markerColor}
            emissive={markerColor}
            emissiveIntensity={1.1}
            position={[0, 0, 0.148]}
            radius={0.006}
            size={[0.11, 0.025, 0.01]}
          />
        </group>
      )}

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

function Lighting({
  bounds,
  isDark,
}: {
  bounds: { x: number; z: number; width: number; depth: number };
  isDark: boolean;
}) {
  const scene = useThree((state) => state.scene);
  const target = useMemo(() => new Object3D(), []);
  const centerX = bounds.x + bounds.width / 2;
  const centerZ = bounds.z + bounds.depth / 2;
  const shadowExtent = Math.max(bounds.width, bounds.depth) * 0.65 + 2;
  const lightHeight = Math.max(16, shadowExtent * 0.75);

  useEffect(() => {
    target.position.set(centerX, 0, centerZ);
    scene.add(target);
    return () => {
      scene.remove(target);
    };
  }, [centerX, centerZ, scene, target]);

  return (
    <>
      <hemisphereLight
        color={isDark ? "#93c5fd" : "#dbeafe"}
        groundColor={isDark ? "#111827" : "#78716c"}
        intensity={isDark ? 0.45 : 0.7}
      />
      <directionalLight
        castShadow
        color={isDark ? "#dbeafe" : "#fff7ed"}
        intensity={isDark ? 1.25 : 1.8}
        position={[centerX + shadowExtent * 0.65, lightHeight, centerZ + shadowExtent * 0.45]}
        shadow-bias={-0.00025}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-far={lightHeight + shadowExtent * 2}
        shadow-camera-left={-shadowExtent}
        shadow-camera-near={0.5}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-mapSize-height={1536}
        shadow-mapSize-width={1536}
        shadow-normalBias={0.025}
        target={target}
      />
      <directionalLight
        color={isDark ? "#67e8f9" : "#bfdbfe"}
        intensity={isDark ? 0.25 : 0.35}
        position={[centerX - shadowExtent, 8, centerZ - shadowExtent]}
        target={target}
      />
    </>
  );
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

      <ambientLight intensity={isDark ? 0.16 : 0.28} />
      <Lighting bounds={descriptor.bounds} isDark={isDark} />

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
          <meshStandardMaterial color={isDark ? "#18181b" : "#d6d3d1"} depthWrite={false} roughness={0.92} />
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
            camera={{ fov: 42, near: 0.1, far: 250 }}
            frameloop="demand"
            dpr={[1, 1.5]}
            gl={{ antialias: true, powerPreference: "high-performance" }}
            performance={{ min: 0.5, max: 1 }}
            shadows="percentage"
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
