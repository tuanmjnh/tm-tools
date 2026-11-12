/**
 * Editable row for the Local AI connections settings page.
 *
 * `apiKey` is the value typed in this session only: saving moves it into the
 * named config slot, and the JSON array keeps just `apiKeyEnv`.
 */
export interface AILocalConnectionRow {
  connectionId: string
  provider: string
  baseUrl: string
  models: string
  apiKeyEnv: string
  apiKey: string
  hasKey: boolean
}

export interface AILocalConnectionTest {
  ok: boolean
  message: string
}
