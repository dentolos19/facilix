import { ModelPart } from "./model-part";

export function ConferenceTable() {
  return (
    <>
      <ModelPart color="#0f766e" position={[0, 0.76, 0]} radius={0.1} size={[2.4, 0.13, 1.05]} roughness={0.45} />
      <ModelPart color="#115e59" position={[0, 0.36, 0]} size={[0.35, 0.72, 0.48]} metalness={0.2} />
      <ModelPart color="#99f6e4" position={[0, 0.83, 0]} size={[0.46, 0.018, 0.2]} radius={0.008} roughness={0.2} />
    </>
  );
}
