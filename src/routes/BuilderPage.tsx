import { useEffect, useRef, useState } from 'react'
import { createPrompt, getSettings, savePromptVersion, updateSettings } from '../db/repo'
import ReleaseChecklistModal from '../components/ReleaseChecklistModal'
import CharacterTypeahead from '../components/CharacterTypeahead'
import CreatedCharactersPanel from '../components/CreatedCharactersPanel'
import type { CreatedCharacter } from '../db/types'

interface BuilderPageProps {
  dbReady: boolean
  dbError: string | null
}

interface Character {
  existing: boolean
  tag: string // Add tag field for Created Character reference
  name: string
  look: string
  outfit: string
  notes: string
}

const DEFAULT_NEGATIVE =
  'blurry, grainy, low resolution, out of focus, bad anatomy, warped hands, extra limbs, missing fingers, deformed, mutated features, cartoon, surreal, watermark, logo, text, subtitles'

const SHORT_DESC_THRESHOLD = 350 // chars - threshold for "short description" nudge

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

const defaultAiContentType = (realismValue: string) =>
  realismValue === 'Hyper-Realistic' ? 'photoreal_cinematic_still' : 'ai_generic'

function BuilderPage({ dbReady, dbError }: BuilderPageProps) {
  const [loading, setLoading] = useState(true)

  // Form state
  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState('Sora 2')
  const [customPlatforms, setCustomPlatforms] = useState<Array<{ name: string; maxChars: number; notes?: string }>>([])
  const [duration, setDuration] = useState(15)
  const [realism, setRealism] = useState('Hyper-Realistic')
  const [aiContentType, setAiContentType] = useState<string>(() => defaultAiContentType('Hyper-Realistic'))
  const [frameType, setFrameType] = useState('Cinematic')
  const [maxChars, setMaxChars] = useState(2000)
  const [numCharacters, setNumCharacters] = useState(0)
  const [characters, setCharacters] = useState<Character[]>([])
  const [sceneDescription, setSceneDescription] = useState('')
  const [characterCap, setCharacterCap] = useState<number | ''>(2000)
  const [validationError, setValidationError] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [baseNegative, setBaseNegative] = useState('')
  const [selectedNegativeOptions, setSelectedNegativeOptions] = useState<string[]>([])

  // New output format state
  const defaultAudioOptions = {
    music: { enabled: true, text: '' },
    sfx: { enabled: true, text: '' },
    vo: { enabled: true, text: '' },
  }

  const normalizeAudioOptions = (settingsAudio: any, legacyIncludeAudio?: boolean) => {
    if (settingsAudio) {
      const isBooleanShape = ['music', 'sfx', 'vo'].some((k) => typeof settingsAudio?.[k] === 'boolean')
      if (isBooleanShape) {
        return {
          music: { enabled: !!settingsAudio.music, text: '' },
          sfx: { enabled: !!settingsAudio.sfx, text: '' },
          vo: { enabled: !!settingsAudio.vo, text: '' },
        }
      }
      const isStructured = ['music', 'sfx', 'vo'].every(
        (k) => settingsAudio?.[k]?.enabled !== undefined && settingsAudio?.[k]?.text !== undefined
      )
      if (isStructured) {
        return {
          music: { enabled: !!settingsAudio.music.enabled, text: settingsAudio.music.text || '' },
          sfx: { enabled: !!settingsAudio.sfx.enabled, text: settingsAudio.sfx.text || '' },
          vo: { enabled: !!settingsAudio.vo.enabled, text: settingsAudio.vo.text || '' },
        }
      }
    }

    if (typeof legacyIncludeAudio === 'boolean') {
      return {
        music: { enabled: legacyIncludeAudio, text: '' },
        sfx: { enabled: legacyIncludeAudio, text: '' },
        vo: { enabled: legacyIncludeAudio, text: '' },
      }
    }

    return defaultAudioOptions
  }

  const [outputFormat, setOutputFormat] = useState<'paragraph' | 'timeline' | 'remix-paragraph' | 'remix-timeline'>('paragraph')
  const [audioOptions, setAudioOptions] = useState<typeof defaultAudioOptions>(defaultAudioOptions)
  const [blocksCount, setBlocksCount] = useState(8)
  const [tone, setTone] = useState('Neutral')
  
  // Remix mode state
  const [remixSourceLink, setRemixSourceLink] = useState('')
  const [remixSourceDesc, setRemixSourceDesc] = useState('')
  const [remixIdea, setRemixIdea] = useState('')

  // Elaborate to Cap state
  const [elaborateToCap, setElaborateToCap] = useState(false)
  const [elaborateFields, setElaborateFields] = useState({
    setting: '',
    timeOfDay: 'Day',
    lighting: 'Natural',
    mood: 'Neutral',
    camera: 'Medium',
    motionBeats: '',
    colorPalette: '',
    constraints: '',
  })

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
  const [showChecklist, setShowChecklist] = useState(false)
  const [characterTab, setCharacterTab] = useState<'manual' | 'library'>('manual')
  const modalRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (dbReady) {
      getSettings()
        .then((settings) => {
          setDuration(settings.durationSeconds)
          setRealism(settings.realismPreset || 'Hyper-Realistic')
          setFrameType(settings.frameType || 'Cinematic')
          const resolvedAiContentType = settings.aiContentType || defaultAiContentType(settings.realismPreset || 'Hyper-Realistic')
          setAiContentType(resolvedAiContentType)
          if (!settings.aiContentType) {
            updateSettings({ aiContentType: resolvedAiContentType }).catch(console.error)
          }
          setPlatform(settings.platform || 'Sora 2')
          setMaxChars(settings.maxChars || 2000)
            setOutputFormat(settings.outputFormat || 'paragraph')
          const normalizedAudio = normalizeAudioOptions(settings.audioOptions, settings.includeAudio)
          setAudioOptions(normalizedAudio)
          updateSettings({ audioOptions: normalizedAudio }).catch(console.error)
          const defaultNeg = settings.negativePromptDefault || DEFAULT_NEGATIVE
          setBaseNegative(defaultNeg)
          setSelectedNegativeOptions(settings.negativeOptionsSelected || [])
          setCustomPlatforms(settings.platformsCustom || [])
          setPreviousPlatform(settings.platform || 'Sora 2')
          if (settings.elaborateToCap !== undefined) {
            setElaborateToCap(settings.elaborateToCap)
          }
          if (settings.elaborateFields) {
            setElaborateFields(settings.elaborateFields)
          }
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
        characters[i] || { existing: false, tag: '', name: '', look: '', outfit: '', notes: '' }
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

  // Save elaborate settings
  useEffect(() => {
    if (dbReady) {
      updateSettings({ elaborateToCap }).catch(console.error)
    }
  }, [elaborateToCap, dbReady])

  useEffect(() => {
    if (dbReady) {
      updateSettings({ elaborateFields }).catch(console.error)
    }
  }, [elaborateFields, dbReady])

  const allPlatforms = [...DEFAULT_PLATFORMS, ...customPlatforms.map((p) => p.name)]

  const formatNumber = (num: number): string => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  const getCharCountColor = (): string => {
    if (!characterCap) return 'inherit'
    const cap = Number(characterCap)
    if (generatedPrompt.length > cap) return '#f87171'
    if (generatedPrompt.length >= cap - 200) return '#fbbf24'
    return 'inherit'
  }

  const getSceneDescQualityHint = (): { text: string; color: string } => {
    const len = sceneDescription.trim().length
    const cap = characterCap ? Number(characterCap) : 2000
    
    if (len === 0) return { text: 'Required', color: '#9ca3af' }
    if (len < SHORT_DESC_THRESHOLD) return { text: 'Short, consider Elaborate', color: '#fbbf24' }
    if (len >= SHORT_DESC_THRESHOLD && len < cap - 200) return { text: 'Good detail', color: '#10b981' }
    if (len >= cap - 200 && len <= cap) return { text: 'Near cap, good', color: '#fbbf24' }
    if (len > cap) return { text: 'Over cap', color: '#f87171' }
    return { text: 'Good detail', color: '#10b981' }
  }

  const isGenerateDisabled = (): boolean => {
    const sceneValid = sceneDescription.trim().length >= 10
    const capValid = !characterCap || generatedPrompt.length <= Number(characterCap)
    return !sceneValid || (showOutput && !capValid)
  }

  const handleResetToDefaults = async () => {
    setPlatform('Sora 2')
    setDuration(15)
    setRealism('Hyper-Realistic')
    setAiContentType(defaultAiContentType('Hyper-Realistic'))
    setFrameType('Cinematic')
    setOutputFormat('paragraph')
    setAudioOptions(defaultAudioOptions)
    setCharacterCap(2000)
    setBlocksCount(8)
    setTone('Neutral')
    setRemixSourceLink('')
    setRemixSourceDesc('')
    setRemixIdea('')
    setElaborateToCap(false)
    setElaborateFields({
      setting: '',
      timeOfDay: 'Day',
      lighting: 'Natural',
      mood: 'Neutral',
      camera: 'Medium',
      motionBeats: '',
      colorPalette: '',
      constraints: '',
    })
    try {
      await updateSettings({
        platform: 'Sora 2',
        durationSeconds: 15,
        realismPreset: 'Hyper-Realistic',
        aiContentType: defaultAiContentType('Hyper-Realistic'),
        frameType: 'Cinematic',
        outputFormat: 'paragraph',
        audioOptions: defaultAudioOptions,
        maxChars: 2000,
      })
    } catch (error) {
      console.error('Failed to reset settings:', error)
    }
  }

  const handleClearForm = () => {
    setTitle('')
    setSceneDescription('')
    setNumCharacters(0)
    setCharacters([])
    setAudioOptions({
      music: { enabled: audioOptions.music.enabled, text: '' },
      sfx: { enabled: audioOptions.sfx.enabled, text: '' },
      vo: { enabled: audioOptions.vo.enabled, text: '' },
    })
    setValidationError('')
  }

  const handleClearNegatives = () => {
    setBaseNegative('')
    setSelectedNegativeOptions([])
  }

  const handleResetElaborate = () => {
    setElaborateToCap(false)
    setElaborateFields({
      setting: '',
      timeOfDay: 'Day',
      lighting: 'Natural',
      mood: 'Neutral',
      camera: 'Medium',
      motionBeats: '',
      colorPalette: '',
      constraints: '',
    })
  }

  const isDefaultName = (name: string, index: number): boolean => {
    const trimmed = name.trim()
    if (!trimmed) return true
    const defaultLabel = `Character ${index + 1}`
    return trimmed.toLowerCase() === defaultLabel.toLowerCase()
  }

  const handleCreatedCharacterSelect = (character: CreatedCharacter, index: number) => {
    const updated = [...characters]
    const current = updated[index] || { existing: true, tag: '', name: '', look: '', outfit: '', notes: '' }

    updated[index] = {
      ...current,
      existing: true,
      tag: character.tag,
      name: isDefaultName(current.name, index) ? character.name : current.name,
      look: current.look?.trim() ? current.look : character.look || '',
      outfit: current.outfit?.trim() ? current.outfit : character.outfit || '',
      notes: current.notes?.trim() ? current.notes : character.notes || '',
    }

    setCharacters(updated)
  }

  const handleUseCreatedCharacterInBuilder = (character: CreatedCharacter) => {
    // Add a new character slot if needed
    if (numCharacters === 0) {
      setNumCharacters(1)
      // Wait for next tick to ensure character array is initialized
      setTimeout(() => {
        const updated = [...characters]
        updated[0] = {
          existing: true,
          tag: character.tag,
          name: character.name,
          look: character.look || '',
          outfit: character.outfit || '',
          notes: '',
        }
        setCharacters(updated)
      }, 0)
    } else {
      // Find first empty slot or add new
      const emptyIndex = characters.findIndex((c) => !c.name.trim() && !c.tag.trim())
      if (emptyIndex >= 0) {
        handleCreatedCharacterSelect(character, emptyIndex)
      } else if (numCharacters < 10) {
        setNumCharacters(numCharacters + 1)
        setTimeout(() => {
          handleCreatedCharacterSelect(character, numCharacters)
        }, 0)
      }
    }

    // Switch to manual tab to show the populated character
    setCharacterTab('manual')
  }

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
      setCharacterCap(foundCustom.maxChars)
    } else if (value === 'Sora 2') {
      setMaxChars(2000)
      setCharacterCap(2000)
    } else {
      setCharacterCap('')
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

    const handleOutputFormatChange = async (format: typeof outputFormat) => {
      setOutputFormat(format)
      // Set blocks to 8 for timeline formats
      if (format === 'timeline' || format === 'remix-timeline') {
        setBlocksCount(8)
      }
      try {
        await updateSettings({ outputFormat: format })
      } catch (error) {
        console.error('Failed to save output format:', error)
      }
    }

    const handleAudioOptionToggle = async (key: keyof typeof audioOptions, value: boolean) => {
      const updated = { ...audioOptions, [key]: { ...audioOptions[key], enabled: value } }
      setAudioOptions(updated)
      try {
        await updateSettings({ audioOptions: updated })
      } catch (error) {
        console.error('Failed to save audio options:', error)
      }
    }

    const handleAudioTextChange = async (key: keyof typeof audioOptions, text: string) => {
      const updated = { ...audioOptions, [key]: { ...audioOptions[key], text } }
      setAudioOptions(updated)
      try {
        await updateSettings({ audioOptions: updated })
      } catch (error) {
        console.error('Failed to save audio text:', error)
      }
    }

  const handleAiContentTypeChange = async (value: string) => {
    setAiContentType(value)
    try {
      await updateSettings({ aiContentType: value })
    } catch (error) {
      console.error('Failed to save AI content type:', error)
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

  const expandPromptWithElaboration = (basePrompt: string): string => {
    if (!elaborateToCap || !characterCap || sceneDescription.trim().length === 0) return basePrompt
    
    const cap = Number(characterCap)
    
    // Build clarity-first elaboration additions (no plot invention)
    const additions: string[] = []
    
    // Setting/Location (only if specified)
    if (elaborateFields.setting.trim()) {
      additions.push(`set in ${elaborateFields.setting.trim()}`)
    }
    
    // Time of day + Lighting (combined for brevity)
    const atmosphere: string[] = []
    if (elaborateFields.timeOfDay && elaborateFields.timeOfDay !== 'Day') {
      atmosphere.push(`${elaborateFields.timeOfDay.toLowerCase()}`)
    }
    if (elaborateFields.lighting && elaborateFields.lighting !== 'Natural') {
      atmosphere.push(`${elaborateFields.lighting.toLowerCase()} lighting`)
    }
    if (atmosphere.length > 0) {
      additions.push(atmosphere.join(' '))
    }
    
    // Mood (only if non-neutral)
    if (elaborateFields.mood && elaborateFields.mood !== 'Neutral') {
      additions.push(`${elaborateFields.mood.toLowerCase()} mood`)
    }
    
    // Camera (only if non-default)
    if (elaborateFields.camera && elaborateFields.camera !== 'Medium') {
      additions.push(`${elaborateFields.camera.toLowerCase()} shot`)
    }
    
    // Motion beats (verbatim if provided)
    if (elaborateFields.motionBeats.trim()) {
      additions.push(elaborateFields.motionBeats.trim())
    }
    
    // Color palette (verbatim if provided)
    if (elaborateFields.colorPalette.trim()) {
      additions.push(`palette: ${elaborateFields.colorPalette.trim()}`)
    }
    
    // Constraints (verbatim if provided)
    if (elaborateFields.constraints.trim()) {
      additions.push(elaborateFields.constraints.trim())
    }
    
    // Append elaborations to base prompt ONLY in positive section
    let elaborated = basePrompt
    if (additions.length > 0) {
      const elaborationText = additions.join(', ')
      // Find the actual negative section (with real newlines, not escaped)
      const negativeMarker = '\n\nNegative:'
      const negativeIndex = elaborated.indexOf(negativeMarker)
      
      if (negativeIndex > 0) {
        // Split into positive and negative parts
        const positivePrompt = elaborated.substring(0, negativeIndex)
        const negativePrompt = elaborated.substring(negativeIndex)
        
        // Add elaboration ONLY to positive prompt
        let enhancedPositive = positivePrompt
        if (positivePrompt.endsWith('.')) {
          enhancedPositive = positivePrompt.slice(0, -1) + `, ${elaborationText}.`
        } else if (positivePrompt.endsWith(',')) {
          enhancedPositive = positivePrompt + ` ${elaborationText}.`
        } else {
          enhancedPositive = positivePrompt + `, ${elaborationText}`
        }
        
        // Recombine with untouched negative prompt
        elaborated = enhancedPositive + negativePrompt
      } else {
        // No negatives, just append to end
        if (elaborated.endsWith('.')) {
          elaborated = elaborated.slice(0, -1) + `, ${elaborationText}.`
        } else if (elaborated.endsWith(',')) {
          elaborated = elaborated + ` ${elaborationText}.`
        } else {
          elaborated = elaborated + `, ${elaborationText}`
        }
      }
    }
    
    // Trim to cap at sentence boundary if needed
    if (elaborated.length > cap) {
      const negativeMarker = '\n\nNegative:'
      const negativeIndex = elaborated.indexOf(negativeMarker)
      
      if (negativeIndex > 0 && negativeIndex < cap) {
        // Negative section is within cap, trim only positive part
        const positivePrompt = elaborated.substring(0, negativeIndex)
        const negativePrompt = elaborated.substring(negativeIndex)
        
        let trimmedPositive = positivePrompt
        const lastPeriod = positivePrompt.lastIndexOf('.')
        if (lastPeriod > 0 && positivePrompt.length > cap - negativePrompt.length) {
          trimmedPositive = positivePrompt.substring(0, lastPeriod + 1)
        }
        
        elaborated = trimmedPositive + negativePrompt
      } else if (negativeIndex > cap) {
        // Entire thing is too long, trim at sentence boundary and preserve negatives
        const positivePrompt = elaborated.substring(0, negativeIndex)
        const negativePrompt = elaborated.substring(negativeIndex)
        
        const maxPositiveLength = cap - negativePrompt.length - 10
        let trimmedPositive = positivePrompt.substring(0, maxPositiveLength)
        const lastPeriod = trimmedPositive.lastIndexOf('.')
        if (lastPeriod > 0) {
          trimmedPositive = trimmedPositive.substring(0, lastPeriod + 1)
        }
        
        elaborated = trimmedPositive + negativePrompt
      }
    }
    
    return elaborated
  }

  const compilePrompt = (): string => {
    let basePrompt = ''
    if (outputFormat === 'timeline' || outputFormat === 'remix-timeline') {
      basePrompt = compileTimelineScript()
    } else if (outputFormat === 'remix-paragraph') {
      basePrompt = compileRemixParagraph()
    } else {
      basePrompt = compileCinematicParagraph()
    }
    
    return expandPromptWithElaboration(basePrompt)
  }

  const buildAudioTexts = () => {
    const musicText = (audioOptions.music.text || '').trim() || 'cinematic underscore matching the mood'
    const sfxText = (audioOptions.sfx.text || '').trim() || 'natural environmental ambience and realistic sound effects'
    const voRaw = (audioOptions.vo.text || '').trim() || 'natural voiceover or dialogue if applicable, no subtitles'
    const voText = /no subtitles/i.test(voRaw)
      ? voRaw
      : `${voRaw}${voRaw.endsWith('.') ? '' : '.'} no subtitles`
    return { musicText, sfxText, voText }
  }

  // Maps AI Content Type to a single non-redundant style prefix line.
  const buildAiContentPrefix = (type: string, _realismValue: string, _frameTypeValue: string): string => {
    if (type === 'ai_generic') return ''

    switch (type) {
      case 'stylized_3d_stopmotion':
        return 'Stylized 3D stop-motion look, soft practical lighting, miniature set detail.'
      case 'photoreal_cinematic_portrait':
        return 'Photorealistic cinematic portrait look, shallow depth of field, natural skin texture.'
      case 'photoreal_cinematic_horror':
        return 'Photorealistic cinematic horror still, tense atmosphere, dramatic shadows.'
      case 'photoreal_cinematic_still':
        return 'Photorealistic cinematic still, live-action movie frame composition.'
      default:
        return ''
    }
  }

  const compileCinematicParagraph = (): string => {
    const silent = /silent/i.test(sceneDescription)
    const { musicText, sfxText, voText } = buildAudioTexts()
    const aiPrefix = buildAiContentPrefix(aiContentType, realism, frameType)
    const hasRealismLeadIn = realism === 'Hyper-Realistic' && !aiPrefix

    // Scene summary
    let bodyText = ''
    if (sceneDescription.trim()) {
      bodyText = sceneDescription.trim()
    }

    // Subject (characters)
    const characterParts: string[] = []
    if (numCharacters > 0 && characters.length > 0) {
      const charDescriptions = characters
        .map((char) => {
          const details = [char.name, char.look, char.outfit, char.notes].filter((s) => s.trim()).join(', ')
          return details || null
        })
        .filter(Boolean)
      if (charDescriptions.length > 0) {
        characterParts.push(`featuring ${charDescriptions.join('; ')}`)
      }
    }

    // Metadata: style, camera, framing (skip if realism lead-in present to avoid duplication)
    const metadataParts: string[] = []
    if (!hasRealismLeadIn) {
      metadataParts.push(`${realism} style`)
      metadataParts.push(`${frameType} framing`)
    }
    
    // Duration
    metadataParts.push(`${duration} seconds`)

    // Audio (conditional)
    if (!silent) {
      const audioBits: string[] = []
      if (audioOptions.music.enabled) {
        audioBits.push(`Music: ${musicText}`)
      }
      if (audioOptions.sfx.enabled) {
        audioBits.push(`Audio: ${sfxText}`)
      }
      if (audioOptions.vo.enabled) {
        audioBits.push(`VO/Dialog: ${voText}`)
      }
      if (audioBits.length) {
        metadataParts.push(audioBits.join(' '))
      }
    }

    // Combine body + characters + metadata with proper punctuation
    let paragraph = ''
    
    if (bodyText) {
      // Clean body text ending
      let cleanBody = bodyText.trim()
      if (!cleanBody.endsWith('.') && !cleanBody.endsWith('!') && !cleanBody.endsWith('?')) {
        cleanBody += '.'
      }
      paragraph = cleanBody
    }
    
    // Add characters if present
    if (characterParts.length > 0) {
      paragraph += (paragraph ? ' ' : '') + characterParts.join(', ')
      if (!paragraph.endsWith('.')) {
        paragraph += '.'
      }
    }
    
    // Add metadata
    if (metadataParts.length > 0) {
      paragraph += (paragraph ? ' ' : '') + metadataParts.join(', ') + '.'
    }

    const lines: string[] = []
    if (aiPrefix) {
      lines.push(aiPrefix, '')
    }

    // Prepend realism lead-in as its own line (if Hyper-Realistic and no prefix already set)
    if (hasRealismLeadIn) {
      lines.push('Hyper-realistic, photorealistic 4K digital cinema footage, cinematic live-action look.', '')
    }

    if (paragraph) {
      lines.push(paragraph)
    }

    const finalPrompt = lines.join('\n')

    // Append negatives
    if (negativePrompt.trim()) {
      return `${finalPrompt}\n\nNegative: ${negativePrompt.trim()}`
    }

    return finalPrompt
  }

  const compileTimelineScript = (): string => {
    const blocks = generateTimeBlocks(duration, blocksCount)
    const script: string[] = []
    const silent = /silent/i.test(sceneDescription)
    const { musicText, sfxText, voText } = buildAudioTexts()
    const aiPrefix = buildAiContentPrefix(aiContentType, realism, frameType)
    const hasRealismLeadIn = realism === 'Hyper-Realistic' && !aiPrefix

    if (aiPrefix) {
      script.push(aiPrefix)
      script.push('')
    }

    // Scene Description at top (if provided)
    if (sceneDescription.trim()) {
      script.push(`Scene Description (source): ${sceneDescription.trim()}`)
      script.push('')
    }

    // Realism lead-in (if Hyper-Realistic and not already covered by prefix)
    if (hasRealismLeadIn) {
      script.push('Hyper-realistic, photorealistic 4K digital cinema footage, cinematic live-action look.')
      script.push('')
    }

    // Add remix header if in remix-timeline mode
    if (outputFormat === 'remix-timeline') {
      script.push('REMIX TIMELINE SCRIPT')
      if (remixSourceLink.trim()) {
        script.push(`Source: ${remixSourceLink.trim()}`)
      }
      if (remixSourceDesc.trim()) {
        script.push(`Original: ${remixSourceDesc.trim()}`)
      }
      if (remixIdea.trim()) {
        script.push(`Changes: ${remixIdea.trim()}`)
      }
      script.push('')
    }

    // Generate per-block beats from scene description
    const sceneBeats = generateSceneBeats(sceneDescription, blocksCount)
    
    // Camera progression options
    const cameraShots = ['Wide', 'Medium', 'Close-up', 'Extreme close-up', 'Over-the-shoulder', 'Low angle', 'High angle', 'Aerial']
    const transitions = ['smooth cut', 'match cut', 'whip pan', 'dissolve', 'cross dissolve', 'fade', 'wipe']

    blocks.forEach((block, idx) => {
      const blockLabels = ['Hook', 'Context', 'Peak', 'Climax', 'Resolution', 'Denouement', 'CTA', 'Closing']
      const label = blockLabels[idx] || `Block ${idx + 1}`
      
      // Vary camera shot across blocks
      const camShot = cameraShots[idx % cameraShots.length] || frameType
      
      script.push(`[${block.start}-${block.end}s] - ${label}`)
      script.push(`[ACTION]: ${sceneBeats[idx]}`)
      script.push(`[CAM]: ${camShot} shot, ${realism} look`)
      
      if (!silent) {
        if (audioOptions.vo.enabled) {
          script.push(`[VO]: ${voText}`)
        }
        if (audioOptions.music.enabled) {
          script.push(`[MUSIC]: ${musicText}`)
        }
        if (audioOptions.sfx.enabled) {
          script.push(`[SFX]: ${sfxText}`)
        }
      }
      
      script.push(`[EMOTION]: ${tone}`)
      
      // Vary transitions
      const transition = idx < blocks.length - 1 ? transitions[idx % transitions.length] : 'fade out'
      script.push(`[TRANSITION]: ${transition}`)
      script.push('')
    })

    // Append negatives (no Scene Description at bottom)
    if (negativePrompt.trim()) {
      script.push(`Negative: ${negativePrompt.trim()}`)
    }

    return script.join('\n')
  }

  const generateSceneBeats = (scene: string, count: number): string[] => {
    // Simple beat generation: split scene into logical segments
    const trimmed = scene.trim()
    if (!trimmed) {
      // Fallback generic beats if no scene description
      const genericBeats = [
        'Establishing shot, setting the scene',
        'Introducing key elements',
        'Building tension and movement',
        'Peak action moment',
        'Emotional high point',
        'Transition and resolution',
        'Final reveal or statement',
        'Closing and fade'
      ]
      return genericBeats.slice(0, count)
    }
    
    // Split by sentences or phrases
    const sentences = trimmed.split(/[.!?]+/).filter(s => s.trim().length > 0)
    
    if (sentences.length >= count) {
      // Distribute sentences evenly across blocks
      const beats: string[] = []
      const step = sentences.length / count
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(i * step)
        beats.push(sentences[idx].trim())
      }
      return beats
    } else {
      // Fewer sentences than blocks, repeat and vary
      const beats: string[] = []
      for (let i = 0; i < count; i++) {
        const idx = i % sentences.length
        const prefix = i < sentences.length ? '' : 'Continuing: '
        beats.push(prefix + sentences[idx].trim())
      }
      return beats
    }
  }

  const compileRemixParagraph = (): string => {
    const parts: string[] = []

    // Realism lead-in (if Hyper-Realistic)
    if (realism === 'Hyper-Realistic') {
      parts.push('Hyper-realistic, photorealistic 4K digital cinema footage, cinematic live-action look.')
      parts.push('')
    }

    // Remix header
    parts.push('REMIX PROMPT')
    if (remixSourceLink.trim()) {
      parts.push(`Source: ${remixSourceLink.trim()}`)
    }
    if (remixSourceDesc.trim()) {
      parts.push(`Original: ${remixSourceDesc.trim()}`)
    }
    if (remixIdea.trim()) {
      parts.push(`Changes: ${remixIdea.trim()}`)
    }

    parts.push('')

    // Build the actual prompt
    const promptParts: string[] = []
    
    if (sceneDescription.trim()) {
      promptParts.push(sceneDescription.trim())
    }

    // Characters
    if (numCharacters > 0 && characters.length > 0) {
      const charDescriptions = characters
        .map((char) => {
          const details = [char.name, char.look, char.outfit, char.notes].filter((s) => s.trim()).join(', ')
          return details || null
        })
        .filter(Boolean)
      if (charDescriptions.length > 0) {
        promptParts.push(`featuring ${charDescriptions.join('; ')}`)
      }
    }

    promptParts.push(`${realism} style, ${frameType} framing, ${duration} seconds`)

    const silent = /silent/i.test(sceneDescription)
    const { musicText, sfxText, voText } = buildAudioTexts()
    if (!silent) {
      const audioBits: string[] = []
      if (audioOptions.music.enabled) {
        audioBits.push(`Music: ${musicText}`)
      }
      if (audioOptions.sfx.enabled) {
        audioBits.push(`Audio: ${sfxText}`)
      }
      if (audioOptions.vo.enabled) {
        audioBits.push(`VO/Dialog: ${voText}`)
      }
      if (audioBits.length) {
        promptParts.push(audioBits.join(' '))
      }
    }

    parts.push(promptParts.join(', ') + '.')

    // Negatives
    if (negativePrompt.trim()) {
      parts.push('')
      parts.push(`Negative: ${negativePrompt.trim()}`)
    }

    return parts.join('\n')
  }

  const generateTimeBlocks = (durationSec: number, count: number): Array<{ start: number; end: number }> => {
    const blockSize = durationSec / count
    const blocks: Array<{ start: number; end: number }> = []
    
    for (let i = 0; i < count; i++) {
      const start = Math.round(i * blockSize * 10) / 10
      const end = Math.round((i + 1) * blockSize * 10) / 10
      blocks.push({ start, end })
    }
    
    return blocks
  }

  const handleGenerate = () => {
    // Validate scene description
    if (sceneDescription.trim().length < 10) {
      setValidationError('Scene Description must be at least 10 characters.')
      return
    }
    setValidationError('')

    // Validate character cap
    if (characterCap && generatedPrompt.length > Number(characterCap)) {
      return
    }

    // Validate remix mode required fields
    if (outputFormat === 'remix-paragraph' || outputFormat === 'remix-timeline') {
      if (!remixSourceDesc.trim() && !remixSourceLink.trim()) {
        alert('Please provide either a Source link or Source description for remix mode.')
        return
      }
      if (!remixIdea.trim()) {
        alert('Please provide a Remix idea describing the changes you want.')
        return
      }
    }

    const content = compilePrompt()
    setGeneratedPrompt(content)
    setShowOutput(true)
  }

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt)
      setCopiedPrompt(true)
      setTimeout(() => setCopiedPrompt(false), 1500)
    } catch (error) {
      console.error('Failed to copy prompt:', error)
    }
  }

  const handleCopyNegative = async () => {
    try {
      await navigator.clipboard.writeText(negativePrompt)
      setCopiedNegative(true)
      setTimeout(() => setCopiedNegative(false), 1500)
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
        outputFormat,
        blocksCount,
        includeVO: audioOptions.vo.enabled,
        includeMusic: audioOptions.music.enabled,
        includeSfx: audioOptions.sfx.enabled,
        tone,
        remixSourceLink: remixSourceLink || undefined,
        remixSourceDesc: remixSourceDesc || undefined,
        remixIdea: remixIdea || undefined,
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
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>AI Content Type:</span>
              <select
                value={aiContentType}
                onChange={(e) => handleAiContentTypeChange(e.target.value)}
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0.5rem',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                }}
              >
                <option value="ai_generic">AI-generated (generic)</option>
                <option value="stylized_3d_stopmotion">Stylized 3D, stop-motion / claymation</option>
                <option value="photoreal_cinematic_portrait">Photorealistic cinematic portrait</option>
                <option value="photoreal_cinematic_horror">Photorealistic cinematic horror still</option>
                <option value="photoreal_cinematic_still">Photorealistic cinematic still (movie frame)</option>
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

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Output Format:</span>
              <select
                value={outputFormat}
                  onChange={(e) => handleOutputFormatChange(e.target.value as typeof outputFormat)}
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0.5rem',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                }}
              >
                <option value="paragraph">Cinematic Paragraph</option>
                <option value="timeline">Timeline Script</option>
                <option value="remix-paragraph">Remix (Paragraph)</option>
                <option value="remix-timeline">Remix (Timeline)</option>
              </select>
            </label>
          </div>

          {/* Audio Options */}
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', opacity: 0.9 }}>Audio Options</h3>
              <span style={{ fontSize: '0.8rem', opacity: 0.65 }}>Defaults on. Write 'silent' in the scene description to suppress all audio cues.</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
              {([
                { key: 'music', label: 'Music (adds [MUSIC])', placeholder: 'e.g., tense cinematic underscore, synthwave, orchestral trailer' },
                { key: 'sfx', label: 'Ambient / SFX (adds [SFX])', placeholder: 'e.g., ocean swell, footsteps, distant traffic, room tone' },
                { key: 'vo', label: 'Voiceover / Dialogue (adds [VO])', placeholder: 'e.g., calm narrator, whispered line, short dialogue' },
              ] as const).map((row) => {
                const opt = audioOptions[row.key]
                return (
                  <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={opt.enabled}
                      onChange={(e) => handleAudioOptionToggle(row.key, e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
                      <span style={{ fontSize: '0.9rem' }}>{row.label}</span>
                      <input
                        type="text"
                        value={opt.text}
                        placeholder={row.placeholder}
                        onChange={(e) => handleAudioTextChange(row.key, e.target.value)}
                        disabled={!opt.enabled}
                        style={{
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          padding: '0.5rem',
                          color: 'var(--text)',
                          fontSize: '0.9rem',
                          opacity: opt.enabled ? 1 : 0.5,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Timeline Template Settings (only for timeline modes) */}
          {(outputFormat === 'timeline' || outputFormat === 'remix-timeline') && (
            <div style={{ 
              background: 'var(--panel)', 
              border: '1px solid var(--border)', 
              borderRadius: '8px', 
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', opacity: 0.9 }}>Timeline Template</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Blocks:</span>
                  <select
                    value={blocksCount}
                    onChange={(e) => setBlocksCount(Number(e.target.value))}
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '0.5rem',
                      color: 'var(--text)',
                      fontSize: '0.9rem',
                    }}
                  >
                    <option value={4}>4</option>
                    <option value={5}>5</option>
                    <option value={6}>6</option>
                    <option value={7}>7</option>
                    <option value={8}>8</option>
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Tone:</span>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '0.5rem',
                      color: 'var(--text)',
                      fontSize: '0.9rem',
                    }}
                  >
                    <option>Neutral</option>
                    <option>Intense</option>
                    <option>Emotional</option>
                    <option>Comedy</option>
                    <option>Horror</option>
                  </select>
                </label>
              </div>

            </div>
          )}

          {/* Remix Card (only for remix modes) */}
          {(outputFormat === 'remix-paragraph' || outputFormat === 'remix-timeline') && (
            <div style={{ 
              background: 'var(--panel)', 
              border: '1px solid var(--border)', 
              borderRadius: '8px', 
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', opacity: 0.9 }}>Remix</h3>
              
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Sora link (reference only):</span>
                <input
                  type="text"
                  value={remixSourceLink}
                  onChange={(e) => setRemixSourceLink(e.target.value)}
                  placeholder="https://..."
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '0.5rem',
                    color: 'var(--text)',
                    fontSize: '0.85rem',
                  }}
                />
                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>App will not fetch the video, link is stored only for your notes.</span>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Source description: *</span>
                <textarea
                  value={remixSourceDesc}
                  onChange={(e) => setRemixSourceDesc(e.target.value)}
                  placeholder="Describe the original video: subject, setting, vibe..."
                  rows={3}
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '0.5rem',
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                    fontSize: '0.85rem',
                  }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Remix idea: *</span>
                <textarea
                  value={remixIdea}
                  onChange={(e) => setRemixIdea(e.target.value)}
                  placeholder="What changes do you want? (e.g., different setting, change outfit, modify action...)"
                  rows={3}
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '0.5rem',
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                    fontSize: '0.85rem',
                  }}
                />
              </label>
            </div>
          )}

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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <legend style={{ fontSize: '0.85rem', opacity: 0.8, padding: '0 0.5rem', margin: 0 }}>
                  Character Details
                </legend>
                <div style={{ display: 'flex', gap: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px', padding: '2px' }}>
                  <button
                    onClick={() => setCharacterTab('manual')}
                    style={{
                      padding: '0.4rem 0.75rem',
                      background: characterTab === 'manual' ? 'var(--accent)' : 'transparent',
                      color: characterTab === 'manual' ? 'white' : 'var(--text)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: characterTab === 'manual' ? 500 : 400,
                    }}
                  >
                    Manual Entry
                  </button>
                  <button
                    onClick={() => setCharacterTab('library')}
                    style={{
                      padding: '0.4rem 0.75rem',
                      background: characterTab === 'library' ? 'var(--accent)' : 'transparent',
                      color: characterTab === 'library' ? 'white' : 'var(--text)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: characterTab === 'library' ? 500 : 400,
                    }}
                  >
                    Created Characters
                  </button>
                </div>
              </div>

              {characterTab === 'manual' ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.8rem' }}>
                          Existing?
                        </th>
                        <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.8rem' }}>
                          Tag
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
                            {char.existing ? (
                              <CharacterTypeahead
                                value={char.tag}
                                onChange={(value) => {
                                  const updated = [...characters]
                                  updated[idx].tag = value
                                  setCharacters(updated)
                                }}
                                onSelect={(character) => handleCreatedCharacterSelect(character, idx)}
                                placeholder="@tag"
                              />
                            ) : (
                              <input
                                type="text"
                                value={char.tag}
                                onChange={(e) => {
                                  const updated = [...characters]
                                  updated[idx].tag = e.target.value
                                  setCharacters(updated)
                                }}
                                placeholder="@tag (optional)"
                                disabled
                                style={{
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: '4px',
                                  padding: '0.3rem',
                                  color: 'var(--text)',
                                  fontSize: '0.85rem',
                                  width: '100%',
                                  opacity: 0.5,
                                }}
                              />
                            )}
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
                            {char.existing && char.look && char.outfit && (
                              <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.2rem' }}>
                                Defaults: {char.look} | {char.outfit}
                              </div>
                            )}
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
              ) : (
                <CreatedCharactersPanel onUseInBuilder={handleUseCreatedCharacterInBuilder} />
              )}
            </fieldset>
          )}

          {/* Scene Description */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Scene Description:</span>
              <span style={{ fontSize: '0.75rem', color: getSceneDescQualityHint().color, fontWeight: 500 }}>
                {getSceneDescQualityHint().text}
              </span>
            </div>
            <textarea
              value={sceneDescription}
              onChange={(e) => {
                setSceneDescription(e.target.value)
                if (e.target.value.trim().length >= 10) {
                  setValidationError('')
                }
              }}
              placeholder="Describe the setting, action, camera movement..."
              rows={4}
              style={{
                background: 'var(--panel)',
                border: validationError ? '2px solid #f87171' : '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.5rem',
                color: 'var(--text)',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                resize: 'vertical',
              }}
            />
            {validationError && (
              <span style={{ fontSize: '0.8rem', color: '#f87171' }}>{validationError}</span>
            )}
            {/* Nudge for short descriptions */}
            {sceneDescription.trim().length > 0 &&
              sceneDescription.trim().length < SHORT_DESC_THRESHOLD &&
              !elaborateToCap && (
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                  Want a richer prompt?{' '}
                  <button
                    type="button"
                    onClick={() => setElaborateToCap(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#60a5fa',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      padding: 0,
                    }}
                  >
                    Enable Elaborate to Cap
                  </button>
                </div>
              )}
          </label>

          {/* Character Cap */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Character Cap:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="number"
                value={characterCap}
                onChange={(e) => setCharacterCap(e.target.value ? Number(e.target.value) : '')}
                placeholder="e.g., 2000"
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0.5rem',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                  maxWidth: '150px',
                }}
              />
              {characterCap && (
                <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                  ({formatNumber(Number(characterCap))} chars)
                </span>
              )}
              {!characterCap && (
                <span style={{ fontSize: '0.85rem', color: '#f87171' }}>add cap</span>
              )}
            </div>
          </label>

          {/* Elaborate to Cap */}
          {platform === 'Sora 2' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={elaborateToCap}
                  onChange={(e) => setElaborateToCap(e.target.checked)}
                />
                <span>Elaborate to cap</span>
              </label>
              <span style={{ fontSize: '0.75rem', opacity: 0.6, marginLeft: '1.75rem' }}>
                Adds cinematography + sensory detail to approach the cap. Does not change your story.
              </span>

              {elaborateToCap && sceneDescription.trim().length === 0 && (
                <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginLeft: '1.75rem' }}>
                  Add a scene description first
                </div>
              )}

              {elaborateToCap && sceneDescription.trim().length > 0 && (
                <fieldset
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    background: 'var(--panel)',
                    marginTop: '0.5rem',
                  }}
                >
                  <legend style={{ fontSize: '0.85rem', opacity: 0.8, padding: '0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>Elaboration Options</span>
                    <button
                      type="button"
                      onClick={handleResetElaborate}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#60a5fa',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        padding: 0,
                      }}
                    >
                      Reset Elaborate
                    </button>
                  </legend>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Setting/Location:</span>
                      <input
                        type="text"
                        value={elaborateFields.setting}
                        onChange={(e) => setElaborateFields({ ...elaborateFields, setting: e.target.value })}
                        placeholder="e.g., Abandoned warehouse with rusted beams"
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Time of Day:</span>
                        <select
                          value={elaborateFields.timeOfDay}
                          onChange={(e) => setElaborateFields({ ...elaborateFields, timeOfDay: e.target.value })}
                          style={{
                            background: 'var(--panel)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            padding: '0.5rem',
                            color: 'var(--text)',
                            fontSize: '0.9rem',
                          }}
                        >
                          <option value="Day">Day</option>
                          <option value="Morning">Morning</option>
                          <option value="Afternoon">Afternoon</option>
                          <option value="Golden Hour">Golden Hour</option>
                          <option value="Evening">Evening</option>
                          <option value="Night">Night</option>
                          <option value="Midnight">Midnight</option>
                        </select>
                      </label>

                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Lighting:</span>
                        <select
                          value={elaborateFields.lighting}
                          onChange={(e) => setElaborateFields({ ...elaborateFields, lighting: e.target.value })}
                          style={{
                            background: 'var(--panel)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            padding: '0.5rem',
                            color: 'var(--text)',
                            fontSize: '0.9rem',
                          }}
                        >
                          <option value="Natural">Natural</option>
                          <option value="Cinematic">Cinematic</option>
                          <option value="Dramatic">Dramatic</option>
                          <option value="Soft">Soft</option>
                          <option value="Hard">Hard</option>
                          <option value="Neon">Neon</option>
                          <option value="Volumetric">Volumetric</option>
                        </select>
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Mood:</span>
                        <select
                          value={elaborateFields.mood}
                          onChange={(e) => setElaborateFields({ ...elaborateFields, mood: e.target.value })}
                          style={{
                            background: 'var(--panel)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            padding: '0.5rem',
                            color: 'var(--text)',
                            fontSize: '0.9rem',
                          }}
                        >
                          <option value="Neutral">Neutral</option>
                          <option value="Tense">Tense</option>
                          <option value="Melancholic">Melancholic</option>
                          <option value="Joyful">Joyful</option>
                          <option value="Mysterious">Mysterious</option>
                          <option value="Eerie">Eerie</option>
                          <option value="Romantic">Romantic</option>
                        </select>
                      </label>

                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Camera:</span>
                        <select
                          value={elaborateFields.camera}
                          onChange={(e) => setElaborateFields({ ...elaborateFields, camera: e.target.value })}
                          style={{
                            background: 'var(--panel)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            padding: '0.5rem',
                            color: 'var(--text)',
                            fontSize: '0.9rem',
                          }}
                        >
                          <option value="Medium">Medium</option>
                          <option value="Wide">Wide</option>
                          <option value="Close-up">Close-up</option>
                          <option value="Extreme Close-up">Extreme Close-up</option>
                          <option value="Aerial">Aerial</option>
                          <option value="Low Angle">Low Angle</option>
                          <option value="High Angle">High Angle</option>
                        </select>
                      </label>
                    </div>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Motion Beats:</span>
                      <input
                        type="text"
                        value={elaborateFields.motionBeats}
                        onChange={(e) => setElaborateFields({ ...elaborateFields, motionBeats: e.target.value })}
                        placeholder="e.g., Slow pan left, quick zoom, tracking shot"
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
                      <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Color Palette:</span>
                      <input
                        type="text"
                        value={elaborateFields.colorPalette}
                        onChange={(e) => setElaborateFields({ ...elaborateFields, colorPalette: e.target.value })}
                        placeholder="e.g., Desaturated blues and grays, warm orange accents"
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
                      <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Constraints:</span>
                      <input
                        type="text"
                        value={elaborateFields.constraints}
                        onChange={(e) => setElaborateFields({ ...elaborateFields, constraints: e.target.value })}
                        placeholder="e.g., No text overlay, maintain 16:9 ratio"
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
                  </div>
                </fieldset>
              )}
            </div>
          )}

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
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={handleGenerate}
              disabled={isGenerateDisabled()}
              style={{
                padding: '0.6rem 1.2rem',
                background: isGenerateDisabled() ? 'var(--border)' : 'var(--accent)',
                color: isGenerateDisabled() ? 'var(--text)' : 'var(--bg)',
                border: 'none',
                borderRadius: '8px',
                cursor: isGenerateDisabled() ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: '0.95rem',
                opacity: isGenerateDisabled() ? 0.5 : 1,
              }}
            >
              Generate
            </button>
            <button
              onClick={handleResetToDefaults}
              style={{
                padding: '0.6rem 1rem',
                background: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Reset to Defaults
            </button>
            <button
              onClick={handleClearForm}
              style={{
                padding: '0.6rem 1rem',
                background: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Clear Form
            </button>
            <button
              onClick={handleClearNegatives}
              style={{
                padding: '0.6rem 1rem',
                background: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Clear Negatives
            </button>
            <button
              onClick={() => setShowChecklist(true)}
              style={{
                padding: '0.6rem 1rem',
                background: 'var(--accent)',
                color: 'white',
                border: '1px solid var(--accent)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Release Checklist
            </button>
          </div>
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
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Output</h2>
                <span style={{ fontSize: '0.9rem', opacity: 0.7 }}>
                  Format: {outputFormat === 'paragraph' && 'Cinematic Paragraph'}
                  {outputFormat === 'timeline' && 'Timeline Script'}
                  {outputFormat === 'remix-paragraph' && 'Remix (Paragraph)'}
                  {outputFormat === 'remix-timeline' && 'Remix (Timeline)'}
                </span>
              </div>
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
                <div style={{ color: getCharCountColor(), fontWeight: 700 }}>
                  {generatedPrompt.length}
                  {characterCap && ` / ${formatNumber(Number(characterCap))}`}
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

      {showChecklist && <ReleaseChecklistModal isOpen={showChecklist} onClose={() => setShowChecklist(false)} />}
    </div>
  )
}

export default BuilderPage
