import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { t } from '../i18n'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ezNotes] renderer error', error, info)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div className="crash-screen">
        <div className="crash-card">
          <span className="crash-icon">
            <AlertTriangle size={22} />
          </span>
          <h1>{t('Something went wrong.')}</h1>
          <p>
            {t(
              'ezNotes hit an unexpected error. Your notes and recordings are safe on disk.'
            )}
          </p>
          <pre>{this.state.error.message}</pre>
          <button
            className="button button-primary"
            onClick={() => window.location.reload()}
          >
            <RotateCcw size={15} />
            {t('Reload ezNotes')}
          </button>
        </div>
      </div>
    )
  }
}
