import { ModelPart } from "./model-part";

export function Stool() {
  return (
    <>
      <mesh castShadow position={[0, 0.58, 0]}>
        <cylinderGeometry args={[0.27, 0.27, 0.12, 16]} />
        <meshStandardMaterial color="#ea580c" roughness={0.5} />
      </mesh>
      <ModelPart color="#475569" position={[0, 0.28, 0]} size={[0.09, 0.56, 0.09]} metalness={0.3} />
    </>
  );
}
