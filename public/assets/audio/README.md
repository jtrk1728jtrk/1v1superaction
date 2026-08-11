# /public/assets/audio

BGM・効果音 (`.mp3`) を配置するディレクトリです。
`src/game/FuriDuel.jsx` が `fetch` でこれらを外部ファイルとして取得し、
Web Audio API (`AudioContext.decodeAudioData`) でデコード・再生します。
コードへの埋め込みは行いません。

現在の実装が参照しているファイル名:

- `bgm.mp3` — BGM。イントロ後、指定区間をシームレスにループ再生する
- `slash1.mp3` — 効果音。斬撃1段目
- `slash2.mp3` — 効果音。斬撃2段目
- `slash3.mp3` — 効果音。斬撃3段目
- `parry.mp3` — 効果音。パリィ成功時
- `dash.mp3` — 効果音。回避ステップ時（再生時に2倍速をかけて鳴らしている）
- `shoot.mp3` — 効果音。自キャラの射撃時
