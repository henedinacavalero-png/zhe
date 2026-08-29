import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseApkg, type RawNote } from './apkg'
import { guessMapping, type FieldGuess } from './guess'
import type { ImportResponse } from './worker'

const LABELS: Record<keyof FieldGuess, string> = { term: '单词', reading: '读音', meaning: '释义', example: '例句' }

export default function ImportPage() {
  const [guess, setGuess] = useState<FieldGuess | null>(null)
  const [fieldNames, setFieldNames] = useState<string[]>([])
  const [skippedNotes, setSkippedNotes] = useState<{ count: number; modelName: string } | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<File | null>(null)
  const notesRef = useRef<RawNote[] | null>(null)
  const navigate = useNavigate()

  async function onFile(f: File) {
    fileRef.current = f
    setError('')
    setGuess(null)
    setProgress(null)
    setSkippedNotes(null)
    try {
      const raw = await parseApkg(f)
      const model = raw.models[0]
      if (!model) throw new Error('牌组里没有笔记模型')
      // 多模型牌组防错位：只保留模型 0 的笔记（其他模板字段数不同，按模型 0 列索引切分会张冠李戴）
      const notes = raw.notes.filter((n) => n.mid === model.id)
      notesRef.current = notes
      const skipped = raw.notes.length - notes.length
      if (skipped > 0) setSkippedNotes({ count: skipped, modelName: model.name })
      setFieldNames(model.fieldNames)
      setGuess(guessMapping(model.fieldNames, notes.slice(0, 30).map((n) => n.fields)))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  function startImport() {
    if (!guess || !fileRef.current) return
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<ImportResponse>) => {
      if (e.data.type === 'progress') setProgress({ done: e.data.done, total: e.data.total })
      if (e.data.type === 'done') { worker.terminate(); navigate(`/library/deck/${e.data.deckId}`) }
      if (e.data.type === 'error') { worker.terminate(); setError(e.data.message) }
    }
    worker.onerror = (e) => { worker.terminate(); setError(e.message || '导入 Worker 异常退出') }
    // notesOnly：过滤后的模型 0 笔记（普通纯对象，可结构化克隆）；worker 解析后用其覆盖 raw.notes
    worker.postMessage({ file: fileRef.current, guess, deckName: fileRef.current.name.replace(/\.apkg$/i, ''), notesOnly: notesRef.current ?? undefined })
  }

  function setPart(part: keyof FieldGuess, col: string) {
    setGuess((g) => g && { ...g, [part]: col === '' ? null : Number(col) })
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">导入 Anki 牌组</h1>
      <input type="file" accept=".apkg" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      {error && <p className="rounded bg-red-50 p-3 text-red-600">{error}</p>}
      {skippedNotes && !progress && (
        <p className="rounded bg-amber-50 p-3 text-amber-600">
          该文件包含多种笔记模板，已跳过 {skippedNotes.count} 条不支持的字段（导入后将只包含与「{skippedNotes.modelName}」相同的词条）
        </p>
      )}
      {guess && !progress && (
        <div className="space-y-2">
          <p className="text-sm text-zinc-500">确认各部分对应的字段（可修改）：</p>
          {(Object.keys(LABELS) as (keyof FieldGuess)[]).map((part) => (
            <label key={part} className="flex items-center gap-2">
              <span className="w-12">{LABELS[part]}</span>
              <select className="rounded border p-1" value={guess[part] ?? ''} onChange={(e) => setPart(part, e.target.value)}>
                <option value="">（无）</option>
                {fieldNames.map((f, i) => <option key={i} value={i}>{f}</option>)}
              </select>
            </label>
          ))}
          <button className="w-full rounded bg-[#3b6ef5] py-2 font-bold text-white" onClick={startImport}>开始导入</button>
        </div>
      )}
      {progress && (
        <div>
          <div className="h-2 rounded bg-zinc-200"><div className="h-2 rounded bg-[#3b6ef5] transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
          <p className="mt-2 text-sm text-zinc-500">正在导入 {progress.done} / {progress.total}</p>
        </div>
      )}
    </div>
  )
}
