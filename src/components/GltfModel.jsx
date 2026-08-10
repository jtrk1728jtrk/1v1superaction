import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// glTF はコードに埋め込まず、/public/assets/models 配下のファイルを
// GLTFLoader で外部ファイルとして読み込む。
export default function GltfModel({ url, ...props }) {
  const gltf = useLoader(GLTFLoader, url)
  return <primitive object={gltf.scene} {...props} />
}
