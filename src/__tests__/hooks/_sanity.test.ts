import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useState } from 'react'

describe('test infra sanity check', () => {
  it('renderHook works with jsdom', () => {
    const { result } = renderHook(() => useState(0))
    act(() => result.current[1](1))
    expect(result.current[0]).toBe(1)
  })
})
