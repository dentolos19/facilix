import { ModelPart } from "./model-part";

export function Pallet() {
  return (
    <>
      {[-0.34, 0, 0.34].map((z) => (
        <ModelPart
          color="#b45309"
          key={z}
          position={[0, 0.16, z]}
          size={[1.05, 0.11, 0.14]}
          radius={0.012}
          roughness={0.88}
        />
      ))}
      {[-0.38, 0, 0.38].map((x) => (
        <ModelPart
          color="#78350f"
          key={x}
          position={[x, 0.06, 0]}
          size={[0.14, 0.12, 0.76]}
          radius={0.01}
          roughness={0.9}
        />
      ))}
    </>
  );
}
