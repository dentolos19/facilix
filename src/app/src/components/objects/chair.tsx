import { ModelPart } from "./model-part";

export function Chair() {
  return (
    <>
      <ModelPart color="#475569" position={[0, 0.42, 0]} size={[0.48, 0.12, 0.48]} />
      <ModelPart color="#475569" position={[0, 0.72, 0.19]} size={[0.48, 0.55, 0.1]} />
      {([-0.17, 0.17] as const).flatMap((x) =>
        ([-0.16, 0.16] as const).map((z) => (
          <ModelPart
            color="#334155"
            key={`${x}-${z}`}
            position={[x, 0.2, z]}
            size={[0.055, 0.4, 0.055]}
            metalness={0.25}
          />
        )),
      )}
    </>
  );
}
