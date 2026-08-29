import { describe, expect, test } from 'vitest'
import { alignFurigana } from './furigana'

describe('alignFurigana 读音-汉字对齐（组级 ruby）', () => {
  test('汉字串整段注音：政党/せいとう', () => {
    expect(alignFurigana('政党', 'せいとう')).toEqual([
      { text: '政党', rt: 'せいとう' },
    ])
  })

  test('单汉字 + 后缀假名：食べる/たべる → 食(た) + べる', () => {
    expect(alignFurigana('食べる', 'たべる')).toEqual([
      { text: '食', rt: 'た' }, { text: 'べる' },
    ])
  })

  test('前缀假名直接对齐：お茶/おちゃ → お + 茶(ちゃ)', () => {
    expect(alignFurigana('お茶', 'おちゃ')).toEqual([
      { text: 'お' }, { text: '茶', rt: 'ちゃ' },
    ])
  })

  test('中段含假名的汉字串：持ち込む/もちこむ → 持ち込(もちこ) + む', () => {
    expect(alignFurigana('持ち込む', 'もちこむ')).toEqual([
      { text: '持ち込', rt: 'もちこ' }, { text: 'む' },
    ])
  })

  test('不规则读音安全：今日/きょう 整段标注，不逐字错分', () => {
    expect(alignFurigana('今日', 'きょう')).toEqual([
      { text: '今日', rt: 'きょう' },
    ])
  })

  test('无汉字或无读音：不加注音', () => {
    expect(alignFurigana('なす', 'なす')).toEqual([{ text: 'なす' }])
    expect(alignFurigana('政党', '')).toEqual([{ text: '政党' }])
    expect(alignFurigana('政党', '   ')).toEqual([{ text: '政党' }])
  })
})
