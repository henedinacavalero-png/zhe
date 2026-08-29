import { create } from 'zustand'
import { db, getAppSettings, DEFAULT_FILTER, type StudyFilter } from '../db/db'
import type { AppSettings } from '../db/types'

interface SettingsState {
  settings: AppSettings | null
  setTheme: (t: AppSettings['theme']) => void
  setDailyNewLimit: (n: number) => void
  setStudyFilter: (f: StudyFilter) => void
}

export const useSettings = create<SettingsState>((set) => {
  const cur = () => useSettings.getState().settings
  const write = (patch: Partial<AppSettings>) => {
    const merged = { key: 'app' as const, dailyNewLimit: 15, theme: 'auto' as const, studyFilter: DEFAULT_FILTER, ...cur(), ...patch }
    void db.settings.put(merged)
    set({ settings: merged })
  }
  return {
    settings: null,
    setTheme: (theme) => write({ theme }),
    setDailyNewLimit: (dailyNewLimit) => write({ dailyNewLimit }),
    setStudyFilter: (studyFilter) => write({ studyFilter }),
  }
})

export async function loadSettings(): Promise<void> {
  const settings = await getAppSettings()
  useSettings.setState({ settings })
}
