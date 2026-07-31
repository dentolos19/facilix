import { ModelPart } from "./model-part";

export function Cabinet() {
  return (
    <>
      <ModelPart color="#78716c" position={[0, 0.65, 0]} size={[0.85, 1.3, 0.5]} metalness={0.1} />
      <ModelPart color="#57534e" position={[-0.21, 0.66, 0.258]} size={[0.015, 1.05, 0.015]} radius={0.003} />
      <ModelPart color="#57534e" position={[0.21, 0.66, 0.258]} size={[0.015, 1.05, 0.015]} radius={0.003} />
      <ModelPart
        color="#d6d3d1"
        position={[-0.07, 0.66, 0.273]}
        size={[0.025, 0.18, 0.018]}
        metalness={0.8}
        radius={0.003}
      />
      <ModelPart
        color="#d6d3d1"
        position={[0.07, 0.66, 0.273]}
        size={[0.025, 0.18, 0.018]}
        metalness={0.8}
        radius={0.003}
      />
    </>
  );
}
