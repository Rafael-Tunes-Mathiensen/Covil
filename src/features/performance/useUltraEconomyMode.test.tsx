import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useUltraEconomyMode } from './useUltraEconomyMode'

describe('useUltraEconomyMode', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('ultra-economy')
  })

  afterEach(() => document.documentElement.classList.remove('ultra-economy'))

  it('persiste e aplica o modo de ultra economia na página inteira', () => {
    const { result } = renderHook(() => useUltraEconomyMode())

    act(() => result.current.toggle())

    expect(result.current.enabled).toBe(true)
    expect(localStorage.getItem('covil:ultra-economy')).toBe('true')
    expect(document.documentElement).toHaveClass('ultra-economy')
  })
})
