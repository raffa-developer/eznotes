/// <reference types="vite/client" />

import type { EzNotesApi } from '../../shared/types'

declare global {
  interface Window {
    ezNotes: EzNotesApi
  }
}

export {}
