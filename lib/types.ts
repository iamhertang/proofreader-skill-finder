export type DiffClass = 'accepted' | 'word_swap' | 'phrase_restructure' | 'full_rewrite'

export type ContentType =
  | 'ui_text'
  | 'item_name'
  | 'skill_name'
  | 'story_dialogue'
  | 'announcement'
  | 'game_rules'
  | 'loading_screen'
  | 'general'

export interface Row {
  textId: string
  chs: string
  target: string
  targetPR: string
  extra: string
}

export interface AnalysedRow extends Row {
  diffClass: DiffClass
  contentType: ContentType
  changedWords: number
  totalWords: number
}

export interface Stats {
  total: number
  accepted: number
  wordSwap: number
  phraseRestructure: number
  fullRewrite: number
  contentTypes: Record<ContentType, number>
}

export interface RunRecord {
  id: string
  createdAt: string
  language: string
  filename: string
  blobUrl: string | null
  rowCount: number
  stats: Stats
  skillMd: string
}

export interface SSEEvent {
  step?: number
  label?: string
  pct?: number
  result?: string
  stats?: Stats
  runId?: string | null
  error?: string
}

export const LANGUAGES = [
  { code: 'EN', label: 'English', flag: '🇬🇧' },
  { code: 'DE', label: 'German', flag: '🇩🇪' },
  { code: 'FR', label: 'French', flag: '🇫🇷' },
  { code: 'JP', label: 'Japanese', flag: '🇯🇵' },
  { code: 'KR', label: 'Korean', flag: '🇰🇷' },
  { code: 'ES', label: 'Spanish', flag: '🇪🇸' },
  { code: 'PT', label: 'Portuguese', flag: '🇵🇹' },
  { code: 'ID', label: 'Indonesian', flag: '🇮🇩' },
  { code: 'VN', label: 'Vietnamese', flag: '🇻🇳' },
  { code: 'TH', label: 'Thai', flag: '🇹🇭' },
  { code: 'RU', label: 'Russian', flag: '🇷🇺' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  ui_text: 'UI Text',
  item_name: 'Item Name',
  skill_name: 'Skill Name',
  story_dialogue: 'Story / Dialogue',
  announcement: 'Announcement',
  game_rules: 'Game Rules',
  loading_screen: 'Loading Screen',
  general: 'General',
}
