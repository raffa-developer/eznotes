import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AudioLines,
  BookOpen,
  Check,
  Clock,
  Copy,
  FileText,
  FolderOpen,
  Search,
  SlidersHorizontal,
  X
} from 'lucide-react'
import { useApp } from '../state/AppContext'
import { Badge, Button, Card, EmptyState } from '../components/ui'
import { t, uiLocale } from '../i18n'
import { formatDate, formatDuration } from '../lib/format'

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
  const audioCount = useMemo(
    () => notes.filter((note) => note.hasAudio).length,
    [notes]
  )
  const activeFilters = Boolean(query.trim()) || courseId !== 'all' || onlyAudio

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
    <div className="page">
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
                  { notes: notes.length, courses: coursesWithNotes.length }
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
        <Card className="library-toolbar">
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

          <div className="library-filter-meta">
            <span>
              {activeFilters
                ? t('Showing {shown} of {total} notes', {
                    shown: filtered.length,
                    total: notes.length
                  })
                : t(
                    notes.length === 1
                      ? '{notes} note across {courses} course'
                      : '{notes} notes across {courses} courses',
                    { notes: notes.length, courses: coursesWithNotes.length }
                  )}
            </span>
            {activeFilters ? (
              <button className="text-link" onClick={clearFilters}>
                {t('Clear all')}
              </button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {loading ? (
        <div className="skeleton-list">
          {[0, 1, 2].map((item) => (
            <div key={item} className="skeleton-row" />
          ))}
        </div>
      ) : filtered.length ? (
        <Card className="note-list-card">
          {filtered.map((note) => {
            const course = schedule.courses.find((item) => item.id === note.courseId)
            return (
              <div
                key={note.id}
                className="note-row"
                onClick={() => navigate(`/notes/${note.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  if (event.key === 'Enter') navigate(`/notes/${note.id}`)
                }}
              >
                <div className="note-date">
                  <strong>
                    {new Intl.DateTimeFormat(uiLocale(), { day: '2-digit' }).format(
                      new Date(note.date)
                    )}
                  </strong>
                  <span>
                    {new Intl.DateTimeFormat(uiLocale(), { month: 'short' }).format(
                      new Date(note.date)
                    )}
                  </span>
                  <small>{new Date(note.date).getFullYear()}</small>
                </div>
                <div
                  className="note-stripe"
                  style={{ background: course?.color ?? '#f2c14e' }}
                />
                <div className="note-main">
                  <div className="note-title-line">
                    <h3>{note.title}</h3>
                    {note.hasAudio ? <Badge tone="info">{t('audio')}</Badge> : null}
                  </div>
                  <p className="note-meta">
                    {note.courseName}
                    <span>·</span>
                    {formatDate(note.date)}
                    <span>·</span>
                    <Clock size={13} /> {formatDuration(note.durationSec)}
                    <span>·</span>
                    <FileText size={13} />{' '}
                    {t(note.wordCount === 1 ? '{count} word' : '{count} words', {
                      count: note.wordCount.toLocaleString()
                    })}
                    <span>·</span>
                    {t('{minutes} min read', {
                      minutes: Math.max(1, Math.ceil(note.wordCount / 200))
                    })}
                  </p>
                  {note.summary ? <p className="note-summary">{note.summary}</p> : null}
                  {note.tags.length ? (
                    <div className="tag-row">
                      {note.tags.map((tag) => (
                        <span key={tag} className="tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  className="note-quick-copy"
                  onClick={(event) => {
                    event.stopPropagation()
                    void copyNote(note.id)
                  }}
                  aria-label={t('Copy note')}
                  title={t('Copy note to clipboard')}
                >
                  {copyingId === note.id ? <Check size={15} /> : <Copy size={15} />}
                </button>
                <span className="note-open">{t('Open')} →</span>
              </div>
            )
          })}
        </Card>
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
