export type ChatAttachmentKind = 'text' | 'image'

export interface ChatAttachment {
  name: string
  type: string
  size?: number
  kind: ChatAttachmentKind
  content?: string
  url?: string
}
