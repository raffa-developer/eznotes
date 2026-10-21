import { useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  ChevronDown,
  Clipboard,
  Download,
  FileText,
  Printer,
  Send
} from 'lucide-react'
import type { NoteExportFormat } from '../../../shared/types'
import { Button } from './ui'
import { t } from '../i18n'

export default function ExportMenu({
  onExport,
  busy
}: {
  onExport: (format: NoteExportFormat) => void | Promise<void>
  busy: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const items: Array<{
    format: NoteExportFormat
    label: string
    hint: string
    icon: typeof Clipboard
  }> = [
    {
      format: 'clipboard',
      label: t('Copy Markdown'),
      hint: t('Paste into any Markdown editor'),
      icon: Clipboard
    },
    {
      format: 'markdown',
      label: t('Save as Markdown'),
      hint: t('A portable .md file'),
      icon: FileText
    },
    {
      format: 'pdf',
      label: t('Save as PDF'),
      hint: t('A4, ready to print or share'),
      icon: Printer
    },
    {
      format: 'obsidian',
      label: t('Send to Obsidian'),
      hint: t('Choose your vault folder'),
      icon: BookOpen
    },
    {
      format: 'notion',
      label: t('Copy for Notion'),
      hint: t('Paste into a Notion page'),
      icon: Send
    }
  ]

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function choose(format: NoteExportFormat): Promise<void> {
    setOpen(false)
    await onExport(format)
  }

  return (
    <div className="export-menu" ref={rootRef}>
      <Button
        variant="soft"
        onClick={() => setOpen((value) => !value)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download size={16} />
        {busy ? t('Exporting…') : t('Export')}
        <ChevronDown size={14} className={open ? 'chevron up' : 'chevron'} />
      </Button>

      {open ? (
        <div className="export-popover" role="menu">
          <p className="export-title">{t('Take this note with you')}</p>
          {items.map(({ format, label, hint, icon: Icon }) => (
            <button
              key={format}
              className="export-item"
              role="menuitem"
              onClick={() => void choose(format)}
              disabled={busy}
            >
              <span className="export-item-icon">
                <Icon size={16} />
              </span>
              <span>
                <strong>{label}</strong>
                <small>{hint}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
