import { describe, expect, it } from 'vitest'
import { sanitizeFilename, splitFrontmatter } from './notes'

describe('splitFrontmatter', () => {
  it('parses the attributes written by saveNote', () => {
    const raw = `---
id: "note_1"
title: "Derivadas"
course: "Cálculo"
courseId: null
duration: 90
tags: ["MAT101","exame"]
---
# Derivadas

Corpo da nota.
`

    const { attributes, body } = splitFrontmatter(raw)

    expect(attributes).toEqual({
      id: 'note_1',
      title: 'Derivadas',
      course: 'Cálculo',
      courseId: null,
      duration: 90,
      tags: ['MAT101', 'exame']
    })
    expect(body).toBe('# Derivadas\n\nCorpo da nota.\n')
  })

  it('returns the raw text when there is no frontmatter', () => {
    expect(splitFrontmatter('# Título\n')).toEqual({
      attributes: {},
      body: '# Título\n'
    })
  })

  it('returns the raw text when the frontmatter block is not closed', () => {
    const raw = '---\nid: "note_1"\n# Corpo'
    expect(splitFrontmatter(raw)).toEqual({ attributes: {}, body: raw })
  })
})

describe('sanitizeFilename', () => {
  it('replaces characters Windows rejects', () => {
    expect(sanitizeFilename('Aula: derivadas / limites?')).toBe(
      'Aula derivadas limites'
    )
  })

  it('trims trailing dots and spaces', () => {
    expect(sanitizeFilename('  Nota...  ')).toBe('Nota')
  })

  it('keeps accented letters', () => {
    expect(sanitizeFilename('Cálculo Diferencial')).toBe('Cálculo Diferencial')
  })

  it('caps the result at 90 characters', () => {
    expect(sanitizeFilename('a'.repeat(120))).toHaveLength(90)
  })

  it('falls back to Geral for an unusable name', () => {
    expect(sanitizeFilename('   ')).toBe('Geral')
    expect(sanitizeFilename('???')).toBe('Geral')
  })
})
