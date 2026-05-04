import type { ContentType } from './types'

const RULES: Array<{ type: ContentType; keywords: string[] }> = [
  {
    type: 'loading_screen',
    keywords: ['LOAD', 'LOADING', 'SPLASH', 'LOADTIP', 'LOADING_TIP'],
  },
  {
    type: 'ui_text',
    keywords: ['UI', 'BTN', 'BUTTON', 'MENU', 'TAB', 'LABEL', 'HUD', 'ICON', 'POPUP', 'TOOLTIP', 'WIDGET'],
  },
  {
    type: 'item_name',
    keywords: ['ITEM', 'EQUIP', 'WEAPON', 'ARMOR', 'ARMOUR', 'MATERIAL', 'PROP', 'GEAR', 'RELIC', 'ARTIFACT', 'CONSUMABLE'],
  },
  {
    type: 'skill_name',
    keywords: ['SKILL', 'ABILITY', 'TALENT', 'PASSIVE', 'ACTIVE', 'BUFF', 'DEBUFF', 'SPELL', 'TECH', 'ULTIMATE'],
  },
  {
    type: 'story_dialogue',
    keywords: ['STORY', 'DIALOG', 'DIALOGUE', 'NPC', 'QUEST', 'CUTSCENE', 'CHAT', 'NARRATIVE', 'LORE', 'MONOLOGUE'],
  },
  {
    type: 'announcement',
    keywords: ['ANNOUNCE', 'ANNOUNCEMENT', 'NEWS', 'NOTICE', 'EVENT', 'BANNER', 'NOTIFY', 'ALERT', 'BROADCAST'],
  },
  {
    type: 'game_rules',
    keywords: ['RULE', 'RULES', 'TUTORIAL', 'TIP', 'TIPS', 'GUIDE', 'HELP', 'HINT', 'MECHANIC', 'INSTRUCTION'],
  },
]

export function inferContentType(textId: string): ContentType {
  const upper = textId.toUpperCase()
  for (const { type, keywords } of RULES) {
    if (keywords.some((kw) => upper.includes(kw))) return type
  }
  return 'general'
}
