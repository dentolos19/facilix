import { ModelPart } from "./model-part";

export function Crate() {
  return (
    <>
      <ModelPart color="#b45309" position={[0, 0.28, 0]} size={[0.55, 0.55, 0.55]} roughness={0.82} />
      {[-0.22, 0, 0.22].map((y) => (
        <ModelPart
          color="#78350f"
          key={y}
          position={[0, 0.28 + y, 0.285]}
          size={[0.58, 0.045, 0.025]}
          radius={0.006}
          roughness={0.85}
        />
      ))}
    </>
  );
}
