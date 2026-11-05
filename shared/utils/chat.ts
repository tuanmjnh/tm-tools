export const CONVERSATION_COLORS = [
  'neutral',
  'primary',
  'secondary',
  'success',
  'info',
  'warning',
  'error'
] as const

export type ConversationColor = typeof CONVERSATION_COLORS[number]

export function isConversationColor(value: unknown): value is ConversationColor {
  return typeof value === 'string' && (CONVERSATION_COLORS as readonly string[]).includes(value)
}

export const CHAT_ATTACHMENT_LIMIT = 5
export const CHAT_ATTACHMENT_TEXT_LIMIT = 200_000
export const CHAT_ATTACHMENT_IMAGE_LIMIT = 10 * 1024 * 1024
