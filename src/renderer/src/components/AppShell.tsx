import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  FolderOpen,
  Home,
  Library,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Settings as SettingsIcon
} from 'lucide-react'
import { useApp } from '../state/AppContext'
import { ToastStack } from './ui'
import { AudioCapture } from '../hooks/useAudioCapture'
import { countdown, formatTime } from '../lib/format'
import { t } from '../i18n'

export default function AppShell(): React.JSX.Element {
  const { nextClass, recording, toasts, dismissToast, settings } = useApp()
  const navigate = useNavigate()
  const nav = [
    { to: '/', label: t('Home'), icon: Home, end: true },
    { to: '/library', label: t('Library'), icon: Library },
    { to: '/schedule', label: t('Schedule'), icon: CalendarDays },
    { to: '/settings', label: t('Settings'), icon: SettingsIcon }
  ]
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('eznotes.sidebar') === 'collapsed'
  )
  const activeRecording =
    recording &&
    ['recording', 'paused', 'processing', 'error'].includes(recording.status)

  useEffect(() => {
    localStorage.setItem('eznotes.sidebar', collapsed ? 'collapsed' : 'expanded')
  }, [collapsed])

  useEffect(() => {
    return window.ezNotes.app.onOpenNote((noteId) => {
      navigate(`/notes/${noteId}`)
    })
  }, [navigate])

  useEffect(() => {
    return window.ezNotes.app.onOpenLive(() => navigate('/live'))
  }, [navigate])

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate('/')} aria-label={t('ezNotes home')}>
          <span className="brand-mark" />
          <span className="brand-name">ezNotes</span>
          <span className="brand-tag">{t('notes')}</span>
        </button>

        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed((value) => !value)}
          title={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
          aria-label={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          <span>{collapsed ? t('Expand') : t('Collapse')}</span>
        </button>

        <nav className="nav">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        {activeRecording ? (
          <button
            className="sidebar-recording"
            onClick={() => navigate('/live')}
            title={t('Open live lecture')}
          >
            <span className={`rec-dot ${recording.status}`} />
            <span>
              <strong>
                {recording.status === 'processing'
                  ? t('Writing notes')
                  : recording.status === 'paused'
                    ? t('Paused')
                    : recording.status === 'error'
                      ? t('Needs attention')
                      : t('Recording')}
              </strong>
              <small>{recording.courseName}</small>
            </span>
            <Mic size={16} />
          </button>
        ) : nextClass ? (
          <button
            className="next-mini"
            onClick={() => navigate('/schedule')}
            title={`${nextClass.course.name} · ${formatTime(nextClass.slot.startTime)}`}
          >
            <span
              className="next-mini-dot"
              style={{ background: nextClass.course.color }}
            />
            <span>
              <small>
                {nextClass.isNow ? t('Happening now') : countdown(nextClass.startsAt)}
              </small>
              <strong>{nextClass.course.name}</strong>
              <small>
                {formatTime(nextClass.slot.startTime)}
                <span className="meta-sep" />
                {nextClass.slot.room || t('No room')}
              </small>
            </span>
          </button>
        ) : null}

        <button
          className="sidebar-folder"
          onClick={() => void window.ezNotes.notes.openFolder()}
          title={t('Open notes folder')}
        >
          <FolderOpen size={15} />
          <span>{t('Notes folder')}</span>
        </button>

        <div className="sidebar-foot">
          <span>ezNotes {settings?.appVersion ?? ''}</span>
          <span className="sidebar-foot-dot" />
          <span>{t('local-first')}</span>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>

      <AudioCapture />
      <ToastStack toasts={toasts} dismiss={dismissToast} />
    </div>
  )
}
