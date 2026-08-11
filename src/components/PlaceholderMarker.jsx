// モデル未配置のときに表示する目印用のワイヤーフレームボックス。
export default function PlaceholderMarker({ color = '#ff6b6b', ...props }) {
  return (
    <mesh {...props}>
      <boxGeometry args={[1, 1.8, 1]} />
      <meshBasicMaterial color={color} wireframe />
    </mesh>
  )
}
