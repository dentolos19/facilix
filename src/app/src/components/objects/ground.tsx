import type { Rect } from "#/routes/(platform)/facility.$id/-helpers/scene-geometry";

export function Ground({ bounds, isDark }: { bounds: Rect; isDark: boolean }) {
  return (
    <mesh
      position={[bounds.x + bounds.width / 2, -0.01, bounds.z + bounds.depth / 2]}
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[bounds.width + 2, bounds.depth + 2]} />
      <meshStandardMaterial color={isDark ? "#18181b" : "#d6d3d1"} depthWrite={false} roughness={0.92} />
    </mesh>
  );
}
