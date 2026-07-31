export function Plant() {
  return (
    <>
      <mesh castShadow position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.18, 0.23, 0.32, 12]} />
        <meshStandardMaterial color="#92400e" />
      </mesh>
      <mesh castShadow position={[0, 0.47, 0]}>
        <cylinderGeometry args={[0.035, 0.055, 0.45, 8]} />
        <meshStandardMaterial color="#3f6212" roughness={0.9} />
      </mesh>
      {[
        [-0.16, 0.6, 0.05, -0.5],
        [0.16, 0.68, -0.04, 0.5],
        [-0.08, 0.79, -0.1, -0.25],
        [0.08, 0.87, 0.08, 0.25],
      ].map(([x, y, z, rotation], index) => (
        <mesh castShadow key={index} position={[x, y, z]} rotation={[0, 0, rotation]} scale={[0.68, 1, 0.42]}>
          <sphereGeometry args={[0.25, 10, 8]} />
          <meshStandardMaterial color={index % 2 === 0 ? "#15803d" : "#22c55e"} roughness={0.84} />
        </mesh>
      ))}
    </>
  );
}
