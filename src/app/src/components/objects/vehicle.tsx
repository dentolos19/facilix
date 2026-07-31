import { ModelPart } from "./model-part";

export function Vehicle() {
  return (
    <>
      <ModelPart color="#1d4ed8" position={[0, 0.35, 0]} size={[1.72, 0.42, 0.84]} metalness={0.35} roughness={0.32} />
      <ModelPart color="#2563eb" position={[0.61, 0.58, 0]} size={[0.48, 0.22, 0.78]} metalness={0.3} roughness={0.3} />
      <ModelPart
        color="#172554"
        position={[-0.15, 0.7, 0]}
        size={[0.78, 0.34, 0.7]}
        metalness={0.55}
        roughness={0.12}
      />
      <ModelPart
        color="#0f172a"
        position={[0.27, 0.7, 0]}
        rotation={[0, 0, -0.38]}
        size={[0.04, 0.28, 0.66]}
        metalness={0.5}
        roughness={0.08}
      />
      <ModelPart
        color="#f8fafc"
        emissive="#fef3c7"
        emissiveIntensity={1.2}
        position={[0.87, 0.43, -0.25]}
        size={[0.035, 0.12, 0.18]}
        radius={0.01}
      />
      <ModelPart
        color="#f8fafc"
        emissive="#fef3c7"
        emissiveIntensity={1.2}
        position={[0.87, 0.43, 0.25]}
        size={[0.035, 0.12, 0.18]}
        radius={0.01}
      />
      <ModelPart color="#94a3b8" position={[0.9, 0.26, 0]} size={[0.05, 0.08, 0.7]} metalness={0.8} roughness={0.25} />
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
  );
}
