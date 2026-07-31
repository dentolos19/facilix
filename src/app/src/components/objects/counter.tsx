import { ModelPart } from "./model-part";

export function Counter() {
  return (
    <>
      <ModelPart color="#64748b" position={[0, 0.55, 0]} size={[1.5, 1.1, 0.5]} metalness={0.25} />
      <ModelPart color="#e2e8f0" position={[0, 1.13, 0]} size={[1.62, 0.08, 0.62]} metalness={0.18} roughness={0.28} />
    </>
  );
}
