# 1v1superaction

React + three.js（`@react-three/fiber`）で構築する1vs1アクションゲームです。
現時点では最小構成として、空のシーンにプレイヤーモデルを1つ読み込んで
表示できるところまでを実装しています。ゲームロジックは未実装です。

## セットアップ

```bash
npm install
npm run dev
```

ブラウザで表示されるURL（デフォルトは `http://localhost:5173`）を開くと、
グリッド床のある空のシーンが表示されます。

## 3Dモデル・音声素材の配置

3Dモデル（glTF）やBGM・効果音（mp3/wav）はコードに埋め込まず、
`public/assets/` 配下に置いた外部ファイルとして実行時に読み込みます。

```
public/assets/
├── models/
│   └── player.glb   ← プレイヤーモデル（未配置の間はプレースホルダー表示）
└── audio/
    ├── bgm.mp3
    └── se_attack.wav
```

`player.glb` をこのパスに置くだけで、次回リロード時に自動的に3Dモデルが
表示されます。ファイルサイズやコードへの埋め込みは気にせず、そのまま配置して
問題ありません。詳細は各ディレクトリ内の `README.md` を参照してください。

## GitHub Pagesへの公開

`vite.config.js` で `base` をリポジトリ名 (`/1v1superaction/`) に合わせて
本番ビルド時のみ切り替える設定を入れています。

```bash
npm run build
```

`.github/workflows/deploy.yml` に、`main` ブランチへのpushをトリガーとした
GitHub Pages自動デプロイのワークフローを用意しています。リポジトリの
Settings → Pages で Source を「GitHub Actions」に設定すれば利用できます。
