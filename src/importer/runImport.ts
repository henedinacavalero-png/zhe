import type { RawApkg, RawNote } from './apkg'
import type { FieldGuess } from './guess'
import { buildLinks, type WordSeed } from '../linker/linker'
import { newProgress } from '../scheduler/scheduler'
import { db } from '../db/db'
import type { Word } from '../db/types'

const SOUND_RE = /\[sound:([^\]]+)\]/
const BATCH = 200

export function extractAudioName(fields: string[]): string | null {
  for (const f of fields) { const m = f.match(SOUND_RE); if (m) return m[1] }
  return null
}

function cleanField(s: string): string { return s.replace(SOUND_RE, '').trim() }

export interface BuildWordsResult { words: Word[]; audioNames: (string | null)[] }

/** notes → Word 雏形。audioNames[i] 与 words[i] 一一对应（裁定 1：空 term 的 note 整体跳过，保证索引对齐） */
export function buildWords(notes: RawNote[], guess: FieldGuess, deckId: number): BuildWordsResult {
  const words: Word[] = []
  const audioNames: (string | null)[] = []
  for (const n of notes) {
    const f = n.fields
    const term = cleanField(f[guess.term] ?? '')
    if (term === '') continue
    const example = guess.example !== null ? cleanField(f[guess.example] ?? '') : ''
    const exampleZh = guess.exampleZh !== null ? cleanField(f[guess.exampleZh] ?? '') : ''
    const exampleRt = guess.exampleRt !== null ? cleanField(f[guess.exampleRt] ?? '') : ''
    words.push({
      deckId,
      term,
      reading: guess.reading !== null ? cleanField(f[guess.reading] ?? '') : '',
      meaning: cleanField(f[guess.meaning] ?? ''),
      pos: n.tags.find((t) => /動|名|形|副|助|接/i.test(t)) ?? '',
      examples: example ? [{ ja: example, zh: exampleZh, rt: exampleRt || undefined }] : [],
      audio: null,
      tags: n.tags,
      lesson: n.tags[0] ?? null, // 首个 tag 作为课/分组线索
      related: [],
    })
    audioNames.push(extractAudioName(f))
  }
  return { words, audioNames }
}

/** 把媒体清单里的音频按 audioNames[i] ↔ words[i] 对齐挂载（裁定 1）；未命中保持 null */
export function attachAudio(words: Word[], audioNames: (string | null)[], mediaFiles: Map<string, Blob>): void {
  for (let i = 0; i < words.length; i++) {
    const name = audioNames[i]
    if (name && mediaFiles.has(name)) words[i].audio = mediaFiles.get(name)!
  }
}

/** Worker 内执行：建 deck → 词条（阶段 A）→ 关联写回（阶段 B）→ 音频 → 全部入库。onProgress(已处理, 总数)，total = 词数×2 */
export async function runImport(
  raw: RawApkg, guess: FieldGuess, deckName: string,
  onProgress: (done: number, total: number) => void,
): Promise<number> {
  const deckId = await db.decks.add({ name: deckName, importedAt: Date.now(), wordCount: 0 })
  const { words, audioNames } = buildWords(raw.notes, guess, deckId)
  attachAudio(words, audioNames, raw.mediaFiles)

  const seeds: WordSeed[] = words.map((w, i) => ({ id: i, term: w.term, reading: w.reading, deckId, lesson: w.lesson }))
  const links = buildLinks(seeds) // seed.id 是词表内索引，与 Dexie 主键无关

  const total = words.length * 2 // 词条阶段 + 关联阶段各算一半，进度平滑到 100%
  let done = 0

  // 阶段 A：分批入库词条，收集真实主键（裁定 2：seed 索引 ≠ 自增主键，多牌组导入时不可用 +1 推算）
  const realIds: number[] = []
  for (let i = 0; i < words.length; i += BATCH) {
    const batch = words.slice(i, i + BATCH)
    const keys = await db.words.bulkAdd(batch, { allKeys: true })
    realIds.push(...keys)
    await db.progress.bulkPut(keys.map((wid) => newProgress(wid)))
    done += batch.length
    onProgress(done, total)
  }
  // 回填真实主键：阶段 B 的 bulkPut 必须带主键，否则 put 会当作新增再插一遍
  for (let i = 0; i < realIds.length; i++) words[i].id = realIds[i]

  // 阶段 B：seed 索引上的关联映射成真实主键后写回 related
  for (let i = 0; i < words.length; i += BATCH) {
    const end = Math.min(i + BATCH, words.length)
    const updates: Word[] = []
    for (let j = i; j < end; j++) {
      const rel = links.get(j)
      if (!rel?.length) continue
      words[j].related = rel.map((r) => ({ wordId: realIds[r.wordId], type: r.type, score: r.score }))
      updates.push(words[j])
    }
    if (updates.length) await db.words.bulkPut(updates)
    done += end - i
    onProgress(done, total)
  }

  await db.decks.update(deckId, { wordCount: words.length })
  return deckId
}
