import { db, getStreak, bumpStreak } from './db'
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
