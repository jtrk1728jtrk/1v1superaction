import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// 確認用にカメラをマウス操作できるようにするだけの最小ラッパー。
export default function OrbitControls() {
  const { camera, gl } = useThree()
  const controlsRef = useRef(null)

  useEffect(() => {
    const controls = new ThreeOrbitControls(camera, gl.domElement)
    controls.enableDamping = true
    controls.target.set(0, 1, 0)
    controlsRef.current = controls
    return () => controls.dispose()
  }, [camera, gl])

  useFrame(() => controlsRef.current?.update())

  return null
}
