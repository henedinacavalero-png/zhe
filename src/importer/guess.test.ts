import { expect, test } from 'vitest'
import { guessMapping } from './guess'

test('按内容特征自动映射：单词/读音/释义/例句', () => {
  const fieldNames = ['Front', 'よみ', 'Back', '例文']
  const sample = [
    ['食べる', 'たべる', '吃', '朝ごはんを食べる。'],
    ['飲む', 'のむ', '喝', 'コーヒーを飲む。'],
    ['山', 'やま', '山', '山に登る。'],
  ]
  expect(guessMapping(fieldNames, sample)).toEqual({ term: 0, reading: 1, meaning: 2, example: 3, exampleZh: null })
})

test('没有例句列时 example 为 null；无假名列时 reading 为 null', () => {
  const sample = [['食べる', '吃'], ['飲む', '喝']]
  expect(guessMapping(['単語', '意味'], sample)).toEqual({ term: 0, reading: null, meaning: 1, example: null, exampleZh: null })
})

test('片假名读音列被识别（外来语）', () => {
  // 全片假名读音列：reading=0 是核心断言；term 落点以 guessMapping 实际输出为准——
  // 「苹果」含汉字故 term 猜为 1，candidates 中只剩该列，meaning 也落到 1（与 term 同列，见 guess.ts 收尾逻辑）
  const sample = [['リンゴ', '苹果'], ['ペン', '笔']]
  expect(guessMapping(['よみ', '意味'], sample)).toEqual({ term: 1, reading: 0, meaning: 1, example: null, exampleZh: null })
})

test('例句尾部带 [sound:] 音频标签时仍被识别为例句', () => {
  const sample = [['食べる', '吃', '朝ごはんを食べる。[sound:ex1.mp3]'], ['飲む', '喝', 'コーヒーを飲む。[sound:ex2.mp3]']]
  expect(guessMapping(['単語', '意味', '例文'], sample)).toEqual({ term: 0, reading: null, meaning: 1, example: 2, exampleZh: null })
})

test('含中文（有汉字无假名）的列优先判定为释义，数字编号列不被选为释义', () => {
  // 模拟真实 JLPT 牌组：NoteID 数字列在前，VocabKanji 混合列为单词，VocabDefSC 纯中文释义
  const fieldNames = ['NoteID', 'VocabKanji', 'VocabFurigana', 'VocabDefSC', 'SentKanji1']
  const sample = [
    ['12345', '食べる', 'たべる', '吃；进食', '朝ごはんを食べる。[sound:s1.mp3]'],
    ['12346', '飲む', 'のむ', '喝', 'コーヒーを飲む。[sound:s2.mp3]'],
  ]
  expect(guessMapping(fieldNames, sample)).toEqual({ term: 1, reading: 2, meaning: 3, example: 4, exampleZh: null })
})

test('完整例句组：例句列之后的第一个中文列判为例句翻译', () => {
  const fieldNames = ['単語', 'よみ', '意味', '例文', '例文译']
  const sample = [
    ['食べる', 'たべる', '吃', '朝ごはんを食べる。', '吃早饭'],
    ['飲む', 'のむ', '喝', 'コーヒーを飲む。', '喝咖啡'],
    ['山', 'やま', '山', '山に登る。', '爬山'],
  ]
  expect(guessMapping(fieldNames, sample)).toEqual({ term: 0, reading: 1, meaning: 2, example: 3, exampleZh: 4 })
})

test('真实 JLPT 牌组形态：无句号例句列、少量外语转写读音、稀疏补充列', () => {
  // 复刻 egg_rolls 牌组特征：SentKanji1 无句号结尾；VocabFurigana 混有 〜与外语转写（92% 纯假名）；
  // VocabPlus 稀疏（12% 非空）不得抢走例句列；VocabPoS 含假名（ナ形）不干扰中文释义判定
  const fieldNames = ['NoteID', 'VocabKanji', 'VocabPitch', 'VocabPoS', 'VocabFurigana', 'VocabDefSC', 'VocabPlus', 'SentKanji1']
  const sample = [
    ['1', 'なす', '0', '名', 'なす', '茄子', '', '麻婆茄子'],
    ['2', '高校', '0', '名', 'こうこう', '高中', '', '妹は高校に通っています'],
    ['3', '丸', '0', '名', 'まる', '圆，圆形；句号', '', '答えに丸をつける'],
    ['4', '付き合う', '', '動', 'つきあう', '交往；兼职', '補足説明が入る場合があります', '彼女と付き合っている'],
    ['5', '間', '0', '名', 'かん', '间，期间', '', 'その間に彼はいなくなっていました'],
    ['6', '〜やすい', '', '接尾', '〜やすい', '容易～', '', 'このペンは書きやすい'],
    ['7', 'kilogram', '', '名', '(フ) kilogramme', '千克（公制）', '', '体重をキログラムで測る'],
    ['8', 'とかす', '', '動', 'とかす', '梳（头发）', '', '髪をとかす'],
    ['9', '昭和', '0', '名', 'しょうわ', '（日本年号）昭和', '', '昭和初期の風俗'],
    ['10', '党', '0', '名', 'とう', '党羽，同伙；政党', '', '野党を批判する'],
  ]
  expect(guessMapping(fieldNames, sample)).toEqual({ term: 1, reading: 4, meaning: 5, example: 7, exampleZh: null })
})
