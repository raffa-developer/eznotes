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

const ITEMS: Array<{
  format: NoteExportFormat
  label: string
  hint: string
  icon: typeof Clipboard
}> = [
  {
    format: 'clipboard',
    label: 'Copy Markdown',
    hint: 'Paste into any Markdown editor',
    icon: Clipboard
  },
  {
    format: 'markdown',
    label: 'Save as Markdown',
    hint: 'A portable .md file',
    icon: FileText
  },
  {
    format: 'pdf',
    label: 'Save as PDF',
    hint: 'A4, ready to print or share',
    icon: Printer
  },
  {
    format: 'obsidian',
    label: 'Send to Obsidian',
    hint: 'Choose your vault folder',
    icon: BookOpen
  },
  {
    format: 'notion',
    label: 'Copy for Notion',
    hint: 'Paste into a Notion page',
    icon: Send
  }
]

export default function ExportMenu({
  onExport,
  busy
}: {
  onExport: (format: NoteExportFormat) => void | Promise<void>
  busy: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

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
        {busy ? 'Exporting…' : 'Export'}
        <ChevronDown size={14} className={open ? 'chevron up' : 'chevron'} />
      </Button>

      {open ? (
        <div className="export-popover" role="menu">
          <p className="export-title">Take this note with you</p>
          {ITEMS.map(({ format, label, hint, icon: Icon }) => (
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
