# 1v1superaction

React + three.js で構築する1vs1アクションゲーム「THE WARDEN」です。
遠距離フェーズと斬撃フェーズを行き来する多段ボス戦を、パリィ・回避ダッシュ・
弾の撃ち返しを軸に戦います（`src/game/FuriDuel.jsx`）。

## セットアップ

```bash
npm install
npm run dev
```

ブラウザで表示されるURL（デフォルトは `http://localhost:5173`）を開くと、
起動時に自動で素材を読み込み、タイトル画面が表示されます。

## 操作方法

- 移動: WASD / 矢印キー（タッチはスティック）
- 射撃: `L`（タッチは「撃」ボタン）
- 斬撃（3段コンボ）: `J`（タッチは「斬」ボタン）
- パリィ（受け）: `K`（タッチは「受」ボタン。ボスの斬撃に合わせると崩せる）
- 回避ダッシュ: `Space`（タッチは「避」ボタン）

## 3Dモデル・音声素材の配置

3Dモデル（glTF）やBGM・効果音（mp3）はコードに埋め込まず、
`public/assets/` 配下に置いた外部ファイルとして起動時に読み込みます。

```
public/assets/
├── models/
│   ├── player.glb   ← プレイヤーモデル
│   └── boss.glb     ← ボスモデル
└── audio/
    ├── bgm.mp3
    └── se_attack.mp3   ← 斬撃1〜3段目・パリィの効果音で共用
```

ファイルサイズやコードへの埋め込みは気にせず、そのまま配置して問題ありません。
詳細は各ディレクトリ内の `README.md` を参照してください。

## GitHub Pagesへの公開

`vite.config.js` で `base` をリポジトリ名 (`/1v1superaction/`) に合わせて
本番ビルド時のみ切り替える設定を入れています。

```bash
npm run build
```

`.github/workflows/deploy.yml` に、`main` ブランチへのpushをトリガーとした
GitHub Pages自動デプロイのワークフローを用意しています。
