// モデル未配置のときに表示する目印用のワイヤーフレームボックス。
export default function PlaceholderMarker(props) {
  return (
    <mesh {...props}>
      <boxGeometry args={[1, 1.8, 1]} />
      <meshBasicMaterial color="#ff6b6b" wireframe />
    </mesh>
  )
}
