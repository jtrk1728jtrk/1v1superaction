import { Component } from 'react'

// glTF がまだ配置されていない場合でもシーン全体がクラッシュしないように、
// モデル読み込み中に発生したエラーだけをここで捕まえる。
export default class ModelLoadBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.warn(`[model] failed to load "${this.props.label ?? 'model'}":`, error)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}
