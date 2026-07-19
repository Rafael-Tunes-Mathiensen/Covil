import { describe, expect, it } from 'vitest'
import { getInitials, normalizeMessage } from './formatters'

describe('getInitials', () => {
  it('retorna até duas iniciais', () => {
    expect(getInitials('  Ana Maria Souza ')).toBe('AM')
  })
})

describe('normalizeMessage', () => {
  it('remove espaços repetidos e limita o conteúdo', () => {
    expect(normalizeMessage('  vamos   jogar?  ')).toBe('vamos jogar?')
    expect(normalizeMessage('a'.repeat(2_100))).toHaveLength(2_000)
  })
})
