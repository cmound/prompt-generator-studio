import { useEffect, useState } from 'react'
import { deletePrompt, getVersions, listPrompts, savePromptVersion } from '../db/repo'
import type { Prompt, PromptVersion } from '../db/types'

function LibraryPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const refreshPrompts = async () => {
    const data = await listPrompts()
    setPrompts(data)
    setLoading(false)
  }

  const refreshVersions = async (promptId: string) => {
    const data = await getVersions(promptId)
    setVersions(data)
  }

  useEffect(() => {
    refreshPrompts().catch(console.error)
  }, [])

  const handleSelectPrompt = async (id: string) => {
    setSelectedPromptId(id)
    await refreshVersions(id)
  }

  const handleRestore = async (version: PromptVersion) => {
    setRestoring(version.id)
    try {
      await savePromptVersion(version.promptId, version.content, {
        charCount: version.charCount,
        riskScore: version.riskScore,
        riskReasons: version.riskReasons,
        platform: version.platform,
        realism: version.realism,
        frameType: version.frameType,
        durationSeconds: version.durationSeconds,
        negativePrompt: version.negativePrompt,
      })
      await refreshVersions(version.promptId)
      await refreshPrompts()
    } catch (error) {
      console.error('Failed to restore version', error)
    } finally {
      setRestoring(null)
    }
  }

  /**
   * Delete prompt verification checklist:
   * 1. Create 1 prompt with 2+ versions
   * 2. Confirm it appears in Library
   * 3. Click Delete, confirm dialog
   * 4. Verify prompt disappears from left list
   * 5. Verify versions panel clears or moves to next prompt
   * 6. DevTools → Application → IndexedDB → pgs-db:
   *    - prompts row removed
   *    - promptVersions rows for that promptId removed
   */
  const handleDelete = async () => {
    if (!selectedPromptId) return

    const selectedPrompt = prompts.find((p) => p.id === selectedPromptId)
    if (!selectedPrompt) return

    const confirmed = window.confirm(
      `Delete "${selectedPrompt.title}" and all its versions?\n\nThis cannot be undone.`
    )
    if (!confirmed) return

    setDeleting(true)
    setDeleteError(null)
    try {
      await deletePrompt(selectedPromptId)

      // Remove from state
      const updatedPrompts = prompts.filter((p) => p.id !== selectedPromptId)
      setPrompts(updatedPrompts)

      // Clear versions
      setVersions([])

      // Select next prompt if available
      if (updatedPrompts.length > 0) {
        const nextPrompt = updatedPrompts[0]
        setSelectedPromptId(nextPrompt.id)
        await refreshVersions(nextPrompt.id)
      } else {
        setSelectedPromptId(null)
      }
    } catch (error) {
      console.error('Failed to delete prompt:', error)
      setDeleteError('Failed to delete prompt. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="placeholder" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Library</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem', minHeight: '60vh' }}>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '0.75rem',
              background: 'var(--surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              overflow: 'auto',
            }}
          >
            <div style={{ fontWeight: 700, opacity: 0.8 }}>Prompts</div>
            {prompts.length === 0 && <p style={{ opacity: 0.7 }}>No prompts saved yet.</p>}
            {prompts.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectPrompt(p.id)}
                style={{
                  textAlign: 'left',
                  background: p.id === selectedPromptId ? 'rgba(125, 211, 252, 0.1)' : 'var(--panel)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0.6rem',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.2rem',
                }}
              >
                <span style={{ fontWeight: 700 }}>{p.title}</span>
                <span style={{ fontSize: '0.85rem', opacity: 0.75 }}>{p.platform}</span>
                <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                  Updated {new Date(p.updatedAt).toLocaleString()}
                </span>
              </button>
            ))}
          </div>

          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '1rem',
              background: 'var(--surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              minHeight: '60vh',
            }}
          >
            {selectedPromptId && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Versions</h2>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    padding: '0.35rem 0.75rem',
                    background: deleting ? 'var(--panel)' : '#ef4444',
                    color: deleting ? 'var(--muted)' : '#fff',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                  }}
                >
                  {deleting ? 'Deleting...' : '🗑️ Delete Prompt'}
                </button>
              </div>
            )}
            {deleteError && (
              <div style={{ padding: '0.5rem', background: '#ef4444', color: '#fff', borderRadius: '6px', fontSize: '0.85rem' }}>
                {deleteError}
              </div>
            )}
            {!selectedPromptId ? (
              <p style={{ opacity: 0.75 }}>Select a prompt to view versions.</p>
            ) : versions.length === 0 ? (
              <p style={{ opacity: 0.75 }}>No versions yet.</p>
            ) : (
              versions
                .slice()
                .reverse()
                .map((v) => (
                  <div
                    key={v.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      background: 'var(--panel)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>Version {v.versionNumber}</div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.65 }}>
                          {new Date(v.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRestore(v)}
                        disabled={restoring === v.id}
                        style={{
                          padding: '0.35rem 0.75rem',
                          background: restoring === v.id ? 'var(--panel)' : 'var(--accent)',
                          color: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          cursor: restoring === v.id ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        {restoring === v.id ? 'Restoring...' : 'Restore this version'}
                      </button>
                    </div>
                    <textarea
                      value={v.content}
                      readOnly
                      rows={6}
                      style={{
                        width: '100%',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        padding: '0.6rem',
                        color: 'var(--text)',
                        fontFamily: 'monospace',
                        fontSize: '0.9rem',
                        lineHeight: 1.5,
                        resize: 'vertical',
                      }}
                    />
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default LibraryPage
