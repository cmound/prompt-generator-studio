import { useEffect, useState, useRef } from 'react'
import {
  saveImageAsset,
  saveImageEdit,
  listImageEdits,
  getImageAsset,
  deleteImageEdit,
  updateImageEdit,
  type ListImageEditsParams,
} from '../db/imageRepo'
import type { ImageEdit } from '../db/types'

// Deterministic prompt variation generator
function generatePromptVariations(instruction: string, count: number): string[] {
  const baseTemplate = `Use the provided image as reference. Apply this change: ${instruction}. Keep identity consistent. Preserve pose, lighting, and background unless specified. High realism. No UI text.`

  const variationTokens = [
    ['cinematic framing', 'professional composition', 'editorial style', 'dynamic angle', 'balanced framing'],
    ['soft natural light', 'studio lighting', 'golden hour glow', 'dramatic shadows', 'diffused daylight'],
    ['fine texture detail', 'crisp fabric rendering', 'subtle material nuance', 'rich surface quality', 'authentic texture'],
    ['shallow depth of field', 'sharp focus throughout', 'balanced depth', 'bokeh background', 'crisp foreground'],
    ['vibrant color grade', 'muted tones', 'natural color balance', 'warm color cast', 'cool color palette'],
  ]

  const variations: string[] = []
  for (let i = 0; i < Math.min(count, 5); i++) {
    const tokens = variationTokens.map((group) => group[i % group.length])
    const variant = `${baseTemplate} Style: ${tokens.join(', ')}.`
    variations.push(variant)
  }

  return variations
}

function ImageLabPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageId, setImageId] = useState<string | null>(null)
  const [instruction, setInstruction] = useState('')
  const [variationCount, setVariationCount] = useState(3)
  const [prompts, setPrompts] = useState<string[]>([])
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [savingIndex, setSavingIndex] = useState<number | null>(null)

  const [savedEdits, setSavedEdits] = useState<ImageEdit[]>([])
  const [selectedEdit, setSelectedEdit] = useState<ImageEdit | null>(null)
  const [selectedEditImage, setSelectedEditImage] = useState<string | null>(null)

  // CRUD filters
  const [searchQuery, setSearchQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'updatedDesc' | 'createdDesc' | 'titleAsc'>('updatedDesc')

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Highlight state for saved variation
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  
  // Ref for scrolling to Generated Prompts section
  const generatedPromptsRef = useRef<HTMLElement>(null)

  useEffect(() => {
    refreshLibrary()
  }, [searchQuery, favoritesOnly, sortBy])

  const refreshLibrary = async () => {
    const params: ListImageEditsParams = {
      search: searchQuery || undefined,
      favoritesOnly,
      sort: sortBy,
    }
    const edits = await listImageEdits(params)
    setSavedEdits(edits)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setPrompts([])

    try {
      const id = await saveImageAsset(file)
      setImageId(id)
    } catch (error) {
      console.error('Failed to save image:', error)
    }
  }

  const handleGeneratePrompts = () => {
    if (!imageId || !instruction.trim()) {
      alert('Please upload an image and provide a change request.')
      return
    }

    const generated = generatePromptVariations(instruction, variationCount)
    setPrompts(generated)
  }

  const handleCopy = async (prompt: string, index: number) => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const handleSaveVariant = async (index: number) => {
    if (!imageId) return
    setSavingIndex(index)
    try {
      await saveImageEdit(imageId, instruction, variationCount, index)
      await refreshLibrary()
      setTimeout(() => setSavingIndex(null), 2000)
    } catch (error) {
      console.error('Failed to save:', error)
      setSavingIndex(null)
    }
  }

  const handleSelectEdit = async (edit: ImageEdit) => {
    setSelectedEdit(edit)
    
    // Load the image asset
    const asset = await getImageAsset(edit.imageId)
    if (asset) {
      const url = URL.createObjectURL(asset.blob)
      setSelectedEditImage(url)
      
      // Load into left panel
      setPreviewUrl(url)
      setImageId(edit.imageId)
      setInstruction(edit.instruction)
      setVariationCount(edit.variations)
      setPrompts(edit.prompts)
      
      // Highlight the saved variation
      setHighlightedIndex(edit.selectedVariantIndex)
      
      // Scroll to Generated Prompts section after a brief delay to ensure render
      setTimeout(() => {
        generatedPromptsRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        })
      }, 100)
      
      // Remove highlight after 2 seconds
      setTimeout(() => {
        setHighlightedIndex(null)
      }, 2100)
    }
  }

  const handleCopySelected = async () => {
    if (!selectedEdit) return
    const prompt = selectedEdit.prompts[selectedEdit.selectedVariantIndex]
    try {
      await navigator.clipboard.writeText(prompt)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const handleDeleteEdit = async () => {
    if (!selectedEdit) return
    if (!window.confirm('Delete this saved variant?')) return

    try {
      await deleteImageEdit(selectedEdit.id)
      setSelectedEdit(null)
      setSelectedEditImage(null)
      await refreshLibrary()
    } catch (error) {
      console.error('Failed to delete:', error)
    }
  }

  const handleToggleFavorite = async (edit: ImageEdit, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await updateImageEdit(edit.id, { isFavorite: !edit.isFavorite })
      await refreshLibrary()
      if (selectedEdit?.id === edit.id) {
        setSelectedEdit({ ...edit, isFavorite: !edit.isFavorite })
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    }
  }

  const startRename = (edit: ImageEdit, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingId(edit.id)
    setRenameValue(edit.title)
  }

  const saveRename = async () => {
    if (!renamingId || !renameValue.trim()) {
      cancelRename()
      return
    }
    try {
      await updateImageEdit(renamingId, { title: renameValue.trim() })
      await refreshLibrary()
      if (selectedEdit?.id === renamingId) {
        setSelectedEdit({ ...selectedEdit, title: renameValue.trim() })
      }
      setRenamingId(null)
      setRenameValue('')
    } catch (error) {
      console.error('Failed to rename:', error)
    }
  }

  const cancelRename = () => {
    setRenamingId(null)
    setRenameValue('')
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveRename()
    } else if (e.key === 'Escape') {
      cancelRename()
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '1.5rem' }}>
      {/* Main area */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <section className="placeholder">
          <h1>Image Lab</h1>
          <p style={{ marginBottom: '1rem' }}>
            Upload reference images and generate prompt variations for image-to-image workflows.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Upload */}
            <div>
              <label
                htmlFor="image-upload"
                style={{
                  display: 'inline-block',
                  padding: '0.5rem 1rem',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                📁 Choose Image
              </label>
              <input
                id="image-upload"
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              {selectedFile && (
                <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', opacity: 0.7 }}>
                  {selectedFile.name}
                </span>
              )}
            </div>

            {/* Preview */}
            {previewUrl && (
              <div>
                <img
                  src={previewUrl}
                  alt="Preview"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '300px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                  }}
                />
              </div>
            )}

            {/* Controls */}
            {imageId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Change request:</span>
                  <textarea
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="e.g., Change outfit to formal business suit"
                    rows={3}
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '0.5rem',
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      fontSize: '0.9rem',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Variations:</span>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={variationCount}
                    onChange={(e) => setVariationCount(Math.min(5, Math.max(1, Number(e.target.value))))}
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '0.3rem 0.5rem',
                      color: 'var(--text)',
                      width: '60px',
                    }}
                  />
                </label>

                <button
                  onClick={handleGeneratePrompts}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--accent)',
                    color: 'var(--bg)',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    alignSelf: 'flex-start',
                  }}
                >
                  Generate Prompts
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Generated Prompts */}
        {prompts.length > 0 && (
          <section className="placeholder" ref={generatedPromptsRef}>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>Generated Prompts</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {prompts.map((prompt, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--panel)',
                    border: highlightedIndex === idx 
                      ? '2px solid var(--accent)' 
                      : '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    boxShadow: highlightedIndex === idx 
                      ? '0 0 12px rgba(125, 211, 252, 0.5)' 
                      : 'none',
                    transition: 'all 0.3s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <strong style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                      Variation {idx + 1}
                      {selectedEdit?.selectedVariantIndex === idx && (
                        <span style={{ 
                          marginLeft: '0.5rem', 
                          fontSize: '0.75rem', 
                          color: 'var(--accent)',
                          fontWeight: 600 
                        }}>
                          (Saved)
                        </span>
                      )}
                    </strong>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                        {prompt.length} chars
                      </span>
                      <button
                        onClick={() => handleCopy(prompt, idx)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: copiedIndex === idx ? '#7dd3fc' : 'var(--panel)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                        }}
                      >
                        {copiedIndex === idx ? '✓ Copied' : '📋 Copy'}
                      </button>
                      <button
                        onClick={() => handleSaveVariant(idx)}
                        disabled={savingIndex === idx}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: savingIndex === idx ? 'var(--panel)' : '#22c55e',
                          color: savingIndex === idx ? 'var(--muted)' : '#0b1220',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          cursor: savingIndex === idx ? 'not-allowed' : 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                        }}
                      >
                        {savingIndex === idx ? '✓ Saved' : '💾 Save'}
                      </button>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5, fontFamily: 'monospace' }}>
                    {prompt}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Image Library sidebar */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <section
          className="placeholder"
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 'calc(100vh - 10rem)', overflow: 'auto' }}
        >
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Image Library</h2>

          {/* Toolbar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
            <input
              type="text"
              placeholder="🔍 Search title, instruction, or prompt..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '0.5rem',
                color: 'var(--text)',
                fontSize: '0.85rem',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={favoritesOnly}
                  onChange={(e) => setFavoritesOnly(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                ⭐ Favorites
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'updatedDesc' | 'createdDesc' | 'titleAsc')}
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '0.3rem 0.5rem',
                  color: 'var(--text)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                <option value="updatedDesc">Last Updated</option>
                <option value="createdDesc">Newest First</option>
                <option value="titleAsc">Title (A-Z)</option>
              </select>
            </div>
          </div>

          {/* List */}
          {savedEdits.length === 0 && (
            <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>
              {searchQuery || favoritesOnly ? 'No matches found.' : 'No saved edits yet.'}
            </p>
          )}
          {savedEdits.map((edit) => (
            <div
              key={edit.id}
              onClick={() => handleSelectEdit(edit)}
              style={{
                background: selectedEdit?.id === edit.id ? 'rgba(125, 211, 252, 0.1)' : 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.6rem',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
              }}
            >
              {/* Title row with favorite and delete */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
                {renamingId === edit.id ? (
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={handleRenameKeyDown}
                    onBlur={saveRename}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1,
                      background: 'var(--bg)',
                      border: '1px solid var(--accent)',
                      borderRadius: '4px',
                      padding: '0.2rem 0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                    }}
                  />
                ) : (
                  <div
                    onClick={(e) => startRename(edit, e)}
                    style={{
                      flex: 1,
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: 'text',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '4px',
                    }}
                    title="Click to rename"
                  >
                    {edit.title}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                  <button
                    onClick={(e) => handleToggleFavorite(edit, e)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      padding: '0.2rem',
                      lineHeight: 1,
                      opacity: edit.isFavorite ? 1 : 0.3,
                    }}
                    title={edit.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    ⭐
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (window.confirm('Delete this saved variant?')) {
                        deleteImageEdit(edit.id).then(() => refreshLibrary())
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      padding: '0.2rem',
                      lineHeight: 1,
                      opacity: 0.5,
                    }}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Metadata */}
              <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                Variant {edit.selectedVariantIndex + 1} of {edit.variations}
              </div>
              <div style={{ fontSize: '0.8rem', opacity: 0.75 }}>
                {edit.instruction.slice(0, 50)}
                {edit.instruction.length > 50 ? '...' : ''}
              </div>
              <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>
                {new Date(edit.updatedAt).toLocaleString()}
              </div>
            </div>
          ))}
        </section>

        {selectedEdit && (
          <section className="placeholder" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Details</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={handleCopySelected}
                  style={{
                    padding: '0.3rem 0.6rem',
                    background: 'var(--accent)',
                    color: 'var(--bg)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}
                >
                  📋 Copy
                </button>
                <button
                  onClick={handleDeleteEdit}
                  style={{
                    padding: '0.3rem 0.6rem',
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
            {selectedEditImage && (
              <img
                src={selectedEditImage}
                alt="Saved"
                style={{
                  maxWidth: '100%',
                  maxHeight: '150px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  objectFit: 'cover',
                }}
              />
            )}
            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
              <strong>Instruction:</strong> {selectedEdit.instruction}
            </div>
            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
              <strong>Selected:</strong> Variant {selectedEdit.selectedVariantIndex + 1}
            </div>
            <textarea
              value={selectedEdit.prompts[selectedEdit.selectedVariantIndex]}
              readOnly
              rows={8}
              style={{
                width: '100%',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '0.5rem',
                color: 'var(--text)',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                lineHeight: 1.5,
                resize: 'vertical',
              }}
            />
          </section>
        )}
      </aside>
    </div>
  )
}

export default ImageLabPage
