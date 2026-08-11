# /public/assets/audio

BGM・効果音 (`.mp3` / `.wav`) を配置するディレクトリです。
`src/game/FuriDuel.jsx` が `fetch` でこれらを外部ファイルとして取得し、
Web Audio API (`AudioContext.decodeAudioData`) でデコード・再生します。
コードへの埋め込みは行いません。

現在の実装が参照しているファイル名:

- `bgm.mp3` — BGM。イントロ後、指定区間をシームレスにループ再生する
- `se_attack.mp3` — 効果音。斬撃1〜3段目・パリィの全SFXキー
  (`slash1` / `slash2` / `slash3` / `parry`) にこの1ファイルを共用している

斬撃の段ごと・パリィで別々の音を鳴らしたい場合は、このディレクトリに
追加の音声ファイルを置いた上で `src/game/FuriDuel.jsx` の `loadAssets()`
内で個別のパスを割り当ててください。
