import { useState, useEffect } from 'react'

function SettingsPage() {
  const [apiKey, setApiKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [strictness, setStrictness] = useState<'Relaxed' | 'Standard' | 'Strict'>('Standard')
  const [strictnessSaved, setStrictnessSaved] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('openai_api_key')
    if (stored) {
      setApiKey(stored)
    }
    const storedStrictness = localStorage.getItem('pgs_content_strictness') as 'Relaxed' | 'Standard' | 'Strict' | null
    if (storedStrictness === 'Relaxed' || storedStrictness === 'Strict' || storedStrictness === 'Standard') {
      setStrictness(storedStrictness)
    }
  }, [])

  const handleSave = () => {
    localStorage.setItem('openai_api_key', apiKey)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleStrictnessSave = () => {
    localStorage.setItem('pgs_content_strictness', strictness)
    setStrictnessSaved(true)
    setTimeout(() => setStrictnessSaved(false), 2000)
  }

  const handleClear = () => {
    localStorage.removeItem('openai_api_key')
    setApiKey('')
  }

  return (
    <section className="placeholder" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h1>Settings</h1>
      <p style={{ opacity: 0.8, marginBottom: '2rem' }}>
        Adjust defaults, shortcuts, and integrations for your workspace.
      </p>

      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>OpenAI API Integration</h2>
        
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>
            OpenAI API Key (stored locally in browser)
          </span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '0.6rem',
              color: 'var(--text)',
              fontSize: '0.9rem',
              fontFamily: 'monospace',
            }}
          />
          <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>
            Used for Image-to-Description in Image Lab. Never sent to our servers.
          </span>
        </label>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleSave}
            disabled={!apiKey.trim()}
            style={{
              padding: '0.6rem 1.2rem',
              background: !apiKey.trim() ? 'var(--border)' : 'var(--accent)',
              color: !apiKey.trim() ? 'var(--text)' : 'var(--bg)',
              border: 'none',
              borderRadius: '6px',
              cursor: !apiKey.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
              opacity: !apiKey.trim() ? 0.5 : 1,
            }}
          >
            {saved ? '✓ Saved' : 'Save API Key'}
          </button>
          
          <button
            onClick={handleClear}
            style={{
              padding: '0.6rem 1.2rem',
              background: 'var(--panel)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Content Rating Strictness</h2>
        <p style={{ fontSize: '0.9rem', opacity: 0.75, margin: 0 }}>
          Controls how strict the local content rating and rewrite assistant is. Relaxed, Standard, or Strict multiplies
          trigger weights by 0.85 / 1.0 / 1.2. Stored only in your browser.
        </p>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>Strictness</span>
          <select
            value={strictness}
            onChange={(e) => setStrictness(e.target.value as 'Relaxed' | 'Standard' | 'Strict')}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '0.6rem',
              color: 'var(--text)',
              fontSize: '0.9rem',
            }}
          >
            <option value="Relaxed">Relaxed (0.85x)</option>
            <option value="Standard">Standard (1.0x)</option>
            <option value="Strict">Strict (1.2x)</option>
          </select>
        </label>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleStrictnessSave}
            style={{
              padding: '0.6rem 1.2rem',
              background: 'var(--accent)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            {strictnessSaved ? '✓ Saved' : 'Save strictness'}
          </button>
          <button
            onClick={() => {
              setStrictness('Standard')
              localStorage.setItem('pgs_content_strictness', 'Standard')
            }}
            style={{
              padding: '0.6rem 1.2rem',
              background: 'var(--panel)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Reset to Standard
          </button>
        </div>
      </div>
    </section>
  )
}

export default SettingsPage
