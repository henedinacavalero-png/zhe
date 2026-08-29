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
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active ? 'border-[#3b6ef5] bg-[#3b6ef5] font-bold text-white' : 'border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'}`}>
      {label}{count !== undefined && <span className="ml-1 opacity-70">{count}</span>}
    </button>
  )
}

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
      const c: Record<string, number> = { all: all }
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
      setCounts((prev) => ({ ...prev, [filter.level]: c.all, [`${filter.level}:freq`]: 0, ...c }))
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

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-4">
      <div className="text-center">
        <div className="text-sm text-zinc-400">今天</div>
        <div className="mt-2 rounded-2xl bg-indigo-50 px-10 py-6 dark:bg-zinc-800">
          {/* “N 个新词”须为同一文本节点（getByText 只匹配元素的直接文本子节点） */}
          <div className="text-4xl font-bold text-[#3b6ef5]">{info.ready ? info.news : '…'} 个新词</div>
          <div className="mt-1 text-sm text-zinc-500">{info.ready ? info.due : '…'} 个待复习</div>
        </div>
        {info.streakDays > 0 && <div className="mt-3 text-sm text-orange-500">🔥 连续打卡 {info.streakDays} 天</div>}
      </div>

      <div className="w-full max-w-md space-y-2">
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

      <Link to="/review" className="w-full max-w-xs rounded-full bg-[#3b6ef5] py-3 text-center font-bold text-white">
        {info.news + info.due > 0 ? '开始背诵 →' : '这个范围今天背完了 🎉'}
      </Link>
    </div>
  )
}
