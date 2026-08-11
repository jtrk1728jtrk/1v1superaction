import { Suspense } from 'react'
import GltfModel from './GltfModel'
import ModelLoadBoundary from './ModelLoadBoundary'
import PlaceholderMarker from './PlaceholderMarker'
import OrbitControls from './OrbitControls'
import { assetUrl } from '../utils/assetPath'

const PLAYER_MODEL_URL = assetUrl('models/player.glb')
const BOSS_MODEL_URL = assetUrl('models/boss.glb')

export default function Scene() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />

      <gridHelper args={[20, 20, '#666666', '#333333']} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#2a2a2e" />
      </mesh>

      {/* プレイヤーモデル: /public/assets/models/player.glb をまだ配置していない間は
          プレースホルダーのワイヤーフレームを表示する */}
      <ModelLoadBoundary
        label="player"
        fallback={<PlaceholderMarker position={[-2, 0.9, 0]} />}
      >
        <Suspense fallback={<PlaceholderMarker position={[-2, 0.9, 0]} />}>
          <GltfModel url={PLAYER_MODEL_URL} position={[-2, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
        </Suspense>
      </ModelLoadBoundary>

      {/* ボスモデル: /public/assets/models/boss.glb をまだ配置していない間は
          プレースホルダーのワイヤーフレームを表示する */}
      <ModelLoadBoundary
        label="boss"
        fallback={<PlaceholderMarker color="#4d9dff" position={[2, 0.9, 0]} />}
      >
        <Suspense fallback={<PlaceholderMarker color="#4d9dff" position={[2, 0.9, 0]} />}>
          <GltfModel url={BOSS_MODEL_URL} position={[2, 0, 0]} rotation={[0, -Math.PI / 2, 0]} />
        </Suspense>
      </ModelLoadBoundary>

      <OrbitControls />
    </>
  )
}
