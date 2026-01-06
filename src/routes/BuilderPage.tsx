import { useEffect, useRef, useState } from 'react'
import { createPrompt, getSettings, savePromptVersion, updateSettings } from '../db/repo'

interface BuilderPageProps {
  dbReady: boolean
  dbError: string | null
}

interface Character {
  existing: boolean
  name: string
  look: string
  outfit: string
  notes: string
}

const DEFAULT_NEGATIVE =
  'blurry, grainy, low resolution, out of focus, bad anatomy, warped hands, extra limbs, missing fingers, deformed, mutated features, cartoon, surreal, watermark, logo, text, subtitles'

const DEFAULT_PLATFORMS = ['Sora 2', 'Runway Gen-3', 'Pika 2.0']
const REALISM_OPTIONS = [
  'Hyper-Realistic',
  'Photorealistic',
  'Cinematic Live Action',
  'Stylized',
  'Surreal',
  'Animated / Cartoon',
]
const FRAME_OPTIONS = [
  'Cinematic',
  'Documentary',
  'Aerial',
  'POV',
  'Broadcast / News Desk',
  'Handheld / Phone Video',
  'Selfie-Stick',
]

const NEGATIVE_OPTIONS = {
  styleA: { label: 'No black & white / monochrome', tokens: 'black and white, monochrome' },
  styleB: { label: 'No fisheye or distorted lens', tokens: 'fisheye, distorted lens' },
  styleC: { label: 'No heavy motion blur', tokens: 'heavy motion blur' },
  styleD: { label: 'No extreme close-up', tokens: 'extreme close-up' },
  styleE: { label: 'No shaky handheld camera', tokens: 'shaky handheld, handheld shake' },
  techA: { label: 'No flicker or stutter', tokens: 'flicker, stutter' },
  techB: { label: 'No compression artifacts', tokens: 'compression artifacts, macroblocking' },
  techC: { label: 'No overexposed or underexposed lighting', tokens: 'overexposed, underexposed' },
  techD: { label: 'No lens dirt, glare or reflections', tokens: 'lens dirt, glare, reflections' },
  contentA: { label: 'No violence or gore', tokens: 'violence, gore' },
  contentB: { label: 'No injuries or blood', tokens: 'injuries, blood' },
  contentC: { label: 'No explicit or suggestive content', tokens: 'explicit, suggestive' },
  contentD: { label: 'No smoking, drugs, alcohol', tokens: 'smoking, drugs, alcohol' },
}

function BuilderPage({ dbReady, dbError }: BuilderPageProps) {
  const [loading, setLoading] = useState(true)

  // Form state
  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState('Sora 2')
  const [customPlatforms, setCustomPlatforms] = useState<Array<{ name: string; maxChars: number; notes?: string }>>([])
  const [duration, setDuration] = useState(15)
  const [realism, setRealism] = useState('Hyper-Realistic')
  const [frameType, setFrameType] = useState('Cinematic')
  const [maxChars, setMaxChars] = useState(2000)
  const [numCharacters, setNumCharacters] = useState(0)
  const [characters, setCharacters] = useState<Character[]>([])
  const [sceneDescription, setSceneDescription] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [baseNegative, setBaseNegative] = useState('')
  const [selectedNegativeOptions, setSelectedNegativeOptions] = useState<string[]>([])

  // Output state
  const [generatedPrompt, setGeneratedPrompt] = useState('')
  const [showOutput, setShowOutput] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [copiedNegative, setCopiedNegative] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentPromptId, setCurrentPromptId] = useState<string | null>(null)
  const [lastSavedVersionId, setLastSavedVersionId] = useState<string | null>(null)

  // Modal state
  const [showPlatformModal, setShowPlatformModal] = useState(false)
  const [newPlatformName, setNewPlatformName] = useState('')
  const [newPlatformMaxChars, setNewPlatformMaxChars] = useState<number | ''>('')
  const [newPlatformNotes, setNewPlatformNotes] = useState('')
  const [previousPlatform, setPreviousPlatform] = useState('Sora 2')
  const modalRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (dbReady) {
      getSettings()
        .then((settings) => {
          setDuration(settings.durationSeconds)
          setRealism(settings.realismPreset || 'Hyper-Realistic')
          setFrameType(settings.frameType || 'Cinematic')
          setPlatform(settings.platform || 'Sora 2')
          setMaxChars(settings.maxChars || 2000)
          const defaultNeg = settings.negativePromptDefault || DEFAULT_NEGATIVE
          setBaseNegative(defaultNeg)
          setSelectedNegativeOptions(settings.negativeOptionsSelected || [])
          setCustomPlatforms(settings.platformsCustom || [])
          setPreviousPlatform(settings.platform || 'Sora 2')
          if (!settings.negativePromptDefault) {
            updateSettings({ negativePromptDefault: DEFAULT_NEGATIVE }).catch(console.error)
          }
          setLoading(false)
        })
        .catch((error) => {
          console.error('Failed to load settings:', error)
          setLoading(false)
        })
    }
  }, [dbReady])

  useEffect(() => {
    // Update characters array when count changes
    const newCharacters: Character[] = []
    for (let i = 0; i < numCharacters; i++) {
      newCharacters.push(
        characters[i] || { existing: false, name: '', look: '', outfit: '', notes: '' }
      )
    }
    setCharacters(newCharacters)
  }, [numCharacters])

  useEffect(() => {
    if (showPlatformModal && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'input, button, textarea, select, [tabindex]:not([tabindex="-1"])'
      )
      focusable[0]?.focus()
    }
  }, [showPlatformModal])

  // Merge baseNegative + auto tokens into negativePrompt
  useEffect(() => {
    const autoTokens = selectedNegativeOptions
      .map((id) => NEGATIVE_OPTIONS[id as keyof typeof NEGATIVE_OPTIONS]?.tokens || '')
      .filter(Boolean)
      .join(', ')

    const allTokens = [baseNegative, autoTokens]
      .filter((s) => s.trim())
      .join(', ')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    // Deduplicate
    const unique = Array.from(new Set(allTokens))
    setNegativePrompt(unique.join(', '))
  }, [baseNegative, selectedNegativeOptions])

  const allPlatforms = [...DEFAULT_PLATFORMS, ...customPlatforms.map((p) => p.name)]

  const handlePlatformChange = (value: string) => {
    if (value === '__add_platform__') {
      setPreviousPlatform(platform)
      setShowPlatformModal(true)
      setNewPlatformName('')
      setNewPlatformMaxChars(maxChars)
      setNewPlatformNotes('')
      return
    }

    setPlatform(value)
    const foundCustom = customPlatforms.find((p) => p.name === value)
    if (foundCustom) {
      setMaxChars(foundCustom.maxChars)
    }
  }

  const handleModalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!showPlatformModal || !modalRef.current) return
    if (e.key === 'Escape') {
      e.stopPropagation()
      setShowPlatformModal(false)
      setPlatform(previousPlatform)
      return
    }

    if (e.key === 'Tab') {
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'input, button, textarea, select, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
  }

  const handleSaveNewPlatform = async () => {
    if (!newPlatformName.trim() || !newPlatformMaxChars) return

    const entry = {
      name: newPlatformName.trim(),
      maxChars: Number(newPlatformMaxChars),
      notes: newPlatformNotes.trim() || undefined,
    }

    const updated = [...customPlatforms, entry]
    setCustomPlatforms(updated)
    setPlatform(entry.name)
    setMaxChars(entry.maxChars)

    try {
      await updateSettings({
        platformsCustom: updated,
        platform: entry.name,
        maxChars: entry.maxChars,
      })
    } catch (error) {
      console.error('Failed to save custom platform:', error)
    }

    setShowPlatformModal(false)
  }

  const handleCancelPlatform = () => {
    setShowPlatformModal(false)
    setPlatform(previousPlatform)
  }

  const handleNegativeOptionToggle = async (optionId: string) => {
    const updated = selectedNegativeOptions.includes(optionId)
      ? selectedNegativeOptions.filter((id) => id !== optionId)
      : [...selectedNegativeOptions, optionId]

    setSelectedNegativeOptions(updated)

    try {
      await updateSettings({ negativeOptionsSelected: updated })
    } catch (error) {
      console.error('Failed to save negative option selection:', error)
    }
  }

  const handleNegativePromptManualChange = (value: string) => {
    // Extract auto tokens
    const autoTokens = selectedNegativeOptions
      .map((id) => NEGATIVE_OPTIONS[id as keyof typeof NEGATIVE_OPTIONS]?.tokens || '')
      .filter(Boolean)
      .join(', ')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const autoTokensSet = new Set(autoTokens)

    // User's tokens = value minus auto tokens
    const userTokens = value
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t && !autoTokensSet.has(t))

    setBaseNegative(userTokens.join(', '))
  }

  const compilePrompt = (): string => {
    const parts: string[] = []

    // Duration + realism + frame type
    parts.push(`${duration} second ${frameType} shot, ${realism} style.`)

    // Character block
    if (numCharacters > 0 && characters.length > 0) {
      const charDescriptions = characters
        .map((char, idx) => {
          const prefix = char.existing ? 'Existing character' : 'New character'
          const name = char.name.trim() || `Character ${idx + 1}`
          const details = [char.look, char.outfit, char.notes].filter((s) => s.trim()).join(', ')
          return `${prefix} "${name}"${details ? ': ' + details : ''}`
        })
        .filter(Boolean)
      if (charDescriptions.length > 0) {
        parts.push('\nCharacters:\n' + charDescriptions.join('.\n') + '.')
      }
    }

    // Scene description
    if (sceneDescription.trim()) {
      parts.push('\nScene: ' + sceneDescription.trim())
    }

    // Negative prompt
    if (negativePrompt.trim()) {
      parts.push('\nAvoid: ' + negativePrompt.trim())
    }

    return parts.join('\n')
  }

  const handleGenerate = () => {
    const content = compilePrompt()
    setGeneratedPrompt(content)
    setShowOutput(true)
  }

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt)
      setCopiedPrompt(true)
      setTimeout(() => setCopiedPrompt(false), 2000)
    } catch (error) {
      console.error('Failed to copy prompt:', error)
    }
  }

  const handleCopyNegative = async () => {
    try {
      await navigator.clipboard.writeText(negativePrompt)
      setCopiedNegative(true)
      setTimeout(() => setCopiedNegative(false), 2000)
    } catch (error) {
      console.error('Failed to copy negative prompt:', error)
    }
  }

  const handleSaveToLibrary = async () => {
    if (!generatedPrompt.trim()) return
    setSaving(true)
    try {
      const titleToUse = title.trim() || 'Untitled Prompt'
      let promptId = currentPromptId
      if (!promptId) {
        promptId = await createPrompt({ title: titleToUse, platform, tags: [] })
        setCurrentPromptId(promptId)
      }

      const versionId = await savePromptVersion(promptId, generatedPrompt, {
        charCount: generatedPrompt.length,
        riskScore: 0,
        riskReasons: [],
        platform,
        realism,
        frameType,
        durationSeconds: duration,
        negativePrompt,
      })
      setLastSavedVersionId(versionId)
    } catch (error) {
      console.error('Failed to save prompt:', error)
    } finally {
      setSaving(false)
    }
  }

  if (!dbReady) {
    return (
      <section className="placeholder">
        <h1>Builder</h1>
        {dbError ? (
          <p style={{ color: '#f87171' }}>Error: {dbError}</p>
        ) : (
          <p>Initializing...</p>
        )}
      </section>
    )
  }

  if (loading) {
    return (
      <section className="placeholder">
        <h1>Builder</h1>
        <p>Loading defaults...</p>
      </section>
    )
  }

  return (
    <div className="builder-layout" data-show-output={showOutput}>
      {/* Input Form */}
      <section className="placeholder builder-form">
        <h1 style={{ marginBottom: '1rem' }}>Prompt Builder</h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Title */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Title / Intent:</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Hero walking through city"
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.5rem',
                color: 'var(--text)',
                fontSize: '0.9rem',
              }}
            />
          </label>

          {/* Platform, Duration, Realism, Frame Type */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.75rem',
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Platform:</span>
              <select
                value={platform}
                onChange={(e) => handlePlatformChange(e.target.value)}
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0.5rem',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                }}
              >
                {allPlatforms.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value="__add_platform__">Add New Platform…</option>
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Duration (sec):</span>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                min={1}
                max={60}
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0.5rem',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Realism:</span>
              <select
                value={realism}
                onChange={(e) => setRealism(e.target.value)}
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0.5rem',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                }}
              >
                {REALISM_OPTIONS.map((opt) => (
                  <option key={opt}>{opt}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Frame Type:</span>
              <select
                value={frameType}
                onChange={(e) => setFrameType(e.target.value)}
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0.5rem',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                }}
              >
                {FRAME_OPTIONS.map((opt) => (
                  <option key={opt}>{opt}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Character Count */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Number of Characters (0-10):</span>
            <input
              type="number"
              value={numCharacters}
              onChange={(e) => setNumCharacters(Math.min(10, Math.max(0, Number(e.target.value))))}
              min={0}
              max={10}
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.5rem',
                color: 'var(--text)',
                fontSize: '0.9rem',
                maxWidth: '120px',
              }}
            />
          </label>

          {/* Character Table */}
          {numCharacters > 0 && (
            <fieldset
              style={{
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.75rem',
                background: 'var(--panel)',
              }}
            >
              <legend style={{ fontSize: '0.85rem', opacity: 0.8, padding: '0 0.5rem' }}>
                Character Details
              </legend>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.8rem' }}>
                        Existing?
                      </th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.8rem' }}>
                        Name
                      </th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.8rem' }}>
                        Look/Expressions
                      </th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.8rem' }}>
                        Outfit
                      </th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.8rem' }}>
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {characters.map((char, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: '0.5rem' }}>
                          <input
                            type="checkbox"
                            checked={char.existing}
                            onChange={(e) => {
                              const updated = [...characters]
                              updated[idx].existing = e.target.checked
                              setCharacters(updated)
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <input
                            type="text"
                            value={char.name}
                            onChange={(e) => {
                              const updated = [...characters]
                              updated[idx].name = e.target.value
                              setCharacters(updated)
                            }}
                            placeholder={`Character ${idx + 1}`}
                            style={{
                              background: 'var(--bg)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              padding: '0.3rem',
                              color: 'var(--text)',
                              fontSize: '0.85rem',
                              width: '100%',
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <input
                            type="text"
                            value={char.look}
                            onChange={(e) => {
                              const updated = [...characters]
                              updated[idx].look = e.target.value
                              setCharacters(updated)
                            }}
                            placeholder="e.g., smiling, confident"
                            style={{
                              background: 'var(--bg)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              padding: '0.3rem',
                              color: 'var(--text)',
                              fontSize: '0.85rem',
                              width: '100%',
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <input
                            type="text"
                            value={char.outfit}
                            onChange={(e) => {
                              const updated = [...characters]
                              updated[idx].outfit = e.target.value
                              setCharacters(updated)
                            }}
                            placeholder="e.g., casual jeans"
                            style={{
                              background: 'var(--bg)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              padding: '0.3rem',
                              color: 'var(--text)',
                              fontSize: '0.85rem',
                              width: '100%',
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <input
                            type="text"
                            value={char.notes}
                            onChange={(e) => {
                              const updated = [...characters]
                              updated[idx].notes = e.target.value
                              setCharacters(updated)
                            }}
                            placeholder="Optional"
                            style={{
                              background: 'var(--bg)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              padding: '0.3rem',
                              color: 'var(--text)',
                              fontSize: '0.85rem',
                              width: '100%',
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </fieldset>
          )}

          {/* Scene Description */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Scene Description:</span>
            <textarea
              value={sceneDescription}
              onChange={(e) => setSceneDescription(e.target.value)}
              placeholder="Describe the setting, action, camera movement..."
              rows={4}
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.5rem',
                color: 'var(--text)',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                resize: 'vertical',
              }}
            />
          </label>

          {/* Negative Prompts */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Negative Prompts:</span>
            <textarea
              value={negativePrompt}
              onChange={(e) => handleNegativePromptManualChange(e.target.value)}
              placeholder="Elements to avoid..."
              rows={2}
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.5rem',
                color: 'var(--text)',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                resize: 'vertical',
              }}
            />
          </label>

          {/* Negative Options Checkboxes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Style / Look */}
            <fieldset
              style={{
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.75rem',
                background: 'var(--panel)',
              }}
            >
              <legend style={{ fontSize: '0.85rem', opacity: 0.8, padding: '0 0.5rem' }}>
                Style / Look
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {['styleA', 'styleB', 'styleC', 'styleD', 'styleE'].map((id) => (
                  <label
                    key={id}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedNegativeOptions.includes(id)}
                      onChange={() => handleNegativeOptionToggle(id)}
                    />
                    <span>{NEGATIVE_OPTIONS[id as keyof typeof NEGATIVE_OPTIONS].label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Technical Artifacts */}
            <fieldset
              style={{
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.75rem',
                background: 'var(--panel)',
              }}
            >
              <legend style={{ fontSize: '0.85rem', opacity: 0.8, padding: '0 0.5rem' }}>
                Technical Artifacts
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {['techA', 'techB', 'techC', 'techD'].map((id) => (
                  <label
                    key={id}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedNegativeOptions.includes(id)}
                      onChange={() => handleNegativeOptionToggle(id)}
                    />
                    <span>{NEGATIVE_OPTIONS[id as keyof typeof NEGATIVE_OPTIONS].label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Content / Safety */}
            <fieldset
              style={{
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.75rem',
                background: 'var(--panel)',
              }}
            >
              <legend style={{ fontSize: '0.85rem', opacity: 0.8, padding: '0 0.5rem' }}>
                Content / Safety (family-friendly clips)
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {['contentA', 'contentB', 'contentC', 'contentD'].map((id) => (
                  <label
                    key={id}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedNegativeOptions.includes(id)}
                      onChange={() => handleNegativeOptionToggle(id)}
                    />
                    <span>{NEGATIVE_OPTIONS[id as keyof typeof NEGATIVE_OPTIONS].label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            style={{
              padding: '0.6rem 1.2rem',
              background: 'var(--accent)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.95rem',
            }}
          >
            Generate
          </button>
        </div>
      </section>

      {showPlatformModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-platform-title"
          onKeyDown={handleModalKeyDown}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            ref={modalRef}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '1rem',
              minWidth: '320px',
              maxWidth: '420px',
              boxShadow: 'var(--shadow)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <h2 id="add-platform-title" style={{ margin: 0, fontSize: '1rem' }}>
              Add New Platform
            </h2>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Platform Name *</span>
              <input
                value={newPlatformName}
                onChange={(e) => setNewPlatformName(e.target.value)}
                required
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '0.45rem',
                  color: 'var(--text)',
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Max Characters *</span>
              <input
                type="number"
                min={1}
                value={newPlatformMaxChars}
                onChange={(e) => setNewPlatformMaxChars(Number(e.target.value) || '')}
                required
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '0.45rem',
                  color: 'var(--text)',
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Notes (optional)</span>
              <textarea
                value={newPlatformNotes}
                onChange={(e) => setNewPlatformNotes(e.target.value)}
                rows={2}
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '0.45rem',
                  color: 'var(--text)',
                  resize: 'vertical',
                }}
              />
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                onClick={handleCancelPlatform}
                style={{
                  padding: '0.45rem 0.8rem',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewPlatform}
                style={{
                  padding: '0.45rem 0.8rem',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'var(--bg)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Save Platform
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Output Panel */}
      {showOutput && (
        <aside className="builder-output">
          <div className="placeholder" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Output</h2>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                <button
                  onClick={handleCopyPrompt}
                  style={{
                    padding: '0.4rem 0.8rem',
                    background: copiedPrompt ? '#7dd3fc' : 'var(--accent)',
                    color: 'var(--bg)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    transition: 'background 0.2s',
                  }}
                >
                  {copiedPrompt ? '✓ Prompt Copied' : '📋 Copy Prompt'}
                </button>
                <button
                  onClick={handleCopyNegative}
                  style={{
                    padding: '0.4rem 0.8rem',
                    background: copiedNegative ? '#7dd3fc' : 'var(--panel)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    transition: 'background 0.2s',
                  }}
                >
                  {copiedNegative ? '✓ Negative Copied' : '📋 Copy Negative'}
                </button>
                <button
                  onClick={handleSaveToLibrary}
                  disabled={saving}
                  style={{
                    padding: '0.4rem 0.8rem',
                    background: saving ? 'var(--panel)' : '#22c55e',
                    color: saving ? 'var(--muted)' : '#0b1220',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    transition: 'opacity 0.2s',
                  }}
                >
                  {saving ? 'Saving...' : 'Save to Library'}
                </button>
                {!saving && lastSavedVersionId && (
                  <span style={{ fontSize: '0.85rem', color: '#34d399' }}>Saved</span>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.9rem' }}>
              <div>
                <div style={{ opacity: 0.7 }}>Prompt chars</div>
                <div style={{ color: generatedPrompt.length > maxChars ? '#f87171' : 'inherit', fontWeight: 700 }}>
                  {generatedPrompt.length}
                </div>
              </div>
              <div>
                <div style={{ opacity: 0.7 }}>Negative chars</div>
                <div style={{ fontWeight: 700 }}>{negativePrompt.length}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.9rem', opacity: 0.8 }}>Generated Prompt</label>
              <textarea
                value={generatedPrompt}
                readOnly
                rows={14}
                style={{
                  width: '100%',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  color: 'var(--text)',
                  fontFamily: 'monospace',
                  fontSize: '0.9rem',
                  lineHeight: 1.6,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.9rem', opacity: 0.8 }}>Negative Prompt</label>
              <textarea
                value={negativePrompt}
                readOnly
                rows={6}
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
          </div>
        </aside>
      )}
    </div>
  )
}

export default BuilderPage
