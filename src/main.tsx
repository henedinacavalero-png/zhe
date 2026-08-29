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

void loadSettings().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
