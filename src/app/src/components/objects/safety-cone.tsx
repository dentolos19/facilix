import { ModelPart } from "./model-part";

export function SafetyCone() {
  return (
    <>
      <ModelPart color="#c2410c" position={[0, 0.035, 0]} radius={0.015} size={[0.42, 0.07, 0.42]} roughness={0.72} />
      <mesh castShadow position={[0, 0.3, 0]}>
        <coneGeometry args={[0.18, 0.5, 16]} />
        <meshStandardMaterial color="#f97316" roughness={0.66} />
      </mesh>
      <mesh castShadow position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.115, 0.145, 0.11, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.5} />
      </mesh>
    </>
  );
}
