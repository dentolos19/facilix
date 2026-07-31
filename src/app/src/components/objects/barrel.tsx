export function Barrel() {
  return (
    <>
      <mesh castShadow position={[0, 0.43, 0]} receiveShadow>
        <cylinderGeometry args={[0.28, 0.28, 0.86, 20]} />
        <meshStandardMaterial color="#2563eb" metalness={0.38} roughness={0.42} />
      </mesh>
      {[0.12, 0.43, 0.74].map((y) => (
        <mesh castShadow key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.28, 0.025, 8, 20]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.72} roughness={0.3} />
        </mesh>
      ))}
    </>
  );
}
