import { describe, expect, it } from 'vitest'
import { parseIceServers } from './config'

describe('parseIceServers', () => {
  it('usa um STUN público quando a configuração não foi informada', () => {
    expect(parseIceServers()).toEqual([
      { urls: ['stun:stun.l.google.com:19302'] },
    ])
  })

  it('normaliza uma lista separada por vírgulas', () => {
    expect(parseIceServers('stun:a.example, turn:b.example ')).toEqual([
      { urls: ['stun:a.example', 'turn:b.example'] },
    ])
  })
})
