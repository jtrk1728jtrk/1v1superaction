import { playAudio, stopAudio } from '../utils/audioManager'
import { assetUrl } from '../utils/assetPath'

const BGM_URL = assetUrl('audio/bgm.mp3')
const SE_URL = assetUrl('audio/se_attack.mp3')

// BGM・効果音の読み込み動作を確認するための最小限のテストUI。
export default function GameUI() {
  return (
    <div className="game-ui">
      <button onClick={() => playAudio(BGM_URL, { loop: true, volume: 0.5 })}>
        BGM再生
      </button>
      <button onClick={() => stopAudio(BGM_URL)}>BGM停止</button>
      <button onClick={() => playAudio(SE_URL, { volume: 1 })}>効果音再生</button>
    </div>
  )
}
