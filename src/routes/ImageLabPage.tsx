import { useEffect, useState, useRef } from 'react'
import {
  saveImageAsset,
  saveImageEdit,
  listImageEdits,
  getImageAsset,
  deleteImageEdit,
  updateImageEdit,
  type ListImageEditsParams,
  createImageDescription,
  listImageDescriptions,
  updateImageDescription,
  deleteImageDescription,
  type ListImageDescriptionsParams,
} from '../db/imageRepo'
import type { ImageEdit, ImageDescription, ImageDescriptionFields } from '../db/types'

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

  // Sora 2 Description Builder state
  const [libraryTab, setLibraryTab] = useState<'edits' | 'descriptions'>('edits')
  const [savedDescriptions, setSavedDescriptions] = useState<ImageDescription[]>([])
  const [selectedDescription, setSelectedDescription] = useState<ImageDescription | null>(null)
  const [descriptionFocus, setDescriptionFocus] = useState('Person / Character')
  const [descriptionNotes, setDescriptionNotes] = useState('')
  const [descriptionFields, setDescriptionFields] = useState<ImageDescriptionFields>({
    subjectType: 'Person',
    ageRange: '',
    gender: '',
    ethnicity: '',
    hair: '',
    faceDetails: '',
    outfitTop: '',
    outfitBottom: '',
    shoes: '',
    accessories: '',
    pose: '',
    expression: '',
    setting: '',
    lighting: '',
    cameraFraming: '',
    lensLook: '',
    qualityTags: '',
  })
  const [generatedDescription, setGeneratedDescription] = useState('')
  const [descriptionNegative, setDescriptionNegative] = useState(
    'blurry, low quality, distorted, deformed, unrealistic, cartoonish, CGI, illustration, painting'
  )
  const [savingDescription, setSavingDescription] = useState(false)
  const [copiedDescription, setCopiedDescription] = useState(false)
  
  // Description rename state
  const [renamingDescId, setRenamingDescId] = useState<string | null>(null)
  const [renameDescValue, setRenameDescValue] = useState('')

  // Image-to-Description state
  const [aiDescription, setAiDescription] = useState('')
  const [generatingAiDescription, setGeneratingAiDescription] = useState(false)
  const [aiDescriptionError, setAiDescriptionError] = useState('')
  const [copiedAiDescription, setCopiedAiDescription] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)

  useEffect(() => {
    refreshLibrary()
  }, [searchQuery, favoritesOnly, sortBy])

  useEffect(() => {
    refreshDescriptions()
  }, [searchQuery, favoritesOnly, sortBy])

  useEffect(() => {
    const key = localStorage.getItem('openai_api_key')
    setHasApiKey(!!key)
  }, [])

  const handleGenerateAiDescription = async () => {
    if (!selectedFile) {
      setAiDescriptionError('Please upload an image first.')
      return
    }

    const apiKey = localStorage.getItem('openai_api_key')
    if (!apiKey) {
      setAiDescriptionError('OpenAI API key not found. Please add it in Settings.')
      return
    }

    setGeneratingAiDescription(true)
    setAiDescriptionError('')

    try {
      // Convert image to base64
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(selectedFile)
      })
      const base64Image = await base64Promise

      // Call OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analyze this image and create a single-paragraph Sora 2-ready prompt description. Include: subject details (clothing, physical features, pose), environment, lighting, camera framing, mood, and what to keep consistent if used as reference. Write as one continuous cinematic paragraph with photorealistic language. End with: "no subtitles, no watermarks, no text overlays, no distortions, no extra characters."`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: base64Image
                  }
                }
              ]
            }
          ],
          max_tokens: 500
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `API error: ${response.status}`)
      }

      const data = await response.json()
      const description = data.choices?.[0]?.message?.content || ''
      setAiDescription(description)
      
      // Save to current edit if one is being worked on
      if (imageId && instruction.trim()) {
        // Will be saved when user clicks Save
      }
    } catch (error: any) {
      console.error('Failed to generate AI description:', error)
      setAiDescriptionError(error.message || 'Failed to generate description. Please check your API key and try again.')
    } finally {
      setGeneratingAiDescription(false)
    }
  }

  const handleCopyAiDescription = async () => {
    try {
      await navigator.clipboard.writeText(aiDescription)
      setCopiedAiDescription(true)
      setTimeout(() => setCopiedAiDescription(false), 2000)
    } catch (error) {
      console.error('Failed to copy AI description:', error)
    }
  }

  const handleSaveAiDescriptionToEdit = async () => {
    if (!imageId || !aiDescription.trim()) return
    
    setSavingIndex(-1) // Use -1 to indicate saving AI description
    try {
      // Find if there's already an edit for this image/instruction
      const existingEdit = savedEdits.find(e => e.imageId === imageId && e.instruction === instruction)
      
      if (existingEdit) {
        // Update existing edit with AI description
        await updateImageEdit(existingEdit.id, {
          generatedPromptDescription: aiDescription
        })
      } else {
        // Create new edit with AI description
        const editId = await saveImageEdit(imageId, instruction || 'AI Generated Description', 1, 0, [aiDescription])
        await updateImageEdit(editId, {
          generatedPromptDescription: aiDescription
        })
      }
      
      await refreshLibrary()
      setTimeout(() => setSavingIndex(null), 2000)
    } catch (error) {
      console.error('Failed to save AI description:', error)
      setSavingIndex(null)
    }
  }

  const refreshLibrary = async () => {
    const params: ListImageEditsParams = {
      search: searchQuery || undefined,
      favoritesOnly,
      sort: sortBy,
    }
    const edits = await listImageEdits(params)
    setSavedEdits(edits)
  }

  const refreshDescriptions = async () => {
    const params: ListImageDescriptionsParams = {
      search: searchQuery || undefined,
      favoritesOnly,
      sort: sortBy,
    }
    const descriptions = await listImageDescriptions(params)
    setSavedDescriptions(descriptions)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setPrompts([])
    setAiDescription('')
    setAiDescriptionError('')

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
      
      // Load AI description if exists
      if (edit.generatedPromptDescription) {
        setAiDescription(edit.generatedPromptDescription)
      } else {
        setAiDescription('')
      }
      
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

  // Sora 2 Description Builder handlers
  const generateSoraDescription = () => {
    const parts: string[] = []
    const { subjectType, ageRange, gender, ethnicity, hair, faceDetails, outfitTop, outfitBottom, 
      shoes, accessories, pose, expression, setting, lighting, cameraFraming, lensLook, qualityTags } = descriptionFields

    // Start with notes if provided
    if (descriptionNotes.trim()) {
      parts.push(descriptionNotes.trim())
    }

    // Build subject description
    const subjectParts: string[] = []
    if (ageRange) subjectParts.push(ageRange)
    if (gender) subjectParts.push(gender)
    if (ethnicity) subjectParts.push(ethnicity)
    if (subjectType && subjectType !== 'Person') subjectParts.push(subjectType.toLowerCase())
    
    if (subjectParts.length > 0) {
      parts.push(`A ${subjectParts.join(' ')}`)
    } else if (!descriptionNotes.trim()) {
      parts.push('A person')
    }

    // Physical features
    if (hair) parts.push(`with ${hair}`)
    if (faceDetails) parts.push(`${faceDetails}`)

    // Outfit details
    const outfitParts: string[] = []
    if (outfitTop) outfitParts.push(outfitTop)
    if (outfitBottom) outfitParts.push(outfitBottom)
    if (shoes) outfitParts.push(shoes)
    if (accessories) outfitParts.push(accessories)
    if (outfitParts.length > 0) {
      parts.push(`wearing ${outfitParts.join(', ')}`)
    }

    // Pose and expression
    if (pose) parts.push(pose)
    if (expression) parts.push(`with a ${expression} expression`)

    // Setting
    if (setting) parts.push(`in ${setting}`)

    // Technical details
    const techParts: string[] = []
    if (lighting) techParts.push(lighting)
    if (cameraFraming) techParts.push(cameraFraming)
    if (lensLook) techParts.push(lensLook)
    if (qualityTags) techParts.push(qualityTags)
    
    let description = parts.join(', ') + '.'
    
    if (techParts.length > 0) {
      description += ` ${techParts.join(', ')}.`
    }

    const fullDescription = `${description}\n\nNegative: ${descriptionNegative}`
    
    setGeneratedDescription(fullDescription)
    return fullDescription
  }

  const handleCopyDescription = async () => {
    if (!generatedDescription) return
    try {
      await navigator.clipboard.writeText(generatedDescription)
      setCopiedDescription(true)
      setTimeout(() => setCopiedDescription(false), 2000)
    } catch (error) {
      console.error('Failed to copy description:', error)
    }
  }

  const handleSaveDescription = async () => {
    if (!imageId || !generatedDescription) {
      alert('Please generate a description first.')
      return
    }

    setSavingDescription(true)
    try {
      const title = `${descriptionFocus} - ${new Date().toLocaleDateString()}`
      await createImageDescription(
        imageId,
        title,
        descriptionFocus,
        descriptionNotes,
        descriptionFields,
        generatedDescription,
        descriptionNegative
      )
      await refreshDescriptions()
      setTimeout(() => setSavingDescription(false), 2000)
    } catch (error) {
      console.error('Failed to save description:', error)
      setSavingDescription(false)
    }
  }

  const handleSelectDescription = async (desc: ImageDescription) => {
    setSelectedDescription(desc)
    
    // Load the image asset
    const asset = await getImageAsset(desc.imageId)
    if (asset) {
      const url = URL.createObjectURL(asset.blob)
      setPreviewUrl(url)
      setImageId(desc.imageId)
    }

    // Load the description data
    setDescriptionFocus(desc.focus)
    setDescriptionNotes(desc.notes)
    setDescriptionFields(desc.fields)
    setGeneratedDescription(desc.descriptionText)
    setDescriptionNegative(desc.negativeText)
  }

  const handleToggleDescriptionFavorite = async (desc: ImageDescription, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await updateImageDescription(desc.id, { isFavorite: !desc.isFavorite })
      await refreshDescriptions()
      if (selectedDescription?.id === desc.id) {
        setSelectedDescription({ ...desc, isFavorite: !desc.isFavorite })
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    }
  }

  const handleDeleteDescription = async (descId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Delete this saved description? This cannot be undone.')) return

    try {
      await deleteImageDescription(descId)
      if (selectedDescription?.id === descId) {
        setSelectedDescription(null)
      }
      await refreshDescriptions()
    } catch (error) {
      console.error('Failed to delete description:', error)
    }
  }

  const startDescriptionRename = (desc: ImageDescription, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingDescId(desc.id)
    setRenameDescValue(desc.title)
  }

  const saveDescriptionRename = async () => {
    if (!renamingDescId) return
    const trimmed = renameDescValue.trim()
    if (!trimmed) {
      cancelDescriptionRename()
      return
    }
    try {
      await updateImageDescription(renamingDescId, { title: trimmed })
      await refreshDescriptions()
      if (selectedDescription?.id === renamingDescId) {
        setSelectedDescription({ ...selectedDescription, title: trimmed })
      }
      setRenamingDescId(null)
      setRenameDescValue('')
    } catch (error) {
      console.error('Failed to rename description:', error)
    }
  }

  const cancelDescriptionRename = () => {
    setRenamingDescId(null)
    setRenameDescValue('')
  }

  const handleDescriptionRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveDescriptionRename()
    } else if (e.key === 'Escape') {
      cancelDescriptionRename()
    }
  }

  const updateDescriptionField = (field: keyof ImageDescriptionFields, value: string) => {
    setDescriptionFields((prev) => ({ ...prev, [field]: value }))
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

                {/* Image-to-Description AI */}
                <div
                  style={{
                    background: 'var(--panel)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    marginTop: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>Image Description (Sora 2)</h3>
                    <button
                      onClick={handleGenerateAiDescription}
                      disabled={!hasApiKey || generatingAiDescription}
                      style={{
                        padding: '0.5rem 1rem',
                        background: !hasApiKey || generatingAiDescription ? 'var(--border)' : 'var(--accent)',
                        color: !hasApiKey || generatingAiDescription ? 'var(--text)' : 'var(--bg)',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: !hasApiKey || generatingAiDescription ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        opacity: !hasApiKey || generatingAiDescription ? 0.5 : 1,
                      }}
                    >
                      {generatingAiDescription ? 'Generating...' : 'Create Prompt Description'}
                    </button>
                  </div>

                  {!hasApiKey && (
                    <div style={{ fontSize: '0.85rem', color: '#fbbf24', background: 'rgba(251, 191, 36, 0.1)', padding: '0.5rem', borderRadius: '4px' }}>
                      Add OpenAI API key in Settings to enable.
                    </div>
                  )}

                  {aiDescriptionError && (
                    <div style={{ fontSize: '0.85rem', color: '#f87171', background: 'rgba(248, 113, 113, 0.1)', padding: '0.5rem', borderRadius: '4px' }}>
                      {aiDescriptionError}
                    </div>
                  )}

                  {generatingAiDescription && (
                    <div style={{ fontSize: '0.85rem', opacity: 0.7, fontStyle: 'italic' }}>
                      Analyzing image with GPT-4o...
                    </div>
                  )}

                  {aiDescription && (
                    <>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Generated Description:</span>
                          <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                            {aiDescription.length} chars
                          </span>
                        </div>
                        <textarea
                          value={aiDescription}
                          onChange={(e) => setAiDescription(e.target.value)}
                          rows={6}
                          style={{
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            padding: '0.5rem',
                            color: 'var(--text)',
                            fontFamily: 'inherit',
                            fontSize: '0.9rem',
                            resize: 'vertical',
                          }}
                        />
                      </label>

                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          onClick={handleCopyAiDescription}
                          style={{
                            padding: '0.4rem 0.8rem',
                            background: copiedAiDescription ? '#7dd3fc' : 'var(--panel)',
                            color: 'var(--text)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                          }}
                        >
                          {copiedAiDescription ? '✓ Copied' : '📋 Copy'}
                        </button>
                        
                        <button
                          onClick={handleSaveAiDescriptionToEdit}
                          disabled={savingIndex === -1}
                          style={{
                            padding: '0.4rem 0.8rem',
                            background: savingIndex === -1 ? '#7dd3fc' : 'var(--accent)',
                            color: savingIndex === -1 ? 'var(--text)' : 'var(--bg)',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: savingIndex === -1 ? 'default' : 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                          }}
                        >
                          {savingIndex === -1 ? '✓ Saved to Library' : '💾 Save to Library'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Sora 2 Description Builder */}
        {imageId && (
          <section className="placeholder">
            <h2 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>Sora 2 Description Builder</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Focus and Notes */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1, minWidth: '200px' }}>
                  <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Focus:</span>
                  <select
                    value={descriptionFocus}
                    onChange={(e) => setDescriptionFocus(e.target.value)}
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '0.5rem',
                      color: 'var(--text)',
                      fontSize: '0.9rem',
                    }}
                  >
                    <option>Person / Character</option>
                    <option>Outfit / Wardrobe</option>
                    <option>Face / Headshot</option>
                    <option>Full Body / Pose</option>
                    <option>Environment / Background</option>
                    <option>Lighting / Camera</option>
                  </select>
                </label>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Notes (optional):</span>
                <textarea
                  value={descriptionNotes}
                  onChange={(e) => setDescriptionNotes(e.target.value)}
                  placeholder="e.g., middle-aged man, stern expression, business suit..."
                  rows={2}
                  style={{
                    background: 'var(--panel)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '0.5rem',
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                    fontSize: '0.9rem',
                  }}
                />
              </label>

              {/* Guided Fields Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Subject Type:</span>
                  <input
                    type="text"
                    value={descriptionFields.subjectType}
                    onChange={(e) => updateDescriptionField('subjectType', e.target.value)}
                    placeholder="Person"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>
                
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Age Range:</span>
                  <input
                    type="text"
                    value={descriptionFields.ageRange}
                    onChange={(e) => updateDescriptionField('ageRange', e.target.value)}
                    placeholder="e.g., mid-30s"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Gender:</span>
                  <input
                    type="text"
                    value={descriptionFields.gender}
                    onChange={(e) => updateDescriptionField('gender', e.target.value)}
                    placeholder="e.g., male, female"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Ethnicity/Skin Tone:</span>
                  <input
                    type="text"
                    value={descriptionFields.ethnicity}
                    onChange={(e) => updateDescriptionField('ethnicity', e.target.value)}
                    placeholder="optional"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Hair:</span>
                  <input
                    type="text"
                    value={descriptionFields.hair}
                    onChange={(e) => updateDescriptionField('hair', e.target.value)}
                    placeholder="e.g., short brown hair"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Face Details:</span>
                  <input
                    type="text"
                    value={descriptionFields.faceDetails}
                    onChange={(e) => updateDescriptionField('faceDetails', e.target.value)}
                    placeholder="e.g., beard, glasses"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Outfit Top:</span>
                  <input
                    type="text"
                    value={descriptionFields.outfitTop}
                    onChange={(e) => updateDescriptionField('outfitTop', e.target.value)}
                    placeholder="e.g., navy blazer"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Outfit Bottom:</span>
                  <input
                    type="text"
                    value={descriptionFields.outfitBottom}
                    onChange={(e) => updateDescriptionField('outfitBottom', e.target.value)}
                    placeholder="e.g., gray trousers"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Shoes:</span>
                  <input
                    type="text"
                    value={descriptionFields.shoes}
                    onChange={(e) => updateDescriptionField('shoes', e.target.value)}
                    placeholder="e.g., black dress shoes"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Accessories:</span>
                  <input
                    type="text"
                    value={descriptionFields.accessories}
                    onChange={(e) => updateDescriptionField('accessories', e.target.value)}
                    placeholder="e.g., watch, tie"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Pose/Action:</span>
                  <input
                    type="text"
                    value={descriptionFields.pose}
                    onChange={(e) => updateDescriptionField('pose', e.target.value)}
                    placeholder="e.g., standing, walking"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Expression/Mood:</span>
                  <input
                    type="text"
                    value={descriptionFields.expression}
                    onChange={(e) => updateDescriptionField('expression', e.target.value)}
                    placeholder="e.g., confident"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Setting/Background:</span>
                  <input
                    type="text"
                    value={descriptionFields.setting}
                    onChange={(e) => updateDescriptionField('setting', e.target.value)}
                    placeholder="e.g., modern office"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Lighting:</span>
                  <input
                    type="text"
                    value={descriptionFields.lighting}
                    onChange={(e) => updateDescriptionField('lighting', e.target.value)}
                    placeholder="e.g., studio lighting"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Camera Framing:</span>
                  <input
                    type="text"
                    value={descriptionFields.cameraFraming}
                    onChange={(e) => updateDescriptionField('cameraFraming', e.target.value)}
                    placeholder="e.g., medium shot"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Lens/Look:</span>
                  <input
                    type="text"
                    value={descriptionFields.lensLook}
                    onChange={(e) => updateDescriptionField('lensLook', e.target.value)}
                    placeholder="e.g., shallow DOF"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Quality Tags:</span>
                  <input
                    type="text"
                    value={descriptionFields.qualityTags}
                    onChange={(e) => updateDescriptionField('qualityTags', e.target.value)}
                    placeholder="e.g., photorealistic"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>
              </div>

              {/* Negative Prompt */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Negative Prompt:</span>
                <input
                  type="text"
                  value={descriptionNegative}
                  onChange={(e) => setDescriptionNegative(e.target.value)}
                  style={{
                    background: 'var(--panel)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '0.5rem',
                    color: 'var(--text)',
                    fontSize: '0.85rem',
                  }}
                />
              </label>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={generateSoraDescription}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--accent)',
                    color: 'var(--bg)',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Create Prompt Description
                </button>
                <button
                  onClick={handleCopyDescription}
                  disabled={!generatedDescription}
                  style={{
                    padding: '0.5rem 1rem',
                    background: copiedDescription ? '#7dd3fc' : 'var(--panel)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    cursor: generatedDescription ? 'pointer' : 'not-allowed',
                    opacity: generatedDescription ? 1 : 0.5,
                  }}
                >
                  {copiedDescription ? '✓ Copied' : '📋 Copy Description'}
                </button>
                <button
                  onClick={handleSaveDescription}
                  disabled={!generatedDescription || savingDescription}
                  style={{
                    padding: '0.5rem 1rem',
                    background: savingDescription ? 'var(--panel)' : '#22c55e',
                    color: savingDescription ? 'var(--muted)' : '#0b1220',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    cursor: generatedDescription && !savingDescription ? 'pointer' : 'not-allowed',
                    fontWeight: 600,
                    opacity: generatedDescription ? 1 : 0.5,
                  }}
                >
                  {savingDescription ? '✓ Saved' : '💾 Save Description'}
                </button>
              </div>

              {/* Generated Output */}
              {generatedDescription && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Generated Sora 2 Description:</span>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      opacity: 0.7,
                      color: generatedDescription.length > 2000 ? '#ef4444' : 'inherit'
                    }}>
                      {generatedDescription.length} chars {generatedDescription.length > 2000 ? '(⚠️ over 2000)' : ''}
                    </span>
                  </div>
                  <textarea
                    value={generatedDescription}
                    readOnly
                    rows={10}
                    style={{
                      width: '100%',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '0.75rem',
                      color: 'var(--text)',
                      fontFamily: 'monospace',
                      fontSize: '0.9rem',
                      lineHeight: 1.5,
                      resize: 'vertical',
                    }}
                  />
                </div>
              )}
            </div>
          </section>
        )}

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

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)' }}>
            <button
              onClick={() => setLibraryTab('edits')}
              style={{
                padding: '0.5rem 1rem',
                background: libraryTab === 'edits' ? 'var(--accent)' : 'transparent',
                color: libraryTab === 'edits' ? 'var(--bg)' : 'var(--text)',
                border: 'none',
                borderBottom: libraryTab === 'edits' ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                fontWeight: libraryTab === 'edits' ? 600 : 400,
                fontSize: '0.9rem',
              }}
            >
              Edits
            </button>
            <button
              onClick={() => setLibraryTab('descriptions')}
              style={{
                padding: '0.5rem 1rem',
                background: libraryTab === 'descriptions' ? 'var(--accent)' : 'transparent',
                color: libraryTab === 'descriptions' ? 'var(--bg)' : 'var(--text)',
                border: 'none',
                borderBottom: libraryTab === 'descriptions' ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                fontWeight: libraryTab === 'descriptions' ? 600 : 400,
                fontSize: '0.9rem',
              }}
            >
              Descriptions
            </button>
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
            <input
              type="text"
              placeholder={libraryTab === 'edits' ? '🔍 Search edits...' : '🔍 Search descriptions...'}
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

          {/* Edits List */}
          {libraryTab === 'edits' && (
            <>
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
            </>
          )}

          {/* Descriptions List */}
          {libraryTab === 'descriptions' && (
            <>
              {savedDescriptions.length === 0 && (
                <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>
                  {searchQuery || favoritesOnly ? 'No matches found.' : 'No saved descriptions yet.'}
                </p>
              )}
              {savedDescriptions.map((desc) => (
                <div
                  key={desc.id}
                  onClick={() => handleSelectDescription(desc)}
                  style={{
                    background: selectedDescription?.id === desc.id ? 'rgba(125, 211, 252, 0.1)' : 'var(--panel)',
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
                    {renamingDescId === desc.id ? (
                      <input
                        type="text"
                        value={renameDescValue}
                        onChange={(e) => setRenameDescValue(e.target.value)}
                        onKeyDown={handleDescriptionRenameKeyDown}
                        onBlur={saveDescriptionRename}
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
                        onClick={(e) => startDescriptionRename(desc, e)}
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
                        {desc.title}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                      <button
                        onClick={(e) => handleToggleDescriptionFavorite(desc, e)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '1rem',
                          padding: '0.2rem',
                          lineHeight: 1,
                          opacity: desc.isFavorite ? 1 : 0.3,
                        }}
                        title={desc.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        ⭐
                      </button>
                      <button
                        onClick={(e) => handleDeleteDescription(desc.id, e)}
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
                    Focus: {desc.focus}
                  </div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.75 }}>
                    {desc.notes ? desc.notes.slice(0, 50) : desc.descriptionText.slice(0, 50)}
                    {(desc.notes || desc.descriptionText).length > 50 ? '...' : ''}
                  </div>
                  <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>
                    {new Date(desc.updatedAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </>
          )}
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
