import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages ではリポジトリ名がサブパスになるため、
// 本番ビルド時のみ base を "/<repo-name>/" に切り替える。
// ローカル開発 (`npm run dev`) では base: '/' のままアクセスできる。
const repoName = '1v1superaction'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${repoName}/` : '/',
  plugins: [react()],
}))
