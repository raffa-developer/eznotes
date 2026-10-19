import { Route, Routes } from 'react-router-dom'
import { AppProvider } from './state/AppContext'
import AppShell from './components/AppShell'
import Dashboard from './pages/Dashboard'
import Library from './pages/Library'
import Live from './pages/Live'
import NotePage from './pages/NotePage'
import SchedulePage from './pages/SchedulePage'
import SettingsPage from './pages/SettingsPage'

export default function App(): React.JSX.Element {
  return (
    <AppProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="live" element={<Live />} />
          <Route path="library" element={<Library />} />
          <Route path="notes/:id" element={<NotePage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </AppProvider>
  )
}
