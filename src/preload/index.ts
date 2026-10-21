import { contextBridge, ipcRenderer } from 'electron'
import type {
  EzNotesApi,
  FinalizeRecordingInput,
  NoteExportFormat,
  RecordingEvent,
  Schedule,
  SecretKey,
  Settings,
  StartRecordingInput
} from '../shared/types'

const api: EzNotesApi = {
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
    openMainWindow: () => ipcRenderer.invoke('app:openMainWindow'),
    openNote: (id: string) => ipcRenderer.invoke('app:openNote', id),
    hideIsland: () => ipcRenderer.invoke('app:hideIsland'),
    setIslandExpanded: (expanded: boolean, height?: number) =>
      ipcRenderer.invoke('app:setIslandExpanded', expanded, height),
    onOpenNote: (callback: (noteId: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, noteId: string) =>
        callback(noteId)
      ipcRenderer.on('app:openNote', listener)
      return () => ipcRenderer.removeListener('app:openNote', listener)
    },
    onOpenLive: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('app:openLive', listener)
      return () => ipcRenderer.removeListener('app:openLive', listener)
    }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<Settings>) => ipcRenderer.invoke('settings:update', patch),
    setSecret: (key: SecretKey, value: string) =>
      ipcRenderer.invoke('settings:setSecret', key, value),
    clearSecret: (key: SecretKey) => ipcRenderer.invoke('settings:clearSecret', key),
    chooseNotesDir: () => ipcRenderer.invoke('settings:chooseNotesDir'),
    chooseObsidianVault: () => ipcRenderer.invoke('settings:chooseObsidianVault'),
    testLlm: () => ipcRenderer.invoke('settings:testLlm'),
    testStt: () => ipcRenderer.invoke('settings:testStt'),
    downloadDiarizationModels: () =>
      ipcRenderer.invoke('settings:downloadDiarizationModels')
  },
  schedule: {
    get: () => ipcRenderer.invoke('schedule:get'),
    save: (schedule: Schedule) => ipcRenderer.invoke('schedule:save', schedule),
    upcoming: () => ipcRenderer.invoke('schedule:upcoming')
  },
  notes: {
    list: () => ipcRenderer.invoke('notes:list'),
    get: (id: string) => ipcRenderer.invoke('notes:get', id),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
    deleteAudio: (id: string) => ipcRenderer.invoke('notes:deleteAudio', id),
    copy: (id: string) => ipcRenderer.invoke('notes:copy', id),
    export: (id: string, format: NoteExportFormat) =>
      ipcRenderer.invoke('notes:export', id, format),
    reveal: (id: string) => ipcRenderer.invoke('notes:reveal', id),
    openFolder: () => ipcRenderer.invoke('notes:openFolder'),
    regenerate: (id: string) => ipcRenderer.invoke('notes:regenerate', id)
  },
  recording: {
    start: (input: StartRecordingInput) => ipcRenderer.invoke('recording:start', input),
    pause: () => ipcRenderer.invoke('recording:pause'),
    resume: () => ipcRenderer.invoke('recording:resume'),
    stop: () => ipcRenderer.invoke('recording:stop'),
    finalize: (input: FinalizeRecordingInput) =>
      ipcRenderer.invoke('recording:finalize', input),
    discard: (id: string) => ipcRenderer.invoke('recording:discard', id),
    state: () => ipcRenderer.invoke('recording:state'),
    live: () => ipcRenderer.invoke('recording:live'),
    recoverable: () => ipcRenderer.invoke('recording:recoverable'),
    recover: (id: string) => ipcRenderer.invoke('recording:recover', id),
    sendAudio: (chunk: ArrayBuffer) => ipcRenderer.send('recording:audio', chunk),
    saveWebm: (id: string, data: ArrayBuffer) =>
      ipcRenderer.send('recording:webm', id, data),
    onEvent: (callback: (event: RecordingEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: RecordingEvent) =>
        callback(payload)
      ipcRenderer.on('recording:event', listener)
      return () => ipcRenderer.removeListener('recording:event', listener)
    }
  }
}

contextBridge.exposeInMainWorld('ezNotes', api)
