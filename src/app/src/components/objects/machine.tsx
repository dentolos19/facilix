import { ModelPart } from "./model-part";

export function Machine() {
  return (
    <>
      <ModelPart color="#334155" position={[0, 0.14, 0]} size={[1.24, 0.28, 0.9]} metalness={0.55} roughness={0.42} />
      <ModelPart color="#64748b" position={[0, 0.65, 0]} size={[1.15, 0.82, 0.82]} metalness={0.4} roughness={0.38} />
      <ModelPart
        color="#0f172a"
        position={[0, 0.69, 0.42]}
        size={[0.74, 0.4, 0.035]}
        metalness={0.35}
        roughness={0.28}
      />
      <ModelPart
        color="#38bdf8"
        emissive="#0284c7"
        emissiveIntensity={0.7}
        position={[0, 0.74, 0.442]}
        size={[0.54, 0.2, 0.012]}
        radius={0.004}
        roughness={0.15}
      />
      <ModelPart color="#f59e0b" position={[0.28, 1.13, 0]} size={[0.3, 0.22, 0.48]} metalness={0.2} />
      <mesh castShadow position={[-0.35, 1.15, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.18, 16]} />
        <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.8} roughness={0.3} />
      </mesh>
    </>
  );
}
