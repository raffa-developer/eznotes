import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type {
  NoteMeta,
  RecordingSnapshot,
  Schedule,
  SettingsStatus,
  UpcomingClass
} from '../../../shared/types'

export type ToastTone = 'info' | 'success' | 'warn' | 'error'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
}

interface AppContextValue {
  settings: SettingsStatus | null
  schedule: Schedule
  upcoming: UpcomingClass[]
  notes: NoteMeta[]
  recording: RecordingSnapshot | null
  level: number
  loading: boolean
  toasts: Toast[]
  nextClass: UpcomingClass | null
  refreshSettings: () => Promise<void>
  refreshSchedule: () => Promise<void>
  refreshNotes: () => Promise<void>
  refreshUpcoming: () => Promise<void>
  setRecording: (snapshot: RecordingSnapshot | null) => void
  toast: (message: string, tone?: ToastTone) => void
  dismissToast: (id: number) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<SettingsStatus | null>(null)
  const [schedule, setSchedule] = useState<Schedule>({ courses: [], slots: [] })
  const [upcoming, setUpcoming] = useState<UpcomingClass[]>([])
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [recording, setRecording] = useState<RecordingSnapshot | null>(null)
  const [level, setLevel] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(1)

  const refreshSettings = useCallback(async () => {
    const next = await window.aula.settings.get()
    setSettings(next)
  }, [])

  const refreshSchedule = useCallback(async () => {
    const next = await window.aula.schedule.get()
    setSchedule(next)
  }, [])

  const refreshNotes = useCallback(async () => {
    const next = await window.aula.notes.list()
    setNotes(next)
  }, [])

  const refreshUpcoming = useCallback(async () => {
    const next = await window.aula.schedule.upcoming()
    setUpcoming(next)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = toastId.current++
    setToasts((current) => [...current.slice(-3), { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, tone === 'error' ? 8000 : 5000)
  }, [])

  useEffect(() => {
    let mounted = true
    Promise.all([
      window.aula.settings.get(),
      window.aula.schedule.get(),
      window.aula.schedule.upcoming(),
      window.aula.notes.list(),
      window.aula.recording.state()
    ])
      .then(([nextSettings, nextSchedule, nextUpcoming, nextNotes, nextRecording]) => {
        if (!mounted) return
        setSettings(nextSettings)
        setSchedule(nextSchedule)
        setUpcoming(nextUpcoming)
        setNotes(nextNotes)
        setRecording(nextRecording)
      })
      .catch((error) => {
        toast(error instanceof Error ? error.message : String(error), 'error')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    const unsubscribe = window.aula.recording.onEvent((event) => {
      if (event.type === 'state') setRecording(event.snapshot)
      if (event.type === 'level') setLevel(event.level)
      if (event.type === 'notice') toast(event.message, event.level)
    })

    const interval = window.setInterval(() => {
      void window.aula.schedule.upcoming().then(setUpcoming)
    }, 60_000)

    return () => {
      mounted = false
      unsubscribe()
      window.clearInterval(interval)
    }
  }, [toast])

  useEffect(() => {
    if (!settings) return
    const theme = settings.settings.theme
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const apply = (): void => {
      const resolved = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme
      document.documentElement.dataset.theme = resolved
      document.documentElement.style.colorScheme = resolved
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings])

  const value = useMemo<AppContextValue>(
    () => ({
      settings,
      schedule,
      upcoming,
      notes,
      recording,
      level,
      loading,
      toasts,
      nextClass: upcoming[0] ?? null,
      refreshSettings,
      refreshSchedule,
      refreshNotes,
      refreshUpcoming,
      setRecording,
      toast,
      dismissToast
    }),
    [
      settings,
      schedule,
      upcoming,
      notes,
      recording,
      level,
      loading,
      toasts,
      refreshSettings,
      refreshSchedule,
      refreshNotes,
      refreshUpcoming,
      toast,
      dismissToast
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}
