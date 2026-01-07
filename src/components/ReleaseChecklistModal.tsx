// Release Checklist modal for final QC, persisted in localStorage.

import { useEffect, useRef, useState } from 'react'

interface ChecklistItem {
  id: string
  label: string
  group: 'builder' | 'library' | 'imagelab'
  done: boolean
}

interface ChecklistState {
  items: ChecklistItem[]
  updatedAt: number | null
}

const STORAGE_KEY = 'pgs.releaseChecklist.v1'

const INITIAL_ITEMS: Omit<ChecklistItem, 'done'>[] = [
  // Group A: Builder (core)
  { id: 'builder-1', label: 'Generate a prompt in Cinematic Paragraph', group: 'builder' },
  { id: 'builder-2', label: 'Generate a prompt in Timeline Script', group: 'builder' },
  { id: 'builder-3', label: 'Verify Prompt chars and Negative chars update correctly', group: 'builder' },
  { id: 'builder-4', label: 'Verify character cap formatting uses #,### and amber near cap', group: 'builder' },
  { id: 'builder-5', label: 'Verify Copy Prompt copies the generated prompt exactly', group: 'builder' },
  { id: 'builder-6', label: 'Verify Copy Negative copies negative prompt exactly', group: 'builder' },
  { id: 'builder-7', label: 'Verify Save to Library saves current prompt', group: 'builder' },
  { id: 'builder-8', label: 'Verify Reset to Defaults restores defaults', group: 'builder' },
  { id: 'builder-9', label: 'Verify Clear Form clears builder inputs but keeps app stable', group: 'builder' },
  { id: 'builder-10', label: 'Verify Clear Negatives clears negative prompt only', group: 'builder' },
  { id: 'builder-11', label: 'Verify Elaborate nudge appears only for short non-empty descriptions', group: 'builder' },
  { id: 'builder-12', label: 'Verify Elaborate to Cap expands without inventing new plot/characters and stays under cap', group: 'builder' },
  { id: 'builder-13', label: 'Verify "silent" in Scene Description suppresses audio cues (if implemented)', group: 'builder' },
  
  // Group B: Library
  { id: 'library-1', label: 'Open a saved prompt and confirm fields restore correctly', group: 'library' },
  { id: 'library-2', label: 'Restore a previous version and confirm it overwrites current builder fields', group: 'library' },
  { id: 'library-3', label: 'Rename prompt title and confirm it persists after refresh', group: 'library' },
  { id: 'library-4', label: 'Delete prompt and confirm it disappears immediately', group: 'library' },
  
  // Group C: Image Lab
  { id: 'imagelab-1', label: 'Upload a reference image and generate prompt variations', group: 'imagelab' },
  { id: 'imagelab-2', label: 'Save a generated variation and confirm it appears in Image Library list', group: 'imagelab' },
  { id: 'imagelab-3', label: 'Load the saved image edit and confirm it hydrates correctly', group: 'imagelab' },
  { id: 'imagelab-4', label: 'Rename saved image edit and confirm it persists', group: 'imagelab' },
  { id: 'imagelab-5', label: 'Delete saved image edit and confirm it disappears', group: 'imagelab' },
]

const loadChecklist = (): ChecklistState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as ChecklistState
      // Validate that stored IDs match current schema
      const storedIds = new Set(parsed.items.map(i => i.id))
      const idsMatch = INITIAL_ITEMS.every(i => storedIds.has(i.id)) && parsed.items.length === INITIAL_ITEMS.length
      
      if (idsMatch) {
        return parsed
      }
    }
  } catch (error) {
    console.warn('Failed to load checklist, resetting:', error)
  }
  
  // Initialize or reset if schema mismatch
  return {
    items: INITIAL_ITEMS.map(item => ({ ...item, done: false })),
    updatedAt: null
  }
}

const saveChecklist = (state: ChecklistState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('Failed to save checklist:', error)
  }
}

interface ReleaseChecklistModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function ReleaseChecklistModal({ isOpen, onClose }: ReleaseChecklistModalProps) {
  const [checklist, setChecklist] = useState<ChecklistState>(loadChecklist)
  const modalRef = useRef<HTMLDivElement>(null)
  const firstCheckboxRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      // Focus first checkbox when modal opens
      setTimeout(() => firstCheckboxRef.current?.focus(), 100)
      
      // Handle ESC key
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose()
        }
      }
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  const toggleItem = (id: string) => {
    const newState: ChecklistState = {
      items: checklist.items.map(item =>
        item.id === id ? { ...item, done: !item.done } : item
      ),
      updatedAt: Date.now()
    }
    setChecklist(newState)
    saveChecklist(newState)
  }

  const markAllComplete = () => {
    const newState: ChecklistState = {
      items: checklist.items.map(item => ({ ...item, done: true })),
      updatedAt: Date.now()
    }
    setChecklist(newState)
    saveChecklist(newState)
  }

  const resetChecklist = () => {
    const newState: ChecklistState = {
      items: checklist.items.map(item => ({ ...item, done: false })),
      updatedAt: null
    }
    setChecklist(newState)
    saveChecklist(newState)
  }

  if (!isOpen) return null

  const completedCount = checklist.items.filter(i => i.done).length
  const totalCount = checklist.items.length
  const progressPercent = (completedCount / totalCount) * 100

  const groupedItems = {
    builder: checklist.items.filter(i => i.group === 'builder'),
    library: checklist.items.filter(i => i.group === 'library'),
    imagelab: checklist.items.filter(i => i.group === 'imagelab'),
  }

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return 'Never'
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-labelledby="checklist-title"
        aria-modal="true"
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          maxWidth: '700px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
          <h2 id="checklist-title" style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem' }}>
            Release Checklist
          </h2>
          <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
            Last updated: {formatDate(checklist.updatedAt)}
          </div>
          
          {/* Progress */}
          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                Completed {completedCount} / {totalCount}
              </span>
              <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                {Math.round(progressPercent)}%
              </span>
            </div>
            <div style={{
              height: '8px',
              background: 'var(--bg)',
              borderRadius: '4px',
              overflow: 'hidden',
              border: '1px solid var(--border)',
            }}>
              <div style={{
                height: '100%',
                width: `${progressPercent}%`,
                background: progressPercent === 100 ? '#22c55e' : 'var(--accent)',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        </div>

        {/* Checklist Items */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem 1.5rem',
        }}>
          {/* Builder Group */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: 'var(--accent)' }}>
              Builder (Core)
            </h3>
            {groupedItems.builder.map((item, idx) => (
              <label
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  padding: '0.6rem 0',
                  cursor: 'pointer',
                  borderBottom: idx < groupedItems.builder.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}
              >
                <input
                  ref={idx === 0 ? firstCheckboxRef : undefined}
                  type="checkbox"
                  checked={item.done}
                  onChange={() => toggleItem(item.id)}
                  style={{
                    marginTop: '0.2rem',
                    cursor: 'pointer',
                    width: '18px',
                    height: '18px',
                  }}
                />
                <span style={{
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                  textDecoration: item.done ? 'line-through' : 'none',
                  opacity: item.done ? 0.6 : 1,
                }}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>

          {/* Library Group */}
          <div style={{ marginBottom: '1.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: 'var(--accent)' }}>
              Library
            </h3>
            {groupedItems.library.map((item, idx) => (
              <label
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  padding: '0.6rem 0',
                  cursor: 'pointer',
                  borderBottom: idx < groupedItems.library.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => toggleItem(item.id)}
                  style={{
                    marginTop: '0.2rem',
                    cursor: 'pointer',
                    width: '18px',
                    height: '18px',
                  }}
                />
                <span style={{
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                  textDecoration: item.done ? 'line-through' : 'none',
                  opacity: item.done ? 0.6 : 1,
                }}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>

          {/* Image Lab Group */}
          <div style={{ paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: 'var(--accent)' }}>
              Image Lab
            </h3>
            {groupedItems.imagelab.map((item, idx) => (
              <label
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  padding: '0.6rem 0',
                  cursor: 'pointer',
                  borderBottom: idx < groupedItems.imagelab.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => toggleItem(item.id)}
                  style={{
                    marginTop: '0.2rem',
                    cursor: 'pointer',
                    width: '18px',
                    height: '18px',
                  }}
                />
                <span style={{
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                  textDecoration: item.done ? 'line-through' : 'none',
                  opacity: item.done ? 0.6 : 1,
                }}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={markAllComplete}
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              Mark All Complete
            </button>
            <button
              onClick={resetChecklist}
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              Reset Checklist
            </button>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1.5rem',
              background: 'var(--accent)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
