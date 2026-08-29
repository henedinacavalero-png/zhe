import Dexie from 'dexie'
import { db, getStreak, bumpStreak, TangoDB, candidateKeys } from './db'
import type { Word } from './types'

test('写入并读回 Word', async () => {
  const w: Word = {
    deckId: 1, term: '食べる', reading: 'たべる', meaning: '吃', pos: '動・一段',
    examples: [{ ja: '朝ごはんを食べる。', zh: '吃早饭。' }], audio: null,
    tags: [], lesson: null, related: [],
  }
  const id = await db.words.add(w)
  expect((await db.words.get(id))?.term).toBe('食べる')
})

test('streak：同日不重复计，隔天断签重置为 1', async () => {
  await bumpStreak('2026-08-29')
  await bumpStreak('2026-08-29')
  expect((await getStreak()).days).toBe(1)
  await bumpStreak('2026-08-31')
  expect((await getStreak()).days).toBe(1)
  // 此时状态：days=1, lastStudyDate='2026-08-31'。
  // '2026-09-01' 的昨天是 '2026-08-31'，命中连续续签分支 → days 应递增为 2
  //（若 yesterday 计算偏移一天，此处会被误判为断签得 1，本断言即失败）。
  await bumpStreak('2026-09-01')
  expect((await getStreak()).days).toBe(2)
})

test('v1→v2 迁移：存量词从 lesson 标签回填 level/freq 索引', async () => {
  // 用独立库模拟旧版：v1 只有基础索引，写入两条旧格式词
  const legacy = new Dexie('tangochou-mig-test')
  legacy.version(1).stores({
    decks: '++id, name',
    words: '++id, deckId, term, lesson',
    progress: 'wordId, due, isNew',
    settings: 'key',
  })
  await legacy.open()
  await legacy.table('words').bulkAdd([
    { deckId: 1, term: '政党', reading: 'せいとう', meaning: '政党', pos: '', examples: [], audio: null,
      tags: ['egg::3-N3::N3低频'], lesson: 'egg::3-N3::N3低频', related: [] },
    { deckId: 1, term: '山', reading: 'やま', meaning: '山', pos: '', examples: [], audio: null,
      tags: ['egg::1-N5'], lesson: 'egg::1-N5', related: [] },
  ] as Word[])
  legacy.close()

  // 用新版类重开（触发 v2 upgrade 回填）
  const up = new TangoDB('tangochou-mig-test')
  await up.open()
  const all = await up.words.toArray()
  const seito = all.find((w) => w.term === '政党')!
  const yama = all.find((w) => w.term === '山')!
  expect(seito.level).toBe('N3')
  expect(seito.freq).toBe('低频')
  expect(yama.level).toBe('N5')
  expect(yama.freq).toBe('')
  // 级别索引可用：按 N3 筛选只命中政党
  const n3 = await candidateKeys({ level: 'N3', freq: 'all' }, up)
  expect(n3).toHaveLength(1)
  const teapai = await candidateKeys({ level: 'N3', freq: '低频' }, up)
  expect(teapai).toHaveLength(1)
  up.close()
  await Dexie.delete('tangochou-mig-test')
})
