import { describe, expect, test } from 'vitest'
import { alignFurigana, alignSentenceReading, isBracketFurigana, parseBracketFurigana } from './furigana'

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

  test('例句整句对齐：假名锚点切分读音，夹段归汉字', () => {
    // 真实数据：SentKanji1 / SentFurigana1
    expect(alignSentenceReading('妹は高校に通っています', 'いもうとはこうこうにつうっています')).toEqual([
      { text: '妹', rt: 'いもうと' }, { text: 'は' }, { text: '高校', rt: 'こうこう' },
      { text: 'に' }, { text: '通', rt: 'つう' }, { text: 'っています' },
    ])
  })

  test('例句对齐：锚点找不到时该汉字段无注音，后续照常', () => {
    // 送り仮名不一致（通わなくて）导致 って 锚点失败：通 段无注音，て 以後照常
    expect(alignSentenceReading('妹は通っています', 'いもうとはつうじています')).toEqual([
      { text: '妹', rt: 'いもうと' }, { text: 'は' }, { text: '通' }, { text: 'っています' },
    ])
  })

  test('例句对齐：无读音或纯假名句子原样返回', () => {
    expect(alignSentenceReading('妹は高校に通っています', '')).toEqual([{ text: '妹は高校に通っています' }])
    expect(alignSentenceReading('谢谢你', 'ありがとう')).toEqual([{ text: '谢谢你' }])
  })

  test('Anki 汉字[かな]格式检测与解析：<b> 高亮转 mark', () => {
    const rt = '妹[いもうと]は<b> 高校[こうこう]</b>に 通[かよ]っています'
    expect(isBracketFurigana(rt)).toBe(true)
    expect(isBracketFurigana('いもうとはこうこうにつうっています')).toBe(false)
    expect(parseBracketFurigana(rt)).toEqual([
      { text: '妹', rt: 'いもうと' }, { text: 'は' },
      { text: ' ', mark: true }, { text: '高校', rt: 'こうこう', mark: true },
      { text: 'に ' }, { text: '通', rt: 'かよ' }, { text: 'っています' },
    ])
  })
})
