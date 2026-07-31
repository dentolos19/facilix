import { ModelPart } from "./model-part";

export function ReceptionDesk() {
  return (
    <>
      <ModelPart color="#166534" position={[0, 0.6, 0]} size={[1.8, 1.2, 0.58]} roughness={0.45} />
      <ModelPart color="#86efac" position={[0, 1.23, 0]} size={[1.95, 0.1, 0.68]} metalness={0.1} />
      <ModelPart color="#14532d" position={[0, 0.62, 0.3]} size={[1.35, 0.62, 0.035]} radius={0.01} roughness={0.3} />
    </>
  );
}
