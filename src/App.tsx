import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import BuilderPage from './routes/BuilderPage'
import LibraryPage from './routes/LibraryPage'
import SettingsPage from './routes/SettingsPage'
import ImageLabPage from './routes/ImageLabPage'
import { ensureSeeded } from './db/seed'

function App() {
  const [dbReady, setDbReady] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)

  useEffect(() => {
    ensureSeeded()
      .then(() => setDbReady(true))
      .catch((error) => {
        console.error('DB initialization failed:', error)
        setDbError(error.message || String(error))
      })
  }, [])
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
      >
        Skip to content
      </a>
      <header className="app-header">
        <div className="content-frame">
          <div className="header-bar">
            <h1>Prompt Generator Studio</h1>
            <nav aria-label="Primary">
              <ul className="app-nav">
                <li>
                  <NavLink
                    to="/"
                    end
                    className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  >
                    Builder
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/library"
                    className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  >
                    Library
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/image-lab"
                    className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  >
                    Image Lab
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/settings"
                    className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  >
                    Settings
                  </NavLink>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </header>
      <main id="main" className="app-main" tabIndex={-1}>
        <div className="content-frame">
          <Routes>
            <Route path="/" element={<BuilderPage dbReady={dbReady} dbError={dbError} />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/image-lab" element={<ImageLabPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default App
