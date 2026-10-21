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
- [ ] **P1-2** Class-time notifications + optional auto-start, using
      `notifyBeforeMinutes` and `UpcomingClass.isNow`
      `src/main/schedule.ts`, `src/main/index.ts`
- [ ] **P1-3** Opus compression in `finalize()`; serve `.opus` from the
      `eznotes://audio/` protocol
      `src/main/recording.ts`, `src/main/index.ts`
- [ ] **P1-4** Tray icon (record/pause/stop, state) and global hotkey with
      conflict check
      `src/main/index.ts`
- [ ] **P1-5** LLM provider adapters for Anthropic/Gemini/OpenAI Responses;
      keep Chat Completions as one adapter
      `src/main/llm.ts`, `src/shared/types.ts`
- [ ] **P1-6** Wire up `Settings.uiLanguage` with a small dictionary module
      `src/shared/types.ts`, `src/renderer/src/pages/*`

## P2 — Refinements

- [ ] **P2-1** Configurable live-outline cadence (fixed 90 s today)
      `src/main/recording.ts`
- [ ] **P2-2** Island across mixed-DPI monitors
      `src/main/index.ts` (`positionIsland`)
- [ ] **P2-3** Make island `hasShadow` platform-aware
      `src/main/index.ts`
- [ ] **P2-4** React error boundary around the app shell
      `src/renderer/src/main.tsx`

## Engineering hygiene

- [x] **H-1** Add `vitest` + `npm test`; cover `trimOverlap`, `dedupeSegments`,
      `splitFrontmatter`, `sanitizeFilename`, `upcomingClasses`, `detectCues`
      — 39 tests in 6 files; `electron` is aliased to `tests/electron-stub.ts`.
- [x] **H-2** Add CI: `typecheck` + `test` + `build`
      — `.github/workflows/ci.yml`, Node 24, Electron binary download skipped.
- [x] **H-3** Replace hardcoded `User-Agent: ezNotes/0.5.2` with
      `app.getVersion()`
      `src/main/appVersion.ts`, `src/main/stt.ts`, `src/main/llm.ts`
- [x] **H-4** Rotate `eznotes.log` at ~2 MB, keep two files
      `src/main/log.ts` (`rotateLogFile`) + tests
- [x] **H-5** Link `TODO.md` from the README
      `README.md` (Status and Roadmap sections)
