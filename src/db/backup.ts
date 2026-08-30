import { db } from './db'
import type { AppSettings, Deck, Progress, Streak, Word } from './types'

export async function encodeAudio(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000)
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return `data:${blob.type};base64,${btoa(bin)}`
}

export async function decodeAudio(dataUrl: string): Promise<Blob> {
  const [meta, b64] = dataUrl.split(',')
  const type = meta.slice(5).split(';')[0]
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return new Blob([buf], { type })
}

type WordWithoutMedia = Omit<Word, 'audio' | 'images'>

interface Backup {
  version: 1
  decks: Deck[]
  words: WordWithoutMedia[]
  audioByWordId: Record<string, string | undefined>
  imagesByWordId?: Record<string, Record<string, string> | undefined> // 文件名 → dataURL
  progress: Progress[]
  settings: (AppSettings | Streak)[]
}

export async function exportBackup(): Promise<Blob> {
  const [decks, words, progress, settings] = await Promise.all([
    db.decks.toArray(), db.words.toArray(), db.progress.toArray(), db.settings.toArray(),
  ])
  const audioByWordId: Record<string, string | undefined> = {}
  const imagesByWordId: Record<string, Record<string, string> | undefined> = {}
  const bareWords: WordWithoutMedia[] = []
  for (const w of words) {
    const { audio, images, ...rest } = w
    audioByWordId[String(w.id)] = audio ? await encodeAudio(audio) : undefined
    if (images && Object.keys(images).length) {
      const enc: Record<string, string> = {}
      for (const [name, blob] of Object.entries(images)) enc[name] = await encodeAudio(blob)
      imagesByWordId[String(w.id)] = enc
    }
    bareWords.push(rest)
  }
  const backup: Backup = { version: 1, decks, words: bareWords, audioByWordId, imagesByWordId, progress, settings }
  return new Blob([JSON.stringify(backup)], { type: 'application/json' })
}

export async function importBackup(file: Blob): Promise<void> {
  const backup = JSON.parse(await file.text()) as Backup
  if (backup.version !== 1) throw new Error('不支持的备份文件版本')
  // 音频/图片按原 word id 找回（Dexie 对带主键的对象保留原 id），先解码再一次性 bulkAdd
  const words = await Promise.all(backup.words.map(async (w) => {
    const audioData = backup.audioByWordId[String(w.id)]
    const imgs = backup.imagesByWordId?.[String(w.id)]
    const images: Record<string, Blob> | null = imgs
      ? Object.fromEntries(await Promise.all(Object.entries(imgs).map(async ([k, v]) => [k, await decodeAudio(v)])))
      : null
    return { ...w, audio: audioData ? await decodeAudio(audioData) : null, images }
  }))
  await db.transaction('rw', [db.decks, db.words, db.progress, db.settings], async () => {
    await Promise.all([db.decks.clear(), db.words.clear(), db.progress.clear(), db.settings.clear()])
    await db.words.bulkAdd(words)
    await db.decks.bulkPut(backup.decks)
    await db.progress.bulkPut(backup.progress)
    await db.settings.bulkPut(backup.settings)
  })
}
