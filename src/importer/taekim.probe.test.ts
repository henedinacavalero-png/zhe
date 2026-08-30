import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseApkg } from './apkg'
import { guessMapping } from '../importer/guess'
import { buildWords } from './runImport'

const REAL = 'D:/浏览器下载/Japanese_course_based_on_Tae_Kims_grammar_guide__anime.apkg'

test('探针：Tae Kim 牌组在线上代码下的真实映射与词条', async () => {
  const file = new Blob([readFileSync(REAL)])
  const raw = await parseApkg(file, { media: false })
  const model = raw.models[0]
  const names = model.fieldNames
  const notes = raw.notes.filter((n) => n.mid === model.id)
  const g = guessMapping(names, notes.slice(0, 30).map((n) => n.fields))
  const pick = (i: number | null) => (i === null ? null : names[i] ?? '(越界)')
  console.log('models[0] =', model.name, '| 六列:', JSON.stringify({
    term: pick(g.term), reading: pick(g.reading), meaning: pick(g.meaning),
    example: pick(g.example), exampleZh: pick(g.exampleZh), exampleRt: pick(g.exampleRt),
  }))
  const { words } = buildWords(notes, g, 1)
  const sm = words.find((w) => w.term === 'すみません')
  console.log('すみません 词条:', JSON.stringify({
    meaning: sm?.meaning, reading: sm?.reading, hasImages: !!sm?.images && Object.keys(sm.images).length,
  }))
  expect(sm).toBeTruthy()
}, 300_000)
