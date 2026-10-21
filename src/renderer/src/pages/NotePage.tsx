import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeSlug from 'rehype-slug'
import 'katex/dist/katex.min.css'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock,
  Copy,
  FileText,
  FolderOpen,
  List,
  Mic,
  Music,
  RefreshCw,
  Tag,
  Trash2
} from 'lucide-react'
import type { NoteDetail, NoteExportFormat } from '../../../shared/types'
import { useApp } from '../state/AppContext'
import { Badge, Button, Card, EmptyState, Modal } from '../components/ui'
import ExportMenu from '../components/ExportMenu'
import { t } from '../i18n'
import { formatDate, formatDuration, formatTimestamp } from '../lib/format'

export default function NotePage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const { schedule, refreshNotes, toast, settings } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const printMode = new URLSearchParams(location.search).get('print') === '1'
  const [note, setNote] = useState<NoteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [audioOpen, setAudioOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletingAudio, setDeletingAudio] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [toc, setToc] = useState<Array<{ id: string; text: string; level: number }>>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    window.ezNotes.notes
      .get(id)
      .then((next) => setNote(next))
      .catch((error) => toast(error instanceof Error ? error.message : String(error), 'error'))
      .finally(() => setLoading(false))
  }, [id, toast])

  const course = schedule.courses.find((item) => item.id === note?.courseId)

  async function regenerate(): Promise<void> {
    if (!note) return
    setRegenerating(true)
    try {
      const updated = await window.ezNotes.notes.regenerate(note.id)
      setNote(updated)
      await refreshNotes()
      toast(t('Notes regenerated from the same transcript.'), 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRegenerating(false)
    }
  }

  async function remove(): Promise<void> {
    if (!note) return
    setDeleting(true)
    try {
      await window.ezNotes.notes.delete(note.id)
      await refreshNotes()
      toast(t('Note deleted.'), 'success')
      navigate('/library')
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
      setDeleting(false)
    }
  }

  async function removeAudio(): Promise<void> {
    if (!note) return
    setDeletingAudio(true)
    try {
      const updated = await window.ezNotes.notes.deleteAudio(note.id)
      setNote(updated)
      await refreshNotes()
      setAudioOpen(false)
      toast(t('Audio deleted. The transcript and note are untouched.'), 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setDeletingAudio(false)
    }
  }

  useEffect(() => {
    document.body.dataset.print = printMode ? '1' : '0'
    return () => {
      delete document.body.dataset.print
      delete document.body.dataset.printReady
    }
  }, [printMode])

  useEffect(() => {
    if (!note) return
    const timer = window.setTimeout(() => {
      if (printMode) {
        document.body.dataset.printReady = '1'
        return
      }
      const headings = Array.from(
        document.querySelectorAll<HTMLElement>('.markdown-body h2, .markdown-body h3')
      )
      setToc(
        headings
          .filter((heading) => heading.id)
          .map((heading) => ({
            id: heading.id,
            text: heading.textContent ?? '',
            level: heading.tagName === 'H2' ? 2 : 3
          }))
      )
    }, 100)
    return () => window.clearTimeout(timer)
  }, [note, printMode])

  async function copyNote(): Promise<void> {
    if (!note) return
    try {
      const result = await window.ezNotes.notes.copy(note.id)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
      toast(result.message, 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  async function exportNote(format: NoteExportFormat): Promise<void> {
    if (!note) return
    setExporting(true)
    try {
      const result = await window.ezNotes.notes.export(note.id, format)
      if (!result.canceled) toast(result.message, 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setExporting(false)
    }
  }

  function seek(seconds: number): void {
    if (!audioRef.current) return
    audioRef.current.currentTime = seconds
    void audioRef.current.play()
  }

  const readMinutes = Math.max(1, Math.ceil((note?.wordCount ?? 0) / 200))
  const displayMarkdown = note
    ? note.markdown.replace(/^\s*#\s+.+(?:\r?\n)+/, '')
    : ''

  if (loading) {
    return (
      <div className="page">
        <div className="note-skeleton" />
      </div>
    )
  }

  if (!note) {
    return (
      <div className="page">
        <EmptyState
          icon={<FileText size={24} />}
          title={t('Note not found')}
          body={t('It may have been moved or deleted outside ezNotes.')}
          action={
            <Button variant="outline" onClick={() => navigate('/library')}>
              {t('Back to library')}
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="page note-page">
      <header className="note-head">
        <div className="note-head-top">
          <Link to="/library" className="back-link">
            <ArrowLeft size={15} /> {t('Library')}
          </Link>
          <div className="note-actions">
            <Button variant="primary" size="sm" onClick={() => void copyNote()}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? t('Copied') : t('Copy note')}
            </Button>
            <ExportMenu onExport={exportNote} busy={exporting} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void regenerate()}
              disabled={regenerating || !note.transcript.length}
            >
              <RefreshCw size={15} className={regenerating ? 'spin' : ''} />
              {regenerating ? t('Rewriting…') : t('Regenerate')}
            </Button>
            <button
              className="icon-button"
              onClick={() => void window.ezNotes.notes.reveal(note.id)}
              aria-label={t('Reveal note file')}
              title={t('Reveal note file')}
            >
              <FolderOpen size={16} />
            </button>
            <button
              className="icon-button danger"
              onClick={() => setDeleteOpen(true)}
              aria-label={t('Delete note')}
              title={t('Delete note')}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <div className="note-kicker">
          <span
            className="course-line"
            style={{ background: course?.color ?? '#f2c14e' }}
          />
          <span>{note.courseName}</span>
          {course?.code && course.code !== note.courseName ? (
            <Badge tone="neutral">{course.code}</Badge>
          ) : null}
        </div>
        <h1>{note.title}</h1>
        <div className="note-meta-row">
          <span>
            <CalendarDays size={14} />
            {formatDate(note.date)}
          </span>
          <span>
            <Clock size={14} />
            {formatDuration(note.durationSec)}
          </span>
          <span>
            <FileText size={14} />
            {t(note.wordCount === 1 ? '{count} word' : '{count} words', {
              count: note.wordCount.toLocaleString()
            })}
          </span>
          <span>
            <Clock size={14} />
            {t('{minutes} min read', { minutes: readMinutes })}
          </span>
          {note.hasAudio ? (
            <span>
              <Mic size={14} />
              {t('Audio available')}
            </span>
          ) : null}
        </div>
      </header>

      {note.wordCount < 5 ? (
        <div className="banner banner-error" style={{ marginBottom: 18 }}>
          <FileText size={17} />
          <span>
            {t('This note has no content yet. The transcript is safe; use')}{' '}
            <button
              className="inline-link"
              onClick={() => void regenerate()}
              disabled={regenerating}
            >
              {t('Regenerate')}
            </button>{' '}
            {t('to write it again.')}
          </span>
        </div>
      ) : null}

      <div className="note-grid">
        <Card className="note-content-card">
          <article className="markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex, rehypeSlug]}
              components={{
                a: ({ href, children }) => (
                  <a
                    href={href}
                    onClick={(event) => {
                      event.preventDefault()
                      if (href && /^https?:\/\//.test(href)) {
                        void window.ezNotes.app.openExternal(href)
                      }
                    }}
                  >
                    {children}
                  </a>
                )
              }}
            >
              {displayMarkdown}
            </ReactMarkdown>
          </article>
        </Card>

        <aside className="note-side">
          {toc.length > 2 ? (
            <Card className="toc-card">
              <h3>
                <List size={14} /> {t('Contents')}
              </h3>
              <nav>
                {toc.map((item) => (
                  <button
                    key={item.id}
                    className={item.level === 3 ? 'toc-sub' : ''}
                    onClick={() =>
                      document
                        .getElementById(item.id)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  >
                    {item.text}
                  </button>
                ))}
              </nav>
            </Card>
          ) : null}

          {note.hasAudio && note.recordingId ? (
            <Card className="audio-card">
              <div className="audio-head">
                <span className="audio-icon">
                  <Music size={17} />
                </span>
                <div>
                  <strong>{t('Lecture audio')}</strong>
                  <small>
                    {t('Kept for {days} days', {
                      days: settings?.settings.retentionDays ?? 30
                    })}
                  </small>
                </div>
              </div>
              <audio
                ref={audioRef}
                data-eznotes-audio
                controls
                preload="metadata"
                src={`eznotes://audio/${note.recordingId}`}
              />
              <div className="audio-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAudioOpen(true)}
                >
                  <Trash2 size={14} />
                  {t('Delete audio early')}
                </Button>
              </div>
            </Card>
          ) : null}

          <Card className="detail-card">
            <h3>{t('Details')}</h3>
            <dl>
              <div>
                <dt>{t('Course')}</dt>
                <dd>{note.courseName}</dd>
              </div>
              {course?.lecturer ? (
                <div>
                  <dt>{t('Lecturer')}</dt>
                  <dd>{course.lecturer}</dd>
                </div>
              ) : null}
              <div>
                <dt>{t('Date')}</dt>
                <dd>{formatDate(note.date)}</dd>
              </div>
              <div>
                <dt>{t('Duration')}</dt>
                <dd>{formatDuration(note.durationSec)}</dd>
              </div>
              <div>
                <dt>{t('File')}</dt>
                <dd className="detail-path">{note.path.split(/[\\/]/).slice(-2).join('/')}</dd>
              </div>
            </dl>
            {note.tags.length ? (
              <div className="tag-row">
                {note.tags.map((tag) => (
                  <span key={tag} className="tag">
                    <Tag size={11} />
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </Card>

          {note.transcript.length ? (
            <Card className="transcript-card-side">
              <details>
                <summary>
                  <span>
                    <strong>{t('Transcript')}</strong>
                    <small>
                      {t('{count} segments', { count: note.transcript.length })}
                    </small>
                  </span>
                  <span className="summary-hint">{t('Show')}</span>
                </summary>
                <div className="transcript-side-scroll">
                  {note.transcript.map((segment) => (
                    <button
                      key={segment.id}
                      className="transcript-side-line"
                      onClick={() => seek(segment.start)}
                    >
                      <span>{formatTimestamp(segment.start)}</span>
                      <p>
                        {segment.speaker ? (
                          <>
                            <strong className="transcript-speaker">
                              {segment.speaker}
                            </strong>{' '}
                          </>
                        ) : null}
                        {segment.text}
                      </p>
                    </button>
                  ))}
                </div>
              </details>
            </Card>
          ) : null}
        </aside>
      </div>

      <Modal
        open={deleteOpen}
        title={t('Delete this note?')}
        subtitle={t('The Markdown file and its transcript will be removed.')}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              {t('Cancel')}
            </Button>
            <Button variant="danger" onClick={() => void remove()} disabled={deleting}>
              <Trash2 size={15} />
              {deleting ? t('Deleting…') : t('Delete note')}
            </Button>
          </>
        }
      >
        <p className="modal-text">
          <strong>{note.title}</strong>{' '}
          {t('will be deleted from your notes folder. This cannot be undone.')}
          {note.hasAudio ? ` ${t('The lecture audio will also be deleted.')}` : ''}
        </p>
      </Modal>

      <Modal
        open={audioOpen}
        title={t('Delete the audio?')}
        subtitle={t('The note and transcript stay in your library.')}
        onClose={() => setAudioOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAudioOpen(false)} disabled={deletingAudio}>
              {t('Cancel')}
            </Button>
            <Button variant="danger" onClick={() => void removeAudio()} disabled={deletingAudio}>
              <Trash2 size={15} />
              {deletingAudio ? t('Deleting…') : t('Delete audio')}
            </Button>
          </>
        }
      >
        <p className="modal-text">
          {t(
            'You will no longer be able to replay this lecture or jump to its timestamps. The written notes are kept.'
          )}
        </p>
      </Modal>
    </div>
  )
}
