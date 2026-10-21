import type { Schedule, UpcomingClass } from '../shared/types'
import { upcomingClasses } from './schedule'

export const AUTO_START_GRACE_MS = 2 * 60 * 1000

/**
 * The class that should start recording now: it must have started no earlier
 * than `earliestStartMs`, no more than `graceMs` ago, and not have ended yet.
 */
export function dueClass(
  schedule: Schedule,
  now: Date,
  earliestStartMs: number,
  graceMs = AUTO_START_GRACE_MS
): UpcomingClass | null {
  const nowMs = now.getTime()

  for (const item of upcomingClasses(schedule, now, 24)) {
    const startsAt = new Date(item.startsAt).getTime()
    const endsAt = new Date(item.endsAt).getTime()
    if (startsAt < earliestStartMs) continue
    if (nowMs < startsAt) continue
    if (nowMs - startsAt > graceMs) continue
    if (nowMs >= endsAt) continue
    return item
  }

  return null
}

/** The class that is in progress right now, if any. */
export function currentClass(
  schedule: Schedule,
  now: Date
): UpcomingClass | null {
  return upcomingClasses(schedule, now, 12).find((item) => item.isNow) ?? null
}

/** The next class that starts within `minutes` from now, if any. */
export function dueSoonClass(
  schedule: Schedule,
  now: Date,
  minutes: number
): UpcomingClass | null {
  if (minutes <= 0) return null

  const nowMs = now.getTime()
  const windowMs = minutes * 60_000
  for (const item of upcomingClasses(schedule, now, 24)) {
    const startsAt = new Date(item.startsAt).getTime()
    if (startsAt > nowMs && startsAt - nowMs <= windowMs) return item
  }

  return null
}
