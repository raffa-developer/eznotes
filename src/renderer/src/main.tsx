import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import '@fontsource-variable/fraunces'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '@fontsource/atkinson-hyperlegible/400-italic.css'
import App from './App'
import Island from './pages/Island'
import './styles.css'
import './polish.css'
import './island.css'

const islandMode = window.location.hash.startsWith('#/island')
if (islandMode) document.body.classList.add('island-window')

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

if (islandMode) {
  root.render(<Island />)
} else {
  root.render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>
  )
}
