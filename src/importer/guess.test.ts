import { expect, test } from 'vitest'
import { guessMapping } from './guess'

test('按内容特征自动映射：单词/读音/释义/例句', () => {
  const fieldNames = ['Front', 'よみ', 'Back', '例文']
  const sample = [
    ['食べる', 'たべる', '吃', '朝ごはんを食べる。'],
    ['飲む', 'のむ', '喝', 'コーヒーを飲む。'],
    ['山', 'やま', '山', '山に登る。'],
  ]
  expect(guessMapping(fieldNames, sample)).toEqual({ term: 0, reading: 1, meaning: 2, example: 3, exampleZh: null, exampleRt: null })
})

test('没有例句列时 example 为 null；无假名列时 reading 为 null', () => {
  const sample = [['食べる', '吃'], ['飲む', '喝']]
  expect(guessMapping(['単語', '意味'], sample)).toEqual({ term: 0, reading: null, meaning: 1, example: null, exampleZh: null, exampleRt: null })
})

test('片假名读音列被识别（外来语）', () => {
  const sample = [['リンゴ', '苹果'], ['ペン', '笔']]
  expect(guessMapping(['よみ', '意味'], sample)).toEqual({ term: 1, reading: 0, meaning: 1, example: null, exampleZh: null, exampleRt: null })
})

test('例句尾部带 [sound:] 音频标签时仍被识别为例句', () => {
  const sample = [['食べる', '吃', '朝ごはんを食べる。[sound:ex1.mp3]'], ['飲む', '喝', 'コーヒーを飲む。[sound:ex2.mp3]']]
  expect(guessMapping(['単語', '意味', '例文'], sample)).toEqual({ term: 0, reading: null, meaning: 1, example: 2, exampleZh: null, exampleRt: null })
})

test('含中文（有汉字无假名）的列优先判定为释义，数字编号列不被选为释义', () => {
  const fieldNames = ['NoteID', 'VocabKanji', 'VocabFurigana', 'VocabDefSC', 'SentKanji1']
  const sample = [
    ['12345', '食べる', 'たべる', '吃；进食', '朝ごはんを食べる。[sound:s1.mp3]'],
    ['12346', '飲む', 'のむ', '喝', 'コーヒーを飲む。[sound:s2.mp3]'],
  ]
  expect(guessMapping(fieldNames, sample)).toEqual({ term: 1, reading: 2, meaning: 3, example: 4, exampleZh: null, exampleRt: null })
})

test('完整例句组：例句之后的中文列是例句翻译、长假名列是例句注音', () => {
  const fieldNames = ['単語', 'よみ', '意味', '例文', '例文注音', '例文译']
  const sample = [
    ['食べる', 'たべる', '吃', '朝ごはんを食べる。', 'あさごはんをたべる', '吃早饭'],
    ['飲む', 'のむ', '喝', 'コーヒーを飲む。', 'コーヒーをのむ', '喝咖啡'],
    ['山', 'やま', '山', '山に登る。', 'やまにのぼる', '爬山'],
  ]
  expect(guessMapping(fieldNames, sample)).toEqual({ term: 0, reading: 1, meaning: 2, example: 3, exampleRt: 4, exampleZh: 5 })
})

test('真实 JLPT 牌组形态：无句号例句列、少量外语转写读音、稀疏补充列', () => {
  // 复刻 egg_rolls 牌组：SentKanji1 无句号；SentFurigana1 整句假名；SentDefSC1 中文翻译；
  // VocabFurigana 92% 纯假名；VocabPlus 稀疏；VocabPoS 含假名不干扰中文判定
  const fieldNames = ['NoteID', 'VocabKanji', 'VocabPitch', 'VocabPoS', 'VocabFurigana', 'VocabDefSC', 'VocabPlus', 'SentKanji1', 'SentFurigana1', 'SentDefSC1']
  const sample = [
    ['1', 'なす', '0', '名', 'なす', '茄子', '', '妹は高校に通っています', 'いもうとはこうこうにつうっています', '妹妹在上高中'],
    ['2', '高校', '0', '名', 'こうこう', '高中', '', '答えに丸をつける', 'こたえにまるをつける', '在答案上画圈'],
    ['3', '丸', '0', '名', 'まる', '圆，圆形；句号', '', 'その間に彼はいなくなっていました', 'そのあいだにかれはいなくなっていました', '在那期间他不见了'],
    ['4', '付き合う', '', '動', 'つきあう', '交往；兼职', '', '彼女と付き合っている', 'かのじょとつきあっている', '和她交往着'],
    ['5', '間', '0', '名', 'かん', '间，期间', '', ' Export a', 'エクスポート', '导出'],
    ['6', '〜やすい', '', '接尾', '〜やすい', '容易～', '', 'このペンは書きやすい', 'このペンはかきやすい', '这支笔好写'],
    ['7', 'kilogram', '', '名', '(フ) kilogramme', '千克（公制）', '', '体重を測る', 'たいじゅうをはかる', '量体重'],
    ['8', 'とかす', '', '動', 'とかす', '梳（头发）', '', '髪をとかす', 'かみをとかす', '梳头发'],
    ['9', '昭和', '0', '名', 'しょうわ', '（日本年号）昭和', '', '昭和初期の風俗', 'しょうわしょきのふうぞく', '昭和初期的风俗'],
    ['10', '党', '0', '名', 'とう', '党羽，同伙；政党', '', '野党を批判する', 'やとうをひはんする', '批评在野党'],
  ]
  expect(guessMapping(fieldNames, sample)).toEqual({
    term: 1, reading: 4, meaning: 5, example: 7, exampleRt: 8, exampleZh: 9,
  })
})

test('文法卡组形态：常量书名列与 GUID 列不得当选，Word/Explain/Example 正确识别', () => {
  // 复刻蓝宝书文法卡组：Level 列全是"蓝宝书【N1】"常量，Note ID 全是 GUID，字段超多（只列关键列）
  const fieldNames = ['Note ID', 'Link', 'Level', 'Word', 'Explain1', 'Example1', 'Chinese1', 'SubOrder']
  const sample = [
    ['d2fa5318-9630-11ef-bb6c-4c5f70aa778c', 'bluebook_link-6', '蓝宝书【N1】', '～あっての', '表示条件，"正因为有了A，才有B的存在"。', '山田監督は私の恩人です。今の私があるのも監督あってのことです', '山田教练是我的恩人。', '6'],
    ['d2fac831-9630-11ef-b59e-4c5f70aa778c', 'bluebook_link-7', '蓝宝书【N1】', '～以外の何ものでもない', '表示强调，"不是别的，正是……"。', '彼女を悩ませているのは仕事のストレス以外のなにものでもない。', '使她烦恼的正是工作压力。', '7'],
    ['d2faf08a-9630-11ef-bf6c-4c5f70aa778c', 'bluebook_link-1002', '蓝宝书【N2】', '～いかんで', '表示根据，"取决于……"。', '出席状況のいかんでは、停止することもある。', '根据出席情况，有可能停止。', '1002'],
  ]
  expect(guessMapping(fieldNames, sample)).toEqual({
    term: 3, reading: null, meaning: 4, example: 5, exampleZh: 6, exampleRt: null,
  })
})
