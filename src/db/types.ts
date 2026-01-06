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
}

export interface Settings {
  id: string // Always "app"
  durationSeconds: number
  realismPreset: string
  frameType: string
  platform: string
  maxChars: number
  negativePromptDefault: string
  platformsCustom?: Array<{ name: string; maxChars: number; notes?: string }>
  negativeOptionsSelected?: string[]
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
  createdAt: number
  updatedAt: number
}
