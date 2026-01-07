import { db } from './db'
import type { ImageAsset, ImageEdit, ImageDescription, ImageDescriptionFields } from './types'

export async function saveImageAsset(file: File): Promise<string> {
  const id = crypto.randomUUID()

  const asset: ImageAsset = {
    id,
    createdAt: Date.now(),
    mimeType: file.type,
    name: file.name,
    sizeBytes: file.size,
    blob: file,
  }

  await db.imageAssets.put(asset)
  return id
}

export async function listImageAssets(limit?: number): Promise<ImageAsset[]> {
  let query = db.imageAssets.orderBy('createdAt').reverse()
  if (limit) {
    return query.limit(limit).toArray()
  }
  return query.toArray()
}

export async function saveImageEdit(
  imageId: string,
  instruction: string,
  variations: number,
  selectedVariantIndex: number,
  prompts?: string[]
): Promise<string> {
  const id = crypto.randomUUID()
  const generatedPrompts = prompts || generatePromptVariations(instruction, variations)
  const now = Date.now()

  const edit: ImageEdit = {
    id,
    imageId,
    instruction,
    variations,
    prompts: generatedPrompts,
    selectedVariantIndex,
    title: 'Untitled Edit',
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  }

  await db.imageEdits.put(edit)
  return id
}

export interface ListImageEditsParams {
  imageId?: string
  search?: string
  favoritesOnly?: boolean
  sort?: 'updatedDesc' | 'createdDesc' | 'titleAsc'
}

export async function listImageEdits(params?: ListImageEditsParams): Promise<ImageEdit[]> {
  let collection = params?.imageId
    ? db.imageEdits.where('imageId').equals(params.imageId)
    : db.imageEdits.toCollection()

  // Apply favorites filter
  if (params?.favoritesOnly) {
    collection = collection.filter((edit) => edit.isFavorite === true)
  }

  // Apply search filter
  if (params?.search && params.search.trim()) {
    const searchLower = params.search.toLowerCase()
    collection = collection.filter((edit) => {
      return (
        edit.title.toLowerCase().includes(searchLower) ||
        edit.instruction.toLowerCase().includes(searchLower) ||
        edit.prompts.some((p) => p.toLowerCase().includes(searchLower))
      )
    })
  }

  let edits = await collection.toArray()

  // Apply sort
  const sort = params?.sort ?? 'updatedDesc'
  if (sort === 'updatedDesc') {
    edits.sort((a, b) => b.updatedAt - a.updatedAt)
  } else if (sort === 'createdDesc') {
    edits.sort((a, b) => b.createdAt - a.createdAt)
  } else if (sort === 'titleAsc') {
    edits.sort((a, b) => a.title.localeCompare(b.title))
  }

  return edits
}

export async function updateImageEdit(
  id: string,
  patch: { title?: string; isFavorite?: boolean; generatedPromptDescription?: string }
): Promise<void> {
  await db.imageEdits.update(id, {
    ...patch,
    updatedAt: Date.now(),
  })
}

export async function getImageAsset(id: string): Promise<ImageAsset | undefined> {
  return db.imageAssets.get(id)
}

export async function deleteImageEdit(id: string): Promise<void> {
  await db.imageEdits.delete(id)
}

export async function deleteImageAsset(id: string): Promise<void> {
  // Cascade delete: remove all edits for this image
  const edits = await db.imageEdits.where('imageId').equals(id).toArray()
  await Promise.all(edits.map((edit) => db.imageEdits.delete(edit.id)))
  // Delete the asset itself
  await db.imageAssets.delete(id)
}

// Deterministic prompt variation generator
function generatePromptVariations(instruction: string, count: number): string[] {
  const baseTemplate = `Use the provided image as reference. Apply this change: ${instruction}. Keep identity consistent. Preserve pose, lighting, and background unless specified. High realism. No UI text.`

  const variationTokens = [
    ['cinematic framing', 'professional composition', 'editorial style'],
    ['soft natural light', 'studio lighting', 'golden hour glow'],
    ['fine texture detail', 'crisp fabric rendering', 'subtle material nuance'],
    ['shallow depth of field', 'sharp focus throughout', 'balanced depth'],
    ['vibrant color grade', 'muted tones', 'natural color balance'],
  ]

  const variations: string[] = []
  for (let i = 0; i < Math.min(count, 5); i++) {
    const tokens = variationTokens.map((group) => group[i % group.length])
    const variant = `${baseTemplate} Style: ${tokens.join(', ')}.`
    variations.push(variant)
  }

  return variations
}

// Image Description CRUD operations

export async function createImageDescription(
  imageId: string,
  title: string,
  focus: string,
  notes: string,
  fields: ImageDescriptionFields,
  descriptionText: string,
  negativeText: string
): Promise<string> {
  const id = crypto.randomUUID()
  const now = Date.now()

  const description: ImageDescription = {
    id,
    imageId,
    title,
    focus,
    notes,
    fields,
    descriptionText,
    negativeText,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  }

  await db.imageDescriptions.put(description)
  return id
}

export interface ListImageDescriptionsParams {
  imageId?: string
  search?: string
  favoritesOnly?: boolean
  sort?: 'updatedDesc' | 'createdDesc' | 'titleAsc'
}

export async function listImageDescriptions(
  params?: ListImageDescriptionsParams
): Promise<ImageDescription[]> {
  let collection = params?.imageId
    ? db.imageDescriptions.where('imageId').equals(params.imageId)
    : db.imageDescriptions.toCollection()

  // Apply favorites filter
  if (params?.favoritesOnly) {
    collection = collection.filter((desc) => desc.isFavorite === true)
  }

  // Apply search filter
  if (params?.search && params.search.trim()) {
    const searchLower = params.search.toLowerCase()
    collection = collection.filter((desc) => {
      return (
        desc.title.toLowerCase().includes(searchLower) ||
        desc.notes.toLowerCase().includes(searchLower) ||
        desc.descriptionText.toLowerCase().includes(searchLower)
      )
    })
  }

  let descriptions = await collection.toArray()

  // Apply sort
  const sort = params?.sort ?? 'updatedDesc'
  if (sort === 'updatedDesc') {
    descriptions.sort((a, b) => b.updatedAt - a.updatedAt)
  } else if (sort === 'createdDesc') {
    descriptions.sort((a, b) => b.createdAt - a.createdAt)
  } else if (sort === 'titleAsc') {
    descriptions.sort((a, b) => a.title.localeCompare(b.title))
  }

  return descriptions
}

export async function updateImageDescription(
  id: string,
  patch: {
    title?: string
    isFavorite?: boolean
    focus?: string
    notes?: string
    fields?: ImageDescriptionFields
    descriptionText?: string
    negativeText?: string
  }
): Promise<void> {
  await db.imageDescriptions.update(id, {
    ...patch,
    updatedAt: Date.now(),
  })
}

export async function deleteImageDescription(id: string): Promise<void> {
  await db.imageDescriptions.delete(id)
}

export async function getImageDescription(id: string): Promise<ImageDescription | undefined> {
  return db.imageDescriptions.get(id)
}
