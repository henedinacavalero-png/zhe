import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getAppSettings, getStreak } from '../db/db'
import { pickDailyQueue } from '../scheduler/scheduler'
import { useEffect, useState } from 'react'
import type { Word } from '../db/types'

export default function TodayPage() {
  // 万级词库只取主键集合（toArray 会把含音频的整行全拉进内存）
  const wordKeys = useLiveQuery(() => db.words.toCollection().primaryKeys(), [])
  const progress = useLiveQuery(() => db.progress.toArray(), [])
  const [info, setInfo] = useState({ news: 0, due: 0, streakDays: 0 })
  useEffect(() => {
    (async () => {
      if (wordKeys === undefined || progress === undefined) return
      const s = await getStreak()
      const settings = await getAppSettings()
      const stubs = wordKeys.map((id) => ({ id })) as unknown as Word[]
      const progressMap = new Map(progress.map((p) => [p.wordId, p]))
      const q = pickDailyQueue(stubs, progressMap, settings.dailyNewLimit)
      const news = q.filter((id) => progressMap.get(id)?.isNew).length
      setInfo({ news, due: q.length - news, streakDays: s.days })
    })()
  }, [wordKeys, progress])

  if (wordKeys === undefined || progress === undefined) {
    return <div className="p-8 text-center text-zinc-400">加载中…</div>
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <div className="text-sm text-zinc-400">今天</div>
        <div className="mt-2 rounded-2xl bg-indigo-50 px-10 py-6 dark:bg-zinc-800">
          {/* “N 个新词”须为同一文本节点（getByText 只匹配元素的直接文本子节点） */}
          <div className="text-4xl font-bold text-[#3b6ef5]">{info.news} 个新词</div>
          <div className="mt-1 text-sm text-zinc-500">{info.due} 个待复习</div>
        </div>
        {info.streakDays > 0 && <div className="mt-3 text-sm text-orange-500">🔥 连续打卡 {info.streakDays} 天</div>}
      </div>
      <Link to="/review" className="w-full max-w-xs rounded-full bg-[#3b6ef5] py-3 text-center font-bold text-white">
        {info.news + info.due > 0 ? '开始背诵 →' : '今天背完了 🎉'}
      </Link>
    </div>
  )
}
