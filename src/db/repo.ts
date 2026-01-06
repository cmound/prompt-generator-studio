import { db } from './db'
import type { Prompt, PromptVersion, Settings } from './types'

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean)))
}

export async function createPrompt(input: {
  title: string
  platform: string
  tags?: string[]
}): Promise<string> {
  const id = crypto.randomUUID()
  const now = Date.now()

  const prompt: Prompt = {
    id,
    title: input.title,
    platform: input.platform,
    tags: normalizeTags(input.tags || []),
    createdAt: now,
    updatedAt: now,
  }

  await db.prompts.put(prompt)
  return id
}

export async function savePromptVersion(
  promptId: string,
  content: string,
  meta?: {
    charCount?: number
    riskScore?: number
    riskReasons?: string[]
    platform?: string
    realism?: string
    frameType?: string
    durationSeconds?: number
    negativePrompt?: string
  }
): Promise<string> {
  const id = crypto.randomUUID()

  // Get existing versions to determine next version number
  const existingVersions = await db.promptVersions.where('promptId').equals(promptId).toArray()
  const versionNumber = existingVersions.length + 1

  const version: PromptVersion = {
    id,
    promptId,
    versionNumber,
    content,
    charCount: meta?.charCount ?? content.length,
    riskScore: meta?.riskScore ?? 0,
    riskReasons: meta?.riskReasons ?? [],
    platform: meta?.platform,
    realism: meta?.realism,
    frameType: meta?.frameType,
    durationSeconds: meta?.durationSeconds,
    negativePrompt: meta?.negativePrompt,
    createdAt: Date.now(),
  }

  await db.promptVersions.put(version)

  // Update prompt's updatedAt timestamp
  const prompt = await db.prompts.get(promptId)
  if (prompt) {
    prompt.updatedAt = Date.now()
    await db.prompts.put(prompt)
  }

  return id
}

export async function getPrompt(promptId: string): Promise<Prompt | undefined> {
  return db.prompts.get(promptId)
}

export async function listPrompts(opts?: {
  query?: string
  tag?: string
  platform?: string
  limit?: number
}): Promise<Prompt[]> {
  let collection = db.prompts.orderBy('updatedAt').reverse()

  if (opts?.platform) {
    collection = db.prompts.where('platform').equals(opts.platform).reverse()
  }

  let results = await collection.toArray()

  // Filter by tag if specified
  if (opts?.tag) {
    results = results.filter((p) => p.tags.includes(opts.tag!.toLowerCase()))
  }

  // Filter by query if specified
  if (opts?.query) {
    const lowerQuery = opts.query.toLowerCase()
    results = results.filter((p) => p.title.toLowerCase().includes(lowerQuery))
  }

  // Apply limit
  if (opts?.limit) {
    results = results.slice(0, opts.limit)
  }

  return results
}

export async function getVersions(promptId: string): Promise<PromptVersion[]> {
  return db.promptVersions.where('promptId').equals(promptId).sortBy('versionNumber')
}

export async function deletePrompt(promptId: string): Promise<void> {
  await db.transaction('rw', [db.prompts, db.promptVersions], async () => {
    // Delete all versions for this prompt
    await db.promptVersions.where('promptId').equals(promptId).delete()
    // Delete the prompt itself
    await db.prompts.delete(promptId)
  })
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = await db.settings.get('app')
  if (current) {
    await db.settings.put({ ...current, ...patch })
  }
}

export async function getSettings(): Promise<Settings> {
  const settings = await db.settings.get('app')
  if (!settings) {
    throw new Error('Settings not initialized')
  }
  return settings
}
