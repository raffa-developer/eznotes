import { useSyncExternalStore } from 'react'

let currentLevel = 0
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

/**
 * Microphone levels arrive several times per second. Keep them out of the
 * app-wide context so only the meter components subscribe to these updates.
 */
export function setAudioLevel(level: number): void {
  const next = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0
  if (Math.abs(next - currentLevel) < 0.002) return
  currentLevel = next
  emit()
}

export function resetAudioLevel(): void {
  if (currentLevel === 0) return
  currentLevel = 0
  emit()
}

export function getAudioLevel(): number {
  return currentLevel
}

export function subscribeToAudioLevel(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAudioLevel(): number {
  return useSyncExternalStore(
    subscribeToAudioLevel,
    getAudioLevel,
    getAudioLevel
  )
}
