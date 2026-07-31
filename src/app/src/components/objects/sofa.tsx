import { ModelPart } from "./model-part";

export function Sofa() {
  return (
    <>
      <ModelPart color="#0f766e" position={[0, 0.33, 0]} size={[1.25, 0.42, 0.6]} />
      <ModelPart color="#115e59" position={[0, 0.66, 0.24]} size={[1.25, 0.5, 0.12]} />
      <ModelPart color="#134e4a" position={[-0.61, 0.46, 0]} size={[0.14, 0.5, 0.64]} />
      <ModelPart color="#134e4a" position={[0.61, 0.46, 0]} size={[0.14, 0.5, 0.64]} />
      <ModelPart color="#14b8a6" position={[0, 0.52, 0.06]} size={[1.02, 0.08, 0.46]} radius={0.04} roughness={0.72} />
    </>
  );
}
