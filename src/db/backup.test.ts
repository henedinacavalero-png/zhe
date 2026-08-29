import { db } from './db'
import { decodeAudio, encodeAudio, exportBackup, importBackup } from './backup'
import type { Word } from './types'
import { Blob as NodeBlob } from 'node:buffer'

// fake-indexeddb 的结构化克隆基于 Node 原生 structuredClone，不识别 jsdom 的跨 realm Blob
//（jsdom Blob 存入 IDB 会被克隆成空对象，runImport.test.ts 有同样的环境限制说明）。
// 仅本文件内把全局 Blob 换成 node:buffer 的 Blob（vitest 按文件隔离环境），
// 使音频 Blob 能在 fake-indexeddb 中真实往返，导出/导入的音频映射得到内容级验证。
globalThis.Blob = NodeBlob as unknown as typeof Blob

test('Blob ↔ base64 往返', async () => {
  const blob = new Blob(['MP3DATA'], { type: 'audio/mpeg' })
  const b64 = await encodeAudio(blob)
  const back = await decodeAudio(b64)
  expect(await back.text()).toBe('MP3DATA')
  expect(back.type).toBe('audio/mpeg')
})

test('导出→清库→导入：词/音频/进度/设置按原 id 恢复', async () => {
  const deckId = await db.decks.add({ name: 'N4', importedAt: 111, wordCount: 2 })
  const w1: Word = {
    deckId, term: '食べる', reading: 'たべる', meaning: '吃', pos: '動・一段',
    examples: [{ ja: '朝ごはんを食べる。', zh: '吃早饭。' }],
    audio: new Blob(['MP3DATA'], { type: 'audio/mpeg' }), tags: ['動詞'], lesson: 'L1', related: [],
  }
  const w2: Word = {
    deckId, term: '飲む', reading: 'のむ', meaning: '喝', pos: '動・五段',
    examples: [], audio: null, tags: [], lesson: null, related: [],
  }
  const id1 = await db.words.add(w1)
  const id2 = await db.words.add(w2)
  await db.progress.put({ wordId: id2, ease: 2.5, interval: 3, due: 999, reps: 1, lapses: 0, lastReviewed: 888, isNew: false })
  await db.settings.put({ key: 'app', dailyNewLimit: 7, theme: 'dark' })

  const backup = await exportBackup()
  expect(backup).toBeInstanceOf(Blob)

  // importBackup 内部先 clear 全表再写入——等价于“数据全丢后恢复”
  await importBackup(backup)

  const back1 = (await db.words.get(id1))!
  expect(back1.term).toBe('食べる')
  expect(back1.lesson).toBe('L1')
  expect(back1.audio).toBeInstanceOf(Blob)
  expect(back1.audio!.type).toBe('audio/mpeg')
  expect(await back1.audio!.text()).toBe('MP3DATA')
  const back2 = (await db.words.get(id2))!
  expect(back2.term).toBe('飲む')
  expect(back2.audio).toBeNull()
  expect(await db.decks.get(deckId)).toMatchObject({ name: 'N4', wordCount: 2 })
  expect(await db.progress.get(id2)).toMatchObject({ interval: 3, isNew: false })
  expect(await db.settings.get('app')).toEqual({ key: 'app', dailyNewLimit: 7, theme: 'dark' })
})
