import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Schedule, Settings } from '../shared/types'
import { getNote, saveNote, writeNoteTranscript } from './notes'
import { createBackup, inspectBackup, restoreBackup } from './backup'

const roots: string[] = []

function temp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  roots.push(dir)
  return dir
}

function settings(notesDir: string): Settings {
  return {
    stt: {
      provider: 'groq',
      model: 'whisper-large-v3',
      language: 'pt',
      liveTranscript: true,
      liveOutlineSeconds: 90,
      speakerLabels: false
    },
    llm: {
      provider: 'opencode-console',
      baseURL: 'https://opencode.ai/inference/openai/v1',
      model: 'deepseek-v4.1-flash'
    },
    notesDir,
    obsidianVault: '',
    microphoneId: null,
    retentionDays: 30,
    theme: 'dark',
    uiLanguage: 'pt',
    notifyBeforeMinutes: 5,
    autoStartRecording: false,
    globalHotkey: false,
    globalHotkeyKey: 'Ctrl+Alt+Shift+R'
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('local backup', () => {
  it('backs up notes, transcripts, schedule, and sanitized settings', async () => {
    const notesDir = temp('eznotes-backup-notes-')
    const userData = temp('eznotes-backup-data-')
    const parent = temp('eznotes-backup-out-')
    const schedule: Schedule = {
      courses: [
        { id: 'c1', name: 'Redes', code: 'IRD', color: '#7cd4fd', glossary: [] }
      ],
      slots: [
        {
          id: 's1',
          courseId: 'c1',
          weekday: 2,
          startTime: '10:00',
          endTime: '12:00'
        }
      ]
    }
    fs.writeFileSync(
      path.join(userData, 'schedule.json'),
      JSON.stringify(schedule)
    )
    fs.writeFileSync(
      path.join(userData, 'secrets.json'),
      JSON.stringify({ encrypted: { groqApiKey: 'dpapi:secret' } })
    )

    saveNote({
      id: 'note_backup',
      title: 'Aula de redes',
      courseId: 'c1',
      courseName: 'Redes',
      date: '2026-11-19T10:00:00.000Z',
      durationSec: 3600,
      recordingId: null,
      language: 'pt',
      tags: [],
      markdown: '# Aula de redes\n\nConteúdo.',
      notesDir
    })
    writeNoteTranscript(notesDir, 'note_backup', [
      { id: 's1', start: 1, end: 2, text: 'Transcrição guardada.' }
    ])

    const outcome = await createBackup(
      parent,
      notesDir,
      userData,
      settings(notesDir),
      false
    )
    expect(outcome.noteCount).toBe(1)
    expect(outcome.audioCount).toBe(0)

    const manifest = inspectBackup(outcome.path)
    expect(manifest.noteCount).toBe(1)
    expect(manifest.recordingIds).toEqual([])
    expect(manifest.settings.notesDir).toBe('')
    expect(fs.existsSync(path.join(outcome.path, 'notes', 'Redes'))).toBe(true)
    expect(fs.existsSync(path.join(outcome.path, 'app', 'schedule.json'))).toBe(
      true
    )
    expect(fs.existsSync(path.join(outcome.path, 'secrets.json'))).toBe(false)

    const destination = temp('eznotes-restore-out-')
    const recordings = temp('eznotes-restore-audio-')
    const restored = await restoreBackup(outcome.path, destination, recordings)
    expect(restored.noteCount).toBe(1)
    expect(restored.audioCount).toBe(0)
    expect(restored.warnings).toEqual([])
    expect(restored.notesDir).not.toBe(notesDir)
    expect(restored.settings.uiLanguage).toBe('pt')
    expect(restored.schedule?.slots).toHaveLength(1)
    expect(getNote(restored.notesDir, 'note_backup')?.transcript[0].text).toBe(
      'Transcrição guardada.'
    )
  })

  it('rejects folders without a valid manifest', () => {
    const empty = temp('eznotes-bad-backup-')
    expect(() => inspectBackup(empty)).toThrow('not an ezNotes backup')
  })
})
