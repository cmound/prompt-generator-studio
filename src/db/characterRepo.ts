import type { CreatedCharacter } from './types'

const STORAGE_KEY = 'pgs.createdCharacters.v1'

type StoredCharacter = CreatedCharacter

const dispatchUpdated = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pgs:characters-updated'))
  }
}

const read = (): StoredCharacter[] => {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((c) => c && typeof c.tag === 'string' && typeof c.name === 'string')
  } catch (err) {
    console.error('Failed to read characters from storage', err)
    return []
  }
}

const write = (chars: StoredCharacter[]) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chars))
}

const normalizeTag = (tag: string): string => {
  const trimmed = tag.trim().replace(/^@+/, '')
  return trimmed ? `@${trimmed}` : ''
}

const sortCharacters = (chars: StoredCharacter[]): StoredCharacter[] => {
  return [...chars].sort((a, b) => a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()))
}

export async function list(): Promise<StoredCharacter[]> {
  return sortCharacters(read())
}

export async function getCharacterByTag(tag: string): Promise<StoredCharacter | null> {
  const normalized = normalizeTag(tag).toLowerCase()
  if (!normalized) return null
  const all = read()
  return all.find((c) => c.tag.toLowerCase() === normalized) || null
}

export async function searchCharacters(query: string): Promise<StoredCharacter[]> {
  const normalizedRaw = query.trim().toLowerCase()
  if (!normalizedRaw) return []

  const normalizedWithoutAt = normalizedRaw.startsWith('@') ? normalizedRaw.slice(1) : normalizedRaw
  const all = read()

  const ranked = all
    .map((character) => {
      const tag = character.tag.toLowerCase()
      const name = character.name.toLowerCase()

      const matchesTagPrefix = tag.startsWith(normalizedRaw) || tag.startsWith(`@${normalizedWithoutAt}`)
      const matchesTagContains = tag.includes(normalizedRaw) || tag.includes(normalizedWithoutAt)
      const matchesName = normalizedWithoutAt ? name.includes(normalizedWithoutAt) : false

      if (!matchesTagPrefix && !matchesTagContains && !matchesName) return null

      let score = 3
      if (matchesTagPrefix) score = 0
      else if (matchesName) score = 1
      else score = 2

      return { character, score }
    })
    .filter((entry): entry is { character: StoredCharacter; score: number } => Boolean(entry))
    .sort((a, b) => a.score - b.score || a.character.tag.localeCompare(b.character.tag))
    .slice(0, 12)

  return ranked.map((entry) => entry.character)
}

// Backward compatibility
export const searchCharactersByTag = searchCharacters

export async function upsert(
  character: Omit<StoredCharacter, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<string> {
  const now = Date.now()
  const tagNormalized = normalizeTag(character.tag)
  if (!tagNormalized) throw new Error('Tag is required')
  if (tagNormalized.includes(' ')) throw new Error('Tag cannot contain spaces')
  if (!character.name?.trim()) throw new Error('Name is required')
  if (character.appearsGuide && character.appearsGuide.length > 800) throw new Error('Appears guide cannot exceed 800 characters')
  if (character.cannotUseGuide && character.cannotUseGuide.length > 800) throw new Error('Cannot use guide cannot exceed 800 characters')

  const all = read()
  const lowerTag = tagNormalized.toLowerCase()
  const existingIndex = all.findIndex((c) => c.tag.toLowerCase() === lowerTag)

  if (existingIndex >= 0 && character.id && all[existingIndex].id !== character.id) {
    throw new Error('A character with this tag already exists')
  }
  if (existingIndex >= 0 && !character.id) {
    throw new Error('A character with this tag already exists')
  }

  if (existingIndex >= 0) {
    const existing = all[existingIndex]
    const updated: StoredCharacter = {
      ...existing,
      ...character,
      tag: tagNormalized,
      updatedAt: now,
    }
    all[existingIndex] = updated
    write(all)
    dispatchUpdated()
    return updated.id
  }

  const newId = crypto.randomUUID()
  const newChar: StoredCharacter = {
    ...character,
    id: newId,
    tag: tagNormalized,
    createdAt: now,
    updatedAt: now,
  } as StoredCharacter

  all.push(newChar)
  write(all)
  dispatchUpdated()
  return newId
}

export async function remove(tag: string): Promise<void> {
  const normalized = normalizeTag(tag).toLowerCase()
  if (!normalized) return
  const filtered = read().filter((c) => c.tag.toLowerCase() !== normalized)
  write(filtered)
  dispatchUpdated()
}

export async function clear(): Promise<void> {
  write([])
  dispatchUpdated()
}

export async function exportJson(): Promise<string> {
  return JSON.stringify(sortCharacters(read()), null, 2)
}

export async function importJson(json: string): Promise<void> {
  let parsed: any
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new Error('Invalid JSON file')
  }

  if (!Array.isArray(parsed)) throw new Error('Invalid format: expected an array')

  const incoming: StoredCharacter[] = []
  for (const item of parsed) {
    if (!item || typeof item.tag !== 'string' || typeof item.name !== 'string') continue
    const tag = normalizeTag(item.tag)
    if (!tag) continue
    incoming.push({
      ...item,
      tag,
      id: item.id || crypto.randomUUID(),
      createdAt: item.createdAt || Date.now(),
      updatedAt: Date.now(),
    })
  }

  const existing = read()
  const merged = [...existing]
  incoming.forEach((char) => {
    const idx = merged.findIndex((c) => c.tag.toLowerCase() === char.tag.toLowerCase())
    if (idx >= 0) merged[idx] = char
    else merged.push(char)
  })

  write(sortCharacters(merged))
  dispatchUpdated()
}
