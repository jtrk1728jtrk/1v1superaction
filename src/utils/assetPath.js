// GitHub Pages ではアプリが "/<repo-name>/" 以下でホストされるため、
// public/assets 配下のファイルは必ずこの関数経由でパスを組み立てる。
export function assetUrl(relativePath) {
  return `${import.meta.env.BASE_URL}assets/${relativePath}`
}
