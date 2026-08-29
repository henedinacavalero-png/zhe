import { parseApkg } from './apkg'
import type { RawNote } from './apkg'
import { runImport } from './runImport'
import type { FieldGuess } from './guess'

export interface ImportRequest { file: Blob; guess: FieldGuess; deckName: string; notesOnly?: RawNote[] }
export type ImportResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; deckId: number }
  | { type: 'error'; message: string }

// Worker 全局在 DOM lib 下没有独立类型，收窄一次即可（保持薄胶水）
const post = (msg: ImportResponse) =>
  (self as unknown as { postMessage: (m: ImportResponse) => void }).postMessage(msg)

self.onmessage = async (e: MessageEvent<ImportRequest>) => {
  const { file, guess, deckName, notesOnly } = e.data
  try {
    const raw = await parseApkg(file)
    // 多模型牌组：前端已按模型 0 过滤，此处覆盖 notes，保证实际导入与预览一致
    if (notesOnly) raw.notes = notesOnly
    const deckId = await runImport(raw, guess, deckName, (done, total) =>
      post({ type: 'progress', done, total }))
    post({ type: 'done', deckId })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
