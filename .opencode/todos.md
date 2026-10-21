# ezNotes — working todos

Actionable checklist. Rationale, file/line references, and "done when" criteria
live in [`../TODO.md`](../TODO.md).

Conventions: run `npm run typecheck` before committing, one item per commit,
tick the box here and in `TODO.md` when it lands.

## P0 — Don't lose a lecture

- [x] **P0-1** Crash-safe recording: rewrite the WAV header every ~30 s and
      persist `session.json` next to `audio.wav`
      `src/main/recording.ts` (`start`, `appendAudio`, `stop`)
      — header + `fsync` + manifest on a 30 s timer, on pause/resume, and on stop;
      manifest removed once the note is saved with audio kept.
- [x] **P0-2** Recover orphaned `rec_*` recordings on startup and offer
      "Recover lecture" on the dashboard
      `src/main/index.ts` (`recording:recoverable`, `recording:recover`),
      `src/renderer/src/pages/Dashboard.tsx`
      — scans the recordings folder, skips ones already linked to a note, repairs
      the WAV header from the file size, and hands the session to the normal
      retention dialog in Live.
- [x] **P0-3** Allow saving a transcript-only note from the finalize error state
      `src/main/recording.ts` (`finalize`, `transcriptOnly`), `src/renderer/src/pages/Live.tsx`
      — live segments persist to `live-transcript.json` per chunk; the error
      dialog offers "Save transcript only" without needing Groq or the LLM.
## P1 — Product gaps

- [x] **P1-1** Speaker diarization: add `speaker?: string` to
      `TranscriptSegment`, diarize before note generation, render in NotePage
      `src/main/diarization.ts`, `src/main/diarizer/`, `src/renderer/src/pages/NotePage.tsx`
      — local sherpa-onnx via a bundled Node runtime; models download on demand.
- [x] **P1-2** Class-time notifications + opt-in auto-start, using
      `notifyBeforeMinutes` and `autoStartRecording` (off by default)
      `src/main/autoStart.ts`, `src/main/index.ts`, `src/renderer/src/pages/SettingsPage.tsx`
      — 20 s scheduler, two-minute grace, launch guard, once per class.
- [x] **P1-3** Opus/WebM encoding in the renderer; WAV kept only for
      transcription and speaker detection; protocol serves both
      `src/renderer/src/hooks/useAudioCapture.ts`, `src/main/recording.ts`
- [x] **P1-4** Tray icon (record/pause/stop, state) and configurable global
      hotkey with conflict warning
      `src/main/index.ts`, `src/shared/hotkeys.ts`, `src/renderer/src/pages/SettingsPage.tsx`
      — hotkey off by default; default `Ctrl+Alt+Shift+R`; 50 tests.
- [x] **P1-5** LLM provider adapters for Anthropic/Gemini/OpenAI Responses;
      Chat Completions stays for the other providers
      `src/main/llm.ts`, `src/shared/types.ts`, `src/renderer/src/pages/SettingsPage.tsx`
      — Anthropic uses the official SDK with streaming; 61 tests.
- [x] **P1-6** Wire up `Settings.uiLanguage` with a dictionary module
      `src/renderer/src/i18n.ts`, `src/renderer/src/locales/`, `src/main/uiText.ts`
      — English/pt-PT, live switching, locale-aware dates, tray/dialogs; 64 tests.

## Design

- [x] **UI redesign** — light-first macOS Tahoe-inspired shell, Apple blue,
      Inter + Newsreader, balanced density, Dynamic Island, dark mode.
      `src/renderer/src/apple.css`, `src/renderer/src/island.css`

## P2 — Refinements

- [x] **P2-1** Configurable live-outline cadence (60/90/120/180 s) and skip
      unchanged transcripts
      `src/main/recording.ts`, `src/renderer/src/pages/SettingsPage.tsx`
- [x] **P2-2** Island across mixed-DPI monitors
      `src/main/index.ts` (`positionIsland`, display metrics listeners)
- [x] **P2-3** Remove the island shadow entirely (CSS and native `hasShadow`)
      `src/main/index.ts`, `src/renderer/src/island.css`
- [x] **P2-4** React error boundary around the app and island
      `src/renderer/src/components/ErrorBoundary.tsx`
- [x] **P2-5** Live-transcript quality: 12 s windows every 8 s, silence
      trimming (`analyzeSpeech`), and Groq confidence filtering
      `src/main/stt.ts`, `src/main/recording.ts`

## Engineering hygiene

- [x] **H-1** Add `vitest` + `npm test`; cover `trimOverlap`, `dedupeSegments`,
      `analyzeSpeech`, `isLikelyHallucination`, `splitFrontmatter`,
      `sanitizeFilename`, `upcomingClasses`, `detectCues`
      — 76 tests in 9 files; `electron` is aliased to `tests/electron-stub.ts`.
- [x] **H-2** Add CI: `typecheck` + `test` + `build`
      — `.github/workflows/ci.yml`, Node 24, Electron binary download skipped.
- [x] **H-3** Replace hardcoded `User-Agent: ezNotes/0.5.2` with
      `app.getVersion()`
      `src/main/appVersion.ts`, `src/main/stt.ts`, `src/main/llm.ts`
- [x] **H-4** Rotate `eznotes.log` at ~2 MB, keep two files
      `src/main/log.ts` (`rotateLogFile`) + tests
- [x] **H-5** Link `TODO.md` from the README
      `README.md` (Status and Roadmap sections)
