import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAudioLevel,
  resetAudioLevel,
  setAudioLevel,
  subscribeToAudioLevel
} from './audioLevel'

describe('audio level store', () => {
  beforeEach(() => {
    resetAudioLevel()
  })

  it('clamps levels into the meter range', () => {
    setAudioLevel(0.42)
    expect(getAudioLevel()).toBe(0.42)
    setAudioLevel(4)
    expect(getAudioLevel()).toBe(1)
    setAudioLevel(-1)
    expect(getAudioLevel()).toBe(0)
    setAudioLevel(Number.NaN)
    expect(getAudioLevel()).toBe(0)
  })

  it('notifies subscribers only for meaningful changes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToAudioLevel(listener)

    setAudioLevel(0.2)
    setAudioLevel(0.201)
    setAudioLevel(0.5)
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    setAudioLevel(0.8)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('resets to silence once', () => {
    const listener = vi.fn()
    subscribeToAudioLevel(listener)
    setAudioLevel(0.6)
    resetAudioLevel()
    resetAudioLevel()
    expect(getAudioLevel()).toBe(0)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
