import { expect, test } from 'vitest'
import { guessMapping } from './guess'

test('按内容特征自动映射：单词/读音/释义/例句', () => {
  const fieldNames = ['Front', 'よみ', 'Back', '例文']
  const sample = [
    ['食べる', 'たべる', '吃', '朝ごはんを食べる。'],
    ['飲む', 'のむ', '喝', 'コーヒーを飲む。'],
    ['山', 'やま', '山', '山に登る。'],
  ]
  expect(guessMapping(fieldNames, sample)).toEqual({ term: 0, reading: 1, meaning: 2, example: 3 })
})

test('没有例句列时 example 为 null；无假名列时 reading 为 null', () => {
  const sample = [['食べる', '吃'], ['飲む', '喝']]
  expect(guessMapping(['単語', '意味'], sample)).toEqual({ term: 0, reading: null, meaning: 1, example: null })
})

test('片假名读音列被识别（外来语）', () => {
  // 全片假名读音列：reading=0 是核心断言；term 落点以 guessMapping 实际输出为准——
  // 「苹果」含汉字故 term 猜为 1，candidates 中只剩该列，meaning 也落到 1（与 term 同列，见 guess.ts 收尾逻辑）
  const sample = [['リンゴ', '苹果'], ['ペン', '笔']]
  expect(guessMapping(['よみ', '意味'], sample)).toEqual({ term: 1, reading: 0, meaning: 1, example: null })
})

test('例句尾部带 [sound:] 音频标签时仍被识别为例句', () => {
  const sample = [['食べる', '吃', '朝ごはんを食べる。[sound:ex1.mp3]'], ['飲む', '喝', 'コーヒーを飲む。[sound:ex2.mp3]']]
  expect(guessMapping(['単語', '意味', '例文'], sample)).toEqual({ term: 0, reading: null, meaning: 1, example: 2 })
})

test('含中文（有汉字无假名）的列优先判定为释义，数字编号列不被选为释义', () => {
  // 模拟真实 JLPT 牌组：NoteID 数字列在前，VocabKanji 混合列为单词，VocabDefSC 纯中文释义
  const fieldNames = ['NoteID', 'VocabKanji', 'VocabFurigana', 'VocabDefSC', 'SentKanji1']
  const sample = [
    ['12345', '食べる', 'たべる', '吃；进食', '朝ごはんを食べる。[sound:s1.mp3]'],
    ['12346', '飲む', 'のむ', '喝', 'コーヒーを飲む。[sound:s2.mp3]'],
  ]
  expect(guessMapping(fieldNames, sample)).toEqual({ term: 1, reading: 2, meaning: 3, example: 4 })
})
