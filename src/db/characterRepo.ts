import { db } from './db'
import type { CreatedCharacter } from './types'

export async function listCharacters(opts?: {
  query?: string
  sortBy?: 'updatedAt' | 'tag'
}): Promise<CreatedCharacter[]> {
  let collection = db.createdCharacters.orderBy('updatedAt').reverse()

  let results = await collection.toArray()

  // Filter by query (search tag or name)
  if (opts?.query) {
    const lowerQuery = opts.query.toLowerCase()
    results = results.filter(
      (c) =>
        c.tag.toLowerCase().includes(lowerQuery) ||
        c.name.toLowerCase().includes(lowerQuery)
    )
  }

  // Sort
  if (opts?.sortBy === 'tag') {
    results.sort((a, b) => a.tag.localeCompare(b.tag))
  }

  return results
}

export async function getCharacterById(id: string): Promise<CreatedCharacter | undefined> {
  return db.createdCharacters.get(id)
}

export async function getCharacterByTag(tag: string): Promise<CreatedCharacter | null> {
  const normalizedTag = tag.toLowerCase()
  const all = await db.createdCharacters.toArray()
  return all.find((c) => c.tag.toLowerCase() === normalizedTag) || null
}

export async function searchCharacters(query: string): Promise<CreatedCharacter[]> {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []

  const isTagQuery = normalized.startsWith('@')
  const normalizedNameQuery = isTagQuery ? normalized.slice(1) : normalized
  const all = await db.createdCharacters.toArray()

  const ranked = all
    .map((character) => {
      const tag = character.tag.toLowerCase()
      const name = character.name.toLowerCase()

      const matchesTagPrefix = tag.startsWith(normalized)
      const matchesTagContains = tag.includes(normalized)
      const matchesName = normalizedNameQuery ? name.includes(normalizedNameQuery) : false

      if (!matchesTagPrefix && !matchesTagContains && !matchesName) return null

      // Prefer tag prefix, then name contains, then tag contains (or reversed if tag query)
      let score = 3
      if (matchesTagPrefix) score = 0
      else if (isTagQuery && matchesTagContains) score = 1
      else if (matchesName) score = 1
      else score = 2

      return { character, score }
    })
    .filter((entry): entry is { character: CreatedCharacter; score: number } => Boolean(entry))
    .sort((a, b) => a.score - b.score || a.character.tag.localeCompare(b.character.tag))
    .slice(0, 8)

  return ranked.map((entry) => entry.character)
}

// Backward compatibility for older imports
export const searchCharactersByTag = searchCharacters

export async function upsertCharacter(
  character: Omit<CreatedCharacter, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<string> {
  const now = Date.now()

  // Validate tag format
  if (!character.tag.startsWith('@')) {
    throw new Error('Tag must start with @')
  }

  if (character.tag.includes(' ')) {
    throw new Error('Tag cannot contain spaces')
  }

  // Validate max lengths
  if (character.appearsGuide && character.appearsGuide.length > 800) {
    throw new Error('Appears guide cannot exceed 800 characters')
  }

  if (character.cannotUseGuide && character.cannotUseGuide.length > 800) {
    throw new Error('Cannot use guide cannot exceed 800 characters')
  }

  // Check for duplicate tag (case-insensitive)
  const existing = await getCharacterByTag(character.tag)
  if (existing && existing.id !== character.id) {
    throw new Error('A character with this tag already exists')
  }

  if (character.id) {
    // Update existing
    const existingChar = await db.createdCharacters.get(character.id)
    if (!existingChar) {
      throw new Error('Character not found')
    }

    await db.createdCharacters.update(character.id, {
      ...character,
      updatedAt: now,
    })

    return character.id
  } else {
    // Create new
    const id = crypto.randomUUID()
    const newChar: CreatedCharacter = {
      ...character,
      id,
      createdAt: now,
      updatedAt: now,
    } as CreatedCharacter

    await db.createdCharacters.put(newChar)
    return id
  }
}

export async function deleteCharacter(id: string): Promise<void> {
  await db.createdCharacters.delete(id)
}
