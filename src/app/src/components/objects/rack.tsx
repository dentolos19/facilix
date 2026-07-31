import { ModelPart } from "./model-part";

export function Rack({ server = false }: { server?: boolean }) {
  return (
    <>
      <ModelPart
        color={server ? "#0f172a" : "#57534e"}
        position={[0, 0.9, 0]}
        size={[0.9, 1.8, 0.5]}
        metalness={0.4}
        roughness={0.38}
      />
      {[0.32, 0.65, 0.98, 1.31, 1.64].map((y) => (
        <ModelPart
          color={server ? "#1e293b" : "#a8a29e"}
          key={y}
          position={[0, y, 0.263]}
          size={[0.7, 0.18, 0.025]}
          metalness={0.55}
          radius={0.006}
          roughness={0.3}
        />
      ))}
      {server &&
        [0.36, 0.69, 1.02, 1.35, 1.68].map((y) => (
          <ModelPart
            color="#22d3ee"
            emissive="#0891b2"
            emissiveIntensity={1.5}
            key={y}
            position={[0.25, y, 0.282]}
            radius={0.004}
            size={[0.1, 0.025, 0.012]}
          />
        ))}
    </>
  );
}
