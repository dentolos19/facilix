"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { CuboidIcon } from "lucide-react";
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Object3D } from "three";

import { buildSceneDescriptor } from "#/routes/(platform)/facility.$id/-helpers/scene-geometry";
import type { PlacedItem } from "#/routes/(platform)/facility.$id/-helpers/types";

import { Decorations } from "./decorations";
import { Device } from "./device";
import { Ground } from "./ground";
import { Room } from "./room";

function CameraSetup({ bounds }: { bounds: { x: number; z: number; width: number; depth: number } }) {
  const { camera } = useThree();
  const centerX = bounds.x + bounds.width / 2;
  const centerZ = bounds.z + bounds.depth / 2;
  const distance = Math.max(bounds.width, bounds.depth) * 1.8;
  const initialDistance = Math.max(distance, 6);

  useEffect(() => {
    camera.position.set(centerX + initialDistance * 0.6, initialDistance * 0.5, centerZ + initialDistance * 0.6);
    camera.lookAt(centerX, 1.5, centerZ);
  }, [camera, centerX, centerZ, initialDistance]);

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
  const camera = useMemo(() => {
    const bounds = descriptor.bounds;
    return {
      target: [bounds.x + bounds.width / 2, 1.5, bounds.z + bounds.depth / 2] as [number, number, number],
      distance: Math.max(bounds.width, bounds.depth) * 1.8,
    };
  }, [descriptor]);

  return (
    <>
      <ThemeBackground isDark={isDark} />
      <CameraSetup bounds={descriptor.bounds} />
      <ambientLight intensity={isDark ? 0.16 : 0.28} />
      <Lighting bounds={descriptor.bounds} isDark={isDark} />

      {descriptor.rooms.map((room) => (
        <Room
          isDark={isDark}
          key={room.id}
          onPointerMove={(event) => onHoverMove(event.clientX, event.clientY)}
          onPointerOut={() => onHoverItem(null)}
          onPointerOver={() => onHoverItem(room.id)}
          onSelectRoom={readOnly ? (id) => onSelectItem(id) : undefined}
          room={room}
          selected={selectedItemId === room.id}
        />
      ))}

      {descriptor.devices.map((device) => (
        <Device
          device={device}
          key={device.id}
          onPointerMove={(event) => onHoverMove(event.clientX, event.clientY)}
          onPointerOut={() => onHoverItem(null)}
          onPointerOver={() => onHoverItem(device.id)}
          onSelect={onSelectItem}
          selected={selectedItemId === device.id}
        />
      ))}

      <Decorations decorations={descriptor.decorations} />
      {descriptor.rooms.length > 0 && <Ground bounds={descriptor.bounds} isDark={isDark} />}

      <OrbitControls
        makeDefault
        target={camera.target}
        maxPolarAngle={Math.PI / 2 + 0.3}
        minDistance={2}
        maxDistance={camera.distance * 3}
      />
    </>
  );
}

function SceneLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <span className="text-muted-foreground/50 text-xs">Loading 3D view…</span>
    </div>
  );
}

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
              canvas.addEventListener("webglcontextlost", (event) => {
                event.preventDefault();
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
