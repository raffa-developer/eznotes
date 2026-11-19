import { useEffect, useState } from 'react'
import {
  BookOpen,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Sparkles
} from 'lucide-react'
import type {
  NoteDetail,
  StudyCard,
  StudyConfidence,
  StudySet,
  StudySource
} from '../../../shared/types'
import { useApp } from '../state/AppContext'
import { Button, Modal, Segmented } from './ui'
import { t } from '../i18n'
import { formatTimestamp } from '../lib/format'

type StudyMode = 'all' | 'missed'

export default function StudyModal({
  open,
  note,
  onClose,
  onJumpToSource
}: {
  open: boolean
  note: NoteDetail
  onClose: () => void
  onJumpToSource: (source: StudySource) => void
}): React.JSX.Element {
  const { toast } = useApp()
  const [set, setSet] = useState<StudySet | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [rating, setRating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [mode, setMode] = useState<StudyMode>('all')

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setSet(null)
    setIndex(0)
    setRevealed(false)
    setMode('all')
    window.ezNotes.notes
      .study(note.id)
      .then((next) => {
        if (active) setSet(next)
      })
      .catch((error) => {
        if (active) {
          toast(error instanceof Error ? error.message : String(error), 'error')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, note.id, toast])

  const cards = set
    ? mode === 'missed'
      ? set.cards.filter((card) => card.confidence <= 1)
      : set.cards
    : []
  const card = cards[index] as StudyCard | undefined
  const needsReview = set
    ? set.cards.filter((item) => item.confidence <= 1).length
    : 0

  async function generate(): Promise<void> {
    setGenerating(true)
    try {
      const next = await window.ezNotes.notes.generateStudy(note.id)
      setSet(next)
      setMode('all')
      setIndex(0)
      setRevealed(false)
      toast(t('Study set generated.'), 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function rate(confidence: StudyConfidence): Promise<void> {
    if (!card) return
    setRating(true)
    try {
      const next = await window.ezNotes.notes.rateStudyCard(
        note.id,
        card.id,
        confidence
      )
      setSet(next)
      setRevealed(false)
      if (mode === 'missed') setIndex(0)
      else setIndex((current) => current + 1)
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRating(false)
    }
  }

  async function exportSet(): Promise<void> {
    setExporting(true)
    try {
      const result = await window.ezNotes.notes.exportStudy(note.id)
      if (!result.canceled) toast(result.message, 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setExporting(false)
    }
  }

  function changeMode(next: StudyMode): void {
    setMode(next)
    setIndex(0)
    setRevealed(false)
  }

  function sourceText(source: StudySource): string {
    if (source.heading) return source.heading
    if (source.timestamp !== undefined) {
      return t('Transcript at {time}', {
        time: formatTimestamp(source.timestamp)
      })
    }
    return t('Open source')
  }

  return (
    <Modal
      open={open}
      title={t('Study this note')}
      subtitle={t(
        'Short questions generated from the note, with links back to the source.'
      )}
      onClose={onClose}
      width={760}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('Close')}
        </Button>
      }
    >
      {loading ? (
        <div className="study-loading">
          <Loader2 size={18} className="spin" />
          {t('Loading study set…')}
        </div>
      ) : !set ? (
        <div className="study-empty">
          <span className="study-empty-icon">
            <Sparkles size={22} />
          </span>
          <h3>{t('Turn this lecture into active recall.')}</h3>
          <p>
            {t(
              'Generate a small set of questions from this note and its transcript. Every answer links back to the section or timestamp it came from.'
            )}
          </p>
          <Button
            variant="primary"
            onClick={() => void generate()}
            disabled={generating}
          >
            {generating ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <Sparkles size={15} />
            )}
            {generating ? t('Generating…') : t('Generate study set')}
          </Button>
        </div>
      ) : (
        <div className="study-body">
          <div className="study-summary">
            <span>
              <strong>{set.cards.length}</strong>{' '}
              {set.cards.length === 1 ? t('card') : t('cards')}
            </span>
            <span>
              <strong>{needsReview}</strong>{' '}
              {needsReview === 1 ? t('needs review') : t('need review')}
            </span>
            <span className="study-summary-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void exportSet()}
                disabled={exporting}
              >
                <Download size={14} />
                {exporting ? t('Exporting…') : t('Export')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void generate()}
                disabled={generating}
              >
                <RefreshCw size={14} className={generating ? 'spin' : ''} />
                {generating ? t('Generating…') : t('Regenerate')}
              </Button>
            </span>
          </div>

          <Segmented
            value={mode}
            onChange={changeMode}
            options={[
              { value: 'all', label: t('All cards') },
              { value: 'missed', label: t('Needs review') }
            ]}
          />

          {card ? (
            <div className="study-card">
              <span className="study-card-count">
                {t('Card {index} of {total}', {
                  index: index + 1,
                  total: cards.length
                })}
                {card.attempts > 0
                  ? `  ${
                      card.attempts === 1
                        ? t('{count} attempt', { count: card.attempts })
                        : t('{count} attempts', { count: card.attempts })
                    }`
                  : ''}
              </span>
              <h3>{card.question}</h3>
              {revealed ? (
                <>
                  <p className="study-answer">{card.answer}</p>
                  {card.source.heading || card.source.timestamp !== undefined ? (
                    <button
                      className="study-source"
                      type="button"
                      onClick={() => onJumpToSource(card.source)}
                    >
                      <BookOpen size={13} />
                      {sourceText(card.source)}
                    </button>
                  ) : null}
                  <div className="study-confidence">
                    <span>{t('How did that feel?')}</span>
                    <button
                      className="study-rate again"
                      onClick={() => void rate(1)}
                      disabled={rating}
                    >
                      {t('Again')}
                    </button>
                    <button
                      className="study-rate almost"
                      onClick={() => void rate(2)}
                      disabled={rating}
                    >
                      {t('Almost')}
                    </button>
                    <button
                      className="study-rate good"
                      onClick={() => void rate(3)}
                      disabled={rating}
                    >
                      {t('Got it')}
                    </button>
                  </div>
                </>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => setRevealed(true)}
                >
                  {t('Show answer')}
                </Button>
              )}
            </div>
          ) : (
            <div className="study-complete">
              <CheckCircle2 size={24} />
              <h3>
                {mode === 'missed' && needsReview
                  ? t('Review the remaining cards.')
                  : t('You reviewed every card in this view.')}
              </h3>
              <p>
                {needsReview
                  ? t(
                      needsReview === 1
                        ? '{count} card still needs review.'
                        : '{count} cards still need review.',
                      { count: needsReview }
                    )
                  : t('All cards are marked as confident.')}
              </p>
              <div className="study-complete-actions">
                {needsReview ? (
                  <Button variant="primary" onClick={() => changeMode('missed')}>
                    {t('Review missed cards')}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  onClick={() => {
                    setIndex(0)
                    setRevealed(false)
                  }}
                >
                  {t('Start again')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
