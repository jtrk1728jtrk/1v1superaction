# /public/assets/audio

BGM・効果音 (`.mp3` / `.wav`) を配置するディレクトリです。
`src/utils/audioManager.js` が `HTMLAudioElement` 経由でこれらを外部ファイルとして
読み込み・再生します。コードへの埋め込みは行いません。

現在の実装 (`src/components/GameUI.jsx`) が参照しているファイル名:

- `bgm.mp3` — BGM
- `se_attack.wav` — 効果音（テスト用）

ファイルを配置していない状態でも、再生を試みるとブラウザの再生エラーが
コンソールに警告として出力されるだけで、アプリ自体はクラッシュしません。
