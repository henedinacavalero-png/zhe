import { useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { exportBackup, importBackup } from '../db/backup'
import { loadSettings, useSettings } from './useSettings'

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
    <div className="space-y-6 p-4">
      <h1 className="text-xl font-bold">设置</h1>
      <label className="flex items-center justify-between">
        <span>每日新词上限</span>
        <input type="number" min={5} max={100} className="w-20 rounded border p-1 dark:bg-zinc-800"
          value={settings?.dailyNewLimit ?? 15}
          onChange={(e) => setDailyNewLimit(Math.max(5, Number(e.target.value) || 15))} />
      </label>
      <label className="flex items-center justify-between">
        <span>主题</span>
        <select className="rounded border p-1 dark:bg-zinc-800" value={settings?.theme ?? 'auto'}
          onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'auto')}>
          <option value="auto">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option>
        </select>
      </label>
      <div className="space-y-2">
        <button className="w-full rounded border py-2" onClick={onExport}>导出备份（JSON）</button>
        <button className="w-full rounded border py-2" onClick={() => fileRef.current?.click()}>导入备份</button>
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
      <div>
        <h2 className="mb-2 font-bold">牌组管理</h2>
        {(decks ?? []).map((d) => (
          <div key={d.id} className="flex items-center justify-between border-b py-2">
            <span>{d.name}</span>
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
      </div>
    </div>
  )
}
