import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import '@fontsource-variable/inter'
import '@fontsource-variable/newsreader'
import App from './App'
import Island from './pages/Island'
import ErrorBoundary from './components/ErrorBoundary'
import './styles.css'
import './polish.css'
import './apple.css'
import './island.css'

const islandMode = window.location.hash.startsWith('#/island')
if (islandMode) document.body.classList.add('island-window')

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

if (islandMode) {
  root.render(
    <ErrorBoundary>
      <Island />
    </ErrorBoundary>
  )
} else {
  root.render(
    <React.StrictMode>
      <HashRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </HashRouter>
    </React.StrictMode>
  )
}
