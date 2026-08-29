import { describe, expect, test } from 'vitest'
import { attachAudio, buildWords, extractAudioName, runImport } from './runImport'
import type { RawApkg, RawNote } from './apkg'
import { db } from '../db/db'
import type { Word } from '../db/types'

const note: RawNote = { mid: 1, fields: ['食べる', 'たべる', '吃 [sound:pop.mp3]', '朝ごはんを食べる。'], tags: ['JLPT::N4'] }
const GUESS = { term: 0, reading: 1, meaning: 2, example: 3 } as const

describe('runImport 管线', () => {
  test('extractAudioName 从任意字段提取 [sound:xxx]', () => {
    expect(extractAudioName(note.fields)).toBe('pop.mp3')
    expect(extractAudioName(['a', 'b'])).toBeNull()
  })

  test('buildWords：映射成 Word 雏形（含 tags→lesson 线索、无例句时空数组），audioNames 与 words 对齐', () => {
    const { words, audioNames } = buildWords([note], GUESS, 7)
    expect(words).toHaveLength(1)
    const w = words[0]
    expect(w).toMatchObject({ deckId: 7, term: '食べる', reading: 'たべる', meaning: '吃', lesson: 'JLPT::N4' })
    expect(w.examples).toEqual([{ ja: '朝ごはんを食べる。', zh: '' }]) // 无中文翻译列 → zh 为空串
    expect(audioNames).toEqual(['pop.mp3']) // 裁定 1：audioNames[i] 对应 words[i] 的源 note
  })

  test('buildWords：无例句列 → examples 为空数组', () => {
    const { words } = buildWords([note], { term: 0, reading: 1, meaning: 2, example: null }, 7)
    expect(words[0].examples).toEqual([])
  })

  test('buildWords：空 term 被过滤后 audioNames 仍与 words 严格对齐', () => {
    const empty: RawNote = { mid: 1, fields: ['', '', '', ''], tags: [] }
    const { words, audioNames } = buildWords([empty, note], GUESS, 7)
    expect(words).toHaveLength(1)
    expect(words[0].term).toBe('食べる')
    expect(audioNames).toEqual(['pop.mp3']) // 不是 [null, 'pop.mp3']——对齐是硬约束
  })

  test('attachAudio：mediaFiles 命中时挂载 Blob，未命中保持 null（audioNames 与 words 对齐）', async () => {
    const mk = (): Word => ({ deckId: 7, term: 'x', reading: '', meaning: '', pos: '', examples: [], audio: null, tags: [], lesson: null, related: [] })
    const words = [mk(), mk()]
    attachAudio(words, ['pop.mp3', 'missing.mp3'], new Map([['pop.mp3', new Blob(['MP3DATA'])]]))
    expect(await words[0].audio!.text()).toBe('MP3DATA')
    expect(words[1].audio).toBeNull()
  })

  test('runImport：两阶段入库，related.wordId 指向真实主键，音频入库，进度两阶段合计到 100%', async () => {
    const notes: RawNote[] = [
      { mid: 1, fields: ['食べる', 'たべる', '吃 [sound:pop.mp3]', ''], tags: ['JLPT::N4'] },
      { mid: 1, fields: ['食事', 'しょくじ', '饭菜', ''], tags: ['JLPT::N4'] },
    ]
    const raw: RawApkg = {
      models: [{ id: 1, name: 'Basic', fieldNames: ['単語', 'よみ', '意味', '例文'] }],
      notes,
      mediaFiles: new Map([['pop.mp3', new Blob(['MP3DATA'])]]),
    }
    const calls: [number, number][] = []
    const deckId = await runImport(
      raw, { term: 0, reading: 1, meaning: 2, example: null }, '测试牌组',
      (done, total) => calls.push([done, total]),
    )
    expect(deckId).toBeGreaterThan(0)
    expect((await db.decks.get(deckId))?.wordCount).toBe(2)

    const all = await db.words.where('deckId').equals(deckId).toArray()
    expect(all).toHaveLength(2)
    const taberu = all.find((w) => w.term === '食べる')!
    const shokuji = all.find((w) => w.term === '食事')!
    // 裁定 2：related.wordId 必须是入库后的真实 Dexie 主键（双向各断言一次）
    expect(taberu.related.map((r) => r.wordId)).toEqual([shokuji.id!])
    expect(shokuji.related.map((r) => r.wordId)).toEqual([taberu.id!])
    // 音频：带 [sound:…] 且媒体清单里有的词有 audio；未带的为 null
    //（fake-indexeddb 的结构化克隆无法往返 Blob 内容（读回为空对象），内容级断言见 attachAudio 单测）
    expect(taberu.audio).not.toBeNull()
    expect(shokuji.audio).toBeNull()
    // 学习进度已初始化
    const progs = await db.progress.bulkGet([taberu.id!, shokuji.id!])
    expect(progs.every((p) => p?.isNew === true)).toBe(true)
    // 进度：total = 词数 × 2（词条+关联），最终 done === total
    const last = calls[calls.length - 1]
    expect(last).toEqual([4, 4])
  })
})
