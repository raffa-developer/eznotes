# ezNotes

[![CI](https://github.com/raffa-developer/eznotes/actions/workflows/ci.yml/badge.svg)](https://github.com/raffa-developer/eznotes/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platform: Windows](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D6)
![Version](https://img.shields.io/badge/version-0.5.2-007AFF)

**Lectures in, study notes out.** ezNotes is a Windows desktop app that records
a lecture, transcribes it, and writes structured Markdown notes you can study
from: concepts, definitions, examples, exam hints, and a glossary.

It is local-first. Audio, transcripts, notes, and API keys are stored on your PC.
Audio is uploaded only to Groq for transcription, and the transcript goes only to
the notes provider you choose. There is no analytics or telemetry. The app is
built around **European Portuguese lectures** and writes the final notes in
**pt-PT**.

> **Language:** the interface can be switched between English and European
> Portuguese in **Settings → Appearance**. Transcription language is selectable
> from Portuguese, English, Spanish, French, German, and Italian. Generated
> study notes are always written in European Portuguese.

## Contents

- [Why ezNotes](#why-eznotes)
- [Status](#status)
- [Features](#features)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Transcription with Groq](#transcription-with-groq)
- [Notes models](#notes-models)
- [Speaker labels](#speaker-labels)
- [Library and schedule](#library-and-schedule)
- [Audio, privacy, and data](#audio-privacy-and-data)
- [Automation, tray, and island](#automation-tray-and-island)
- [Copy and export](#copy-and-export)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Why ezNotes

- **Built for actual lectures.** The live view keeps you oriented while the
  class runs, and the post-class pass rebuilds a cleaner transcript from the
  full recording.
- **Notes, not a transcript dump.** The notes model preserves definitions,
  formulas, examples, exam hints, and lecturer emphasis, grouped by topic.
- **Local-first by default.** Only the audio and transcript you configure leave
  the machine. Notes are plain Markdown files that belong to you.
- **No waiting around after class.** Notes are written first, optional speaker
  detection runs afterwards in the background, and the window can be closed to
  the tray while the note finishes.

## Status

`0.5.2` is early but usable. It is **Windows 10/11 only** and currently meant to
be run from source. There is no signed public installer yet; an unsigned NSIS
build can be produced locally with `npm run dist`.

The full pipeline works end-to-end with local mock services and demo mode. Real
Groq and notes-model calls require your own API keys.

## Features

### Capture and live lecture

- Microphone capture at 16 kHz mono through an AudioWorklet.
- Running live transcript while the lecture is in progress.
- Live outline that refreshes on a configurable interval.
- Pause/resume, elapsed time, and input level.
- Live transcription is silence-trimmed and filtered to reduce Whisper
  hallucinations.
- Recording island: an always-on-top pill with timer, level, pause/resume, stop,
  expand, and open-app controls.

### Transcription and notes

- Full-length second pass after class for better accuracy than the live text.
- Structured Markdown notes with concepts, definitions, examples, exam hints,
  open questions, and a glossary.
- Optional offline speaker labels for the lecturer and students.
- Transcript-only fallback if the notes model fails.
- Regenerate a note from the saved transcript at any time.
- Notes-model network failures are retried once on transient errors.

### Library

- One book per course on a four-column shelf.
- Course covers show the course description, number of notes, date range, and
  audio availability.
- Open a book to see every note for that course as simple paper cards in a
  four-column grid.
- Per-book search, audio-only filter, and newest/oldest/longest sorting.
- Paper cards follow the app theme: white in light mode, app surfaces in dark
  mode.
- Open any note directly from its card.

### Schedule and automation

- Weekly timetable with dated Monday–Sunday columns, a time axis, today
  highlight, and a current-time line.
- Click an empty spot in the timetable to add a class at that time.
- Per-day quick-add buttons and a compact course panel.
- Overlapping classes share the column cleanly.
- Optional automatic recording when a scheduled class begins.
- Tray icon and optional global shortcut.
- Close-to-tray finalization with a native notification when the note is ready.

### Output and design

- Markdown files organised by course and date.
- Export to Markdown, A4 PDF, Obsidian, Notion clipboard, or the clipboard.
- Light, dark, or system theme.
- English and European Portuguese interface.
- macOS-inspired layout, Apple blue, Inter for UI, Newsreader for reading and
  book covers.
- API keys encrypted locally with Windows DPAPI.

## Requirements

| Requirement | Details |
| --- | --- |
| OS | Windows 10 or 11 |
| Node.js | 20 or newer; CI uses Node 24 |
| Microphone | Any input device, selectable in Settings |
| Network | Required for Groq transcription and cloud notes models. Not required when using a local Ollama notes model. |
| API keys | A Groq key for transcription, plus an OpenCode/Groq key or local Ollama for notes |
| Speaker labels | Optional: about 45 MB of models and a small local Node runtime; CPU time grows with lecture length |

macOS and Linux are not supported or tested. Windows DPAPI encryption, the tray,
and the recording island are Windows-specific.

## Quick start

```powershell
git clone https://github.com/raffa-developer/eznotes.git
cd eznotes
npm install
npm run dev
```

On first launch:

1. Open **Schedule** and add your courses and weekly class slots.
2. Open **Settings** and add a Groq key and a notes-model key (or choose
   Ollama).
3. Press **Record lecture** on the dashboard.

### Demo mode

Exercise the whole flow without keys or API spend:

```powershell
$env:EZNOTES_MOCK_AI="1"
npm run dev
```

On bash:

```bash
EZNOTES_MOCK_AI=1 npm run dev
```

Demo mode returns canned Portuguese transcript lines and structured notes. It
exercises recording, WAV writing, the live view, the retention dialog, Markdown
output, the library, and note rendering.

### Build an installer

```powershell
npm run pack   # unpacked app in release\win-unpacked
npm run dist   # NSIS installer in release\
```

The build is unsigned. Windows SmartScreen or an Application Control policy may
block it. Run from source or sign the binary with a trusted code-signing
certificate before distributing it.

## How it works

```text
Microphone
  → AudioWorklet (16 kHz mono PCM)
  → WAV on disk
  → Groq Whisper (live windows + final full pass)
  → timestamped transcript
  → notes model
  → importance filter + structured Markdown
  → optional local speaker diarization in the background
  → Documents\ezNotes\<Course>\<date> <title>.md
```

### Live transcription quality

- Live mode sends 12-second windows every 8 seconds.
- Each window is trimmed with an energy VAD before it reaches Groq.
- Windows without enough recent speech are skipped entirely.
- Groq segment confidence metadata (`avg_logprob`, `no_speech_prob`,
  `compression_ratio`) is used to discard silent, repeated, or unreliable
  segments.
- Known Whisper hallucination phrases are filtered out.
- The default STT model is `whisper-large-v3`, the most accurate option for
  Portuguese. `whisper-large-v3-turbo` is faster and cheaper with a slightly
  higher error rate.

Expect roughly 4–8 seconds of live lag. The final pass re-transcribes the full
recording and is more accurate than the live text.

### Finalization and background work

- Notes are generated and saved before speaker detection starts.
- Closing the window while a note is being written hides it to the tray.
  ezNotes keeps working and sends a native notification when the note is ready.
- Quitting during processing exits the app, but the recording stays on disk and
  can be recovered on the next launch.
- Speaker detection runs in the background after the note is saved. It has a
  10-minute cap and the worker is stopped when the app quits.
- Speaker labels update the saved transcript. Press **Regenerate** on the note
  to apply the labels to the notes.

### Audio retention and integrity

- Retention is chosen after every lecture: keep the audio or delete it now.
- Kept audio is Opus in WebM, about 11 MB/hour.
- WAV is used for transcription and speaker detection.
- If Opus encoding is unavailable, or the WebM is shorter than the WAV, the full
  WAV is kept so playback does not silently lose part of the lecture.
- Playback prefers the longer of the WebM and WAV copies.
- Kept audio is deleted after 30 days by default (configurable from 1 to 365).
  Transcripts and notes are not removed by retention.

### Crash recovery

Recordings use a crash-safe WAV header and manifest. If the app dies or is
closed mid-lecture, the next launch offers to recover the audio and live
transcript. The recorded audio remains on disk until it is recovered or cleaned
up by retention.

## Transcription with Groq

Create a key at <https://console.groq.com/keys>. The default model is
`whisper-large-v3`. `whisper-large-v3-turbo` is available in Settings.

- Transcription language is selected in **Settings → Listening**.
- Course glossaries can be provided per course to improve names and technical
  terms.
- A per-request prompt guides European Portuguese spelling and vocabulary.
- Live transcription can be turned off to save Groq audio minutes. The final
  pass still runs after class.

## Notes models

ezNotes has native adapters for Anthropic Messages, Google Gemini
`generateContent`, and the OpenAI Responses API. Other providers use Chat
Completions (`POST {baseURL}/chat/completions`).

| Provider | Base URL | Default model |
| --- | --- | --- |
| OpenCode Go (default) | `https://opencode.ai/inference/go/openai/v1` | `deepseek-v4.1-flash` |
| OpenCode Console | `https://opencode.ai/inference/openai/v1` | `deepseek-v4.1-flash` |
| Anthropic (Claude) | `https://api.anthropic.com` | `claude-opus-5-5` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | `gemini-3.8-flash` |
| OpenAI Responses | `https://api.openai.com/v1` | `gpt-6-astra` |
| Groq | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b` |
| Ollama (local) | `http://localhost:11434/v1` | `qwen2.5:7b` |
| Custom | any compatible endpoint | any |

Model IDs change often; the model field is editable. For Anthropic, use the base
URL without `/v1` because the adapter calls `/v1/messages`. OpenCode Go is the
default; OpenCode Console is the safer choice for general application traffic.

### Running at $0

1. Use a **Groq key on the free plan**.
2. In **Settings → Listening**, turn off **Live transcript and outline during
   class**. Only the final lecture audio is sent to Groq, which fits the free
   tier much better.
3. In **Settings → Writing**, choose one of:
   - **Ollama (local, free)** — install Ollama and run `ollama pull qwen2.5:7b`.
     Notes are generated entirely on your PC.
   - **Groq (free tier)** — reuses your Groq key. Shorter lectures work best;
     long transcripts can hit Groq's free tokens-per-minute limit.

```powershell
winget install Ollama.Ollama
ollama pull qwen2.5:7b
```

OpenCode's free models are restricted to use inside OpenCode, so they cannot be
used by this app. Live transcription and live outlines require the cloud path;
fully offline transcription would need local Whisper support.

## Speaker labels

Turn on **Settings → Listening → Detect speakers after class**. Speaker detection
is optional and runs locally; it never delays the note.

- The note is saved first, then diarization runs in the background.
- It runs only when the lecture audio is kept, because it needs the WAV.
- The first run downloads about 45 MB of models: pyannote segmentation and
  NVIDIA TitaNet, stored in `%APPDATA%\ezNotes\models\sherpa\`.
- A bundled Node runtime adds about 90 MB to the installer.
- A 90-minute lecture can use roughly 350 MB of memory while diarizing.
- Labels are `Speaker 1`, `Speaker 2`, … in order of first appearance. The note
  prompt treats the most active speaker as the lecturer and marks student
  questions.
- Once labels are ready, open the note and press **Regenerate** to include them.
- If diarization fails or models are missing, the note is still saved with a
  warning. The worker has a 10-minute cap and is killed on app quit.

## Library and schedule

### Library

The library is a course bookshelf, not a flat file list.

- Each course is one book on a four-column shelf.
- A book shows its description, number of notes, date range, and audio marker.
- Opening a book shows its notes as four-column paper cards with title, date,
  duration, summary, reading time, and an **Open** action.
- Each book has its own search, audio-only filter, and sort controls.
- The shelf itself supports search, audio filtering, and sorting by newest,
  oldest, or longest.
- Notes open directly in the note reader. Press `Esc` or use **Library** to
  return to the shelf.

### Schedule

- Monday–Sunday columns with this week's dates and a time axis.
- Today is highlighted and a current-time line is shown on today's column.
- Click an empty spot in the timetable to create a class at that time.
- Each day has a quick-add button.
- Overlapping classes are laid out side by side.
- Courses are managed in the panel beside the timetable.
- A class can be deleted from its edit dialog.

## Audio, privacy, and data

| What | Where |
| --- | --- |
| Notes | `Documents\ezNotes\<Course>\YYYY-MM-DD - <title>.md` |
| Note index and sidecar transcripts | `Documents\ezNotes\.eznotes\` |
| Audio | `%APPDATA%\ezNotes\recordings\rec_*\audio.webm` (or `audio.wav` if Opus was unavailable or incomplete) |
| Settings, schedule, encrypted keys | `%APPDATA%\ezNotes\` |
| Speaker models | `%APPDATA%\ezNotes\models\sherpa\` |
| Diagnostics log | `%APPDATA%\ezNotes\eznotes.log` |

- Audio is sent to Groq for transcription.
- The transcript, course, date, duration, and glossary are sent to the chosen
  notes endpoint.
- Speaker detection runs locally; its models are downloaded from GitHub releases.
- No analytics or telemetry is built in.
- API keys are encrypted with Windows DPAPI through Electron `safeStorage` and
  are never written to the notes folder or the repository.
- Logs contain model and finish-reason diagnostics, never API keys or full
  transcripts.
- Recording a lecture may require consent. Inform the lecturer and follow your
  institution's rules. The live screen always shows a recording indicator.

## Automation, tray, and island

### Automatic recording

Turn on **Settings → Automation → Start recording automatically when a class
begins**. It is **off by default**.

- ezNotes must be running; it checks the weekly schedule every 20 seconds.
- A heads-up notification can appear 0, 5, 10, or 15 minutes before class.
- Recording starts only for classes that begin after ezNotes launched, with a
  two-minute grace window, and only once per class.
- You can stop or discard an automatic recording exactly like a manual one.

### Tray and global hotkey

ezNotes adds a tray icon while it runs.

- Open ezNotes, start a quick recording, pause/resume, stop, or quit.
- The menu reflects the current recording state.
- The optional global hotkey is off by default. Enable it in
  **Settings → Automation** and choose one of the available combinations. The
  default is **Ctrl + Alt + Shift + R**.
- When idle, the hotkey starts a quick recording. If a scheduled class is in
  progress, that course is used; otherwise the note is filed under “Geral”.
- During a recording, the hotkey stops it and opens the retention dialog.
- If the shortcut is already in use, ezNotes warns you and leaves the hotkey
  inactive.

### Recording island

When a lecture is active and ezNotes loses focus — including minimize, Alt-Tab,
or clicking another app — a small always-on-top pill appears at the top centre
of the current display.

- Shows timer and input level.
- Pause/resume, stop, expand, and open-app controls.
- After stopping, the retention choice can be made directly from the island.
- When the note is ready, it can open the finished note.
- The island is just the dark pill: transparent window, no white frame or native
  shadow.

## Copy and export

On a note page, use **Copy note** or the **Export** menu:

- **Copy Markdown** — the note body on the clipboard.
- **Save as Markdown** — a portable `.md` file.
- **Save as PDF** — A4, using the styled note view.
- **Send to Obsidian** — writes `<vault>\ezNotes\<Course>\<date> <title>.md`.
  Choose the vault once in **Settings → Exports**.
- **Copy for Notion** — Markdown on the clipboard, ready to paste.

## Development

### Tech stack

- Electron 44
- React 19
- TypeScript 7
- Vite 8 / electron-vite 6
- Vitest 5
- `sherpa-onnx-node` for offline speaker detection
- `webm-muxer` and WebCodecs for compact Opus audio

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

There are **84 tests in 10 files**. Coverage includes:

- Transcript overlap trimming and segment deduplication.
- Speech/VAD analysis and low-confidence Whisper filtering.
- WebM duration parsing and the WAV/WebM retention decision.
- Transient notes-model error classification.
- Frontmatter parsing, filename sanitising, and title/summary extraction.
- Upcoming-class calculation, auto-start scheduling, and quick recording lookup.
- Cue detection, log rotation, speaker assignment, provider response parsing, and
  translation lookup/interpolation.

Main-process modules are imported under Node with `electron` aliased to
`tests/electron-stub.ts`.

`.github/workflows/ci.yml` runs `npm ci`, `typecheck`, `test`, and `build` on
Node 24 for every push to `main` and every pull request.

### Project layout

```text
src/
  main/        Electron main process: recording, STT, LLM, notes, storage
    diarizer/  Offline speaker-detection worker
  preload/     Typed IPC bridge
  renderer/    React UI: dashboard, live, library, note, schedule, settings
  shared/      Types shared by main and renderer
tests/         Node stubs for unit tests
scripts/       CDP, mock-service, and Node-runtime helpers
resources/     App icon and packaged extras
vendor/        Node runtime fetched by npm run fetch:node (gitignored)
```

`npm run pack` and `npm run dist` fetch the Node runtime automatically and copy
it, the diarization worker, and the sherpa native modules into `resources/`.

### Local mocks and UI inspection

`scripts/mock-services.mjs` starts local stand-ins for Groq (port 4011) and a
notes model (port 4010), so you can exercise the network path without credits.
`scripts/inspect.mjs` and `scripts/screenshot.mjs` are CDP helpers used during UI
work.

## Troubleshooting

- **A note is empty or incomplete** — open it and press **Regenerate**. ezNotes
  keeps the transcript even when the audio is deleted. It retries the model with
  a larger output budget and a compact prompt. If the model still fails, a
  transcript-only note is saved instead of an empty file.
- **Transcription or notes fail** — audio and transcript stay on disk. Check the
  keys in Settings, then retry from the recording or regenerate the note.
- **The app will not start from a local build** — the executable is unsigned;
  SmartScreen or Application Control may block it. Run from source or sign the
  binary.
- **Speaker labels are missing** — the optional models may not be downloaded, or
  diarization may have failed. Check the warning on the note or the log. The note
  itself is still complete.
- **Playback is shorter than the lecture** — old recordings may have a truncated
  WebM and no WAV left. Newer builds keep the full WAV when the WebM is
  incomplete. Existing audio cannot be reconstructed.
- **Logs** — see `%APPDATA%\ezNotes\eznotes.log` for model and finish-reason
  diagnostics. It never contains API keys or full transcripts.

## Known limitations

- Windows 10/11 only; macOS and Linux are not supported.
- Live transcription requires a network connection to Groq. Local Whisper is not
  implemented yet.
- Speaker detection is optional, CPU-heavy on long lectures, and produces
  generic `Speaker N` labels rather than real names.
- Speaker detection requires keeping the lecture audio.
- A public signed installer and auto-update flow are not available yet.
- Provider and backend diagnostic error details may be shown in English even
  when the interface is in Portuguese.
- Live transcripts can still make mistakes. The VAD and confidence filters
  reduce hallucinations but cannot remove them entirely.
- The notes model can return an incomplete note; use **Regenerate** or switch
  models if it does.

## Roadmap

The detailed, tickable list lives in [`TODO.md`](TODO.md). Highlights:

- Local/offline transcription option.
- Signed Windows installer and automatic updates.
- More keyboard shortcuts and accessibility refinements.
- Further accuracy work for live and final Portuguese transcription.
- Broader provider/model presets.

Recently shipped: crash-safe recordings and recovery, transcript-only notes,
background speaker labels, opt-in auto-start, tray and global hotkey support,
compact Opus audio with WAV integrity fallback, native Anthropic/Gemini/OpenAI
adapters, retrying notes-model calls, close-to-tray finalization, the weekly
timetable grid, and the course-book library.

## Contributing

Contributions are welcome: bug reports, feature ideas, documentation, and pull
requests.

1. Open an issue describing the problem or proposal.
2. Fork the repository and create a branch.
3. Run `npm test` and `npm run typecheck` before opening a pull request.
4. Keep generated note prompts and note output in European Portuguese (`pt-PT`).
5. Never commit API keys, personal notes, or recordings.

The UI is available in English and European Portuguese. When adding strings, use
`t('English source')` and add the pt-PT entry under
`src/renderer/src/locales/`.

## License

[MIT](LICENSE) © 2026 Rafael Gonçalves

Bundled and downloaded third-party components are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
