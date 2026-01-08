import { describe, expect, it, beforeEach } from 'vitest'
import { assessContentRating } from './contentRating'

type StorageShape = Record<string, string>

const mockLocalStorage = (seed: StorageShape = {}): void => {
  const store: StorageShape = { ...seed }
  const storage = {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      Object.keys(store).forEach((key) => delete store[key])
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length
    },
  }
  ;(globalThis as any).localStorage = storage
}

describe('assessContentRating', () => {
  beforeEach(() => {
    mockLocalStorage()
  })

  it('scores neutral prompts as low risk', () => {
    const result = assessContentRating({ prompt: 'Scenic landscape establishing shot with careful composition.' })
    expect(result.rating).toBe(1)
    expect(result.categories).toHaveLength(0)
    expect(result.suggestions).toHaveLength(0)
  })

  it('flags adult language and produces a capped reason', () => {
    const result = assessContentRating({ prompt: 'A stylish yet sexy pose in a studio.' })
    expect(result.rating).toBeGreaterThanOrEqual(3)
    expect(result.reason).toMatch(/Reason: Adult\/Suggestive term 'sexy'/)
    expect(result.reason && result.reason.length).toBeLessThanOrEqual(120)
    expect(result.matches['Adult/Suggestive']).toContain('sexy')
  })

  it('escalates when body detail and adult cues combine', () => {
    const result = assessContentRating({ prompt: 'Nude portrait highlighting cleavage and curves.' })
    expect(result.rating).toBe(5)
    expect(result.categories).toContain('Body-detail')
    expect(result.categories).toContain('Adult/Suggestive')
  })

  it('boosts risk for realistic violence', () => {
    const result = assessContentRating({ prompt: 'Photorealistic fight sequence with blood on armor.' })
    expect(result.rating).toBeGreaterThanOrEqual(4)
    expect(result.categories).toContain('Violence')
    expect(result.reason).toBeTruthy()
  })

  it('treats self-harm terms as very high risk', () => {
    const result = assessContentRating({ prompt: 'A quiet story about a suicide note and regret.' })
    expect(result.rating).toBe(5)
    expect(result.reason).toMatch(/suicide/)
  })

  it('catches IP and brand references', () => {
    const result = assessContentRating({ prompt: 'A playful Mickey Mouse style character in a clubhouse.' })
    expect(result.rating).toBeGreaterThanOrEqual(4)
    expect(result.categories).toContain('IP/Brands')
    expect(result.reason).toMatch(/Mickey Mouse|IP\/Brands/)
  })

  it('escalates real person resemblance language', () => {
    const result = assessContentRating({ prompt: 'A portrait that looks like Beyonce performing live.' })
    expect(result.rating).toBeGreaterThanOrEqual(4)
    expect(result.categories).toContain('Real Person')
  })

  it('surfaces hate and harassment language', () => {
    const result = assessContentRating({ prompt: 'The script includes a racist rant toward a neighbor.' })
    expect(result.rating).toBeGreaterThanOrEqual(4)
    expect(result.categories).toContain('Hate/Harassment')
  })

  it('applies film-brief language bonus reductions', () => {
    const prompt =
      'Blood spatter discussed alongside subject, scene, composition, camera movement, lighting, wardrobe, blocking, and sound design.'
    const result = assessContentRating({ prompt })
    expect(result.rating).toBe(2)
    expect(result.score).toBeLessThan(35)
  })

  it('returns rewrite suggestions for matched terms', () => {
    const result = assessContentRating({ prompt: 'Sexy kiss with blood after a fight featuring Mickey Mouse.' })
    expect(result.suggestions.length).toBeGreaterThanOrEqual(3)
    expect(result.suggestions).toContain('fashion editorial styling')
    expect(result.suggestions).toContain('quiet, affectionate moment')
  })

  it('uses stored strictness multipliers when present', () => {
    mockLocalStorage({ pgs_content_strictness: 'Relaxed' })
    const relaxedResult = assessContentRating({ prompt: 'A stylish yet sexy pose in a studio.' })

    mockLocalStorage({ pgs_content_strictness: 'Strict' })
    const strictResult = assessContentRating({ prompt: 'A stylish yet sexy pose in a studio.' })

    expect(relaxedResult.score).toBeLessThan(strictResult.score)
    expect(relaxedResult.rating).toBeLessThanOrEqual(strictResult.rating)
  })

  it('counts negative prompt triggers', () => {
    const result = assessContentRating({ prompt: 'Calm forest scene', negative: 'gore and blood everywhere' })
    expect(result.rating).toBeGreaterThanOrEqual(3)
    expect(result.categories).toContain('Violence')
    expect(result.matches['Violence'].length).toBeGreaterThan(0)
  })

  it('counts created character metadata triggers', () => {
    const result = assessContentRating({ prompt: 'Neutral scene', charactersText: '@hero Mickey Mouse look' })
    expect(result.rating).toBeGreaterThanOrEqual(4)
    expect(result.categories).toContain('IP/Brands')
  })

  it('truncates very long reasons', () => {
    const longPrompt =
      'A portrait that looks like a legendary performer with an impossibly long descriptive name that keeps going for many words to force truncation'
    const result = assessContentRating({ prompt: longPrompt })
    expect(result.rating).toBeGreaterThanOrEqual(3)
    expect(result.reason).toBeTruthy()
    expect(result.reason && result.reason.length).toBeLessThanOrEqual(120)
  })
})
