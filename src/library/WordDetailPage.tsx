import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import CardBack from '../review/CardBack'

export default function WordDetailPage() {
  const { wordId } = useParams()
  const word = useLiveQuery(() => db.words.get(Number(wordId)), [wordId])
  const deckWords = useLiveQuery(() => db.words.where('deckId').equals(word?.deckId ?? -1).toArray(), [word?.deckId])
  if (!word) return <div className="p-4">加载中…</div>
  const wordsById = new Map((deckWords ?? []).map((w) => [w.id!, w]))
  return (
    <div className="p-4">
      <Link to={`/library/deck/${word.deckId}`}
        className="inline-block rounded-full bg-white px-3 py-1 text-sm text-[#3b6ef5] shadow-sm dark:bg-zinc-800">← 返回列表</Link>
      <div className="mt-4"><CardBack word={word} wordsById={wordsById} onJump={(id) => location.assign(`#/word/${id}`)} /></div>
    </div>
  )
}
