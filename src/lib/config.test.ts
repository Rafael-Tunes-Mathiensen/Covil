import { describe, expect, it } from 'vitest'
import { parseIceServers } from './config'

describe('parseIceServers', () => {
  it('usa um STUN publico quando a configuracao nao foi informada', () => {
    expect(parseIceServers()).toEqual([
      { urls: ['stun:stun.l.google.com:19302'] },
    ])
  })

  it('normaliza uma lista separada por virgulas', () => {
    expect(parseIceServers('stun:a.example, turn:b.example ')).toEqual([
      { urls: ['stun:a.example', 'turn:b.example'] },
    ])
  })

  it('preserva credenciais TURN quando recebe uma lista JSON', () => {
    expect(
      parseIceServers(
        JSON.stringify([
          { urls: ['stun:a.example'] },
          {
            urls: 'turn:b.example',
            username: 'covil',
            credential: 'segredo-temporario',
          },
        ]),
      ),
    ).toEqual([
      { urls: ['stun:a.example'] },
      {
        urls: 'turn:b.example',
        username: 'covil',
        credential: 'segredo-temporario',
      },
    ])
  })

  it('volta ao STUN publico quando o JSON e invalido', () => {
    expect(parseIceServers('[{"urls":')).toEqual([
      { urls: ['stun:stun.l.google.com:19302'] },
    ])
  })
})
