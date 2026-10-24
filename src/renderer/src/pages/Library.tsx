import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AudioLines,
  BookOpen,
  Check,
  Clock,
  Copy,
  FolderOpen,
  Search,
  SlidersHorizontal,
  X
} from 'lucide-react'
import type { NoteMeta } from '../../../shared/types'
import { useApp } from '../state/AppContext'
import { Button, EmptyState } from '../components/ui'
import { t, uiLocale } from '../i18n'
import { formatDuration } from '../lib/format'

interface Shelf {
  key: string
  name: string
  color: string
  notes: NoteMeta[]
  first: number
}

export default function Library(): React.JSX.Element {
  const { notes, schedule, loading, toast } = useApp()
  const [query, setQuery] = useState('')
  const [courseId, setCourseId] = useState<string>('all')
  const [onlyAudio, setOnlyAudio] = useState(false)
  const [sort, setSort] = useState<'newest' | 'oldest' | 'longest'>('newest')
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const navigate = useNavigate()

  const coursesWithNotes = useMemo(
    () =>
      schedule.courses
        .map((course) => ({
          course,
          count: notes.filter((note) => note.courseId === course.id).length
        }))
        .filter((item) => item.count > 0),
    [schedule.courses, notes]
  )
  const noteCourseCount = useMemo(
    () => new Set(notes.map((note) => note.courseId ?? note.courseName)).size,
    [notes]
  )
  const audioCount = useMemo(
    () => notes.filter((note) => note.hasAudio).length,
    [notes]
  )
  const activeFilters = Boolean(query.trim()) || courseId !== 'all' || onlyAudio
  const bookDateFormatter = new Intl.DateTimeFormat(uiLocale(), {
    day: '2-digit',
    month: 'short'
  })

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    const result = notes.filter((note) => {
      if (courseId !== 'all' && note.courseId !== courseId) return false
      if (onlyAudio && !note.hasAudio) return false
      if (!term) return true
      return (
        note.title.toLowerCase().includes(term) ||
        note.courseName.toLowerCase().includes(term) ||
        note.summary.toLowerCase().includes(term) ||
        note.tags.some((tag) => tag.toLowerCase().includes(term))
      )
    })
    return result.sort((a, b) => {
      if (sort === 'oldest') return new Date(a.date).getTime() - new Date(b.date).getTime()
      if (sort === 'longest') return b.durationSec - a.durationSec
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })
  }, [notes, query, courseId, onlyAudio, sort])

  const shelves = useMemo(() => {
    const map = new Map<string, Shelf>()
    filtered.forEach((note, index) => {
      const key = note.courseId ?? `course-name:${note.courseName}`
      const course = schedule.courses.find((item) => item.id === note.courseId)
      let shelf = map.get(key)
      if (!shelf) {
        shelf = {
          key,
          name: course?.name ?? note.courseName ?? t('General'),
          color: course?.color ?? '#8e8e93',
          notes: [],
          first: index
        }
        map.set(key, shelf)
      }
      shelf.notes.push(note)
    })
    return [...map.values()].sort((a, b) => a.first - b.first)
  }, [filtered, schedule.courses])

  function clearFilters(): void {
    setQuery('')
    setCourseId('all')
    setOnlyAudio(false)
  }

  async function openFolder(): Promise<void> {
    try {
      await window.ezNotes.notes.openFolder()
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  async function copyNote(id: string): Promise<void> {
    setCopyingId(id)
    try {
      const result = await window.ezNotes.notes.copy(id)
      toast(result.message, 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      window.setTimeout(() => setCopyingId(null), 1200)
    }
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
                  { notes: notes.length, courses: noteCourseCount }
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

          <div className="library-filter-row">
            <span className="filter-label">
              <SlidersHorizontal size={14} />
              {t('Filter')}
            </span>
            <div className="filter-chips">
              <button
                className={`filter-chip ${courseId === 'all' ? 'active' : ''}`}
                onClick={() => setCourseId('all')}
                aria-pressed={courseId === 'all'}
              >
                {t('All notes')}
                <span className="filter-count">{notes.length}</span>
              </button>
              {coursesWithNotes.map(({ course, count }) => (
                <button
                  key={course.id}
                  className={`filter-chip ${courseId === course.id ? 'active' : ''}`}
                  onClick={() =>
                    setCourseId((current) => (current === course.id ? 'all' : course.id))
                  }
                  aria-pressed={courseId === course.id}
                >
                  <span
                    className="filter-dot"
                    style={{ background: course.color }}
                  />
                  {course.name}
                  <span className="filter-count">{count}</span>
                </button>
              ))}
              <button
                className={`filter-chip ${onlyAudio ? 'active' : ''}`}
                onClick={() => setOnlyAudio((current) => !current)}
                aria-pressed={onlyAudio}
              >
                <AudioLines size={13} />
                {t('Has audio')}
                <span className="filter-count">{audioCount}</span>
              </button>
            </div>
          </div>

          {activeFilters ? (
            <div className="library-filter-meta">
              <span>
                {t('Showing {shown} of {total} notes', {
                  shown: filtered.length,
                  total: notes.length
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
        <div className="book-skeleton-grid" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="book-skeleton" />
          ))}
        </div>
      ) : filtered.length ? (
        <div className="shelf-list">
          {shelves.map((shelf) => (
            <section className="shelf" key={shelf.key}>
              <div className="shelf-head">
                <span
                  className="shelf-marker"
                  style={{ background: shelf.color }}
                />
                <h2>{shelf.name}</h2>
                <span className="shelf-count">
                  {t(
                    shelf.notes.length === 1 ? '{count} note' : '{count} notes',
                    { count: shelf.notes.length }
                  )}
                </span>
              </div>
              <div className="shelf-books">
                {shelf.notes.map((note) => (
                  <div
                    key={note.id}
                    className="book-wrap"
                    style={{ '--course-color': shelf.color } as React.CSSProperties}
                  >
                    <button
                      className="book"
                      type="button"
                      onClick={() => navigate(`/notes/${note.id}`)}
                      aria-label={`${note.title}, ${note.courseName}${
                        note.hasAudio ? ', audio' : ''
                      }`}
                      title={note.title}
                    >
                      <span className="book-cover">
                        <span className="book-top">
                          <span className="book-course">{note.courseName}</span>
                          {note.hasAudio ? (
                            <AudioLines size={11} className="book-audio" />
                          ) : null}
                        </span>
                        <span className="book-title">{note.title}</span>
                        <span className="book-foot">
                          <span>
                            {bookDateFormatter.format(new Date(note.date))}
                          </span>
                          <span className="book-duration">
                            <Clock size={10} />
                            {formatDuration(note.durationSec)}
                          </span>
                        </span>
                      </span>
                    </button>
                    <button
                      className="book-copy"
                      type="button"
                      onClick={() => void copyNote(note.id)}
                      aria-label={t('Copy note')}
                      title={t('Copy note to clipboard')}
                    >
                      {copyingId === note.id ? (
                        <Check size={13} />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Search size={24} />}
          title={t(notes.length ? 'No notes match these filters' : 'No notes yet')}
          body={t(
            notes.length
              ? 'Try a different course, keyword, or turn off the audio filter.'
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
