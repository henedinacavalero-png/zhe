import { describe, expect, test } from 'vitest'
import { parseLevel } from './level'

describe('parseLevel 从课/标签解析 JLPT 级别与频率', () => {
  test('egg_rolls 牌组的标签格式', () => {
    expect(parseLevel('eggrolls-JLPT10k-v3.5::3-N3::N3低频')).toEqual({ level: 'N3', freq: '低频' })
    expect(parseLevel('eggrolls-JLPT10k-v3.5::1-N5')).toEqual({ level: 'N5', freq: null })
    expect(parseLevel('eggrolls-JLPT10k-v3.5::5-N1::N1中频')).toEqual({ level: 'N1', freq: '中频' })
  })

  test('解析失败返回 null（无标签/其他牌组）', () => {
    expect(parseLevel('')).toEqual(null)
    expect(parseLevel('教材::みんな')).toEqual(null)
    expect(parseLevel('JLPT')).toEqual(null)
  })
})
