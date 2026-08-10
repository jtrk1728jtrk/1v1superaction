import { Canvas } from '@react-three/fiber'
import Scene from './components/Scene'
import GameUI from './components/GameUI'
import './App.css'

export default function App() {
  return (
    <div className="app">
      <Canvas camera={{ position: [0, 3, 8], fov: 50 }} shadows>
        <Scene />
      </Canvas>
      <GameUI />
    </div>
  )
}
