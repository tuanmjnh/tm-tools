import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const extractConfig = 'app/components/document-studio/operations/configs/AiExtractionConfig.vue'
const presetModal = 'app/components/document-studio/operations/configs/ExtractPresetModal.vue'
const chatRoute = 'server/api/v1/chat/models.get.ts'
const chatPage = 'app/pages/chat.vue'

describe('AI relay failure surfaces', () => {
  it('the chat catalogue filters models through the shared helper', () => {
    assert.match(read(chatRoute), /chatModelsFromCatalog/)
  })

  it('extraction shows the relay reason instead of an empty picker', () => {
    const source = read(extractConfig)
    assert.match(source, /modelsError/)
    assert.match(source, /getErrorMessage/)
    assert.match(source, /\/system\/settings\/hub/)
  })

  it('extraction retries with a forced catalogue refresh', () => {
    assert.match(read(extractConfig), /refresh=1/)
  })

  it('both surfaces point at the Hub connection page', () => {
    assert.match(read(chatPage), /\/system\/settings\/hub/)
  })
})

describe('extraction preset editor', () => {
  it('hosts a dedicated preset modal and keeps delete behind a confirm', () => {
    const source = read(extractConfig)
    assert.match(source, /ExtractPresetModal/)
    assert.match(source, /method: 'DELETE'/)
    assert.match(source, /BaseConfirmModal/)
    const modal = read(presetModal)
    assert.match(modal, /\/api\/v1\/pdf\/extract\/presets/)
    assert.match(modal, /method: 'POST'/)
    assert.match(modal, /UModal/)
  })

  it('new-preset modal offers import only, edit modal offers export only', () => {
    const modal = read(presetModal)
    // A single conditional row: import when creating, export when editing.
    assert.match(modal, /v-if="!isEditing"/)
    assert.match(modal, /v-else/)
    assert.match(modal, /pdf\.extract\.presetImport/)
    assert.match(modal, /pdf\.extract\.presetExport/)
    assert.match(modal, /function exportCurrent/)
    assert.match(modal, /function applyImported/)
    // The modal never exports the whole catalogue.
    assert.equal(/exportAllPresets|presetExportAll/.test(modal), false)
  })

  it('dropdown exports only the selected preset, never all', () => {
    const source = read(extractConfig)
    assert.match(source, /function exportSelectedPreset/)
    assert.match(source, /disabled: !selectedPreset\.value/)
    assert.equal(/exportAllPresets|presetExportAll|ALL_PRESETS_FILE_NAME/.test(source), false)
    // Bulk import into the list stays available.
    assert.match(source, /function importPresetList/)
    assert.match(source, /pickPresetFile\(\)/)
  })

  it('each surface owns exactly one JSON file picker', () => {
    for (const file of [extractConfig, presetModal]) {
      const source = read(file)
      assert.equal((source.match(/type="file"/g) || []).length, 1)
      assert.match(source, /accept="\.json,application\/json"/)
    }
  })

  it('never overwrites an existing preset while importing', () => {
    const source = read(extractConfig)
    const list = source.slice(source.indexOf('async function importPresetList'))
    assert.match(list, /mergePresets\(presets\.value, entries\)/)
    assert.equal(/method: 'DELETE'/.test(list), false)
  })
})

describe('relay error copy', () => {
  for (const locale of ['en', 'vi']) {
    it(`${locale} tells desktop users to enroll the device`, () => {
      const bundle = read(`i18n/locales/${locale}.json`)
      assert.equal(/aiRelayNotConfigured"[^\n]*NUXT_HUB_APP_SECRET/.test(bundle), false)
      assert.match(bundle, /aiRelayNotConfigured"[^\n]*(device|thiết bị)/i)
    })
  }

  it('does not claim a preset change keeps cached rows', () => {
    assert.equal(/"cacheHint": "[^"]*does not clear the cache/.test(read('i18n/locales/en.json')), false)
  })
})

describe('model check quick action', () => {
  const modelSelect = 'app/components/aiProviders/ModelSelect.vue'
  // The picker, its check button and the error popover now live in the shared
  // package; the app file is a wrapper that supplies labels and the transport.
  const sharedModelSelect = '../tm-platform/packages/tm-ui/src/ModelSelect.vue'
  const checkEndpoint = 'server/api/v1/ai/check.post.ts'

  it('provides a check endpoint backed by the AI gateway', () => {
    const source = read(checkEndpoint)
    assert.match(source, /chatWithConnection/)
    assert.match(source, /defineEventHandler/)
    assert.match(source, /latencyMs/)
  })

  it('ModelSelect renders check button with tooltip and invokes check endpoint', () => {
    const wrapper = read(modelSelect)
    assert.match(wrapper, /showCheck/)
    assert.match(wrapper, /checkModel/)
    assert.match(wrapper, /\/api\/v1\/ai\/check/)

    const shared = read(sharedModelSelect)
    assert.match(shared, /UTooltip/)
    assert.match(shared, /i-lucide-activity/)
  })

  it('parses raw 429 quota error into clean user-friendly text without JSON or URLs', async () => {
    const { parseUpstreamAiError } = await import('../../shared/utils/aiError')
    const raw = 'HTTP 429 — [{"error": {"code": 429, "message": "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \\n* Quota exceed"}}]'
    const result = parseUpstreamAiError(raw, 429)
    assert.equal(result.reasonCode, 'quota_exceeded')
    assert.equal(result.cleanMessage, 'You exceeded your current quota, please check your plan and billing details.')
    assert.equal(/https?:\/\//.test(result.cleanMessage), false)
  })

  it('ModelSelect implements timeout and hover popover when in error state', () => {
    const shared = read(sharedModelSelect)
    assert.match(shared, /checkTimeoutMs/)
    assert.match(shared, /UPopover/)
    assert.match(shared, /mode="hover"/)
    assert.match(shared, /lastRawError/)
  })

  it('parses timeout error into user-friendly text', async () => {
    const { parseUpstreamAiError } = await import('../../shared/utils/aiError')
    const result = parseUpstreamAiError('AI model check timed out after 10s', 408)
    assert.equal(result.reasonCode, 'timeout')
  })
})
