# TODO — known limits and next steps

Working list derived from the README's "Known limits / next steps" plus a pass
over the code. Ordered by what actually blocks using ezNotes for a real semester.

> The tickable checklist lives in [`.opencode/todos.md`](.opencode/todos.md).
> This file keeps the detail, file references, and acceptance criteria.

Legend: **P0** = risk of losing a lecture · **P1** = expected product gap ·
**P2** = polish.

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

- [ ] **Guard against a half-written note**
  `finalize()` writes the transcript before calling the model, and only saves
  Markdown at the end. A failure leaves an orphan transcript and no way back
  except the retry path. Keep the transcript (already done) and expose it from
  the error state as "save transcript-only note" instead of only doing that
  automatically when the key is missing (`src/main/recording.ts:313-348`).

---

## P1 — Product gaps

- [ ] **Speaker diarization (lecturer vs. students)**
  Groq Whisper returns flat segments. Needs either a diarizing STT provider or a
  local pass (whisperX / pyannote) before `generateNotes`.
  - Data shape already supports it loosely: add `speaker?: string` to
    `TranscriptSegment` (`src/shared/types.ts:91`) and render it in `Live` and
    `NotePage`.
  - *Done when:* the note prompt can prefer lecturer content and label quotes.

- [ ] **Automatic recording at class time**
  `upcomingClasses()` already computes `isNow` (`src/main/schedule.ts:113`) and
  `notifyBeforeMinutes` is stored but never read.
  - Notify N minutes before a slot (Electron `Notification` or tray).
  - Optional opt-in auto-start with countdown + cancel.
  - *Done when:* closing the laptop lid is the only thing the user has to
    remember.

- [ ] **Compress audio (Opus) instead of WAV**
  WAV at 16 kHz mono is ~115 MB/hour (`src/main/wav.ts`). Electron has no
  built-in encoder, so this needs `ffmpeg` (bundled binary) or an Opus binding.
  - Keep WAV as the recording format, transcode in `finalize()` before the
    retention decision.
  - Update the `eznotes://audio/` protocol to serve `.opus` with the right MIME
    type (`src/main/index.ts:617`).
  - *Done when:* a kept lecture is <10 MB/hour and still plays in `NotePage`.

- [ ] **Tray icon + global recording hotkey**
  No `Tray` and no `globalShortcut` anywhere in `src/main/index.ts`. Once the
  window is closed during a recording the user can only reach the app through
  the island.
  - Tray menu: record/pause/stop, open app, quit; reflect recording state.
  - Global shortcut (e.g. `Ctrl+Alt+R`) with a conflict check.
  - *Done when:* a lecture can be started without focusing the app.

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

## P2 — Polish

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

- [ ] **Tests and CI**
  No test files and no test script exist. Highest-value first targets are pure
  functions: `trimOverlap`/`dedupeSegments`, `splitFrontmatter`,
  `sanitizeFilename`, `upcomingClasses`, `detectCues`.
  - Add `vitest` + `npm test`, then a GitHub Actions job running
    `typecheck` + `test` + `build`.

- [ ] **Stop hardcoding the version in HTTP clients**
  `'User-Agent': 'ezNotes/0.5.1'` appears in `src/main/stt.ts:64` and
  `src/main/llm.ts:62` and will silently drift from `package.json`.
  - Use `app.getVersion()` (or inject it once from `index.ts`).

- [ ] **Log rotation**
  `%APPDATA%\ezNotes\eznotes.log` grows without bound. Rotate at ~2 MB and keep
  two files.

- [ ] Link this file from the README's "Known limits / next steps" section so
  there is one source of truth.
