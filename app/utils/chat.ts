import type { ConversationColor } from '#shared/utils/chat'

export function getProviderIcon(provider: string): string {
  const p = (provider || '').toLowerCase()
  if (p.includes('openai')) return 'i-simple-icons-openai'
  if (p.includes('anthropic')) return 'i-simple-icons-anthropic'
  if (p.includes('google')) return 'i-simple-icons-google'
  if (p.includes('groq')) return 'i-lucide-zap'
  if (p.includes('deepseek')) return 'i-lucide-sparkles'
  if (p.includes('ollama')) return 'i-lucide-hard-drive'
  if (p.includes('router')) return 'i-lucide-route'
  return 'i-lucide-bot'
}

export const CONVERSATION_COLOR_DOT_CLASS: Record<ConversationColor, string> = {
  neutral: 'bg-(--ui-text-dimmed)',
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  success: 'bg-success',
  info: 'bg-info',
  warning: 'bg-warning',
  error: 'bg-error'
}

export const CONVERSATION_COLOR_ICON_CLASS: Record<ConversationColor, string> = {
  neutral: 'text-(--ui-text-dimmed)',
  primary: 'text-primary',
  secondary: 'text-secondary',
  success: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  error: 'text-error'
}

const TEXT_FILE_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonc', 'csv', 'tsv', 'log', 'yaml', 'yml', 'toml', 'ini', 'env',
  'js', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'css', 'scss', 'less', 'html', 'xml', 'svg',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'php', 'cs', 'cpp', 'c', 'h', 'sql', 'sh', 'bash', 'ps1'
])

const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/x-yaml',
  'application/yaml'
])

export function isTextFile(file: File): boolean {
  if (file.type.startsWith('text/') || TEXT_MIME_TYPES.has(file.type)) return true
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  return TEXT_FILE_EXTENSIONS.has(extension)
}
