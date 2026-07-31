export function WasteBin() {
  return (
    <>
      <mesh castShadow position={[0, 0.3, 0]} receiveShadow>
        <cylinderGeometry args={[0.21, 0.17, 0.6, 14]} />
        <meshStandardMaterial color="#334155" metalness={0.28} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.61, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.18, 0.025, 8, 18]} />
        <meshStandardMaterial color="#64748b" metalness={0.55} roughness={0.35} />
      </mesh>
    </>
  );
}
