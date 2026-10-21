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
  - The note prompt treats the most active speaker as the lecturer and marks
    student questions; the note transcript shows speaker badges.
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

- [ ] **Compress audio (Opus) instead of WAV**
  WAV at 16 kHz mono is ~115 MB/hour (`src/main/wav.ts`). Electron has no
  built-in encoder, so this needs `ffmpeg` (bundled binary) or an Opus binding.
  - Keep WAV as the recording format, transcode in `finalize()` before the
    retention decision.
  - Update the `eznotes://audio/` protocol to serve `.opus` with the right MIME
    type (`src/main/index.ts:617`).
  - *Done when:* a kept lecture is <10 MB/hour and still plays in `NotePage`.

- [x] **Tray icon + configurable global hotkey**
  - Tray menu: open, start quick recording, pause/resume, stop, quit; reflects
    the current recording state.
  - Hotkey is opt-in and selectable (default `Ctrl+Alt+Shift+R`, because
    `Ctrl+Alt+R` is often taken). Registration conflicts produce a warning.
  - A quick recording uses the class in progress, or “Geral” if none; pressing
    the shortcut again stops and opens the retention dialog.
  - *Verified:* the shortcut started “Hotkey Course”, a second press stopped it
    and opened the retention dialog; the Settings select shows the stored key.

- [ ] **More LLM providers (non-Chat-Completions shapes)**
  `chat()` hardcodes `POST {baseURL}/chat/completions` and `max_tokens`
  (`src/main/llm.ts:50,69`), so GPT, Claude, and Gemini native APIs are out.
  - Split `LlmProvider` into an adapter interface: `chat()` per provider, with
    its own endpoint, auth header, token field, and response parser.
  - Keep `opencode-*`, `groq`, `ollama`, `custom` on the current adapter.
  - *Done when:* Settings can pick a Claude or Gemini model and the test button
    passes.

- [ ] **Wire up the UI language setting**
  `Settings.uiLanguage` (`'en' | 'pt'`) is persisted and validated but never
  read; UI strings are hardcoded English while note content is Portuguese.
  - Add a tiny dictionary module and replace literals in `renderer/src/pages/*`.
  - *Done when:* switching the setting changes the interface without a reload.

---

## P2 — Refinements

- [ ] Make the live-outline cadence configurable (currently fixed at 90 s,
  `src/main/recording.ts:44`) and skip the call when the lecture is silent.
- [ ] Island: verify behaviour across monitors with different DPI/scale factors;
  it is positioned from `mainWindow` bounds (`positionIsland`,
  `src/main/index.ts:206`).
- [ ] Make the island's `hasShadow: false` a platform decision instead of a
  blanket hardcode (`src/main/index.ts:181`).
- [ ] Add a React error boundary so a renderer crash doesn't leave a blank window
  while a recording is running.

---

## Engineering hygiene

- [x] **Tests and CI**
  `vitest` + `npm test` now cover `trimOverlap`/`dedupeSegments`,
  `splitFrontmatter`, `sanitizeFilename`, `upcomingClasses`, `detectCues`, log
  rotation, speaker assignment, auto-start scheduling, and title/summary
  extraction — 50 tests across 7 files.
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
