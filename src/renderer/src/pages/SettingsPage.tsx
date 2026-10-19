import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  FolderOpen,
  KeyRound,
  Loader2,
  Mic,
  Monitor,
  Moon,
  Save,
  ShieldCheck,
  Sun,
  Trash2,
  XCircle
} from 'lucide-react'
import type { LlmProvider, Theme } from '../../../shared/types'
import { useApp } from '../state/AppContext'
import { Badge, Button, Card, Field, Segmented } from '../components/ui'

const PROVIDER_PRESETS: Record<
  Exclude<LlmProvider, 'custom'>,
  { baseURL: string; model: string; label: string }
> = {
  'opencode-go': {
    baseURL: 'https://opencode.ai/inference/go/openai/v1',
    model: 'deepseek-v4.1-flash',
    label: 'OpenCode Go'
  },
  'opencode-console': {
    baseURL: 'https://opencode.ai/inference/openai/v1',
    model: 'deepseek-v4.1-flash',
    label: 'OpenCode Console'
  }
}

const LLM_MODELS = [
  'deepseek-v4.1-flash',
  'deepseek-v4-pro',
  'glm-5.3-flash',
  'glm-5.3',
  'glm-5.2',
  'kimi-k3',
  'kimi-k2.7-code',
  'longcat-2.0',
  'mimo-v2.6-flash',
  'hy3',
  'step-5-preview'
]

const STT_MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3']

const LANGUAGES = [
  { value: 'pt', label: 'Portuguese' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' }
]

export default function SettingsPage(): React.JSX.Element {
  const { settings, refreshSettings, toast } = useApp()
  const [groqKey, setGroqKey] = useState('')
  const [llmKey, setLlmKey] = useState('')
  const [sttModel, setSttModel] = useState('whisper-large-v3-turbo')
  const [language, setLanguage] = useState('pt')
  const [provider, setProvider] = useState<LlmProvider>('opencode-go')
  const [baseURL, setBaseURL] = useState(PROVIDER_PRESETS['opencode-go'].baseURL)
  const [model, setModel] = useState(PROVIDER_PRESETS['opencode-go'].model)
  const [retention, setRetention] = useState(30)
  const [theme, setTheme] = useState<Theme>('dark')
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [micId, setMicId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<'stt' | 'llm' | null>(null)
  const [testResult, setTestResult] = useState<{
    stt?: { ok: boolean; message: string }
    llm?: { ok: boolean; message: string }
  }>({})

  useEffect(() => {
    if (!settings) return
    setSttModel(settings.settings.stt.model)
    setLanguage(settings.settings.stt.language)
    setProvider(settings.settings.llm.provider)
    setBaseURL(settings.settings.llm.baseURL)
    setModel(settings.settings.llm.model)
    setRetention(settings.settings.retentionDays)
    setTheme(settings.settings.theme)
    setMicId(settings.settings.microphoneId)
  }, [settings])

  useEffect(() => {
    void loadMicrophones(false)
  }, [])

  async function loadMicrophones(requestPermission: boolean): Promise<void> {
    try {
      if (requestPermission) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
      }
      const devices = await navigator.mediaDevices.enumerateDevices()
      setMicrophones(devices.filter((device) => device.kind === 'audioinput'))
    } catch (error) {
      toast(
        `Could not list microphones: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      )
    }
  }

  async function saveSettings(): Promise<void> {
    if (!settings) return
    setSaving(true)
    try {
      await window.ezNotes.settings.update({
        stt: { provider: settings.settings.stt.provider, model: sttModel, language },
        llm: { provider, baseURL, model },
        retentionDays: retention,
        microphoneId: micId
      })
      await refreshSettings()
      toast('Settings saved.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveSecret(
    key: 'groqApiKey' | 'llmApiKey',
    value: string
  ): Promise<void> {
    if (!value.trim()) {
      toast('Paste a key first.', 'warn')
      return
    }
    try {
      await window.ezNotes.settings.setSecret(key, value.trim())
      setGroqKey('')
      setLlmKey('')
      await refreshSettings()
      toast('Key saved and encrypted.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  async function clearKey(key: 'groqApiKey' | 'llmApiKey'): Promise<void> {
    try {
      await window.ezNotes.settings.clearSecret(key)
      await refreshSettings()
      toast('Key removed.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  async function test(key: 'stt' | 'llm'): Promise<void> {
    setTesting(key)
    try {
      const result =
        key === 'stt'
          ? await window.ezNotes.settings.testStt()
          : await window.ezNotes.settings.testLlm()
      setTestResult((current) => ({ ...current, [key]: result }))
      toast(result.message, result.ok ? 'success' : 'error')
    } finally {
      setTesting(null)
    }
  }

  async function chooseFolder(): Promise<void> {
    const next = await window.ezNotes.settings.chooseNotesDir()
    await refreshSettings()
    toast(`Notes folder: ${next.notesDir}`, 'success')
  }

  async function changeTheme(next: Theme): Promise<void> {
    setTheme(next)
    try {
      await window.ezNotes.settings.update({ theme: next })
      await refreshSettings()
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  function changeProvider(next: LlmProvider): void {
    setProvider(next)
    if (next !== 'custom') {
      setBaseURL(PROVIDER_PRESETS[next].baseURL)
      setModel(PROVIDER_PRESETS[next].model)
    }
  }

  if (!settings) {
    return (
      <div className="page loading-page">
        <div className="loading-mark" />
      </div>
    )
  }

  const hasGroq = settings.hasGroqKey
  const hasLlm = settings.hasLlmKey

  return (
    <div className="page settings-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Preferences</p>
          <h1>Settings</h1>
          <p className="page-sub">
            Two keys, one microphone, and a folder. Nothing else leaves your PC.
          </p>
        </div>
        <Button variant="primary" onClick={() => void saveSettings()} disabled={saving}>
          <Save size={16} />
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </header>

      {settings.demoMode ? (
        <div className="banner banner-warn" style={{ marginBottom: 24 }}>
          <FlaskConical size={17} />
          <span>
            Demo mode is on. The app uses canned Portuguese transcripts and notes
            instead of calling Groq or OpenCode.
          </span>
        </div>
      ) : null}

      <section className="settings-section">
        <div className="settings-section-head">
          <span className="settings-icon">
            <Mic size={19} />
          </span>
          <div>
            <h2>Listening</h2>
            <p>Groq Whisper turns the microphone audio into a Portuguese transcript.</p>
          </div>
          <Badge tone={hasGroq || settings.demoMode ? 'accent' : 'warn'}>
            {settings.demoMode ? 'Simulated' : hasGroq ? 'Connected' : 'Key needed'}
          </Badge>
        </div>

        <Card className="settings-card">
          <Field
            label="Groq API key"
            hint={
              <>
                Encrypted with Windows DPAPI. Get a key at{' '}
                <button
                  className="inline-link"
                  onClick={() => void window.ezNotes.app.openExternal('https://console.groq.com/keys')}
                >
                  console.groq.com <ExternalLink size={11} />
                </button>
                .
              </>
            }
          >
            <div className="secret-row">
              <div className="secret-input">
                <KeyRound size={16} />
                <input
                  type="password"
                  value={groqKey}
                  onChange={(event) => setGroqKey(event.target.value)}
                  placeholder={hasGroq ? '•••••••••••••••• saved' : 'gsk_…'}
                  autoComplete="off"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => void saveSecret('groqApiKey', groqKey)}
              >
                Save key
              </Button>
              {hasGroq ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => void test('stt')}
                    disabled={testing === 'stt'}
                  >
                    {testing === 'stt' ? <Loader2 size={15} className="spin" /> : null}
                    Test
                  </Button>
                  <button
                    className="icon-button danger"
                    onClick={() => void clearKey('groqApiKey')}
                    aria-label="Remove Groq key"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              ) : null}
            </div>
          </Field>

          {testResult.stt ? (
            <TestBanner result={testResult.stt} />
          ) : null}

          <div className="form-row">
            <Field label="Whisper model">
              <select value={sttModel} onChange={(event) => setSttModel(event.target.value)}>
                {STT_MODELS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lecture language">
              <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                {LANGUAGES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <p className="settings-note">
            Audio is uploaded to Groq for transcription. Live text arrives in chunks,
            a few seconds behind the speaker. The final pass after class is more accurate.
          </p>
        </Card>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <span className="settings-icon">
            <KeyRound size={19} />
          </span>
          <div>
            <h2>Writing</h2>
            <p>OpenCode runs the live outline and turns the transcript into structured notes.</p>
          </div>
          <Badge tone={hasLlm || settings.demoMode ? 'accent' : 'warn'}>
            {settings.demoMode ? 'Simulated' : hasLlm ? 'Connected' : 'Key needed'}
          </Badge>
        </div>

        <Card className="settings-card">
          <div className="form-row">
            <Field label="Provider">
              <select
                value={provider}
                onChange={(event) => changeProvider(event.target.value as LlmProvider)}
              >
                <option value="opencode-go">OpenCode Go</option>
                <option value="opencode-console">OpenCode Console</option>
                <option value="custom">Custom OpenAI-compatible</option>
              </select>
            </Field>
            <Field
              label="Model"
              hint="Use a Chat Completions model such as DeepSeek, GLM, or Kimi. GPT, Claude, Gemini, and Qwen use different API shapes and are not supported yet."
            >
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="deepseek-v4.1-flash"
                list="llm-models"
              />
              <datalist id="llm-models">
                {LLM_MODELS.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </Field>
          </div>

          <Field
            label="Base URL"
            hint="The app calls /chat/completions on this URL. No trailing slash needed."
          >
            <input
              value={baseURL}
              onChange={(event) => setBaseURL(event.target.value)}
              placeholder="https://opencode.ai/inference/go/openai/v1"
            />
          </Field>

          <Field
            label="OpenCode API key"
            hint={
              provider === 'opencode-go'
                ? 'Uses your Go subscription. Go is intended for coding-agent traffic, so the Console API is safer for a general app.'
                : 'Create a service-account key in the OpenCode Console.'
            }
          >
            <div className="secret-row">
              <div className="secret-input">
                <KeyRound size={16} />
                <input
                  type="password"
                  value={llmKey}
                  onChange={(event) => setLlmKey(event.target.value)}
                  placeholder={hasLlm ? '•••••••••••••••• saved' : 'sk_…'}
                  autoComplete="off"
                />
              </div>
              <Button variant="outline" onClick={() => void saveSecret('llmApiKey', llmKey)}>
                Save key
              </Button>
              {hasLlm ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => void test('llm')}
                    disabled={testing === 'llm'}
                  >
                    {testing === 'llm' ? <Loader2 size={15} className="spin" /> : null}
                    Test
                  </Button>
                  <button
                    className="icon-button danger"
                    onClick={() => void clearKey('llmApiKey')}
                    aria-label="Remove OpenCode key"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              ) : null}
            </div>
          </Field>

          {testResult.llm ? <TestBanner result={testResult.llm} /> : null}

          <p className="settings-note">
            The transcript is sent to OpenCode to write the note. It is not used to
            train models on the Go endpoint; see the Console for retention details.
          </p>
        </Card>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <span className="settings-icon">
            <FolderOpen size={19} />
          </span>
          <div>
            <h2>Storage</h2>
            <p>Notes are plain Markdown. Audio is kept separately and expires.</p>
          </div>
        </div>

        <Card className="settings-card">
          <Field label="Notes folder" hint={settings.notesDir}>
            <div className="secret-row">
              <input value={settings.notesDir} readOnly />
              <Button variant="outline" onClick={() => void chooseFolder()}>
                <FolderOpen size={15} />
                Choose
              </Button>
              <Button
                variant="ghost"
                onClick={() => void window.ezNotes.notes.openFolder()}
              >
                Open
              </Button>
            </div>
          </Field>

          <div className="form-row">
            <Field
              label="Delete kept audio after"
              hint="Transcripts and notes are never deleted by retention."
            >
              <div className="input-suffix">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={retention}
                  onChange={(event) => setRetention(Number(event.target.value))}
                />
                <span>days</span>
              </div>
            </Field>
            <Field label="Microphone">
              <div className="secret-row">
                <select
                  value={micId ?? ''}
                  onChange={(event) => setMicId(event.target.value || null)}
                >
                  <option value="">System default</option>
                  {microphones.map((device, index) => (
                    <option key={device.deviceId || index} value={device.deviceId}>
                      {device.label || `Microphone ${index + 1}`}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  onClick={() => void loadMicrophones(true)}
                  title="Request permission and refresh devices"
                >
                  Refresh
                </Button>
              </div>
            </Field>
          </div>

          <p className="settings-note">
            Audio files live in the app's private data folder, not in the notes folder.
            If you keep a recording, it is removed automatically after {retention} days.
          </p>
        </Card>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <span className="settings-icon">
            {theme === 'light' ? <Sun size={19} /> : theme === 'dark' ? <Moon size={19} /> : <Monitor size={19} />}
          </span>
          <div>
            <h2>Appearance</h2>
            <p>Dark is the default. System follows Windows.</p>
          </div>
        </div>
        <Card className="settings-card inline-card">
          <Segmented
            value={theme}
            onChange={(value) => void changeTheme(value)}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' }
            ]}
          />
        </Card>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <span className="settings-icon">
            <ShieldCheck size={19} />
          </span>
          <div>
            <h2>Privacy & consent</h2>
            <p>What stays local, what leaves, and what you should tell people.</p>
          </div>
        </div>
        <Card className="settings-card privacy-card">
          <div className="privacy-grid">
            <div>
              <strong>Stays on this PC</strong>
              <ul>
                <li>Audio recordings and transcripts</li>
                <li>Notes and the searchable library</li>
                <li>API keys, encrypted with Windows DPAPI</li>
              </ul>
            </div>
            <div>
              <strong>Leaves this PC</strong>
              <ul>
                <li>Audio chunks go to Groq for transcription</li>
                <li>The transcript goes to OpenCode for note writing</li>
                <li>No analytics or telemetry from ezNotes</li>
              </ul>
            </div>
          </div>
          <div className="banner banner-warn">
            <ShieldCheck size={16} />
            <span>
              Recording a lecture may require consent. Inform the lecturer and follow
              your institution's rules. ezNotes shows a visible recording indicator.
            </span>
          </div>
          <div className="privacy-foot">
            <span>ezNotes {settings.appVersion}</span>
            <button
              className="inline-link"
              onClick={() => void window.ezNotes.app.openExternal('https://opencode.ai/console')}
            >
              OpenCode Console <ExternalLink size={11} />
            </button>
            <button
              className="inline-link"
              onClick={() => void window.ezNotes.app.openExternal('https://console.groq.com')}
            >
              Groq Console <ExternalLink size={11} />
            </button>
          </div>
        </Card>
      </section>
    </div>
  )
}

function TestBanner({
  result
}: {
  result: { ok: boolean; message: string }
}): React.JSX.Element {
  return (
    <div className={`test-banner ${result.ok ? 'ok' : 'fail'}`}>
      {result.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      <span>{result.message}</span>
    </div>
  )
}
