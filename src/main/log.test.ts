import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { rotateLogFile } from './log'

const dirs: string[] = []

function tempLog(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eznotes-log-'))
  dirs.push(dir)
  return path.join(dir, 'eznotes.log')
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('rotateLogFile', () => {
  it('leaves a small log alone', () => {
    const file = tempLog()
    fs.writeFileSync(file, 'small')

    expect(rotateLogFile(file, 1024)).toBe(false)
    expect(fs.readFileSync(file, 'utf8')).toBe('small')
  })

  it('moves a full log to .1', () => {
    const file = tempLog()
    fs.writeFileSync(file, 'x'.repeat(2048))

    expect(rotateLogFile(file, 1024)).toBe(true)
    expect(fs.existsSync(file)).toBe(false)
    expect(fs.readFileSync(`${file}.1`, 'utf8')).toHaveLength(2048)
  })

  it('replaces the previous rotation', () => {
    const file = tempLog()
    fs.writeFileSync(`${file}.1`, 'old')
    fs.writeFileSync(file, 'x'.repeat(2048))

    expect(rotateLogFile(file, 1024)).toBe(true)
    expect(fs.readFileSync(`${file}.1`, 'utf8')).toHaveLength(2048)
  })

  it('returns false when the log does not exist yet', () => {
    expect(rotateLogFile(tempLog(), 1024)).toBe(false)
  })
})
