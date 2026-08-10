// BGM・効果音は /public/assets/audio 配下の外部ファイルを
// HTMLAudioElement で読み込んで再生する薄いユーティリティ。
const audioCache = new Map()

function getAudio(url) {
  let audio = audioCache.get(url)
  if (!audio) {
    audio = new Audio(url)
    audio.preload = 'auto'
    audioCache.set(url, audio)
  }
  return audio
}

export function playAudio(url, { loop = false, volume = 1 } = {}) {
  const audio = getAudio(url)
  audio.loop = loop
  audio.volume = volume
  audio.currentTime = 0
  audio.play().catch((error) => {
    console.warn(`[audio] failed to play: ${url}`, error)
  })
}

export function stopAudio(url) {
  const audio = audioCache.get(url)
  if (audio) {
    audio.pause()
    audio.currentTime = 0
  }
}
