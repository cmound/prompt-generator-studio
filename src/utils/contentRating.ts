export type Rating = 1 | 2 | 3 | 4 | 5

export type Category =
  | 'Adult/Suggestive'
  | 'Violence'
  | 'Self-harm/Terrorism'
  | 'IP/Brands'
  | 'Real Person'
  | 'Body-detail'
  | 'Hate/Harassment'

export interface RatingResult {
  rating: Rating
  score: number
  reason?: string
  categories: Category[]
  matches: Record<Category, string[]>
  suggestions: string[]
}

type Strictness = 'Relaxed' | 'Standard' | 'Strict'

interface Trigger {
  category: Category
  label: string
  pattern: RegExp
  weight: number
  suggestion?: string
}

interface ReasonCandidate {
  category: Category
  match: string
  weight: number
  source: 'trigger' | 'combo'
}

const STRICTNESS_KEY = 'pgs_content_strictness'

const STRICTNESS_MULTIPLIER: Record<Strictness, number> = {
  Relaxed: 0.85,
  Standard: 1,
  Strict: 1.2,
}

const REASON_MAX_LENGTH = 120

const PRODUCTION_TERMS = [
  'subject',
  'scene',
  'composition',
  'camera movement',
  'lighting',
  'wardrobe',
  'blocking',
  'sound design',
]

const TRIGGERS: Trigger[] = [
  { category: 'Adult/Suggestive', label: 'sexy', pattern: /\bsexy\b/gi, weight: 30, suggestion: 'fashion editorial styling' },
  { category: 'Adult/Suggestive', label: 'explicit', pattern: /\b(explicit|nsfw)\b/gi, weight: 34, suggestion: 'neutral, professional tone with wardrobe described factually' },
  { category: 'Adult/Suggestive', label: 'nude', pattern: /\b(nude|naked|topless)\b/gi, weight: 45, suggestion: 'artful wardrobe with implied form' },
  { category: 'Adult/Suggestive', label: 'lingerie', pattern: /\blingerie\b/gi, weight: 32, suggestion: 'runway-inspired wardrobe' },
  { category: 'Adult/Suggestive', label: 'kiss', pattern: /\b(kiss|kissing)\b/gi, weight: 26, suggestion: 'quiet, affectionate moment' },
  { category: 'Adult/Suggestive', label: 'erotic', pattern: /\berotic|seductive|provocative\b/gi, weight: 38, suggestion: 'subtle, moody tone' },
  { category: 'Body-detail', label: 'cleavage', pattern: /\bcleavage\b/gi, weight: 22, suggestion: 'framing that avoids focus on anatomy' },
  { category: 'Body-detail', label: 'thighs', pattern: /\b(thigh|thighs)\b/gi, weight: 18, suggestion: 'full-body wardrobe description' },
  { category: 'Body-detail', label: 'abs', pattern: /\b(abs|midriff|torso)\b/gi, weight: 18, suggestion: 'athletic wardrobe, action-ready' },
  { category: 'Body-detail', label: 'hips', pattern: /\bhips?\b/gi, weight: 16, suggestion: 'balanced, mid-shot framing' },
  { category: 'Violence', label: 'blood', pattern: /\bblood(y)?\b/gi, weight: 35, suggestion: 'injury implied off-screen' },
  { category: 'Violence', label: 'kill', pattern: /\b(kill(ed)?|murder|assault)\b/gi, weight: 32, suggestion: 'conflict framed without graphic harm' },
  { category: 'Violence', label: 'gore', pattern: /\bgore|dismember(ed)?\b/gi, weight: 40, suggestion: 'non-graphic aftermath implied' },
  { category: 'Violence', label: 'knife', pattern: /\b(knife|blades?)\b/gi, weight: 24, suggestion: 'tools kept off-camera' },
  { category: 'Violence', label: 'gun', pattern: /\b(gun|rifle|pistol|shotgun)\b/gi, weight: 26, suggestion: 'unarmed tension, no weapons shown' },
  { category: 'Violence', label: 'fight', pattern: /\b(fight|brawl|combat)\b/gi, weight: 22, suggestion: 'rapid movement, tense confrontation (non-graphic)' },
  { category: 'Violence', label: 'explosion', pattern: /\b(explosion|blast)\b/gi, weight: 24, suggestion: 'distant burst suggested, no debris' },
  {
    category: 'Self-harm/Terrorism',
    label: 'suicide',
    pattern: /\b(suicide|self-harm|self harm)\b/gi,
    weight: 75,
    suggestion: 'focus on support resources, no self-harm depiction',
  },
  {
    category: 'Self-harm/Terrorism',
    label: 'terror',
    pattern: /\b(terror(ist|ism)?|bomb|explosive|hostage|extremist)\b/gi,
    weight: 55,
    suggestion: 'avoid violent themes; use neutral security briefing tone',
  },
  { category: 'IP/Brands', label: 'Disney', pattern: /\bdisney\b/gi, weight: 28, suggestion: 'family-friendly theme park style (original)' },
  { category: 'IP/Brands', label: 'Marvel', pattern: /\bmarvel\b/gi, weight: 26, suggestion: 'original heroic comic universe' },
  { category: 'IP/Brands', label: 'Star Wars', pattern: /\bstar\s+wars\b/gi, weight: 28, suggestion: 'original galactic adventure setting' },
  { category: 'IP/Brands', label: 'Harry Potter', pattern: /\bharry\s+potter\b/gi, weight: 28, suggestion: 'original magical academy setting' },
  { category: 'IP/Brands', label: 'Mickey Mouse', pattern: /\bmickey\s+mouse\b/gi, weight: 55, suggestion: '1930s cartoon-style mouse character (original)' },
  { category: 'IP/Brands', label: 'SpongeBob', pattern: /\bspongebob\b/gi, weight: 50, suggestion: 'underwater cartoon world (original)' },
  { category: 'IP/Brands', label: 'Pokemon', pattern: /\bpokemon\b/gi, weight: 26, suggestion: 'original pocket-creature universe' },
  { category: 'IP/Brands', label: 'Lego', pattern: /\blego\b/gi, weight: 22, suggestion: 'modular toy brick world (original)' },
  { category: 'Real Person', label: 'Taylor Swift', pattern: /\btaylor\s+swift\b/gi, weight: 45, suggestion: 'a performer on stage (non-identifying)' },
  { category: 'Real Person', label: 'Beyonce', pattern: /\bbeyonce\b/gi, weight: 45, suggestion: 'a performer on stage (non-identifying)' },
  { category: 'Real Person', label: 'Obama', pattern: /\b(barack\s+)?obama\b/gi, weight: 40, suggestion: 'an elected official (non-identifying)' },
  { category: 'Real Person', label: 'Elon Musk', pattern: /\belon\s+musk\b/gi, weight: 40, suggestion: 'a tech founder archetype (fictional)' },
  { category: 'Real Person', label: 'celebrity', pattern: /\bcelebrity\b/gi, weight: 22, suggestion: 'a performer on stage (non-identifying)' },
  { category: 'Real Person', label: 'looks like', pattern: /looks\s+like\s+[^,.\n]+/gi, weight: 18, suggestion: 'a performer on stage (non-identifying)' },
  {
    category: 'Hate/Harassment',
    label: 'racist',
    pattern: /\bracist|racism|hate\s+speech|slur(s)?|homophobic|misogynistic|harass(ment)?\b/gi,
    weight: 50,
    suggestion: 'neutral, respectful language; avoid targeted remarks',
  },
  { category: 'Hate/Harassment', label: 'bullying', pattern: /\bbullying|abuse\b/gi, weight: 28, suggestion: 'conflict implied without insults' },
]

const emptyMatches = (): Record<Category, string[]> => ({
  'Adult/Suggestive': [],
  Violence: [],
  'Self-harm/Terrorism': [],
  'IP/Brands': [],
  'Real Person': [],
  'Body-detail': [],
  'Hate/Harassment': [],
})

const toRating = (score: number): Rating => {
  if (score >= 70) return 5
  if (score >= 50) return 4
  if (score >= 30) return 3
  if (score >= 15) return 2
  return 1
}

const getStrictness = (): Strictness => {
  if (typeof localStorage === 'undefined') return 'Standard'
  const stored = localStorage.getItem(STRICTNESS_KEY)
  if (stored === 'Relaxed' || stored === 'Strict') return stored
  return 'Standard'
}

const sanitizeMatchList = (list: string[]): string[] => {
  const unique = Array.from(new Set(list.map((item) => item.trim()).filter(Boolean)))
  return unique.slice(0, 3)
}

export function assessContentRating(input: {
  prompt: string
  negative?: string
  charactersText?: string
}): RatingResult {
  const combined = [input.prompt, input.negative, input.charactersText].filter(Boolean).join(' ').trim()
  const matches = emptyMatches()
  const categoryTotals: Record<Category, number> = {
    'Adult/Suggestive': 0,
    Violence: 0,
    'Self-harm/Terrorism': 0,
    'IP/Brands': 0,
    'Real Person': 0,
    'Body-detail': 0,
    'Hate/Harassment': 0,
  }
  const suggestionSet = new Set<string>()
  const reasonCandidates: ReasonCandidate[] = []

  if (!combined) {
    return {
      rating: 1,
      score: 0,
      categories: [],
      matches,
      suggestions: [],
    }
  }

  const strictness = getStrictness()
  const multiplier = STRICTNESS_MULTIPLIER[strictness]

  let score = 0

  for (const trigger of TRIGGERS) {
    const found = [...combined.matchAll(trigger.pattern)]
    if (!found.length) continue

    const counted = Math.min(found.length, 3)
    const addition = counted * trigger.weight * multiplier
    score += addition
    categoryTotals[trigger.category] += addition

    const foundTerms = found.map((m) => m[0]).filter(Boolean)
    matches[trigger.category].push(...foundTerms)

    if (trigger.suggestion) {
      suggestionSet.add(trigger.suggestion)
    }

    const mostSalient = foundTerms[0]
    if (mostSalient) {
      reasonCandidates.push({ category: trigger.category, match: mostSalient.trim(), weight: addition, source: 'trigger' })
    }
  }

  // Unsafe combination multipliers
  const hasCategory = (cat: Category) => matches[cat].length > 0
  const lowerCombined = combined.toLowerCase()

  if (hasCategory('Body-detail') && hasCategory('Adult/Suggestive')) {
    const bump = 25 * multiplier
    score += bump
    categoryTotals['Adult/Suggestive'] += bump / 2
    categoryTotals['Body-detail'] += bump / 2
    reasonCandidates.push({ category: 'Adult/Suggestive', match: 'body-detail + suggestive mix', weight: bump, source: 'combo' })
  }

  if (hasCategory('Real Person') && /looks\s+like|celebrity/i.test(combined)) {
    const bump = 30 * multiplier
    score += bump
    categoryTotals['Real Person'] += bump
    reasonCandidates.push({ category: 'Real Person', match: 'real person resemblance', weight: bump, source: 'combo' })
  }

  if (hasCategory('Violence') && /(photorealistic|hyper-?realistic|realistic)/i.test(lowerCombined)) {
    const bump = 15 * multiplier
    score += bump
    categoryTotals['Violence'] += bump
    reasonCandidates.push({ category: 'Violence', match: 'realistic violent depiction', weight: bump, source: 'combo' })
  }

  // Film-brief language bonus reduction
  const filmTermMatches = PRODUCTION_TERMS.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'i')
    return regex.test(input.prompt)
  })
  if (filmTermMatches.length > 0) {
    const reduction = Math.min(10, filmTermMatches.length * 2)
    score -= reduction
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)))
  const rating = toRating(finalScore)

  const categories = (Object.keys(matches) as Category[])
    .filter((cat) => matches[cat].length > 0)
    .sort((a, b) => categoryTotals[b] - categoryTotals[a])

  const cleanedMatches = (Object.keys(matches) as Category[]).reduce<Record<Category, string[]>>((acc, cat) => {
    acc[cat] = sanitizeMatchList(matches[cat])
    return acc
  }, emptyMatches())

  let reason: string | undefined
  if (rating >= 3 && categories.length > 0) {
    const topCategory = categories[0]
    const topTerm = cleanedMatches[topCategory][0]

    if (topTerm) {
      reason = `Reason: ${topCategory} term '${topTerm}' commonly triggers moderation.`
    } else if (reasonCandidates.length > 0) {
      const sourcePriority = { trigger: 1, combo: 0 } as const
      const fallback = reasonCandidates.sort((a, b) => {
        if (b.weight === a.weight) return sourcePriority[b.source] - sourcePriority[a.source]
        return b.weight - a.weight
      })[0]
      if (fallback?.match) {
        reason = `Reason: ${fallback.category} term '${fallback.match}' commonly triggers moderation.`
      }
    }

    if (reason && reason.length > REASON_MAX_LENGTH) {
      reason = `${reason.slice(0, REASON_MAX_LENGTH - 3)}...`
    }
  }

  return {
    rating,
    score: finalScore,
    reason,
    categories,
    matches: cleanedMatches,
    suggestions: Array.from(suggestionSet).slice(0, 6),
  }
}
