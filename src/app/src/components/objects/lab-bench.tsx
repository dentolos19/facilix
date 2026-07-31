import { ModelPart } from "./model-part";

export function LabBench() {
  return (
    <>
      <ModelPart color="#e2e8f0" position={[0, 0.78, 0]} size={[1.45, 0.14, 0.65]} metalness={0.1} />
      <ModelPart color="#94a3b8" position={[0, 0.38, 0]} size={[1.1, 0.7, 0.42]} metalness={0.2} />
      <mesh position={[-0.38, 0.86, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.16, 0.025, 8, 20]} />
        <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.22} />
      </mesh>
      <mesh castShadow position={[0.4, 0.94, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 0.28, 12]} />
        <meshStandardMaterial color="#0ea5e9" transparent opacity={0.75} />
      </mesh>
    </>
  );
}
