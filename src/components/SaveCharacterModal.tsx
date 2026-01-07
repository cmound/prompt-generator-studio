import { useState } from 'react'
import { upsertCharacter } from '../db/characterRepo'

interface SaveCharacterModalProps {
  onClose: () => void
  defaultAppearsGuide?: string
  defaultName?: string
}

export default function SaveCharacterModal({
  onClose,
  defaultAppearsGuide = '',
  defaultName = '',
}: SaveCharacterModalProps) {
  const [tag, setTag] = useState('')
  const [name, setName] = useState(defaultName)
  const [look, setLook] = useState('')
  const [outfit, setOutfit] = useState('')
  const [appearsGuide, setAppearsGuide] = useState(defaultAppearsGuide)
  const [cannotUseGuide, setCannotUseGuide] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!tag.trim()) {
      newErrors.tag = 'Tag is required'
    } else if (!tag.startsWith('@')) {
      newErrors.tag = 'Tag must start with @'
    } else if (tag.includes(' ')) {
      newErrors.tag = 'Tag cannot contain spaces'
    }

    if (!name.trim()) {
      newErrors.name = 'Name is required'
    }

    if (appearsGuide.length > 800) {
      newErrors.appearsGuide = `Exceeds 800 characters (${appearsGuide.length})`
    }

    if (cannotUseGuide.length > 800) {
      newErrors.cannotUseGuide = `Exceeds 800 characters (${cannotUseGuide.length})`
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return

    setSaving(true)
    try {
      await upsertCharacter({
        tag: tag.trim(),
        name: name.trim(),
        look: look.trim() || undefined,
        outfit: outfit.trim() || undefined,
        appearsGuide: appearsGuide.trim() || undefined,
        cannotUseGuide: cannotUseGuide.trim() || undefined,
        notes: notes.trim() || undefined,
      })

      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (error) {
      setErrors({ general: error instanceof Error ? error.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '1.5rem',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem' }}>Save as Created Character</h2>

        {success ? (
          <div
            style={{
              padding: '1rem',
              background: '#065f46',
              border: '1px solid #059669',
              borderRadius: '6px',
              textAlign: 'center',
              fontSize: '1rem',
            }}
          >
            ✓ Character saved successfully!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {errors.general && (
              <div
                style={{
                  padding: '0.5rem',
                  background: '#7f1d1d',
                  border: '1px solid #991b1b',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                }}
              >
                {errors.general}
              </div>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                Tag <span style={{ color: '#f87171' }}>*</span>
              </span>
              <input
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="@fatjdv"
                autoFocus
                style={{
                  background: 'var(--bg)',
                  border: errors.tag ? '2px solid #f87171' : '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '0.5rem',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                }}
              />
              {errors.tag && <span style={{ fontSize: '0.75rem', color: '#f87171' }}>{errors.tag}</span>}
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                Name <span style={{ color: '#f87171' }}>*</span>
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="JD"
                style={{
                  background: 'var(--bg)',
                  border: errors.name ? '2px solid #f87171' : '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '0.5rem',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                }}
              />
              {errors.name && <span style={{ fontSize: '0.75rem', color: '#f87171' }}>{errors.name}</span>}
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Look/Expressions</span>
              <input
                type="text"
                value={look}
                onChange={(e) => setLook(e.target.value)}
                placeholder="e.g., confident smile, strong jawline"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '0.5rem',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Outfit</span>
              <input
                type="text"
                value={outfit}
                onChange={(e) => setOutfit(e.target.value)}
                placeholder="e.g., casual jeans and black t-shirt"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '0.5rem',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                Guide on how character appears (max 800 chars)
              </span>
              <textarea
                value={appearsGuide}
                onChange={(e) => setAppearsGuide(e.target.value)}
                placeholder="Describe how this character typically appears..."
                rows={4}
                style={{
                  background: 'var(--bg)',
                  border: errors.appearsGuide ? '2px solid #f87171' : '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '0.5rem',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
              <span style={{ fontSize: '0.75rem', color: appearsGuide.length > 800 ? '#f87171' : '#9ca3af' }}>
                {appearsGuide.length} / 800
              </span>
              {errors.appearsGuide && <span style={{ fontSize: '0.75rem', color: '#f87171' }}>{errors.appearsGuide}</span>}
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                Guide on how character can't be used (max 800 chars)
              </span>
              <textarea
                value={cannotUseGuide}
                onChange={(e) => setCannotUseGuide(e.target.value)}
                placeholder="List restrictions or forbidden scenarios..."
                rows={3}
                style={{
                  background: 'var(--bg)',
                  border: errors.cannotUseGuide ? '2px solid #f87171' : '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '0.5rem',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
              <span style={{ fontSize: '0.75rem', color: cannotUseGuide.length > 800 ? '#f87171' : '#9ca3af' }}>
                {cannotUseGuide.length} / 800
              </span>
              {errors.cannotUseGuide && (
                <span style={{ fontSize: '0.75rem', color: '#f87171' }}>{errors.cannotUseGuide}</span>
              )}
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={2}
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '0.5rem',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </label>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '0.6rem 1rem',
                  background: saving ? '#666' : 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                }}
              >
                {saving ? 'Saving...' : 'Save Character'}
              </button>

              <button
                onClick={onClose}
                disabled={saving}
                style={{
                  padding: '0.6rem 1rem',
                  background: 'var(--panel)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
