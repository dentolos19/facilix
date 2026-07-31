import { RoundedBox } from "@react-three/drei";

interface ModelPartProps {
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

export function ModelPart({
  size,
  position,
  color,
  emissive,
  emissiveIntensity,
  metalness = 0,
  radius,
  rotation,
  roughness = 0.65,
}: ModelPartProps) {
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
