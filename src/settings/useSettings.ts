import { create } from 'zustand'
import { db, getAppSettings } from '../db/db'
import type { AppSettings } from '../db/types'

interface SettingsState {
  settings: AppSettings | null
  setTheme: (t: AppSettings['theme']) => void
  setDailyNewLimit: (n: number) => void
}

export const useSettings = create<SettingsState>((set) => ({
  settings: null,
  setTheme: (theme) => {
    // 写穿回 db（另一字段从当前缓存读，个人应用并发双改的丢更新风险可接受）
    void db.settings.put({ key: 'app', dailyNewLimit: useSettings.getState().settings?.dailyNewLimit ?? 15, theme })
    set((s) => ({ settings: s.settings ? { ...s.settings, theme } : s.settings }))
  },
  setDailyNewLimit: (dailyNewLimit) => {
    void db.settings.put({ key: 'app', dailyNewLimit, theme: useSettings.getState().settings?.theme ?? 'auto' })
    set((s) => ({ settings: s.settings ? { ...s.settings, dailyNewLimit } : s.settings }))
  },
}))

export async function loadSettings(): Promise<void> {
  const settings = await getAppSettings()
  useSettings.setState({ settings })
}
