import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Clock,
  FileText,
  FolderOpen,
  Search,
  SlidersHorizontal
} from 'lucide-react'
import { useApp } from '../state/AppContext'
import { Badge, Button, Card, EmptyState } from '../components/ui'
import { formatDate, formatDuration } from '../lib/format'

export default function Library(): React.JSX.Element {
  const { notes, schedule, loading, toast } = useApp()
  const [query, setQuery] = useState('')
  const [courseId, setCourseId] = useState<string>('all')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'longest'>('newest')
  const navigate = useNavigate()

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    const result = notes.filter((note) => {
      if (courseId !== 'all' && note.courseId !== courseId) return false
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
  }, [notes, query, courseId, sort])

  async function openFolder(): Promise<void> {
    try {
      await window.aula.notes.openFolder()
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Your archive</p>
          <h1>Library</h1>
          <p className="page-sub">
            {notes.length
              ? `${notes.length} lecture${notes.length === 1 ? '' : 's'}, written as Markdown.`
              : 'Every lecture becomes a file you own.'}
          </p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" onClick={() => void openFolder()}>
            <FolderOpen size={16} />
            Open folder
          </Button>
          <Button variant="primary" onClick={() => navigate('/')}>
            <BookOpen size={16} />
            Record lecture
          </Button>
        </div>
      </header>

      <Card className="library-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles, courses, summaries…"
          />
        </div>
        <div className="toolbar-right">
          <label className="select-inline">
            <SlidersHorizontal size={15} />
            <select
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
            >
              <option value="all">All courses</option>
              {schedule.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>
          <select
            className="sort-select"
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="longest">Longest first</option>
          </select>
        </div>
      </Card>

      {loading ? (
        <div className="skeleton-list">
          {[0, 1, 2].map((item) => (
            <div key={item} className="skeleton-row" />
          ))}
        </div>
      ) : filtered.length ? (
        <div className="note-list">
          {filtered.map((note) => {
            const course = schedule.courses.find((item) => item.id === note.courseId)
            return (
              <Card
                key={note.id}
                className="note-row"
                onClick={() => navigate(`/notes/${note.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') navigate(`/notes/${note.id}`)
                }}
              >
                <div className="note-date">
                  <strong>
                    {new Intl.DateTimeFormat('en-GB', { day: '2-digit' }).format(
                      new Date(note.date)
                    )}
                  </strong>
                  <span>
                    {new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(
                      new Date(note.date)
                    )}
                  </span>
                  <small>{new Date(note.date).getFullYear()}</small>
                </div>
                <div
                  className="note-stripe"
                  style={{ background: course?.color ?? '#d8ff6a' }}
                />
                <div className="note-main">
                  <div className="note-title-line">
                    <h3>{note.title}</h3>
                    {note.hasAudio ? <Badge tone="info">audio</Badge> : null}
                  </div>
                  <p className="note-meta">
                    {note.courseName}
                    <span>·</span>
                    {formatDate(note.date)}
                    <span>·</span>
                    <Clock size={13} /> {formatDuration(note.durationSec)}
                    <span>·</span>
                    <FileText size={13} /> {note.wordCount.toLocaleString()} words
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
                <span className="note-open">Open →</span>
              </Card>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Search size={24} />}
          title={notes.length ? 'No notes match that search' : 'No notes yet'}
          body={
            notes.length
              ? 'Try a different course, title, or keyword.'
              : 'Record your first lecture and Aula will write the structured note here.'
          }
          action={
            notes.length ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('')
                  setCourseId('all')
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button variant="primary" onClick={() => navigate('/')}>
                <BookOpen size={16} />
                Go to home
              </Button>
            )
          }
        />
      )}
    </div>
  )
}
