import Dexie, { type Table } from 'dexie'
import type { Prompt, PromptVersion, Settings, ImageAsset, ImageEdit, ImageDescription, CreatedCharacter } from './types'

class PromptGeneratorDB extends Dexie {
  prompts!: Table<Prompt, string>
  promptVersions!: Table<PromptVersion, string>
  settings!: Table<Settings, string>
  imageAssets!: Table<ImageAsset, string>
  imageEdits!: Table<ImageEdit, string>
  imageDescriptions!: Table<ImageDescription, string>
  createdCharacters!: Table<CreatedCharacter, string>

  constructor() {
    super('pgs-db')
    this.version(1).stores({
      prompts: 'id, platform, updatedAt',
      promptVersions: 'id, promptId, createdAt',
      settings: 'id',
    })
    this.version(2).stores({
      prompts: 'id, platform, updatedAt',
      promptVersions: 'id, promptId, createdAt',
      settings: 'id',
      imageAssets: 'id, createdAt',
      imageEdits: 'id, imageId, createdAt',
    })
    this.version(3)
      .stores({
        prompts: 'id, platform, updatedAt',
        promptVersions: 'id, promptId, createdAt',
        settings: 'id',
        imageAssets: 'id, createdAt',
        imageEdits: 'id, imageId, createdAt, title, isFavorite, updatedAt',
      })
      .upgrade(async (tx) => {
        // Backfill new fields for existing imageEdits
        const edits = await tx.table('imageEdits').toArray()
        for (const edit of edits) {
          await tx.table('imageEdits').update(edit.id, {
            title: edit.title ?? 'Untitled Edit',
            isFavorite: edit.isFavorite ?? false,
            updatedAt: edit.updatedAt ?? edit.createdAt ?? Date.now(),
          })
        }
      })
    this.version(4).stores({
      prompts: 'id, platform, updatedAt',
      promptVersions: 'id, promptId, createdAt',
      settings: 'id',
      imageAssets: 'id, createdAt',
      imageEdits: 'id, imageId, createdAt, title, isFavorite, updatedAt',
      imageDescriptions: 'id, imageId, createdAt, title, isFavorite, updatedAt, focus',
    })
    this.version(5).stores({
      prompts: 'id, platform, updatedAt',
      promptVersions: 'id, promptId, createdAt',
      settings: 'id',
      imageAssets: 'id, createdAt',
      imageEdits: 'id, imageId, createdAt, title, isFavorite, updatedAt',
      imageDescriptions: 'id, imageId, createdAt, title, isFavorite, updatedAt, focus',
      createdCharacters: 'id, tag, name, updatedAt',
    })
  }
}

export const db = new PromptGeneratorDB()
