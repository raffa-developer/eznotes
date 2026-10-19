/// <reference types="vite/client" />

import type { AulaApi } from '../../shared/types'

declare global {
  interface Window {
    aula: AulaApi
  }
}

export {}
