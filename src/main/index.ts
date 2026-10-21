import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  protocol,
  screen,
  session,
  shell,
  Tray
} from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import type { MenuItemConstructorOptions, OpenDialogOptions } from 'electron'
import type {
  AppInfo,
  FinalizeRecordingInput,
  NoteExportFormat,
  NoteExportResult,
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
  sanitizeFilename,
  updateNoteMarkdown
} from './notes'
import { RecordingManager } from './recording'
import { generateNotes, testLlm } from './llm'
import { testGroqKey } from './stt'
import { downloadDiarizationModels } from './diarization'
import { demoMode } from './mock'
import { migrateUserData } from './migrate'
import { dueClass, dueSoonClass, currentClass } from './autoStart'
import { log } from './log'
import { mainText } from './uiText'

migrateUserData()

let mainWindow: BrowserWindow | null = null
let islandWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
const ISLAND_WIDTH = 360
const ISLAND_COLLAPSED = { width: ISLAND_WIDTH, height: 54 }
const ISLAND_EXPANDED = { width: ISLAND_WIDTH, height: 246 }

const recording = new RecordingManager((event) => {
  mainWindow?.webContents.send('recording:event', event)
  islandWindow?.webContents.send('recording:event', event)
  if (event.type === 'state') updateTrayMenu()
  if (
    event.type === 'state' &&
    event.snapshot &&
    mainWindow &&
    !mainWindow.isFocused() &&
    ['recording', 'paused', 'processing', 'stopped', 'error'].includes(
      event.snapshot.status
    )
  ) {
    showIsland()
  }
})

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'eznotes',
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
    title: 'ezNotes',
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
    islandWindow?.close()
    islandWindow = null
    mainWindow = null
  })

  mainWindow.on('minimize', () => {
    if (recording.state()) showIsland()
  })

  mainWindow.on('blur', () => {
    if (recording.state()) showIsland()
  })

  mainWindow.on('focus', () => {
    hideIsland()
  })

  mainWindow.on('restore', () => {
    hideIsland()
  })

  mainWindow.on('show', () => {
    hideIsland()
  })

  mainWindow.on('close', (event) => {
    if (quitting) return
    const state = recording.state()
    if (!state) return
    event.preventDefault()
    const language = loadSettings().uiLanguage
    void dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: mainText(language, 'Finish this recording first'),
      message: mainText(language, 'ezNotes still has a recording open.'),
      detail: mainText(
        language,
        'Stop the recording and choose what happens to the audio before closing the window.'
      ),
      buttons: [mainText(language, 'OK')]
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

function islandUrl(): string {
  const base = process.env['ELECTRON_RENDERER_URL']
  if (base) return `${base}#/island`
  return `${pathToFileURL(path.join(__dirname, '../renderer/index.html')).toString()}#/island`
}

function createIslandWindow(): BrowserWindow {
  if (islandWindow) return islandWindow

  islandWindow = new BrowserWindow({
    width: ISLAND_COLLAPSED.width,
    height: ISLAND_COLLAPSED.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: process.platform === 'darwin',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  islandWindow.setAlwaysOnTop(true, 'floating')
  islandWindow.setMenuBarVisibility(false)
  islandWindow.loadURL(islandUrl())
  islandWindow.once('ready-to-show', () => {
    if (!islandWindow) return
    positionIsland()
    islandWindow.showInactive()
  })
  islandWindow.on('closed', () => {
    islandWindow = null
  })

  return islandWindow
}

function positionIsland(): void {
  if (!islandWindow) return
  const [width, height] = islandWindow.getSize()
  const display =
    mainWindow && !mainWindow.isMinimized()
      ? screen.getDisplayMatching(mainWindow.getBounds())
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea
  islandWindow.setPosition(
    Math.round(area.x + (area.width - width) / 2),
    area.y + 10
  )
}

function showIsland(): void {
  const window = createIslandWindow()
  positionIsland()
  if (!window.webContents.isLoading()) {
    window.showInactive()
  }
}

function hideIsland(): void {
  if (islandWindow?.isVisible()) islandWindow.hide()
}

function resizeIsland(expanded: boolean, height?: number): void {
  if (!islandWindow) return
  const width = ISLAND_WIDTH
  const requestedHeight = Number.isFinite(height)
    ? Math.round(height as number)
    : expanded
      ? ISLAND_EXPANDED.height
      : ISLAND_COLLAPSED.height
  const safeHeight = Math.max(
    ISLAND_COLLAPSED.height,
    Math.min(ISLAND_EXPANDED.height, requestedHeight)
  )
  islandWindow.setMinimumSize(ISLAND_WIDTH, ISLAND_COLLAPSED.height)
  islandWindow.setMaximumSize(ISLAND_WIDTH, ISLAND_EXPANDED.height)
  islandWindow.setSize(width, safeHeight)
  positionIsland()
}

function restoreMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  hideIsland()
}

async function chooseSavePath(
  defaultName: string,
  extension: string,
  filterName: string
): Promise<string | null> {
  const options = {
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: filterName, extensions: [extension] }]
  }
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options)
  return result.canceled || !result.filePath ? null : result.filePath
}

function uniqueFile(file: string): string {
  if (!fs.existsSync(file)) return file
  const extension = path.extname(file)
  const base = file.slice(0, file.length - extension.length)
  let counter = 2
  while (fs.existsSync(`${base} (${counter})${extension}`)) counter += 1
  return `${base} (${counter})${extension}`
}

async function exportNotePdf(noteId: string, target: string): Promise<void> {
  const printWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    backgroundColor: '#ffffff',
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  try {
    const rendererURL = process.env['ELECTRON_RENDERER_URL']
    const url = rendererURL
      ? `${rendererURL}#/notes/${noteId}?print=1`
      : `${pathToFileURL(path.join(__dirname, '../renderer/index.html')).toString()}#/notes/${noteId}?print=1`

    await printWindow.loadURL(url)

    let ready = false
    for (let attempt = 0; attempt < 80; attempt += 1) {
      ready = await printWindow.webContents
        .executeJavaScript("document.body.dataset.printReady === '1'")
        .catch(() => false)
      if (ready) break
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    if (!ready) {
      throw new Error(
        mainText(
          loadSettings().uiLanguage,
          'The note view did not finish loading for PDF export.'
        )
      )
    }

    await printWindow.webContents.executeJavaScript(
      'document.fonts.ready.then(() => true)'
    )
    await new Promise((resolve) => setTimeout(resolve, 300))
    const pdf = await printWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4'
    })
    fs.writeFileSync(target, pdf)
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy()
  }
}

function registerIpc(): void {  ipcMain.handle('app:info', (): AppInfo => ({
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

  ipcMain.handle('app:openMainWindow', () => {
    restoreMainWindow()
  })
  ipcMain.handle('app:openNote', (_event, id: string) => {
    restoreMainWindow()
    mainWindow?.webContents.send('app:openNote', id)
  })
  ipcMain.handle('app:hideIsland', () => {
    hideIsland()
  })
  ipcMain.handle('app:setIslandExpanded', (_event, expanded: boolean, height?: number) => {
    resizeIsland(Boolean(expanded), height)
  })

  ipcMain.handle('settings:get', () => settingsStatus())
  ipcMain.handle('settings:update', (_event, patch: Partial<Settings>) => {
    const next = updateSettings(patch)
    syncGlobalHotkey()
    updateTrayMenu()
    return settingsStatusFor(next)
  })
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
      title: mainText(
        current.uiLanguage,
        'Choose where ezNotes saves your notes'
      ),
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
  ipcMain.handle('settings:chooseObsidianVault', async () => {
    const current = loadSettings()
    const options: OpenDialogOptions = {
      title: mainText(current.uiLanguage, 'Choose your Obsidian vault folder'),
      defaultPath: current.obsidianVault || app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory']
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    if (!result.canceled && result.filePaths[0]) {
      updateSettings({ obsidianVault: result.filePaths[0] })
    }
    return settingsStatus()
  })
  ipcMain.handle('settings:testLlm', async (): Promise<TestResult> => {
    const settings = loadSettings()
    const directKey = getSecret('llmApiKey')
    const groqKey = getSecret('groqApiKey')
    const key =
      settings.llm.provider === 'groq' ? groqKey ?? '' : directKey ?? ''
    const keyless = settings.llm.provider === 'ollama'
    if (!key && !keyless) {
      return {
        ok: false,
        message:
          settings.llm.provider === 'groq'
            ? 'Add a Groq key under Listening first.'
            : 'Add a notes model key first.'
      }
    }
    return testLlm({
      apiKey: key || '',
      baseURL: settings.llm.baseURL,
      model: settings.llm.model,
      provider: settings.llm.provider,
      sessionId: `test_${Date.now()}`
    })
  })
  ipcMain.handle('settings:testStt', async (): Promise<TestResult> => {
    const key = getSecret('groqApiKey')
    if (!key) return { ok: false, message: 'Add the Groq key first.' }
    return testGroqKey(key)
  })
  ipcMain.handle('settings:downloadDiarizationModels', () =>
    downloadDiarizationModels()
  )

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
  ipcMain.handle('notes:copy', (_event, id: string): NoteExportResult => {
    const note = getNote(loadSettings().notesDir, id)
    if (!note) throw new Error('Note not found.')
    clipboard.writeText(note.markdown)
    return {
      canceled: false,
      message: mainText(
        loadSettings().uiLanguage,
        'Note copied to the clipboard.'
      )
    }
  })

  ipcMain.handle(
    'notes:export',
    async (_event, id: string, format: NoteExportFormat): Promise<NoteExportResult> => {
      const settings = loadSettings()
      const notesDir = settings.notesDir
      const language = settings.uiLanguage
      const note = getNote(notesDir, id)
      if (!note) throw new Error('Note not found.')

      if (format === 'clipboard' || format === 'notion') {
        clipboard.writeText(note.markdown)
        return {
          canceled: false,
          message:
            format === 'notion'
              ? mainText(
                  language,
                  'Markdown copied. Paste it into a Notion page.'
                )
              : mainText(language, 'Note copied to the clipboard.')
        }
      }

      if (format === 'obsidian') {
        let vault = settings.obsidianVault.trim()
        if (!vault || !fs.existsSync(vault)) {
          const options: OpenDialogOptions = {
            title: 'Choose your Obsidian vault folder',
            defaultPath: vault || app.getPath('documents'),
            properties: ['openDirectory', 'createDirectory']
          }
          const result = mainWindow
            ? await dialog.showOpenDialog(mainWindow, options)
            : await dialog.showOpenDialog(options)
          if (result.canceled || !result.filePaths[0]) {
            return {
              canceled: true,
              message: mainText(language, 'Export canceled.')
            }
          }
          vault = result.filePaths[0]
          updateSettings({ obsidianVault: vault })
        }

        const folder = path.join(vault, 'ezNotes', sanitizeFilename(note.courseName))
        fs.mkdirSync(folder, { recursive: true })
        const target = uniqueFile(path.join(folder, path.basename(note.path)))
        fs.writeFileSync(target, fs.readFileSync(note.path, 'utf8'))
        return {
          canceled: false,
          path: target,
          message: mainText(language, 'Saved to Obsidian: {path}', {
            path: target
          })
        }
      }

      if (format === 'markdown') {
        const target = await chooseSavePath(
          `${sanitizeFilename(note.title)}.md`,
          'md',
          'Markdown'
        )
        if (!target) {
          return { canceled: true, message: mainText(language, 'Export canceled.') }
        }
        fs.writeFileSync(target, fs.readFileSync(note.path, 'utf8'))
        return {
          canceled: false,
          path: target,
          message: mainText(language, 'Markdown exported: {path}', {
            path: target
          })
        }
      }

      if (format === 'pdf') {
        const target = await chooseSavePath(
          `${sanitizeFilename(note.title)}.pdf`,
          'pdf',
          'PDF'
        )
        if (!target) {
          return { canceled: true, message: mainText(language, 'Export canceled.') }
        }
        await exportNotePdf(id, target)
        return {
          canceled: false,
          path: target,
          message: mainText(language, 'PDF exported: {path}', {
            path: target
          })
        }
      }

      throw new Error(`Unsupported export format: ${format}`)
    }
  )

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
    const directKey = getSecret('llmApiKey')
    const groqKey = getSecret('groqApiKey')
    const key =
      settings.llm.provider === 'groq' ? groqKey ?? '' : directKey ?? ''
    const keyless = settings.llm.provider === 'ollama'
    if (!key && !keyless && !demoMode) {
      throw new Error('Add the notes model key in Settings first.')
    }
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
        apiKey: key || (keyless ? '' : 'demo'),
        baseURL: settings.llm.baseURL,
        model: settings.llm.model,
        provider: settings.llm.provider,
        sessionId: `regen_${note.id}`,
        maxTokens: 16_000
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
  ipcMain.handle('recording:live', () => recording.liveState())
  ipcMain.handle('recording:recoverable', () =>
    recording.listRecoverable(loadSettings().notesDir)
  )
  ipcMain.handle('recording:recover', (_event, id: string) =>
    recording.recover(id)
  )
  ipcMain.on('recording:audio', (_event, chunk: ArrayBuffer) => {
    recording.appendAudio(chunk)
  })
  ipcMain.on('recording:webm', (_event, id: string, data: ArrayBuffer) => {
    recording.saveWebm(id, data)
  })
}

function settingsStatusFor(settings: Settings) {
  return {
    ...settingsStatus(),
    settings
  }
}

function registerAudioProtocol(): void {
  protocol.handle('eznotes', async (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== 'audio') {
        return new Response('Not found', { status: 404 })
      }
      const id = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (!/^rec_[A-Za-z0-9_-]+$/.test(id)) {
        return new Response('Invalid recording id', { status: 400 })
      }
      const dir = path.join(recordingsDir(), id)
      const webm = path.join(dir, 'audio.webm')
      const file = fs.existsSync(webm) ? webm : path.join(dir, 'audio.wav')
      if (!fs.existsSync(file)) {
        return new Response('Recording not found', { status: 404 })
      }

      const contentType = file === webm ? 'audio/webm' : 'audio/wav'
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
        'content-type': contentType,
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

const autoStartedKeys = new Set<string>()
const autoNotifiedKeys = new Set<string>()

function createTray(): void {
  if (tray) return

  const iconPath = path.join(__dirname, '../../resources/icon.png')
  const image = nativeImage.createFromPath(iconPath)
  tray = new Tray(
    image.isEmpty()
      ? nativeImage.createEmpty()
      : image.resize({ width: 16, height: 16 })
  )
  tray.setToolTip('ezNotes')
  tray.on('click', () => restoreMainWindow())
  updateTrayMenu()
  log('tray', 'ready')
}

function updateTrayMenu(): void {
  if (!tray) return

  const language = loadSettings().uiLanguage
  const state = recording.state()
  const template: MenuItemConstructorOptions[] = [
    {
      label: mainText(language, 'Open ezNotes'),
      click: () => restoreMainWindow()
    },
    { type: 'separator' }
  ]

  if (!state) {
    template.push({
      label: mainText(language, 'Start quick recording'),
      click: () => void startQuickRecording()
    })
  } else if (state.status === 'recording') {
    template.push({
      label: mainText(language, 'Pause recording'),
      click: () => void recording.pause()
    })
    template.push({
      label: mainText(language, 'Stop and write notes'),
      click: () => void stopRecordingFromTray()
    })
  } else if (state.status === 'paused') {
    template.push({
      label: mainText(language, 'Resume recording'),
      click: () => void recording.resume()
    })
    template.push({
      label: mainText(language, 'Stop and write notes'),
      click: () => void stopRecordingFromTray()
    })
  } else if (state.status === 'processing') {
    template.push({
      label: mainText(language, 'Writing notes…'),
      enabled: false
    })
  } else {
    template.push({
      label: mainText(language, 'Open live lecture'),
      click: () => openLive()
    })
  }

  template.push(
    { type: 'separator' },
    { label: mainText(language, 'Quit ezNotes'), click: () => app.quit() }
  )

  tray.setContextMenu(Menu.buildFromTemplate(template))
  tray.setToolTip(
    state
      ? `ezNotes — ${state.courseName} (${mainText(language, state.status)})`
      : `ezNotes — ${mainText(language, 'ready')}`
  )
}

async function startQuickRecording(): Promise<void> {
  if (recording.state()) {
    openLive()
    return
  }

  const current = currentClass(loadSchedule(), new Date())
  const language = loadSettings().uiLanguage
  try {
    await recording.start({
      courseId: current?.course.id ?? null,
      courseName: current?.course.name ?? 'Geral',
      title: current ? undefined : mainText(language, 'Quick recording'),
      glossary: current?.course.glossary ?? []
    })
    log('tray', 'quick recording started', {
      course: current?.course.name ?? 'Geral'
    })
  } catch (error) {
    notifyError(
      mainText(language, 'Could not start the quick recording: {message}', {
        message: error instanceof Error ? error.message : String(error)
      })
    )
  }
}

async function stopRecordingFromTray(): Promise<void> {
  const language = loadSettings().uiLanguage
  try {
    await recording.stop()
    openLive()
  } catch (error) {
    notifyError(
      mainText(language, 'Could not stop the recording: {message}', {
        message: error instanceof Error ? error.message : String(error)
      })
    )
  }
}

function openLive(): void {
  restoreMainWindow()
  mainWindow?.webContents.send('app:openLive')
}

function toggleRecordingFromHotkey(): void {
  const state = recording.state()
  if (!state) {
    void startQuickRecording()
    return
  }
  if (state.status === 'recording' || state.status === 'paused') {
    void stopRecordingFromTray()
    return
  }
  if (state.status === 'stopped' || state.status === 'error') {
    openLive()
  }
}

function notifyError(message: string): void {
  log('tray', 'action failed', { message })
  mainWindow?.webContents.send('recording:event', {
    type: 'notice',
    message,
    level: 'error'
  })
}

function syncGlobalHotkey(): void {
  globalShortcut.unregisterAll()
  const settings = loadSettings()
  if (!settings.globalHotkey) return

  try {
    const registered = globalShortcut.register(settings.globalHotkeyKey, () =>
      toggleRecordingFromHotkey()
    )
    if (!registered) {
      log('hotkey', 'could not register shortcut', {
        key: settings.globalHotkeyKey
      })
      mainWindow?.webContents.send('recording:event', {
        type: 'notice',
        message: mainText(
          settings.uiLanguage,
          'The global hotkey {key} is already in use by another app.',
          { key: settings.globalHotkeyKey }
        ),
        level: 'warn'
      })
    }
  } catch (error) {
    log('hotkey', 'registration failed', {
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

function startAutoStartScheduler(): void {
  const appStartedAt = Date.now()
  const check = (): void => checkAutoStart(appStartedAt)
  check()
  setInterval(check, 20_000)
}

function checkAutoStart(appStartedAt: number): void {
  const settings = loadSettings()
  if (!settings.autoStartRecording) return
  if (recording.state()) return

  const now = new Date()
  const schedule = loadSchedule()
  const language = settings.uiLanguage

  if (settings.notifyBeforeMinutes > 0) {
    const soon = dueSoonClass(schedule, now, settings.notifyBeforeMinutes)
    if (soon) {
      const key = classKey(soon)
      if (!autoNotifiedKeys.has(key)) {
        autoNotifiedKeys.add(key)
        notify(
          mainText(language, 'Class starting soon'),
          mainText(
            language,
            '{course} starts soon. ezNotes will start recording automatically.',
            { course: soon.course.name }
          )
        )
      }
    }
  }

  // Only start for classes that began after the app launched (with a small
  // tolerance), so reopening ezNotes mid-class does not start a late recording.
  const due = dueClass(schedule, now, appStartedAt - 30_000)
  if (!due) return

  const key = classKey(due)
  if (autoStartedKeys.has(key)) return
  autoStartedKeys.add(key)

  log('autoStart', 'starting recording', {
    courseId: due.course.id,
    slotId: due.slot.id
  })
  void recording
    .start({
      courseId: due.course.id,
      courseName: due.course.name,
      glossary: due.course.glossary
    })
    .then(() => {
      log('autoStart', 'recording started', { courseId: due.course.id })
      notify(
        mainText(language, 'ezNotes is recording'),
        mainText(language, 'Started automatically for {course}.', {
          course: due.course.name
        })
      )
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      log('autoStart', 'could not start recording', { message })
      mainWindow?.webContents.send('recording:event', {
        type: 'notice',
        message: mainText(
          language,
          'Could not start recording automatically: {message}',
          { message }
        ),
        level: 'error'
      })
    })
}

function classKey(item: { slot: { id: string }; startsAt: string }): string {
  return `${item.slot.id}:${item.startsAt}`
}

const activeNotifications = new Set<Notification>()

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return
  const notification = new Notification({ title, body })
  activeNotifications.add(notification)
  notification.on('close', () => activeNotifications.delete(notification))
  notification.on('click', () => restoreMainWindow())
  notification.show()
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
    app.setAppUserModelId('app.eznotes')
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
    createTray()
    syncGlobalHotkey()
    startAutoStartScheduler()

    const repositionIsland = (): void => {
      if (islandWindow?.isVisible()) positionIsland()
    }
    screen.on('display-metrics-changed', repositionIsland)
    screen.on('display-added', repositionIsland)
    screen.on('display-removed', repositionIsland)

    const removed = recording.cleanupExpiredRecordings()
    if (removed.length) {
      console.log(`[eznotes] removed ${removed.length} expired recording(s)`)
    }
    setInterval(() => recording.cleanupExpiredRecordings(), 6 * 60 * 60 * 1000)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    tray?.destroy()
    tray = null
  })

  app.on('before-quit', (event) => {
    if (quitting) return
    const state = recording.state()
    if (!state || !['recording', 'paused', 'processing'].includes(state.status)) return

    event.preventDefault()
    const language = loadSettings().uiLanguage
    const options = {
      type: 'warning' as const,
      title: mainText(language, 'ezNotes is still recording'),
      message: mainText(language, 'A lecture is in progress.'),
      detail: mainText(
        language,
        'If you quit now, the current audio stays on disk but will not be turned into a note.'
      ),
      buttons: [
        mainText(language, 'Keep running'),
        mainText(language, 'Quit anyway')
      ],
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
