# TODO — known limits and next steps

Working list derived from the README's "Known limits / next steps" plus a pass
over the code. Ordered by what actually blocks using ezNotes for a real semester.

> The tickable checklist lives in [`.opencode/todos.md`](.opencode/todos.md).
> This file keeps the detail, file references, and acceptance criteria.

Legend: **P0** = risk of losing a lecture · **P1** = expected product gap ·
**P2** = refinement.

---

## P0 — Don't lose a lecture

- [x] **Crash-safe recording (finalize the WAV header as we go)**
  `RecordingManager.start()` wrote a 44-byte header with zero sizes and only
  rewrote it in `stop()` (`src/main/recording.ts`). If the app or Windows died
  mid-lecture, the file still had data but the header said `0` bytes.
  - Header + `fsync` are now rewritten every 30 s, on pause/resume, and on stop;
    a `session.json` manifest records course, title, byte count, and status.
  - The manifest is removed after a successful finalize when audio is kept, so
    P0-2 can treat its presence as "needs recovery".
  - *Done when:* killing the process during a recording still yields a playable
    WAV after restart.

- [x] **Recover orphaned recordings on startup**
  A crashed session used to be invisible: `app.whenReady()` only ran retention
  cleanup, so the audio was eventually deleted after `retentionDays`.
  - `listRecoverable()` scans `%APPDATA%\ezNotes\recordings\rec_*`, skips folders
    already linked to a note, and reads `session.json` when present.
  - `recover()` adopts the session, repairs the WAV header from the file size,
    and returns a `stopped` snapshot. The dashboard lists recoverable lectures;
    Live opens the normal retention dialog.
  - Old recordings without a manifest still recover using the timestamp in the
    folder name and "Geral" as the course.
  - *Verified:* synthetic crashed WAV (header length 0, stale manifest) appeared
    on the dashboard, recovered at the correct duration, and discarded cleanly.

- [x] **Save a transcript-only note from the error state**
  `finalize()` left the user stuck when transcription failed, even though live
  segments existed in memory.
  - Live segments are persisted to `live-transcript.json` after each chunk and
    reloaded when an interrupted recording is recovered.
  - `finalize({ transcriptOnly: true })` skips the Groq key check and the LLM
    call, using the cached final transcript, then the live transcript, then
    in-memory segments.
  - The Live error dialog offers **Save transcript only** next to Retry and
    Delete.
  - *Verified:* with no Groq key, the button saved a note from the live
    transcript, navigated to it, and kept the audio per the chosen policy.

---

## P1 — Product gaps

- [x] **Speaker diarization (lecturer vs. students)**
  Groq Whisper returns flat segments, and Electron's V8 memory cage blocks the
  sherpa native addon in-process. The app now ships a standalone Node runtime
  and runs diarization in a child process.
  - `TranscriptSegment.speaker` plus `assignSpeakers()` (maximum time overlap,
    labels numbered by first appearance).
  - Settings → Listening toggle; models (~45 MB) download on demand into
    `%APPDATA%\ezNotes\models\sherpa\`.
  - Runs after the note is saved, in the background, so speaker detection can
    never delay notes. It updates the transcript sidecar; pressing Regenerate
    applies the labels to the note.
  - The note prompt treats the most active speaker as the lecturer and marks
    student questions; the note transcript shows speaker badges.
  - The worker has a 10-minute cap and is killed when the app quits, so a
    restart cannot leave an orphaned diarization process behind.
  - *Verified:* a seeded 57-second lecture diarized and produced a note in
    3.3 s; the packaged worker also runs from `resources/`.

- [x] **Automatic recording at class time (opt-in)**
  Off by default: **Settings → Automation → Start recording automatically when
  a class begins**.
  - `dueClass()` starts a class within a two-minute grace window, only once per
    occurrence, and only if it began after the app launched.
  - `dueSoonClass()` sends a Windows notification using the now-configurable
    `notifyBeforeMinutes` (Off / 5 / 10 / 15 minutes).
  - The scheduler checks every 20 seconds; stop or discard works as usual.
  - *Verified:* a class scheduled one minute after launch started recording
    automatically at 16:09:17 with the toggle on.

- [x] **Compact retained audio (Opus/WebM)**
  WAV at 16 kHz mono is ~115 MB/hour. The renderer encodes Opus with WebCodecs
  and muxes it to WebM, so kept audio is ~11 MB/hour.
  - WAV is still written for transcription and speaker detection, then replaced
    by `audio.webm` when the user keeps the audio (with a short grace period for
    the encoder to flush). If encoding is unavailable, WAV is kept as a fallback.
  - The `eznotes://audio/` protocol serves WebM or WAV with range support.
  - *Verified:* a 13-second fake-microphone recording produced a 51 KB WebM, the
    WAV was removed on keep, and the note played it back with a 12.8 s duration.

- [x] **Tray icon + configurable global hotkey**
  - Tray menu: open, start quick recording, pause/resume, stop, quit; reflects
    the current recording state.
  - Hotkey is opt-in and selectable (default `Ctrl+Alt+Shift+R`, because
    `Ctrl+Alt+R` is often taken). Registration conflicts produce a warning.
  - A quick recording uses the class in progress, or “Geral” if none; pressing
    the shortcut again stops and opens the retention dialog.
  - *Verified:* the shortcut started “Hotkey Course”, a second press stopped it
    and opened the retention dialog; the Settings select shows the stored key.

- [x] **More LLM providers (native adapters)**
  - `chat()` dispatches by provider: Chat Completions for `opencode-*`,
    `groq`, `ollama`, and `custom`; native adapters for Anthropic (official SDK,
    streaming), Gemini `generateContent`, and OpenAI Responses.
  - Settings presets: `claude-opus-5-5`, `gemini-3.8-flash`, and `gpt-6-astra`,
    with an editable model field because IDs move fast.
  - *Verified:* mock HTTP/SSE tests cover request shapes, auth headers, system
    prompts, and response parsing; 61 tests pass.

- [x] **Wire up the UI language setting**
  - `t('English source', vars?)` in `src/renderer/src/i18n.ts` with English as
    the fallback; pt-PT dictionaries live in `src/renderer/src/locales/`.
  - Language selector in **Settings → Appearance**; switching updates the UI
    without a reload and also re-localizes dates, greetings, and durations.
  - The tray menu, native dialogs, and export messages are localized in the main
    process via `src/main/uiText.ts`.
  - *Verified:* an isolated build with `uiLanguage: pt` rendered Portuguese on
    every page; switching to English and back worked live. 64 tests pass.
  - Provider/backend error details remain in English as diagnostic text.

---

## Design

- [x] Full UI redesign — light-first macOS Tahoe-inspired shell, Apple blue
  accent, Inter for the interface, Newsreader for note reading, balanced
  density, Dynamic Island-style recording pill, and dark mode.
  - `src/renderer/src/apple.css` is the design layer; `island.css` is the pill.
  - Dates, counts, and weekday labels use the active locale.
  - *Verified:* screenshots of Dashboard, Library, Note, Settings, Schedule,
    Live, and dark mode; no serif leaks into UI chrome.

## P2 — Refinements

- [x] Make the live-outline cadence configurable (`stt.liveOutlineSeconds`,
  default 90 s; 60/90/120/180 in Settings) and skip calls when the transcript
  has not changed.
- [x] Island: position on the cursor's display when the main window is minimized
  and re-position on display metrics changes (`positionIsland`).
- [x] Remove the island's shadow entirely — no CSS `box-shadow` and
  `hasShadow: false` on the native window, leaving only the pill.
- [x] Reduce live-transcript hallucinations: silence-trimmed 12 s windows every
  8 s, speech gating before each Groq call, and confidence filtering
  (`avg_logprob`, `no_speech_prob`, `compression_ratio`) plus known Whisper
  outro phrases. Default STT model is now `whisper-large-v3`.
- [x] Never replace a full WAV with a truncated WebM: compare the WebM duration
  with the WAV before cleanup, keep the WAV when the compressed copy is short,
  and make the audio protocol prefer the longer file.
- [x] Let the window close to the tray while notes are being written, with a
  native notification when the note is ready; quitting still keeps the
  recording recoverable.
- [x] Add a React error boundary for the main window and the island.
- [x] Redesign Schedule as a weekly time grid: dated day columns, today marker,
  time axis, course-coloured blocks, click-empty-to-add, and a compact course
  panel. The old repeated day list and ambiguous count numbers are gone.
- [x] Redesign Library as a shelf of course books: one book per discipline in a
  4-column grid, opening into a theme-aware paper page with the course notes in
  a simple 4-column card grid (white in light mode, app surfaces in dark mode).
  Search, audio filtering, and sorting are preserved.

---

## Engineering hygiene

- [x] **Tests and CI**
  `vitest` + `npm test` now cover `trimOverlap`/`dedupeSegments`,
  `splitFrontmatter`, `sanitizeFilename`, `upcomingClasses`, `detectCues`, log
  rotation, speaker assignment, auto-start scheduling, and title/summary
  extraction — 64 tests across 9 files.
  - `electron` is aliased to `tests/electron-stub.ts` so main-process modules
    import cleanly under Node.
  - `.github/workflows/ci.yml` runs `npm ci`, `typecheck`, `test`, and `build`
    on Node 24, with the Electron binary download skipped.

- [x] **Versioned User-Agent**
  `stt.ts` and `llm.ts` hardcoded `ezNotes/0.5.x`. Both now use
  `userAgent()` from `src/main/appVersion.ts`, which reads `app.getVersion()`.

- [x] **Log rotation**
  `log()` rotates `eznotes.log` at 2 MB to `eznotes.log.1`, keeping two files.
  The rotation helper has unit tests.

- [x] **README link**
  The README links `TODO.md` from the language note and the Roadmap section.

---

## Next implementation wave

Ordered backlog from the repository review. Keep implementation items small,
verify reliability-sensitive changes with tests, and tick each item here and in
[`.opencode/todos.md`](.opencode/todos.md) when complete.

### P1 — Reliability, performance, and setup

- [x] **N-1 Audio capture hot path**
  `src/main/recording.ts`, `src/main/audioBuffer.ts`,
  `src/renderer/src/hooks/useAudioCapture.ts`
  - Replace repeated rolling-window `Buffer.concat` copies with a bounded ring
    buffer or equivalent.
  - Batch disk writes without losing ordering, draining buffered audio on stop,
    or weakening the crash-safe checkpoint/recovery guarantees.
  - *Done when:* a repeatable long synthetic recording has no missing or
    reordered samples, recovers as a valid WAV after forced termination, and
    includes before/after CPU and allocation measurements.
  - *Verified:* the ring buffer cut a 12.8-minute synthetic rolling-window
    workload from 1,853 ms to 20 ms (about 93×) with no retained heap growth.
    A real 6-second Electron capture stopped with a matching WAV header and data
    size; a forced-kill capture recovered at 4.10 s after the header was repaired.
    The write batcher flushes at 16 KB and on every checkpoint, pause/resume, and
    stop. 94 tests pass.

- [x] **N-2 Isolate microphone-level rendering**
  `src/renderer/src/state/audioLevel.ts`,
  `src/renderer/src/state/AppContext.tsx`, `src/renderer/src/pages/Live.tsx`,
  `src/renderer/src/pages/Island.tsx`
  - Move high-frequency level updates out of the app-wide context, or otherwise
    restrict them to the meter components; coalesce updates to display cadence.
  - *Done when:* meter animation remains responsive while unrelated pages and
    shell components do not rerender on every level event.
  - *Verified:* levels now flow through an external store consumed only by the
    Live and Island meter components. A fake-microphone smoke test rendered 18
    live bars with changing heights after three seconds. 97 tests pass.

- [x] **N-3 Make note indexing incremental and searchable**
  `src/main/notes.ts`, `src/main/index.ts`, `src/shared/types.ts`,
  `src/renderer/src/pages/Library.tsx`
  - Avoid recursively scanning the notes folder on every `notes:list` call.
    Keep external Markdown additions, edits, moves, and deletions discoverable
    with a debounced watcher plus an explicit rescan/fallback path.
  - Add global search over note text and transcript text, not only card metadata.
  - *Done when:* tests cover external file changes and index rebuilds; a seeded
    large library can open/search without repeated full scans or blocking the
    main process.
  - *Verified:* the index now scans once per notes folder, then serves cached
    results; a debounced recursive watcher applies changed paths in place and
    broadcasts refreshes. Tests cover additions, edits, renames, deletions,
    explicit rescans, watcher updates, index persistence, and content/transcript
    search. A 1,000-note benchmark took 212 ms for the initial scan, 0.4 ms for
    the first capped search, and 8 ms for a one-file refresh. The Library shows
    content matches with transcript timestamps and has a Rescan action. 103
    tests pass.

- [x] **N-4 Fail closed when secure secret storage is unavailable**
  `src/main/store.ts`, `src/main/secretStorage.ts`, `src/shared/types.ts`,
  `src/renderer/src/pages/SettingsPage.tsx`, `src/renderer/src/locales/`
  - Do not describe base64-encoded plaintext as encryption. Migrate legacy
    `plain:` values to `safeStorage` when available; otherwise refuse new secret
    storage and show a clear localized warning.
  - *Done when:* tests verify encryption, migration, unavailable-storage
    behavior, and that secrets never appear in settings responses or logs.
  - *Verified:* Windows DPAPI migrated a seeded legacy key and stored a new key
    without plaintext in `secrets.json`; Settings reports secure storage and
    disables Save when unavailable. 109 tests pass.

- [ ] **N-5 Make first-run setup provider-aware**
  `src/renderer/src/pages/Dashboard.tsx`,
  `src/renderer/src/pages/SettingsPage.tsx`,
  `src/renderer/src/locales/`
  - Replace the hard-coded “OpenCode key” setup label with copy derived from the
    selected provider. Guide users through microphone selection, provider
    credentials or local Ollama, connection tests, and adding a course.
  - *Done when:* each supported provider shows the right credential/setup
    instructions, local Ollama does not request a cloud key, and the user can
    confirm readiness before the first recording.

- [ ] **N-6 Detect recording health problems**
  `src/renderer/src/hooks/useAudioCapture.ts`,
  `src/main/recording.ts`, `src/renderer/src/pages/Live.tsx`
  - Detect microphone track termination and recording write failures; surface
    actionable warnings and preserve recoverable audio. Check available disk
    space where supported before and during long recordings.
  - *Done when:* tests/smoke tests cover device loss, low disk, and recovery
    without silently saving a misleadingly short recording.

- [ ] **N-7 Add a Windows release verification pipeline**
  `.github/workflows/`, `package.json`, release documentation
  - Build the Windows installer in CI, retain the artifact, and smoke-test
    install, launch, upgrade, and uninstall. Sign releases when signing
    credentials are configured; clearly identify unsigned builds otherwise.
  - *Done when:* a tagged release produces a tested, downloadable Windows
    installer and the signing state is explicit.

### P2 — Study and course workflows

- [ ] **N-8 Add safe note and transcript review/editing**
  `src/main/notes.ts`, `src/shared/types.ts`,
  `src/renderer/src/pages/NotePage.tsx`
  - Let users correct transcript text, rename generic speakers, and edit note
    Markdown. Keep edit history/undo and warn before regeneration can replace
    user edits.
  - *Done when:* edits persist across restart, transcript timestamps and
    speaker assignments are retained, and a prior version can be restored.

- [ ] **N-9 Add a source-linked study mode**
  New study UI and persistence under `.eznotes`; reuse note/transcript data
  - Generate flashcards and short quizzes from selected notes. Link each answer
    to its source note section and, when available, transcript timestamp.
  - *Done when:* users can review, mark confidence, revisit missed cards, and
    verify generated answers against their source; study data is exportable.

- [ ] **N-10 Import schedules from `.ics`**
  `src/main/schedule.ts`, `src/shared/types.ts`,
  `src/renderer/src/pages/SchedulePage.tsx`
  - Add import preview, course matching/creation, recurring classes, and
    one-off exceptions. Handle time zones and daylight-saving transitions.
  - *Done when:* users can preview and resolve conflicts before saving, with
    tests for recurrence, exceptions, time zones, and DST boundaries.

- [ ] **N-11 Add local backup and restore**
  Settings/export UI, `src/main/store.ts`, notes and recordings storage
  - Provide a guided backup that can include Markdown, transcripts, schedule,
    settings, and optionally audio. Never include API secrets by default.
  - *Done when:* a backup can be restored to a clean profile, archive contents
    are validated before writing, and restore conflicts are explained.

### P3 — Design and accessibility

- [ ] **N-12 Consolidate design tokens and improve accessibility**
  `src/renderer/src/styles.css`, `src/renderer/src/polish.css`,
  `src/renderer/src/apple.css`, `src/renderer/src/components/ui.tsx`
  - Reduce overlapping global CSS through shared color, spacing, typography,
    and focus tokens without changing the established light-first visual
    direction. Add modal focus trapping/restoration, keyboard checks, contrast
    checks, and reduced-motion support.
  - *Done when:* main flows pass keyboard-only review in both themes and
    automated accessibility checks; screenshots show no unintended visual
    regressions.
