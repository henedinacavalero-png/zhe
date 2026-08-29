import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, candidateKeys, getAppSettings, getStreak, DEFAULT_FILTER, type StudyFilter } from '../db/db'
import { pickDailyQueue } from '../scheduler/scheduler'
import { useEffect, useState } from 'react'
import type { Word } from '../db/types'
import { useSettings } from '../settings/useSettings'
import type { Freq } from '../library/level'

const LEVELS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' }, { key: 'N5', label: 'N5' }, { key: 'N4', label: 'N4' },
  { key: 'N3', label: 'N3' }, { key: 'N2', label: 'N2' }, { key: 'N1', label: 'N1' },
]
const FREQS: { key: string; label: string }[] = [
  { key: 'all', label: '全部频率' }, { key: '高频', label: '高频' }, { key: '中频', label: '中频' }, { key: '低频', label: '低频' },
]
const HAS_FREQ: Record<string, boolean> = { N1: true, N2: true, N3: true }

function Chip({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
        active
          ? 'bg-[#3b6ef5] font-bold text-white shadow-[0_4px_12px_rgba(59,110,245,.35)]'
          : 'border border-zinc-200/80 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'}`}>
      {label}{count !== undefined && <span className="ml-1 opacity-70">{count}</span>}
    </button>
  )
}

const today = new Date()
const DATE_STR = `${today.getMonth() + 1}月${today.getDate()}日`

export default function TodayPage() {
  const { settings, setStudyFilter } = useSettings()
  const filter: StudyFilter = settings?.studyFilter ?? DEFAULT_FILTER
  const progress = useLiveQuery(() => db.progress.toArray(), [])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [info, setInfo] = useState({ news: 0, due: 0, streakDays: 0, ready: false })

  // 各档词数（索引计数，快）
  useEffect(() => {
    (async () => {
      const all = await db.words.count()
      const c: Record<string, number> = { all }
      for (const lv of ['N5', 'N4', 'N3', 'N2', 'N1']) c[lv] = await db.words.where('level').equals(lv).count()
      setCounts(c)
    })()
  }, [])

  // 筛选条件变化 → 各频率档计数
  useEffect(() => {
    (async () => {
      if (filter.level === 'all') return
      const c: Record<string, number> = { all: await db.words.where('level').equals(filter.level).count() }
      for (const f of ['高频', '中频', '低频'] as Freq[]) {
        c[f] = await db.words.where('[level+freq]').equals([filter.level, f]).count()
      }
      setCounts((prev) => ({ ...prev, [filter.level]: c.all, ...c }))
    })()
  }, [filter.level])

  // 今日队列（按筛选范围，新词随机）
  useEffect(() => {
    (async () => {
      if (progress === undefined) return
      const s = await getStreak()
      const appSettings = await getAppSettings()
      const keys = await candidateKeys(filter)
      const stubs = keys.map((id) => ({ id })) as unknown as Word[]
      const progressMap = new Map(progress.map((p) => [p.wordId, p]))
      const q = pickDailyQueue(stubs, progressMap, appSettings.dailyNewLimit, { shuffle: true })
      const news = q.filter((id) => progressMap.get(id)?.isNew).length
      setInfo({ news, due: q.length - news, streakDays: s.days, ready: true })
    })()
  }, [filter, progress])

  const levelLabel = filter.level === 'all' ? '全部范围' : filter.level + (filter.freq !== 'all' ? ` · ${filter.freq}` : '')

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-extrabold text-slate-700 dark:text-zinc-100">今天 <span className="text-xs font-normal text-zinc-400">{DATE_STR}</span></div>
          {info.streakDays > 0 && (
            <span className="rounded-full bg-[#fff3e8] px-2.5 py-1 text-xs font-bold text-[#ea7c30] dark:bg-orange-900/40 dark:text-orange-300">
              🔥 连续 {info.streakDays} 天
            </span>
          )}
        </div>

        <div className="animate-pop rounded-3xl bg-white p-5 shadow-[0_6px_18px_rgba(59,110,245,0.10)] dark:bg-zinc-800">
          <div className="text-xs text-zinc-400">{levelLabel} · 今天的任务</div>
          <div className="text-5xl font-black leading-tight text-[#3b6ef5]">{info.ready ? info.news : '…'}</div>
          <div className="-mt-1 text-xs text-zinc-500">个新词待认</div>
          <div className="mt-3 flex justify-around rounded-xl bg-[#f1f5fd] px-2 py-2 text-xs text-slate-600 dark:bg-zinc-700/60 dark:text-zinc-300">
            <span>📖 复习 <b>{info.ready ? info.due : '…'}</b></span>
            <span>✨ 新词 <b>{info.ready ? info.news : '…'}</b></span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm space-y-2">
        <div className="flex flex-wrap justify-center gap-2">
          {LEVELS.map((lv) => (
            <Chip key={lv.key} label={lv.label} count={counts[lv.key]}
              active={filter.level === lv.key}
              onClick={() => setStudyFilter({ level: lv.key, freq: 'all' })} />
          ))}
        </div>
        {HAS_FREQ[filter.level] && (
          <div className="flex flex-wrap justify-center gap-2">
            {FREQS.map((f) => (
              <Chip key={f.key} label={f.label} count={counts[f.key]}
                active={filter.freq === f.key}
                onClick={() => setStudyFilter({ ...filter, freq: f.key })} />
            ))}
          </div>
        )}
      </div>

      <Link to="/review"
        className="w-full max-w-sm rounded-full bg-gradient-to-r from-[#3b6ef5] to-[#6366f1] py-3 text-center font-bold text-white shadow-[0_8px_20px_rgba(59,110,245,0.35)]">
        {info.news + info.due > 0 ? '开始背诵 →' : '这个范围今天背完了 🎉'}
      </Link>
    </div>
  )
}
