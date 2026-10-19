import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import type { OpenDialogOptions } from 'electron'
import type {
  AppInfo,
  FinalizeRecordingInput,
  Schedule,
  SecretKey,
  Settings,
  StartRecordingInput,
  TestResult
} from '../shared/types'
import {
  clearSecret,
  getSecret,
  loadSettings,
  recordingsDir,
  setSecret,
  settingsStatus,
  updateSettings
} from './store'
import { loadSchedule, saveSchedule, upcomingClasses } from './schedule'
import {
  deleteNote,
  getNote,
  listNotes,
  removeNoteAudio,
  updateNoteMarkdown
} from './notes'
import { RecordingManager } from './recording'
import { generateNotes, testLlm } from './llm'
import { testGroqKey } from './stt'
import { demoMode } from './mock'

let mainWindow: BrowserWindow | null = null
let quitting = false
const recording = new RecordingManager((event) => {
  mainWindow?.webContents.send('recording:event', event)
})

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'aula',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
])

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1060,
    minHeight: 700,
    show: false,
    backgroundColor: '#0f1110',
    title: 'Aula',
    icon: path.join(__dirname, '../../resources/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('close', (event) => {
    if (quitting) return
    const state = recording.state()
    if (!state) return
    event.preventDefault()
    void dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Finish this recording first',
      message: 'Aula still has a recording open.',
      detail:
        'Stop the recording and choose what happens to the audio before closing the window.',
      buttons: ['OK']
    })
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: '/'
    })
  }
}

function registerIpc(): void {
  ipcMain.handle('app:info', (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    notesDir: loadSettings().notesDir,
    recordingsDir: recordingsDir(),
    demoMode
  }))

  ipcMain.handle('app:openExternal', async (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Invalid URL.')
    await shell.openExternal(url)
  })

  ipcMain.handle('settings:get', () => settingsStatus())
  ipcMain.handle('settings:update', (_event, patch: Partial<Settings>) =>
    settingsStatusFor(updateSettings(patch))
  )
  ipcMain.handle('settings:setSecret', (_event, key: SecretKey, value: string) => {
    setSecret(key, value)
    return settingsStatus()
  })
  ipcMain.handle('settings:clearSecret', (_event, key: SecretKey) => {
    clearSecret(key)
    return settingsStatus()
  })
  ipcMain.handle('settings:chooseNotesDir', async () => {
    const current = loadSettings()
    const options: OpenDialogOptions = {
      title: 'Choose where Aula saves your notes',
      defaultPath: current.notesDir,
      properties: ['openDirectory', 'createDirectory']
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    if (!result.canceled && result.filePaths[0]) {
      fs.mkdirSync(result.filePaths[0], { recursive: true })
      updateSettings({ notesDir: result.filePaths[0] })
    }
    return settingsStatus()
  })
  ipcMain.handle('settings:testLlm', async (): Promise<TestResult> => {
    const settings = loadSettings()
    const key = getSecret('llmApiKey')
    if (!key) return { ok: false, message: 'Add the OpenCode key first.' }
    return testLlm({
      apiKey: key,
      baseURL: settings.llm.baseURL,
      model: settings.llm.model,
      sessionId: `test_${Date.now()}`
    })
  })
  ipcMain.handle('settings:testStt', async (): Promise<TestResult> => {
    const key = getSecret('groqApiKey')
    if (!key) return { ok: false, message: 'Add the Groq key first.' }
    return testGroqKey(key)
  })

  ipcMain.handle('schedule:get', () => loadSchedule())
  ipcMain.handle('schedule:save', (_event, schedule: Schedule) =>
    saveSchedule(schedule)
  )
  ipcMain.handle('schedule:upcoming', () =>
    upcomingClasses(loadSchedule(), new Date(), 12)
  )

  ipcMain.handle('notes:list', () => listNotes(loadSettings().notesDir))
  ipcMain.handle('notes:get', (_event, id: string) =>
    getNote(loadSettings().notesDir, id)
  )
  ipcMain.handle('notes:delete', (_event, id: string) => {
    deleteNote(loadSettings().notesDir, id)
  })
  ipcMain.handle('notes:deleteAudio', (_event, id: string) => {
    const notesDir = loadSettings().notesDir
    removeNoteAudio(notesDir, id)
    return getNote(notesDir, id)
  })
  ipcMain.handle('notes:reveal', (_event, id: string) => {
    const note = getNote(loadSettings().notesDir, id)
    if (note) shell.showItemInFolder(note.path)
  })
  ipcMain.handle('notes:openFolder', async () => {
    await shell.openPath(loadSettings().notesDir)
  })
  ipcMain.handle('notes:regenerate', async (_event, id: string) => {
    const settings = loadSettings()
    const notesDir = settings.notesDir
    const note = getNote(notesDir, id)
    if (!note) throw new Error('Note not found.')
    const key = getSecret('llmApiKey')
    if (!key && !demoMode) throw new Error('Add the OpenCode key in Settings first.')
    if (!note.transcript.length) throw new Error('This note has no transcript to regenerate from.')

    const schedule = loadSchedule()
    const course = note.courseId
      ? schedule.courses.find((item) => item.id === note.courseId)
      : undefined
    const markdown = await generateNotes(
      {
        courseName: note.courseName,
        lecturer: course?.lecturer,
        date: new Date(note.date).toLocaleString('pt-PT', {
          dateStyle: 'long',
          timeStyle: 'short'
        }),
        durationSec: note.durationSec,
        glossary: course?.glossary ?? [],
        segments: note.transcript
      },
      {
        apiKey: key ?? 'demo',
        baseURL: settings.llm.baseURL,
        model: settings.llm.model,
        sessionId: `regen_${note.id}`,
        maxTokens: 7000
      }
    )
    updateNoteMarkdown(notesDir, id, markdown)
    const updated = getNote(notesDir, id)
    if (!updated) throw new Error('Could not reload the note.')
    return updated
  })

  ipcMain.handle('recording:start', (_event, input: StartRecordingInput) =>
    recording.start(input)
  )
  ipcMain.handle('recording:pause', () => recording.pause())
  ipcMain.handle('recording:resume', () => recording.resume())
  ipcMain.handle('recording:stop', () => recording.stop())
  ipcMain.handle('recording:finalize', (_event, input: FinalizeRecordingInput) =>
    recording.finalize(input)
  )
  ipcMain.handle('recording:discard', (_event, id: string) =>
    recording.discard(id)
  )
  ipcMain.handle('recording:state', () => recording.state())
  ipcMain.on('recording:audio', (_event, chunk: ArrayBuffer) => {
    recording.appendAudio(chunk)
  })
}

function settingsStatusFor(settings: Settings) {
  return {
    ...settingsStatus(),
    settings
  }
}

function registerAudioProtocol(): void {
  protocol.handle('aula', async (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== 'audio') {
        return new Response('Not found', { status: 404 })
      }
      const id = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (!/^rec_[A-Za-z0-9_-]+$/.test(id)) {
        return new Response('Invalid recording id', { status: 400 })
      }
      const file = path.join(recordingsDir(), id, 'audio.wav')
      if (!fs.existsSync(file)) {
        return new Response('Recording not found', { status: 404 })
      }

      const size = fs.statSync(file).size
      const range = request.headers.get('range')
      let start = 0
      let end = size - 1
      let status = 200

      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (match) {
          start = match[1] ? Number(match[1]) : 0
          end = match[2] ? Number(match[2]) : size - 1
          if (start >= size || end < start) {
            return new Response('Range not satisfiable', {
              status: 416,
              headers: { 'content-range': `bytes */${size}` }
            })
          }
          end = Math.min(end, size - 1)
          status = 206
        }
      }

      const headers: Record<string, string> = {
        'content-type': 'audio/wav',
        'accept-ranges': 'bytes',
        'content-length': String(end - start + 1),
        'cache-control': 'no-store'
      }
      if (status === 206) {
        headers['content-range'] = `bytes ${start}-${end}/${size}`
      }
      if (request.method === 'HEAD') {
        return new Response(null, { status, headers })
      }

      const stream = fs.createReadStream(file, { start, end })
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status,
        headers
      })
    } catch {
      return new Response('Could not read recording', { status: 500 })
    }
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('app.aula.notes')
    Menu.setApplicationMenu(null)
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, permission, callback) => {
        callback(permission === 'media')
      }
    )
    session.defaultSession.setPermissionCheckHandler(
      (_webContents, permission) => permission === 'media'
    )
    loadSettings()
    registerIpc()
    registerAudioProtocol()
    createWindow()

    const removed = recording.cleanupExpiredRecordings()
    if (removed.length) {
      console.log(`[aula] removed ${removed.length} expired recording(s)`)
    }
    setInterval(() => recording.cleanupExpiredRecordings(), 6 * 60 * 60 * 1000)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', (event) => {
    if (quitting) return
    const state = recording.state()
    if (!state || !['recording', 'paused', 'processing'].includes(state.status)) return

    event.preventDefault()
    const options = {
      type: 'warning' as const,
      title: 'Aula is still recording',
      message: 'A lecture is in progress.',
      detail:
        'If you quit now, the current audio stays on disk but will not be turned into a note.',
      buttons: ['Keep running', 'Quit anyway'],
      defaultId: 0,
      cancelId: 0
    }
    const show = mainWindow
      ? dialog.showMessageBox(mainWindow, options)
      : dialog.showMessageBox(options)
    void show.then((result) => {
      if (result.response === 1) {
        quitting = true
        app.quit()
      }
    })
  })
}
