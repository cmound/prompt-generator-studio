export interface Prompt {
  id: string
  title: string
  platform: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface PromptVersion {
  id: string
  promptId: string
  versionNumber: number
  content: string
  charCount: number
  riskScore: number
  riskReasons: string[]
  platform?: string
  realism?: string
  frameType?: string
  durationSeconds?: number
  negativePrompt?: string
  createdAt: number
  // New fields for Timeline Script and Remix modes
  outputFormat?: 'paragraph' | 'timeline' | 'remix-paragraph' | 'remix-timeline'
  blocksCount?: number
  includeVO?: boolean
  includeMusic?: boolean
  includeSfx?: boolean
  tone?: string
  remixSourceLink?: string
  remixSourceDesc?: string
  remixIdea?: string
}

export interface Settings {
  id: string // Always "app"
  durationSeconds: number
  realismPreset: string
  frameType: string
  aiContentType?: string
  platform: string
  maxChars: number
  negativePromptDefault: string
  outputFormat?: 'paragraph' | 'timeline' | 'remix-paragraph' | 'remix-timeline'
  audioOptions?: {
    music: { enabled: boolean; text: string }
    sfx: { enabled: boolean; text: string }
    vo: { enabled: boolean; text: string }
  }
  includeAudio?: boolean // legacy compatibility
  platformsCustom?: Array<{ name: string; maxChars: number; notes?: string }>
  negativeOptionsSelected?: string[]
  openAiApiKey?: string // stored in localStorage, not IndexedDB
  elaborateToCap?: boolean
  elaborateFields?: {
    setting: string
    timeOfDay: string
    lighting: string
    mood: string
    camera: string
    motionBeats: string
    colorPalette: string
    constraints: string
  }
}

export interface ImageAsset {
  id: string
  createdAt: number
  mimeType: string
  name?: string
  sizeBytes: number
  blob: Blob
}

export interface ImageEdit {
  id: string
  imageId: string
  title: string
  instruction: string
  variations: number
  prompts: string[]
  selectedVariantIndex: number
  isFavorite: boolean
  generatedPromptDescription?: string
  createdAt: number
  updatedAt: number
}

export interface ImageDescriptionFields {
  subjectType: string
  ageRange: string
  gender: string
  ethnicity: string
  hair: string
  faceDetails: string
  outfitTop: string
  outfitBottom: string
  shoes: string
  accessories: string
  pose: string
  expression: string
  setting: string
  lighting: string
  cameraFraming: string
  lensLook: string
  qualityTags: string
}

export interface ImageDescription {
  id: string
  imageId: string
  title: string
  focus: string
  notes: string
  fields: ImageDescriptionFields
  descriptionText: string
  negativeText: string
  isFavorite: boolean
  createdAt: number
  updatedAt: number
}
