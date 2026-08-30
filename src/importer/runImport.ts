import type { RawApkg, RawNote } from './apkg'
import type { FieldGuess } from './guess'
import { buildLinks, type WordSeed } from '../linker/linker'
import { parseLevel } from '../library/level'
import { newProgress } from '../scheduler/scheduler'
import { db } from '../db/db'
import type { Word } from '../db/types'

const SOUND_RE = /\[sound:([^\]]+)\]/
const IMG_SRC_RE = /<img[^>]+src="([^"]+)"/gi
const BATCH = 200

export function extractAudioName(fields: string[]): string | null {
  for (const f of fields) { const m = f.match(SOUND_RE); if (m) return m[1] }
  return null
}

function cleanField(s: string): string { return s.replace(SOUND_RE, '').trim() }

/** 收集一段字段文本里 <img src> 引用的媒体名（去重，≤4 张防止单卡膨胀） */
export function collectImageNames(texts: string[], mediaFiles: Map<string, Blob>): string[] {
  const names: string[] = []
  for (const t of texts) {
    for (const m of t.matchAll(IMG_SRC_RE)) {
      const name = m[1]
      if (mediaFiles.has(name) && !names.includes(name)) names.push(name)
    }
  }
  return names.slice(0, 4)
}

/** 把图片 Blob 按文件名打包成 word.images */
export function packImages(names: string[], mediaFiles: Map<string, Blob>): Record<string, Blob> {
  const imgs: Record<string, Blob> = {}
  for (const n of names) {
    const b = mediaFiles.get(n)
    if (b) imgs[n] = b
  }
  return imgs
}

export interface BuildWordsResult { words: Word[]; audioNames: (string | null)[]; noteFields: string[][] }

/** notes → Word 雏形。audioNames[i]/noteFields[i] 与 words[i] 一一对应（空 term 的 note 整体跳过，保证索引对齐） */
export function buildWords(notes: RawNote[], guess: FieldGuess, deckId: number): BuildWordsResult {
  const words: Word[] = []
  const audioNames: (string | null)[] = []
  const noteFields: string[][] = []
  for (const n of notes) {
    const f = n.fields
    const term = cleanField(f[guess.term] ?? '')
    if (term === '') continue
    const exampleRaw = guess.example !== null ? (f[guess.example] ?? '') : ''
    const example = cleanField(exampleRaw)
    const exampleZh = guess.exampleZh !== null ? cleanField(f[guess.exampleZh] ?? '') : ''
    const exampleRt = guess.exampleRt !== null ? cleanField(f[guess.exampleRt] ?? '') : ''
    const lv = parseLevel(n.tags[0])
    words.push({
      deckId,
      term,
      reading: guess.reading !== null ? cleanField(f[guess.reading] ?? '') : '',
      meaning: cleanField(f[guess.meaning] ?? ''),
      pos: n.tags.find((t) => /動|名|形|副|助|接/i.test(t)) ?? '',
      examples: example ? [{ ja: example, zh: exampleZh, rt: exampleRt || undefined, audioName: exampleRaw.match(SOUND_RE)?.[1] || undefined }] : [],
      audio: null,
      tags: n.tags,
      lesson: n.tags[0] ?? null, // 首个 tag 作为课/分组线索
      level: lv?.level ?? '',
      freq: lv?.freq ?? '',
      related: [],
    })
    audioNames.push(extractAudioName(f))
    noteFields.push(f)
  }
  return { words, audioNames, noteFields }
}

/** 收集每张卡 <img> 引用的图片并挂到 word.images（Tae Kim 之类的图片卡） */
export function attachImages(words: Word[], noteImageNames: string[][], mediaFiles: Map<string, Blob>): void {
  for (let i = 0; i < words.length; i++) {
    const imgs = packImages(noteImageNames[i] ?? [], mediaFiles)
    if (Object.keys(imgs).length) words[i].images = imgs
  }
}

const GUID_STR_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const META_FIELD_RE = /^(note id|link|version|sequence|order|totalorder|suborder)$/i

/** 全字段快照（非空、剔除元数据列）+ 每卡引用媒体的 Blob 表（primary 音频以外） */
export function attachFields(
  words: Word[], noteFields: string[][], fieldNames: string[], guess: FieldGuess,
  mediaFiles: Map<string, Blob>,
): void {
  const usedSlots = new Set(
    [guess.term, guess.reading, guess.meaning, guess.example, guess.exampleZh].filter((x): x is number => x !== null),
  )
  for (let i = 0; i < words.length; i++) {
    const flds = noteFields[i] ?? []
    const snaps: { name: string; value: string }[] = []
    const media: Record<string, Blob> = {}
    const audioName = words[i].audioName
    for (let j = 0; j < flds.length && j < fieldNames.length; j++) {
      const name = fieldNames[j]
      const value = (flds[j] ?? '').trim()
      if (!value) continue
      if (META_FIELD_RE.test(name)) continue
      // 字段文本里引用的媒体（[sound:] / <img>）→ 收进 media 表（主音频 / 已挂图片除外，避免双份存储）
      const audioRefs = [...value.matchAll(/\[sound:([^\]]+)\]/g)].map((m) => m[1])
      for (const ref of audioRefs) {
        if (ref !== audioName && mediaFiles.has(ref)) media[ref] = mediaFiles.get(ref)!
      }
      const imgRefs = [...value.matchAll(IMG_SRC_RE)].map((m) => m[1])
      for (const img of imgRefs) {
        if (!words[i].images?.[img] && mediaFiles.has(img)) media[img] = mediaFiles.get(img)!
      }
      // 整段只是媒体引用（如 JLab 的 Audio/Image 字段）且媒体都已挂载 → 不再重复成字段文本
      const residual = value.replace(/\[sound:[^\]]*\]/g, '').replace(/<img\b[^>]*>/gi, '').replace(/<br\s*\/?>/gi, '').trim()
      if (!residual && audioRefs.every((r) => r === audioName) && imgRefs.every((r) => words[i].images?.[r])) continue
      // 映射槽位（单词/读音/释义/例句/翻译）已在卡面单独展示，不进字段区
      if (usedSlots.has(j)) continue
      if (GUID_STR_RE.test(value)) continue
      if (/^https?:\/\//i.test(value)) continue
      if (/^\d{1,4}$/.test(value)) continue // 纯短数字（声调/序号）不成段
      snaps.push({ name, value })
    }
    words[i].fields = snaps.length ? snaps : null
    words[i].media = Object.keys(media).length ? media : null
  }
}

/** 把媒体清单里的音频按 audioNames[i] ↔ words[i] 对齐挂载（裁定 1）；未命中保持 null */
export function attachAudio(words: Word[], audioNames: (string | null)[], mediaFiles: Map<string, Blob>): void {
  for (let i = 0; i < words.length; i++) {
    const name = audioNames[i]
    if (name && mediaFiles.has(name)) {
      words[i].audio = mediaFiles.get(name)!
      words[i].audioName = name
    }
  }
}

/** Worker 内执行：建 deck → 词条（阶段 A）→ 关联写回（阶段 B）→ 音频 → 全部入库。onProgress(已处理, 总数)，total = 词数×2 */
export async function runImport(
  raw: RawApkg, guess: FieldGuess, deckName: string,
  onProgress: (done: number, total: number) => void,
): Promise<number> {
  const deckId = await db.decks.add({ name: deckName, importedAt: Date.now(), wordCount: 0 })
  const { words, audioNames, noteFields } = buildWords(raw.notes, guess, deckId)
  attachAudio(words, audioNames, raw.mediaFiles)
  // 图片卡（如 Tae Kim 动漫句卡）：noteFields 是字段原文，先提取每卡 <img> 引用的媒体名再按名挂 Blob
  const imgNames = noteFields.map((flds) => collectImageNames(flds, raw.mediaFiles))
  attachImages(words, imgNames, raw.mediaFiles)
  // 全字段快照 + 字段引用的其余媒体（背面完整展示；primary 音频仍走 word.audio）
  attachFields(words, noteFields, raw.models[0].fieldNames, guess, raw.mediaFiles)

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
