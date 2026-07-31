import { ModelPart } from "./model-part";

export function Desk() {
  return (
    <>
      <ModelPart color="#a16207" position={[0, 0.74, 0]} size={[1.25, 0.12, 0.65]} roughness={0.55} />
      {([-0.5, 0.5] as const).flatMap((x) =>
        ([-0.24, 0.24] as const).map((z) => (
          <ModelPart color="#713f12" key={`${x}-${z}`} position={[x, 0.35, z]} size={[0.08, 0.7, 0.08]} />
        )),
      )}
      <ModelPart
        color="#1e293b"
        position={[0, 1.02, -0.12]}
        size={[0.5, 0.34, 0.05]}
        metalness={0.15}
        roughness={0.3}
      />
      <ModelPart
        color="#38bdf8"
        emissive="#0284c7"
        emissiveIntensity={0.35}
        position={[0, 1.02, -0.15]}
        size={[0.43, 0.27, 0.015]}
        radius={0.005}
        roughness={0.18}
      />
      <ModelPart color="#475569" position={[0, 0.84, -0.12]} size={[0.06, 0.22, 0.06]} metalness={0.4} />
      <ModelPart color="#334155" position={[0, 0.82, 0.08]} size={[0.42, 0.025, 0.16]} radius={0.006} />
    </>
  );
}
