import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { loadSettings, useSettings } from './settings/useSettings'

const mq = window.matchMedia('(prefers-color-scheme: dark)')

function applyTheme(theme: 'light' | 'dark' | 'auto' | undefined): void {
  const t = theme ?? 'auto'
  document.documentElement.classList.toggle('dark', t === 'dark' || (t === 'auto' && mq.matches))
}

// 主题跟随：设置变化即应用；auto 模式由系统偏好切换事件驱动（配合 index.css 的 @custom-variant dark）
useSettings.subscribe((s) => applyTheme(s.settings?.theme))
mq.addEventListener('change', () => applyTheme(useSettings.getState().settings?.theme))

void loadSettings()
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
  // IndexedDB 打不开（隐私模式/存储被禁）时降级兜底：渲染零依赖 IndexedDB 的最小提示页，避免永久白屏
  .catch(() => {
    createRoot(document.getElementById('root')!).render(
      <div className="flex h-screen items-center justify-center p-6 text-center text-zinc-500">
        无法访问本地存储。请检查浏览器是否处于隐私模式或已禁用存储。
      </div>,
    )
  })
