# /public/assets/models

glTF (`.glb` / `.gltf`) の3Dモデルを配置するディレクトリです。
ここに置いたファイルはビルド時にコードへ埋め込まれず、`GLTFLoader` が
実行時に `fetch` して読み込みます。

現在の実装 (`src/components/Scene.jsx`) が参照しているファイル名:

- `player.glb` — プレイヤーモデル

ファイルが存在しない間は、読み込みエラーを`ModelLoadBoundary`が捕捉し、
赤いワイヤーフレームのプレースホルダーが代わりに表示されます。
`player.glb` をこのディレクトリに置くだけで、自動的にモデルが表示されます。

今後ボスモデルを追加する場合は `boss.glb` のような名前でこのディレクトリに
配置し、`GltfModel` コンポーネントで読み込んでください。
