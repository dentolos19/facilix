import {
  type DevicePlacement,
  DEVICE_MARKER_HEIGHT,
  DEVICE_MARKER_RADIUS,
  DEVICE_POLE_RADIUS,
} from "#/routes/(platform)/facility.$id/-helpers/scene-geometry";

import { ModelPart } from "./model-part";

interface DeviceProps {
  device: DevicePlacement;
  onSelect?: (id: string) => void;
  selected?: boolean;
  onPointerOver?: (id: string) => void;
  onPointerMove?: (event: { clientX: number; clientY: number }) => void;
  onPointerOut?: () => void;
}

export function Device({ device, onSelect, selected, onPointerOver, onPointerMove, onPointerOut }: DeviceProps) {
  const color = device.iconColor || "#10b981";
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
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.(device.id);
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
          <ModelPart
            color={color}
            position={[0, 0, 0.2]}
            radius={0.055}
            size={[0.3, 0.24, 0.48]}
            metalness={0.32}
            roughness={0.35}
          />
          <ModelPart
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
          <ModelPart
            color={color}
            position={[0, 0, 0]}
            radius={0.055}
            size={[0.38, 0.46, 0.22]}
            metalness={0.12}
            roughness={0.45}
          />
          <ModelPart
            color="#e2e8f0"
            position={[0, 0.05, 0.116]}
            radius={0.025}
            size={[0.27, 0.24, 0.018]}
            roughness={0.24}
          />
          <ModelPart
            color={markerColor}
            emissive={markerColor}
            emissiveIntensity={1.25}
            position={[0, 0.15, 0.13]}
            radius={0.008}
            size={[0.08, 0.025, 0.012]}
          />
          {[-0.07, 0, 0.07].map((x) => (
            <ModelPart color="#64748b" key={x} position={[x, -0.05, 0.13]} radius={0.003} size={[0.025, 0.08, 0.012]} />
          ))}
        </group>
      )}

      {!isCCTV && !isSensor && (
        <group position={[0, device.position.y + 0.08, 0]}>
          <ModelPart
            color={color}
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
          <ModelPart
            color="#0f172a"
            position={[0, 0, 0.136]}
            radius={0.015}
            size={[0.24, 0.12, 0.018]}
            roughness={0.2}
          />
          <ModelPart
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
