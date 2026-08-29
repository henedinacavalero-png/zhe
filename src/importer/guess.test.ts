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
