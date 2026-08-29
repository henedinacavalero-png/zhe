import { useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { exportBackup, importBackup } from '../db/backup'
import { loadSettings, useSettings } from './useSettings'

const CARD = 'rounded-2xl bg-white p-4 shadow-[0_4px_14px_rgba(15,23,42,0.05)] dark:bg-zinc-800'

export default function SettingsPage() {
  const { settings, setTheme, setDailyNewLimit } = useSettings()
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  const fileRef = useRef<HTMLInputElement>(null)

  async function onExport() {
    const blob = await exportBackup()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `tangochou-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-extrabold text-slate-700 dark:text-zinc-100">设置</h1>

      <div className={CARD}>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-400">学习</h2>
        <label className="flex items-center justify-between py-1.5">
          <span className="text-sm">每日新词上限</span>
          <input type="number" min={5} max={100} className="w-20 rounded-lg border border-zinc-200 p-1.5 text-center dark:border-zinc-600 dark:bg-zinc-700"
            value={settings?.dailyNewLimit ?? 15}
            onChange={(e) => setDailyNewLimit(Math.max(5, Number(e.target.value) || 15))} />
        </label>
        <label className="flex items-center justify-between py-1.5">
          <span className="text-sm">主题</span>
          <select className="rounded-lg border border-zinc-200 p-1.5 dark:border-zinc-600 dark:bg-zinc-700" value={settings?.theme ?? 'auto'}
            onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'auto')}>
            <option value="auto">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option>
          </select>
        </label>
      </div>

      <div className={CARD}>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-400">备份</h2>
        <div className="space-y-2">
          <button className="w-full rounded-xl border border-zinc-200 py-2.5 text-sm dark:border-zinc-600" onClick={onExport}>导出备份（JSON）</button>
          <button className="w-full rounded-xl border border-zinc-200 py-2.5 text-sm dark:border-zinc-600" onClick={() => fileRef.current?.click()}>导入备份</button>
          <input ref={fileRef} type="file" accept=".json" hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) {
                try {
                  await importBackup(f)
                  await loadSettings() // 导入直接写了 db，同步回 store 并应用恢复的主题
                  alert('恢复完成')
                } catch (err) { alert(err instanceof Error ? err.message : '导入失败') }
                e.target.value = '' // 允许重复选择同一文件
              }
            }} />
        </div>
      </div>

      <div className={CARD}>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-400">牌组管理</h2>
        {(decks ?? []).map((d) => (
          <div key={d.id} className="flex items-center justify-between py-2">
            <span className="text-sm">{d.name}</span>
            <button className="text-sm text-red-500"
              onClick={async () => {
                if (!confirm(`删除「${d.name}」及其全部单词与进度？`)) return
                const words = await db.words.where('deckId').equals(d.id!).toArray()
                await db.transaction('rw', [db.words, db.progress, db.decks], async () => {
                  await db.progress.bulkDelete(words.map((w) => w.id!))
                  await db.words.bulkDelete(words.map((w) => w.id!))
                  await db.decks.delete(d.id!)
                })
              }}>删除</button>
          </div>
        ))}
        {decks && decks.length === 0 && <p className="text-sm text-zinc-400">还没有牌组</p>}
      </div>
    </div>
  )
}
