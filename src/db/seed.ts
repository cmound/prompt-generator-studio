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
        aiContentType: 'photoreal_cinematic_still',
        platform: 'Sora 2',
        maxChars: 2000,
        negativePromptDefault: DEFAULT_NEGATIVE,
        outputFormat: 'paragraph',
        audioOptions: {
          music: { enabled: true, text: '' },
          sfx: { enabled: true, text: '' },
          vo: { enabled: true, text: '' },
        },
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
      if (!existing.aiContentType) {
        patch.aiContentType = (existing.realismPreset || 'Hyper-Realistic') === 'Hyper-Realistic'
          ? 'photoreal_cinematic_still'
          : 'ai_generic'
      }
      if (existing.platformsCustom === undefined) {
        patch.platformsCustom = []
      }
      if (existing.negativeOptionsSelected === undefined) {
        patch.negativeOptionsSelected = []
      }
      if (!existing.outputFormat) {
        patch.outputFormat = 'paragraph'
      }
      if (!existing.audioOptions) {
        if (typeof existing.includeAudio === 'boolean') {
          const enabled = existing.includeAudio
          patch.audioOptions = {
            music: { enabled, text: '' },
            sfx: { enabled, text: '' },
            vo: { enabled, text: '' },
          }
        } else {
          patch.audioOptions = {
            music: { enabled: true, text: '' },
            sfx: { enabled: true, text: '' },
            vo: { enabled: true, text: '' },
          }
        }
      } else {
        // Migrate legacy boolean-only audioOptions to new shape
        const ao: any = existing.audioOptions
        if (
          typeof ao.music === 'boolean' ||
          typeof ao.sfx === 'boolean' ||
          typeof ao.vo === 'boolean'
        ) {
          patch.audioOptions = {
            music: { enabled: !!ao.music, text: '' },
            sfx: { enabled: !!ao.sfx, text: '' },
            vo: { enabled: !!ao.vo, text: '' },
          }
        }
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
