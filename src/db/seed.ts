import { db } from './db'

const DEFAULT_NEGATIVE =
  'blurry, grainy, low resolution, out of focus, bad anatomy, warped hands, extra limbs, missing fingers, deformed, mutated features, cartoon, surreal, watermark, logo, text, subtitles'

export async function ensureSeeded(): Promise<void> {
  try {
    // Explicitly open the database
    await db.open()

    // Check if settings exist
    const existing = await db.settings.get('app')
    if (!existing) {
      await db.settings.put({
        id: 'app',
        durationSeconds: 15,
        realismPreset: 'Hyper-Realistic',
        frameType: 'Cinematic',
        platform: 'Sora 2',
        maxChars: 2000,
        negativePromptDefault: DEFAULT_NEGATIVE,
        platformsCustom: [],
        negativeOptionsSelected: [],
      })
    } else {
      const patch: Partial<typeof existing> = {}
      if (!existing.negativePromptDefault) {
        patch.negativePromptDefault = DEFAULT_NEGATIVE
      }
      if (!existing.realismPreset) {
        patch.realismPreset = 'Hyper-Realistic'
      }
      if (!existing.frameType) {
        patch.frameType = 'Cinematic'
      }
      if (existing.platformsCustom === undefined) {
        patch.platformsCustom = []
      }
      if (existing.negativeOptionsSelected === undefined) {
        patch.negativeOptionsSelected = []
      }
      if (Object.keys(patch).length > 0) {
        await db.settings.put({ ...existing, ...patch })
      }
    }

    console.log('PGS DB READY')
  } catch (error) {
    console.error('PGS DB ERROR:', error)
    throw error
  }
}
