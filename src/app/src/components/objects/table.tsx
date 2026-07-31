import { ModelPart } from "./model-part";

export function Table() {
  return (
    <>
      <ModelPart color="#a16207" position={[0, 0.7, 0]} size={[1.25, 0.12, 1]} />
      {([-0.48, 0.48] as const).flatMap((x) =>
        ([-0.35, 0.35] as const).map((z) => (
          <ModelPart color="#713f12" key={`${x}-${z}`} position={[x, 0.34, z]} size={[0.09, 0.68, 0.09]} />
        )),
      )}
    </>
  );
}
