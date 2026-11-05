import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ChatAttachment } from '#shared/types/chat'
import type { ConversationColor } from '#shared/utils/chat'

export type ChatRole = 'user' | 'assistant' | 'system'

export interface StoredMessage {
  id: string
  conversationId: string
  role: ChatRole
  content: string
  attachments?: ChatAttachment[]
  model: string | null
  connectionId: string | null
  inputTokens: number | null
  outputTokens: number | null
  createdAt: string
}

export interface StoredConversation {
  id: string
  title: string
  model: string
  connectionId: string
  messageCount: number
  lastMessageAt: string
  createdAt: string
  archived: boolean
  color: ConversationColor
}

export interface CreateConversationInput {
  userId: string
  appId?: string
  title: string
  connectionId: string
  model: string
}

export interface AppendMessageInput {
  conversationId: string
  userId: string
  role: ChatRole
  content: string
  attachments?: ChatAttachment[]
  model?: string
  connectionId?: string
  inputTokens?: number
  outputTokens?: number
}

export interface UpdateConversationInput {
  title?: string
  archived?: boolean
  color?: ConversationColor
}

export interface MessagePage {
  messages: StoredMessage[]
  hasMore: boolean
  nextCursor: string | null
}

/** Row-level shape returned by better-sqlite3 for the joined list query. */
interface ConversationRow {
  id: string
  title: string
  model: string
  connection_id: string
  message_count: number
  last_message_at: string | null
  created_at: string
  archived: number
  color: string
}

interface MessageRow {
  id: string
  conversation_id: string
  role: ChatRole
  content: string
  attachments: string | null
  model: string | null
  connection_id: string | null
  input_tokens: number | null
  output_tokens: number | null
  created_at: string
}

function parseStoredAttachments(raw: string | null): ChatAttachment[] | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed as ChatAttachment[] : undefined
  } catch {
    return undefined
  }
}

function mapMessageRow(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    attachments: parseStoredAttachments(row.attachments),
    model: row.model,
    connectionId: row.connection_id,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    createdAt: row.created_at
  }
}

function mapConversationRow(row: ConversationRow): StoredConversation {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    connectionId: row.connection_id,
    messageCount: Number(row.message_count) || 0,
    lastMessageAt: row.last_message_at || row.created_at,
    createdAt: row.created_at,
    archived: row.archived === 1,
    color: (row.color || 'neutral') as ConversationColor
  }
}

export const TITLE_MAX_LENGTH = 60

export function deriveTitle(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  if (line.length <= TITLE_MAX_LENGTH) return line || 'Untitled chat'
  return `${line.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
}

/**
 * Conversation persistence for the /chat surface. SQLite is the only store:
 * tm-tools owns its own history, while the provider credential stays in TM Hub
 * and inference goes through the hub relay.
 *
 * Every method is scoped by userId, so one account can never read or delete
 * another account's history even when it knows a conversation id.
 */
export class ChatStore {
  private readonly db: Database.Database

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true })
    }
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        app_id TEXT,
        title TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        model TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0,
        color TEXT NOT NULL DEFAULT 'neutral',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chat_conversations_user
        ON chat_conversations (user_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        attachments TEXT,
        model TEXT,
        connection_id TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES chat_conversations (id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
        ON chat_messages (conversation_id, created_at);
    `)

    this.ensureColumn('chat_conversations', 'archived', 'INTEGER NOT NULL DEFAULT 0')
    this.ensureColumn('chat_conversations', 'color', 'TEXT NOT NULL DEFAULT \'neutral\'')
    this.ensureColumn('chat_messages', 'attachments', 'TEXT')
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    if (columns.some(entry => entry.name === column)) return
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }

  listConversations(userId: string): StoredConversation[] {
    const rows = this.db.prepare(`
      SELECT c.id, c.title, c.model, c.connection_id, c.created_at, c.archived, c.color,
             COUNT(m.id) AS message_count,
             MAX(m.created_at) AS last_message_at
        FROM chat_conversations c
        LEFT JOIN chat_messages m ON m.conversation_id = c.id
       WHERE c.user_id = ?
       GROUP BY c.id
       ORDER BY c.archived ASC, COALESCE(MAX(m.created_at), c.created_at) DESC
    `).all(userId) as ConversationRow[]

    return rows.map(mapConversationRow)
  }

  getConversation(userId: string, conversationId: string): StoredConversation | null {
    const row = this.db.prepare(`
      SELECT c.id, c.title, c.model, c.connection_id, c.created_at, c.archived, c.color,
             COUNT(m.id) AS message_count,
             MAX(m.created_at) AS last_message_at
        FROM chat_conversations c
        LEFT JOIN chat_messages m ON m.conversation_id = c.id
       WHERE c.id = ? AND c.user_id = ?
       GROUP BY c.id
    `).get(conversationId, userId) as ConversationRow | undefined

    return row ? mapConversationRow(row) : null
  }

  createConversation(input: CreateConversationInput): StoredConversation {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO chat_conversations (id, user_id, app_id, title, connection_id, model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.userId, input.appId ?? null, input.title, input.connectionId, input.model, now, now)

    return {
      id,
      title: input.title,
      model: input.model,
      connectionId: input.connectionId,
      messageCount: 0,
      lastMessageAt: now,
      createdAt: now,
      archived: false,
      color: 'neutral'
    }
  }

  appendMessage(input: AppendMessageInput): StoredMessage {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO chat_messages
        (id, conversation_id, user_id, role, content, attachments, model, connection_id, input_tokens, output_tokens, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.conversationId,
      input.userId,
      input.role,
      input.content,
      input.attachments?.length ? JSON.stringify(input.attachments) : null,
      input.model ?? null,
      input.connectionId ?? null,
      input.inputTokens ?? null,
      input.outputTokens ?? null,
      now
    )

    return {
      id,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      attachments: input.attachments,
      model: input.model ?? null,
      connectionId: input.connectionId ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      createdAt: now
    }
  }

  deleteMessage(userId: string, messageId: string): void {
    this.db.prepare('DELETE FROM chat_messages WHERE id = ? AND user_id = ?').run(messageId, userId)
  }

  listMessages(userId: string, conversationId: string, limit?: number): StoredMessage[] {
    // `rowid` is not visible through `SELECT *` on a derived table, so the
    // windowed query has to project it as `seq` to keep insertion order when
    // two rows share the same millisecond timestamp.
    const rows = limit
      ? this.db.prepare(`
          SELECT * FROM (
            SELECT rowid AS seq, * FROM chat_messages
             WHERE conversation_id = ? AND user_id = ?
             ORDER BY created_at DESC, seq DESC
             LIMIT ?
          ) ORDER BY created_at ASC, seq ASC
        `).all(conversationId, userId, limit) as MessageRow[]
      : this.db.prepare(`
          SELECT rowid AS seq, * FROM chat_messages
           WHERE conversation_id = ? AND user_id = ?
           ORDER BY created_at ASC, seq ASC
        `).all(conversationId, userId) as MessageRow[]

    return rows.map(mapMessageRow)
  }

  /**
   * Returns one page of messages ending just before `before` (or at the newest
   * message). The cursor is the oldest message id already loaded, matching the
   * Mongo implementation in tm-hub so both clients share page semantics.
   */
  listMessagePage(userId: string, conversationId: string, options: { limit: number, before?: string }): MessagePage {
    const limit = options.limit
    let cursor: { seq: number, created_at: string } | undefined
    if (options.before) {
      cursor = this.db.prepare(`
        SELECT rowid AS seq, created_at FROM chat_messages
         WHERE id = ? AND conversation_id = ? AND user_id = ?
      `).get(options.before, conversationId, userId) as { seq: number, created_at: string } | undefined
    }

    const cursorFilter = cursor
      ? 'AND (created_at < ? OR (created_at = ? AND seq < ?))'
      : ''
    const cursorParams = cursor ? [cursor.created_at, cursor.created_at, cursor.seq] : []

    const rows = this.db.prepare(`
      SELECT * FROM (
        SELECT rowid AS seq, * FROM chat_messages
         WHERE conversation_id = ? AND user_id = ? ${cursorFilter}
         ORDER BY created_at DESC, seq DESC
         LIMIT ?
      ) ORDER BY created_at ASC, seq ASC
    `).all(conversationId, userId, ...cursorParams, limit + 1) as MessageRow[]

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(rows.length - limit) : rows
    const messages = page.map(mapMessageRow)

    return {
      messages,
      hasMore,
      nextCursor: hasMore ? (messages[0]?.id ?? null) : null
    }
  }

  updateConversation(
    userId: string,
    conversationId: string,
    patch: UpdateConversationInput
  ): StoredConversation | null {
    const fields: string[] = []
    const values: unknown[] = []
    if (patch.title !== undefined) {
      fields.push('title = ?')
      values.push(patch.title)
    }
    if (patch.archived !== undefined) {
      fields.push('archived = ?')
      values.push(patch.archived ? 1 : 0)
    }
    if (patch.color !== undefined) {
      fields.push('color = ?')
      values.push(patch.color)
    }
    if (fields.length === 0) return null

    fields.push('updated_at = ?')
    values.push(new Date().toISOString(), conversationId, userId)
    this.db.prepare(`UPDATE chat_conversations SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`)
      .run(...values)

    return this.getConversation(userId, conversationId)
  }

  /** Keeps the conversation row aligned with the model used by its last turn. */
  touchConversation(conversationId: string, model: string, connectionId: string): void {
    this.db.prepare(`
      UPDATE chat_conversations
         SET model = ?, connection_id = ?, updated_at = ?
       WHERE id = ?
    `).run(model, connectionId, new Date().toISOString(), conversationId)
  }

  deleteConversation(userId: string, conversationId: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM chat_conversations WHERE id = ? AND user_id = ?'
    ).run(conversationId, userId)
    return result.changes > 0
  }

  close(): void {
    this.db.close()
  }
}

let store: ChatStore | null = null

/**
 * One connection per process. The packaged Electron runtime runs Nitro inside
 * the main process, so TOOLS_DATA_DIR points at userData there; the web/dev
 * runtime falls back to the gitignored .data directory.
 */
function resolveDatabasePath(): string {
  const dataDir = process.env.TOOLS_DATA_DIR || join(process.cwd(), '.data')
  return join(dataDir, 'chat.sqlite')
}

export function getChatStore(): ChatStore {
  if (!store) store = new ChatStore(resolveDatabasePath())
  return store
}

export const CHAT_HISTORY_WINDOW = 40
