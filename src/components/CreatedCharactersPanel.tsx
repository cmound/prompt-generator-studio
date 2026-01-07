// Created Characters: local character library used for Existing character autocomplete.
import { useEffect, useState } from 'react'
import type { CreatedCharacter } from '../db/types'
import { listCharacters, upsertCharacter, deleteCharacter } from '../db/characterRepo'

interface CreatedCharactersPanelProps {
  onUseInBuilder?: (character: CreatedCharacter) => void
}

export default function CreatedCharactersPanel({ onUseInBuilder }: CreatedCharactersPanelProps) {
  const [characters, setCharacters] = useState<CreatedCharacter[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedChar, setSelectedChar] = useState<CreatedCharacter | null>(null)
  const [editing, setEditing] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Form state
  const [formTag, setFormTag] = useState('')
  const [formName, setFormName] = useState('')
  const [formLook, setFormLook] = useState('')
  const [formOutfit, setFormOutfit] = useState('')
  const [formAppearsGuide, setFormAppearsGuide] = useState('')
  const [formCannotUseGuide, setFormCannotUseGuide] = useState('')
  const [formNotes, setFormNotes] = useState('')

  const loadCharacters = async () => {
    const chars = await listCharacters({ query: searchQuery })
    setCharacters(chars)
  }

  useEffect(() => {
    loadCharacters()
  }, [searchQuery])

  const resetForm = () => {
    setFormTag('')
    setFormName('')
    setFormLook('')
    setFormOutfit('')
    setFormAppearsGuide('')
    setFormCannotUseGuide('')
    setFormNotes('')
    setErrors({})
    setEditing(false)
    setSelectedChar(null)
  }

  const handleEdit = (char: CreatedCharacter) => {
    setSelectedChar(char)
    setFormTag(char.tag)
    setFormName(char.name)
    setFormLook(char.look || '')
    setFormOutfit(char.outfit || '')
    setFormAppearsGuide(char.appearsGuide || '')
    setFormCannotUseGuide(char.cannotUseGuide || '')
    setFormNotes(char.notes || '')
    setEditing(true)
    setErrors({})
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formTag.trim()) {
      newErrors.tag = 'Tag is required'
    } else if (!formTag.startsWith('@')) {
      newErrors.tag = 'Tag must start with @'
    } else if (formTag.includes(' ')) {
      newErrors.tag = 'Tag cannot contain spaces'
    }

    if (!formName.trim()) {
      newErrors.name = 'Name is required'
    }

    if (formAppearsGuide.length > 800) {
      newErrors.appearsGuide = `Exceeds 800 characters (${formAppearsGuide.length})`
    }

    if (formCannotUseGuide.length > 800) {
      newErrors.cannotUseGuide = `Exceeds 800 characters (${formCannotUseGuide.length})`
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) return

    try {
      await upsertCharacter({
        id: selectedChar?.id,
        tag: formTag.trim(),
        name: formName.trim(),
        look: formLook.trim() || undefined,
        outfit: formOutfit.trim() || undefined,
        appearsGuide: formAppearsGuide.trim() || undefined,
        cannotUseGuide: formCannotUseGuide.trim() || undefined,
        notes: formNotes.trim() || undefined,
      })

      await loadCharacters()
      resetForm()
    } catch (error) {
      setErrors({ general: error instanceof Error ? error.message : 'Failed to save' })
    }
  }

  const handleDelete = async (char: CreatedCharacter) => {
    if (!confirm(`Delete character ${char.tag}?`)) return

    try {
      await deleteCharacter(char.id)
      await loadCharacters()
      if (selectedChar?.id === char.id) {
        resetForm()
      }
    } catch (error) {
      console.error('Failed to delete character:', error)
    }
  }

  const handleUseInBuilder = (char: CreatedCharacter) => {
    if (onUseInBuilder) {
      onUseInBuilder(char)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1rem', height: '600px' }}>
      {/* Left: Character List */}
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          overflow: 'hidden',
        }}
      >
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by tag or name..."
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '0.5rem',
            color: 'var(--text)',
            fontSize: '0.85rem',
          }}
        />

        <button
          onClick={() => resetForm()}
          style={{
            padding: '0.5rem',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          + Create New Character
        </button>

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {characters.length === 0 ? (
            <div style={{ fontSize: '0.85rem', opacity: 0.6, textAlign: 'center', marginTop: '2rem' }}>
              No characters yet
            </div>
          ) : (
            characters.map((char) => (
              <div
                key={char.id}
                onClick={() => handleEdit(char)}
                style={{
                  padding: '0.75rem',
                  background: selectedChar?.id === char.id ? 'var(--accent)' : 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: selectedChar?.id === char.id ? 'white' : 'var(--text)',
                }}
              >
                <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{char.tag}</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{char.name}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Character Editor */}
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '1rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1rem' }}>
          {editing ? `Edit ${formTag || 'Character'}` : 'New Character'}
        </h3>

        {errors.general && (
          <div style={{ padding: '0.5rem', background: '#7f1d1d', border: '1px solid #991b1b', borderRadius: '4px', fontSize: '0.85rem' }}>
            {errors.general}
          </div>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>
            Tag <span style={{ color: '#f87171' }}>*</span>
          </span>
          <input
            type="text"
            value={formTag}
            onChange={(e) => setFormTag(e.target.value)}
            placeholder="@fatjdv"
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
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
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
            value={formLook}
            onChange={(e) => setFormLook(e.target.value)}
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
            value={formOutfit}
            onChange={(e) => setFormOutfit(e.target.value)}
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
            Guide on how character appears in videos (max 800 chars)
          </span>
          <textarea
            value={formAppearsGuide}
            onChange={(e) => setFormAppearsGuide(e.target.value)}
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
          <span
            style={{
              fontSize: '0.75rem',
              color: formAppearsGuide.length > 800 ? '#f87171' : '#9ca3af',
            }}
          >
            {formAppearsGuide.length} / 800
          </span>
          {errors.appearsGuide && <span style={{ fontSize: '0.75rem', color: '#f87171' }}>{errors.appearsGuide}</span>}
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>
            Guide on how character can't be used (max 800 chars)
          </span>
          <textarea
            value={formCannotUseGuide}
            onChange={(e) => setFormCannotUseGuide(e.target.value)}
            placeholder="List restrictions or forbidden scenarios..."
            rows={4}
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
          <span
            style={{
              fontSize: '0.75rem',
              color: formCannotUseGuide.length > 800 ? '#f87171' : '#9ca3af',
            }}
          >
            {formCannotUseGuide.length} / 800
          </span>
          {errors.cannotUseGuide && <span style={{ fontSize: '0.75rem', color: '#f87171' }}>{errors.cannotUseGuide}</span>}
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Notes</span>
          <textarea
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
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
            style={{
              padding: '0.6rem 1rem',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 500,
            }}
          >
            {editing ? 'Save Changes' : 'Create Character'}
          </button>

          {editing && selectedChar && (
            <>
              <button
                onClick={() => handleUseInBuilder(selectedChar)}
                style={{
                  padding: '0.6rem 1rem',
                  background: 'var(--panel)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                Use in Builder
              </button>

              <button
                onClick={() => handleDelete(selectedChar)}
                style={{
                  padding: '0.6rem 1rem',
                  background: '#7f1d1d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  marginLeft: 'auto',
                }}
              >
                Delete
              </button>
            </>
          )}

          {editing && (
            <button
              onClick={resetForm}
              style={{
                padding: '0.6rem 1rem',
                background: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
