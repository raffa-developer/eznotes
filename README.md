# ezNotes

[![CI](https://github.com/raffa-developer/eznotes/actions/workflows/ci.yml/badge.svg)](https://github.com/raffa-developer/eznotes/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platform: Windows](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D6)

**Lectures in, study notes out.** ezNotes is a Windows desktop app that records a
lecture, transcribes it in **European Portuguese**, and writes structured Markdown
notes you can study from: concepts, definitions, examples, exam hints, and a
glossary.

It is local-first. Audio, transcripts, notes, and API keys stay on your PC; the
only outbound requests are the ones you configure.

> **Language:** transcription and every generated note are in European Portuguese
> (`pt-PT`). The interface is currently in English — UI localization is on the
> [roadmap](TODO.md).

## Status

`0.5.x` — early but usable, Windows 10/11 only. The full pipeline works end-to-end
in demo mode and against local mock endpoints; real Groq and notes-model calls
need your own API keys. No prebuilt installers are published yet, so run from
source for now.

## Features

- **Live view** — running transcript and a rough outline while the lecture happens.
- **Accurate second pass** — the full audio is re-transcribed after class instead
  of relying on the live chunks.
- **Structured notes** — concepts, definitions, examples, exam hints, open
  questions, and a glossary, grouped by topic rather than chronology.
- **Speaker labels** (optional) — an offline diarization pass separates the
  lecturer from students in the final transcript. No extra API key; the models
  download once.
- **Markdown you own** — one plain file per lecture, organised by course and date.
- **Audio retention is a choice** — keep the recording for replay or delete it
  immediately. The transcript and note are kept either way.
- **Crash recovery** — if the app dies mid-lecture, ezNotes finds the audio on the
  next launch and can finish the note.
- **Transcript-only fallback** — if transcription or the model fails, save the
  transcript as a note instead of losing the lecture.
- **Export anywhere** — clipboard, Markdown, A4 PDF, an Obsidian vault, or Notion.
- **Recording island** — an always-on-top pill with timer, input level, pause,
  stop, and a shortcut to the finished note when the main window is minimized.
- **Optional auto-start** — off by default; when enabled, ezNotes starts
  recording when a scheduled class begins.
- **Tray and hotkey** — start, pause, or stop from the tray or an optional,
  configurable global shortcut.
- **Local-first keys** — API keys are encrypted with Windows DPAPI through
  Electron `safeStorage`.

## Requirements

| Requirement | Details |
| --- | --- |
| OS | Windows 10 or 11 |
| Node.js | 20+ (CI uses 24) |
| Microphone | Any input device; selectable in Settings |
| Network | Needed for Groq and cloud notes models. Ollama can run the notes step locally. |
| API keys | A Groq key for transcription, plus an OpenCode/Groq key or local Ollama for notes |
| Speaker labels | Optional. ~45 MB model download and a few minutes of local CPU per lecture |

macOS and Linux are not supported or tested: DPAPI encryption and the recording
island are Windows-specific.

## Getting started

```powershell
git clone https://github.com/raffa-developer/eznotes.git
cd eznotes
npm install
npm run dev
```

On first launch:

1. Open **Schedule** and add your courses and weekly class slots.
2. Open **Settings** and add a Groq key and a notes-model key (or choose Ollama).
3. Press **Record lecture** on the dashboard.

### Demo mode

Try the whole flow without keys or API spend:

```powershell
$env:EZNOTES_MOCK_AI="1"
npm run dev
```

On bash: `EZNOTES_MOCK_AI=1 npm run dev`.

Demo mode returns canned Portuguese transcript lines and a canned structured
note. It exercises recording, WAV writing, the live view, the retention dialog,
Markdown output, the library, and note rendering.

### Build an installer

```powershell
npm run pack   # unpacked app in release\win-unpacked
npm run dist   # NSIS installer in release\
```

The generated executable is unsigned. Windows SmartScreen or an Application
Control policy may block it, so run from source or sign the binary with a
trusted code-signing certificate before distributing it.

## AI providers

### Transcription — Groq

Create a key at <https://console.groq.com/keys>. The default model is
`whisper-large-v3-turbo`; `whisper-large-v3` is available as a slower, more
accurate option.

### Notes — OpenAI-compatible Chat Completions

ezNotes calls `POST {baseURL}/chat/completions`. Presets:

| Provider | Base URL | Default model |
| --- | --- | --- |
| OpenCode Go (default) | `https://opencode.ai/inference/go/openai/v1` | `deepseek-v4.1-flash` |
| OpenCode Console | `https://opencode.ai/inference/openai/v1` | `deepseek-v4.1-flash` |
| Groq | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b` |
| Ollama (local) | `http://localhost:11434/v1` | `qwen2.5:7b` |
| Custom | any compatible endpoint | any |

OpenCode's docs describe Go as intended for coding-agent traffic; for a general
app, **OpenCode Console** is the safer choice. Only Chat Completions-shaped APIs
are supported — GPT, Claude, and Gemini native APIs have a different shape and
are on the roadmap.

### Running at $0

1. Use a **Groq key on the free plan**.
2. In **Settings → Listening**, turn **Live transcript and outline during class**
   off. Only the final lecture audio is sent to Groq, which fits the free tier
   much better.
3. In **Settings → Writing**, choose one of:
   - **Ollama (local, free)** — install Ollama and run `ollama pull qwen2.5:7b`.
     Notes are generated entirely on your PC.
   - **Groq (free tier)** — reuses your Groq key. Good for shorter lectures; long
     transcripts can hit Groq's free tokens-per-minute limit.

OpenCode's free models are restricted to use inside OpenCode, so they cannot be
used by this app. Live transcription and live outlines require the cloud path;
fully offline transcription would need local Whisper support.

```powershell
winget install Ollama.Ollama
ollama pull qwen2.5:7b
```

## How it works

```text
Microphone
  → AudioWorklet (16 kHz mono PCM)
  → WAV on disk
  → Groq Whisper (live chunks + final full pass)
  → timestamped transcript
  → optional local speaker diarization
  → notes model
  → importance filter + structured Markdown
  → Documents\ezNotes\<Course>\<date> <title>.md
```

- Live transcription sends 7.5-second chunks every 5 seconds and removes
  overlapping words. Expect roughly 3–6 seconds of lag.
- The final pass re-transcribes the full audio, so it is more accurate than the
  live text.
- The prompt asks the model to drop logistics, chatter, and repetition while
  keeping definitions, formulas, examples, and lecturer emphasis.
- Live outlines refresh about every 90 seconds to keep token use low.
- Audio retention is decided after every class. Kept audio is deleted after 30
  days by default (configurable), while transcripts and notes remain.

## Speaker labels (optional)

Turn on **Settings → Listening → Detect speakers after class**. The final
transcript is then diarized on your PC before the note is written.

- This step runs entirely on your machine: no extra API key, and no additional
  audio leaves the PC.
- The first run downloads about 45 MB of models (pyannote segmentation and
  NVIDIA TitaNet), stored under `%APPDATA%\ezNotes\models\sherpa\`.
- A small Node runtime is bundled for the diarizer, which adds about 90 MB to
  the installer.
- Expect a few minutes of CPU time for a long lecture — roughly 4 minutes for a
  90-minute lecture on a modern 4-core laptop. The processing screen shows
  **Detecting speakers**. Memory use grows with the lecture; a 90-minute
  recording needs roughly 350 MB while it runs.
- Labels are `Speaker 1`, `Speaker 2`, … in order of first appearance. The note
  prompt treats the most active speaker as the lecturer and marks student
  questions.
- If diarization fails or the models are missing, the note is still written,
  with a warning.

## Data and privacy

| What | Where |
| --- | --- |
| Notes | `Documents\ezNotes\<Course>\YYYY-MM-DD - <title>.md` |
| Note index and transcripts | `Documents\ezNotes\.eznotes\` |
| Audio | `%APPDATA%\ezNotes\recordings\rec_*\audio.wav` |
| Settings, schedule, encrypted keys | `%APPDATA%\ezNotes\` |
| Speaker models | `%APPDATA%\ezNotes\models\sherpa\` |
| Diagnostics log | `%APPDATA%\ezNotes\eznotes.log` |

- Audio is sent to Groq for transcription.
- The transcript is sent to the chosen notes endpoint.
- Speaker detection runs locally; its models are downloaded from GitHub releases.
- No analytics or telemetry is built in.
- Keys are never written to the notes folder or the repository.
- Recording a lecture may require consent. Inform the lecturer and follow your
  institution's rules; the live screen always shows a recording indicator.

## Recording island

When a lecture is recording and you minimize the main window, a small
always-on-top pill appears at the top centre of the display. It shows the timer
and input level and offers pause/resume, stop, expand, and open-app controls.
After stopping, you can keep or delete the audio directly from the island; when
the note is ready, it can open it.

## Automatic recording (optional)

Turn on **Settings → Automation → Start recording automatically when a class
begins**. It is **off by default**.

- ezNotes must be running; it checks your weekly schedule every 20 seconds.
- A heads-up notification appears before class. Choose Off, 5, 10, or 15
  minutes in the same section.
- Recording starts only for classes that begin after ezNotes launched (with a
  two-minute grace window), and only once per class.
- You can stop or discard the recording exactly like a manual one.

## Tray and global hotkey

ezNotes adds a tray icon while it runs:

- **Open ezNotes**, start a quick recording, pause/resume, stop, or quit.
- The menu reflects the current recording state.

The optional global hotkey is **off by default**. Enable it in
**Settings → Automation** and choose one of four combinations; the default is
**Ctrl + Alt + Shift + R** (Ctrl+Alt+R is commonly taken).

- Pressing it when idle starts a quick recording. If a scheduled class is in
  progress, that course is used; otherwise the note is filed under “Geral”.
- Pressing it during a recording stops it and opens the retention dialog.
- If the shortcut is already used by another app, ezNotes warns you after
  saving and leaves the hotkey inactive.

## Copy and export

On a note page, use **Copy note** or the **Export** menu:

- **Copy Markdown** — the note body on the clipboard.
- **Save as Markdown** — a portable `.md` file.
- **Save as PDF** — A4, using the same styled note view you read in the app.
- **Send to Obsidian** — writes `<vault>\ezNotes\<Course>\<date> <title>.md`.
  The vault is chosen once in **Settings → Exports**.
- **Copy for Notion** — Markdown on the clipboard, ready to paste.

The library also has a quick copy button on every note.

## Development

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app with hot reload |
| `npm run build` | Build main, preload, and renderer into `out/` |
| `npm run typecheck` | Typecheck the Node and web TypeScript projects |
| `npm test` | Run the Vitest suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run fetch:node` | Download the Node runtime used by speaker detection (Windows x64) |
| `npm run preview` | Preview the production build |
| `npm run pack` | Build an unpacked app in `release/win-unpacked` |
| `npm run dist` | Build the NSIS installer in `release/` |

### Tests and CI

Unit tests cover transcript overlap trimming and deduplication, frontmatter
parsing, filename sanitising, upcoming-class calculation, auto-start scheduling,
quick-recording class lookup, cue detection, log rotation, speaker assignment,
and title/summary extraction. The main-process modules are imported under Node
with `electron` aliased to `tests/electron-stub.ts`.

`.github/workflows/ci.yml` runs `npm ci`, `typecheck`, `test`, and `build` on
Node 24 for every push to `main` and every pull request.

`scripts/mock-services.mjs` starts local stand-ins for Groq (port 4011) and a
notes model (port 4010) if you want to exercise the network path without
credits. `scripts/inspect.mjs` and `scripts/screenshot.mjs` are CDP helpers used
during UI work.

### Project layout

```text
src/
  main/        Electron main process: recording, STT, LLM, notes, storage
    diarizer/  Offline speaker-detection worker
  preload/     Typed IPC bridge
  renderer/    React UI (dashboard, live, library, note, schedule, settings)
  shared/      Types shared by main and renderer
tests/         Node stubs for unit tests
scripts/       Local CDP, mock-service, and Node-runtime helpers
vendor/        Node runtime fetched by npm run fetch:node (gitignored)
```

`npm run pack` and `npm run dist` fetch the Node runtime automatically and copy
it, the diarization worker, and the sherpa native modules into
`resources/`.

## Troubleshooting

- **A note is empty or incomplete** — open it and click **Regenerate**.
  ezNotes keeps the transcript even when the audio is deleted, and retries the
  model with a larger output budget and a compact prompt. If the model still
  fails, a transcript-only note is saved instead of an empty file.
- **Transcription or notes fail** — the audio and transcript stay on disk.
  Check the keys in Settings, then retry from the recording or regenerate the
  note.
- **The app will not start from a release build** — the executable is unsigned;
  SmartScreen or an Application Control policy may block it. Run from source or
  sign the binary.
- **Logs** — `%APPDATA%\ezNotes\eznotes.log` contains model and finish-reason
  diagnostics, never API keys or full transcripts.

## Roadmap

The detailed, tickable list lives in [`TODO.md`](TODO.md). Highlights:

- Opus audio instead of WAV to save disk
- Native adapters for non-Chat-Completions providers
- Portuguese (pt-PT) interface localization
- More UI refinements and cross-monitor island behaviour

Recently shipped: crash-safe recordings, recovery of interrupted lectures,
transcript-only notes, optional local speaker labels, opt-in auto-start, and the
tray icon with a configurable global hotkey.

## Contributing

Contributions are welcome — bug reports, feature ideas, docs, and pull requests.

1. Open an issue describing the problem or proposal.
2. Fork the repository and create a branch.
3. Run `npm test` and `npm run typecheck` before opening a pull request.
4. Keep generated note prompts and output in European Portuguese (`pt-PT`).
5. Never commit API keys, personal notes, or recordings.

The interface strings are currently English. If you want to help localize the
app, see the `uiLanguage` setting and P1-6 in the roadmap.

## License

[MIT](LICENSE) © 2026 Rafael

Bundled and downloaded third-party components are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Gonçalves
