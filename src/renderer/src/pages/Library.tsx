import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  AudioLines,
  BookOpen,
  CalendarDays,
  Clock,
  FolderOpen,
  Search,
  UserRound,
  X
} from 'lucide-react'
import type { NoteMeta } from '../../../shared/types'
import { useApp } from '../state/AppContext'
import { Button, EmptyState } from '../components/ui'
import { t, uiLocale } from '../i18n'
import { formatDate, formatDuration } from '../lib/format'

interface CourseBook {
  key: string
  name: string
  code?: string
  lecturer?: string
  description?: string
  color: string
  glossary: string[]
  notes: NoteMeta[]
  earliest: number
  latest: number
  totalDuration: number
  audioCount: number
}

export default function Library(): React.JSX.Element {
  const { notes, schedule, loading, toast } = useApp()
  const [query, setQuery] = useState('')
  const [onlyAudio, setOnlyAudio] = useState(false)
  const [sort, setSort] = useState<'newest' | 'oldest' | 'longest'>('newest')
  const [openBookKey, setOpenBookKey] = useState<string | null>(null)
  const navigate = useNavigate()

  const allBooks = useMemo(() => {
    const map = new Map<string, CourseBook>()

    for (const note of notes) {
      const key = note.courseId ?? `course-name:${note.courseName}`
      const course = schedule.courses.find((item) => item.id === note.courseId)
      let book = map.get(key)
      if (!book) {
        const name = course?.name ?? note.courseName ?? t('General')
        const code = course?.code?.trim() || undefined
        const glossary = course?.glossary ?? []
        const description = glossary
          .map((term) => term.trim())
          .find(
            (term) =>
              term &&
              term.toLocaleLowerCase() !== name.toLocaleLowerCase() &&
              term.toLocaleLowerCase() !== code?.toLocaleLowerCase()
          )
        book = {
          key,
          name,
          code,
          lecturer: course?.lecturer,
          description,
          color: course?.color ?? '#8e8e93',
          glossary,
          notes: [],
          earliest: Number.POSITIVE_INFINITY,
          latest: 0,
          totalDuration: 0,
          audioCount: 0
        }
        map.set(key, book)
      }
      book.notes.push(note)
    }

    for (const book of map.values()) {
      book.notes.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      book.earliest = Math.min(
        ...book.notes.map((note) => new Date(note.date).getTime())
      )
      book.latest = Math.max(
        ...book.notes.map((note) => new Date(note.date).getTime())
      )
      book.totalDuration = book.notes.reduce(
        (sum, note) => sum + note.durationSec,
        0
      )
      book.audioCount = book.notes.filter((note) => note.hasAudio).length
    }

    return [...map.values()]
  }, [notes, schedule.courses])

  const booksWithAudio = useMemo(
    () => allBooks.filter((book) => book.audioCount > 0).length,
    [allBooks]
  )

  const books = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    const result = allBooks.filter((book) => {
      if (onlyAudio && !book.audioCount) return false
      if (!term) return true
      const haystack = [
        book.name,
        book.code,
        book.lecturer,
        book.description,
        ...book.glossary,
        ...book.notes.flatMap((note) => [
          note.title,
          note.summary,
          note.courseName,
          ...note.tags
        ])
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
      return haystack.includes(term)
    })

    return result.sort((a, b) => {
      if (sort === 'oldest') return a.earliest - b.earliest
      if (sort === 'longest') return b.totalDuration - a.totalDuration
      return b.latest - a.latest
    })
  }, [allBooks, query, onlyAudio, sort])

  const activeFilters = Boolean(query.trim()) || onlyAudio
  const openBook = openBookKey
    ? allBooks.find((book) => book.key === openBookKey) ?? null
    : null
  const compactDate = new Intl.DateTimeFormat(uiLocale(), {
    day: '2-digit',
    month: 'short'
  })

  useEffect(() => {
    if (!openBook) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenBookKey(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openBook])

  function clearFilters(): void {
    setQuery('')
    setOnlyAudio(false)
  }

  function dateRange(book: CourseBook): string {
    const first = compactDate.format(new Date(book.earliest))
    const last = compactDate.format(new Date(book.latest))
    return first === last ? first : `${first} – ${last}`
  }

  function noteCount(count: number): string {
    return t(count === 1 ? '{count} note' : '{count} notes', { count })
  }

  async function openFolder(): Promise<void> {
    try {
      await window.ezNotes.notes.openFolder()
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  if (openBook) {
    return (
      <div className="page library-page book-reader-page">
        <div className="book-reader-bar">
          <button
            className="back-link"
            type="button"
            onClick={() => setOpenBookKey(null)}
          >
            <ArrowLeft size={15} />
            {t('Library')}
          </button>
          <span className="book-reader-kicker">
            {openBook.code ?? t('Course book')}
          </span>
        </div>

        <div
          className="open-book open-book-single"
          style={{ '--course-color': openBook.color } as React.CSSProperties}
        >
          <div className="book-sheet">
            <div className="book-sheet-head">
              <div className="book-sheet-intro">
                <span className="book-sheet-kicker">
                  {openBook.code ?? t('Course book')}
                </span>
                <h1 className="book-sheet-title">{openBook.name}</h1>
                {openBook.description ? (
                  <p className="book-sheet-description">{openBook.description}</p>
                ) : null}
                <div className="book-sheet-facts">
                  {openBook.lecturer ? (
                    <span>
                      <UserRound size={13} />
                      {openBook.lecturer}
                    </span>
                  ) : null}
                  <span>
                    <Clock size={13} />
                    {formatDuration(openBook.totalDuration)}
                  </span>
                  <span>
                    <CalendarDays size={13} />
                    {dateRange(openBook)}
                  </span>
                </div>
              </div>
              <div className="book-sheet-count">
                <strong>{openBook.notes.length}</strong>
                <span>{t('Lecture notes')}</span>
              </div>
            </div>

            <div className="note-paper-grid">
              {openBook.notes.map((note) => (
                <button
                  key={note.id}
                  className="note-paper"
                  type="button"
                  onClick={() => navigate(`/notes/${note.id}`)}
                >
                  <span className="note-paper-top">
                    <span>{formatDate(note.date)}</span>
                    <span className="note-paper-duration">
                      <Clock size={10} />
                      {formatDuration(note.durationSec)}
                    </span>
                    {note.hasAudio ? <AudioLines size={11} /> : null}
                  </span>
                  <strong className="note-paper-title">{note.title}</strong>
                  {note.summary ? (
                    <span className="note-paper-summary">{note.summary}</span>
                  ) : null}
                  <span className="note-paper-foot">
                    <span>
                      {t('{minutes} min read', {
                        minutes: Math.max(1, Math.ceil(note.wordCount / 200))
                      })}
                    </span>
                    <span className="note-paper-open">
                      <BookOpen size={12} />
                      {t('Open')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page library-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{t('Your archive')}</p>
          <h1>{t('Library')}</h1>
          <p className="page-sub">
            {notes.length
              ? t(
                  notes.length === 1
                    ? '{notes} note across {courses} course, all as Markdown.'
                    : '{notes} notes across {courses} courses, all as Markdown.',
                  { notes: notes.length, courses: allBooks.length }
                )
              : t('Every lecture becomes a file you own.')}
          </p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" onClick={() => void openFolder()}>
            <FolderOpen size={16} />
            {t('Open folder')}
          </Button>
          <Button variant="primary" onClick={() => navigate('/')}>
            <BookOpen size={16} />
            {t('Record lecture')}
          </Button>
        </div>
      </header>

      {!loading && notes.length ? (
        <div className="library-controls">
          <div className="library-search-row">
            <div className="search-box">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('Search titles, courses, summaries…')}
              />
              {query ? (
                <button
                  className="search-clear"
                  onClick={() => setQuery('')}
                  aria-label={t('Clear search')}
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
            <button
              className={`filter-chip library-audio-filter ${onlyAudio ? 'active' : ''}`}
              type="button"
              onClick={() => setOnlyAudio((current) => !current)}
              aria-pressed={onlyAudio}
              disabled={booksWithAudio === 0}
            >
              <AudioLines size={13} />
              {t('Has audio')}
              <span className="filter-count">{booksWithAudio}</span>
            </button>
            <label className="sort-control">
              <span>{t('Sort')}</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
              >
                <option value="newest">{t('Newest first')}</option>
                <option value="oldest">{t('Oldest first')}</option>
                <option value="longest">{t('Longest first')}</option>
              </select>
            </label>
          </div>

          {activeFilters ? (
            <div className="library-filter-meta">
              <span>
                {t('Showing {shown} of {total} course books', {
                  shown: books.length,
                  total: allBooks.length
                })}
              </span>
              <button className="text-link" onClick={clearFilters}>
                {t('Clear all')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="course-book-grid" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
            <div key={item} className="course-book-skeleton" />
          ))}
        </div>
      ) : books.length ? (
        <div className="course-book-grid">
          {books.map((book) => (
            <button
              key={book.key}
              className="course-book"
              type="button"
              onClick={() => setOpenBookKey(book.key)}
              style={{ '--course-color': book.color } as React.CSSProperties}
              aria-label={t('Open the {course} book', { course: book.name })}
              title={book.description ?? book.name}
            >
              <span className="course-book-cover">
                <span className="course-book-top">
                  <span className="course-book-code">
                    {book.code ?? new Date(book.latest).getFullYear()}
                  </span>
                  {book.audioCount ? (
                    <span className="course-book-audio">
                      <AudioLines size={12} />
                    </span>
                  ) : null}
                </span>
                <span className="course-book-title">{book.name}</span>
                {book.description ? (
                  <span className="course-book-description">
                    {book.description}
                  </span>
                ) : null}
                <span className="course-book-foot">
                  <span>{noteCount(book.notes.length)}</span>
                  <span>{dateRange(book)}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Search size={24} />}
          title={t(
            notes.length
              ? 'No course books match these filters'
              : 'No notes yet'
          )}
          body={t(
            notes.length
              ? 'Try a different keyword or turn off the audio filter.'
              : 'Record your first lecture and ezNotes will write the structured note here.'
          )}
          action={
            notes.length ? (
              <Button variant="outline" onClick={clearFilters}>
                {t('Clear filters')}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => navigate('/')}>
                <BookOpen size={16} />
                {t('Go to home')}
              </Button>
            )
          }
        />
      )}
    </div>
  )
}
