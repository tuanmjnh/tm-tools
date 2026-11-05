<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: string
  maxLength?: number
}>(), {
  modelValue: '',
  maxLength: 16000
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { t } = useI18n()
const notify = useNotify()

type ViewMode = 'split' | 'edit' | 'preview'
const mode = ref<ViewMode>('split')

const sampleText = computed({
  get: () => props.modelValue,
  set: (val: string) => emit('update:modelValue', val)
})

// Quick Templates
const QUICK_TEMPLATES = [
  {
    key: 'table',
    label: 'Bảng Markdown',
    icon: 'i-lucide-table',
    template: `| STT | Tên sản phẩm | Mã / Biến thể | ĐVT | Đơn giá | Quy cách / Ghi chú |
|---|---|---|---|---|---|
| 1 | Sơn lót chống kiềm ngoại thất | Thùng 18L | Thùng | 1.850.000 | Độ phủ 100-120 m² |
| 2 | Sơn lót chống kiềm ngoại thất | Lon 5L | Lon | 550.000 | Độ phủ 30-35 m² |
| 3 | Sơn bóng ngoại thất cao cấp | Trắng sứ (18L) | Thùng | 2.650.000 | Bảo hành 8 năm |`
  },
  {
    key: 'json',
    label: 'Cấu trúc JSON',
    icon: 'i-lucide-braces',
    template: JSON.stringify([
      {
        name: 'Sơn lót chống kiềm cao cấp',
        code: 'SL-CK-01',
        unit: 'Thùng',
        price: 1850000,
        variants: ['Thùng 18L', 'Lon 5L'],
        notes: 'Chống kiềm hóa, chống ố vàng'
      },
      {
        name: 'Sơn bóng ngoại thất cao cấp',
        code: 'SB-EXT-02',
        unit: 'Thùng',
        price: 2650000,
        variants: ['Thùng 18L'],
        notes: 'Bảo hành màu 8 năm'
      }
    ], null, 2)
  },
  {
    key: 'list',
    label: 'Danh sách dòng',
    icon: 'i-lucide-list',
    template: `• Tên sản phẩm: Sơn chống thấm đa năng pha xi măng
  - Quy cách: Thùng 20kg (giá: 1.450.000đ) | Thùng 5kg (giá: 420.000đ)
  - Đặc tính: Bám dính cao, ngăn nước thấm ngược

• Tên sản phẩm: Bột trét tường ngoại thất
  - Quy cách: Bao 40kg (giá: 320.000đ)
  - Tiêu chuẩn: 1kg trét được 1 - 1.2 m²`
  }
]

function applyTemplate(template: string) {
  sampleText.value = template
  notify.success(t('global.copied'), '')
}

function formatJson() {
  try {
    const parsed = JSON.parse(sampleText.value)
    sampleText.value = JSON.stringify(parsed, null, 2)
    notify.success('JSON đã định dạng chuẩn', '')
  } catch {
    notify.warning('Không thể định dạng', 'Nội dung không phải là JSON hợp lệ')
  }
}

function clearContent() {
  sampleText.value = ''
}

// Auto detect format for preview
interface ParsedMarkdownTable {
  headers: string[]
  rows: string[][]
}

const detectedFormat = computed<'markdown_table' | 'json' | 'text'>(() => {
  const text = sampleText.value.trim()
  if (!text) return 'text'
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    return 'json'
  }
  if (text.includes('|') && text.split('\n').some(line => /^\s*\|?\s*[-:]+[-| :]*\|?\s*$/.test(line))) {
    return 'markdown_table'
  }
  return 'text'
})

// Parse JSON preview
const parsedJson = computed<{ valid: boolean, data?: unknown, error?: string }>(() => {
  if (detectedFormat.value !== 'json') return { valid: false }
  try {
    return { valid: true, data: JSON.parse(sampleText.value) }
  } catch (e: unknown) {
    return { valid: false, error: (e as Error).message }
  }
})

// Parse Markdown Table preview
const parsedTable = computed<ParsedMarkdownTable | null>(() => {
  if (detectedFormat.value !== 'markdown_table') return null
  const lines = sampleText.value.split('\n').map(l => l.trim()).filter(Boolean)
  const sepIndex = lines.findIndex(line => /^\s*\|?\s*[-:]+[-| :]*\|?\s*$/.test(line))
  if (sepIndex <= 0) return null

  const parseRow = (line: string) => {
    return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
  }

  const headerLine = lines[sepIndex - 1]
  if (!headerLine) return null

  const headers = parseRow(headerLine)
  const rows: string[][] = []

  for (let i = sepIndex + 1; i < lines.length; i++) {
    const rowLine = lines[i]
    if (rowLine && rowLine.includes('|')) {
      rows.push(parseRow(rowLine))
    }
  }

  return { headers, rows }
})
</script>

<template>
  <div class="flex flex-col border border-default rounded-(--ui-radius) overflow-hidden bg-default">
    <!-- Top Bar with Mode and Quick Actions -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-default px-3 py-2 bg-elevated/40 text-xs">
      <!-- Left: Quick insert templates -->
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="text-muted text-[11px] font-medium mr-1 select-none">Mẫu nhanh:</span>
        <UButton
          v-for="tmpl in QUICK_TEMPLATES"
          :key="tmpl.key"
          :icon="tmpl.icon"
          :label="tmpl.label"
          color="neutral"
          variant="ghost"
          size="xs"
          class="text-xs"
          @click="applyTemplate(tmpl.template)"
        />
        <UButton
          v-if="detectedFormat === 'json'"
          icon="i-lucide-code"
          label="Định dạng JSON"
          color="primary"
          variant="ghost"
          size="xs"
          class="text-xs"
          @click="formatJson"
        />
      </div>

      <!-- Right: View Mode Toggle -->
      <div class="flex items-center gap-1">
        <div class="inline-flex rounded-(--ui-radius) border border-default p-0.5 bg-elevated">
          <button
            type="button"
            class="px-2 py-1 text-[11px] font-medium rounded-(--ui-radius) transition-colors"
            :class="mode === 'split' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted hover:text-default'"
            @click="mode = 'split'"
          >
            <UIcon name="i-lucide-columns-2" class="size-3.5 mr-1 inline" />
            <span class="hidden sm:inline">Song song</span>
          </button>
          <button
            type="button"
            class="px-2 py-1 text-[11px] font-medium rounded-(--ui-radius) transition-colors"
            :class="mode === 'edit' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted hover:text-default'"
            @click="mode = 'edit'"
          >
            <UIcon name="i-lucide-pen-line" class="size-3.5 mr-1 inline" />
            <span>Soạn thảo</span>
          </button>
          <button
            type="button"
            class="px-2 py-1 text-[11px] font-medium rounded-(--ui-radius) transition-colors"
            :class="mode === 'preview' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted hover:text-default'"
            @click="mode = 'preview'"
          >
            <UIcon name="i-lucide-eye" class="size-3.5 mr-1 inline" />
            <span>Trực quan</span>
          </button>
        </div>

        <UButton
          v-if="sampleText"
          icon="i-lucide-trash"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          title="Xóa trắng"
          @click="clearContent"
        />
      </div>
    </div>

    <!-- Main Workspace Container -->
    <div
      class="grid min-h-[280px] max-h-[460px] overflow-hidden"
      :class="{
        'grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-default': mode === 'split',
        'grid-cols-1': mode === 'edit' || mode === 'preview'
      }"
    >
      <!-- LEFT: Editor Pane -->
      <div
        v-show="mode === 'split' || mode === 'edit'"
        class="flex flex-col min-h-0 bg-elevated/10 overflow-hidden"
      >
        <div class="flex items-center justify-between px-3 py-1.5 border-b border-default/50 bg-elevated/20 text-[11px] text-muted">
          <span class="font-medium">Nội dung soạn thảo</span>
          <span class="mono">{{ sampleText.length }} / {{ maxLength }} ký tự</span>
        </div>
        <textarea
          v-model="sampleText"
          :maxlength="maxLength"
          rows="12"
          class="w-full flex-1 p-3 font-mono text-xs leading-relaxed bg-transparent resize-none border-0 focus:outline-none focus:ring-0 text-default placeholder:text-dimmed"
          placeholder="Nhập hoặc dán bảng Markdown, dữ liệu JSON hoặc danh sách mẫu phân đoạn để AI nhận diện cách đặt tên & phân nhóm..."
        />
      </div>

      <!-- RIGHT: Visual Live Preview Pane -->
      <div
        v-show="mode === 'split' || mode === 'preview'"
        class="flex flex-col min-h-0 bg-elevated/30 overflow-hidden"
      >
        <div class="flex items-center justify-between px-3 py-1.5 border-b border-default/50 bg-elevated/50 text-[11px]">
          <span class="font-medium flex items-center gap-1.5 text-primary">
            <UIcon name="i-lucide-sparkles" class="size-3.5" />
            Xem trước trực quan
          </span>
          <UBadge
            color="neutral"
            variant="subtle"
            size="sm"
            class="text-[10px] uppercase font-mono"
          >
            {{ detectedFormat === 'markdown_table' ? 'Bảng Markdown' : detectedFormat === 'json' ? 'Dữ liệu JSON' : 'Văn bản mẫu' }}
          </UBadge>
        </div>

        <div class="flex-1 min-h-0 overflow-auto p-3">
          <!-- Empty state -->
          <div v-if="!sampleText.trim()" class="flex flex-col items-center justify-center h-full text-center p-8 text-muted">
            <UIcon name="i-lucide-eye" class="size-8 text-dimmed mb-2 stroke-1" />
            <p class="text-xs font-medium">
              Chưa có mẫu tham khảo
            </p>
            <p class="text-[11px] text-muted max-w-xs mt-1">
              Nhập nội dung ở khung bên trái hoặc nhấn một trong các "Mẫu nhanh" phía trên để xem trước.
            </p>
          </div>

          <!-- Format 1: Render Markdown Table -->
          <div v-else-if="detectedFormat === 'markdown_table' && parsedTable" class="w-full overflow-x-auto">
            <table class="border-collapse text-xs w-full min-w-max border border-default rounded-(--ui-radius) overflow-hidden shadow-xs">
              <thead class="bg-elevated border-b border-default">
                <tr>
                  <th
                    v-for="(h, idx) in parsedTable.headers"
                    :key="idx"
                    class="px-2.5 py-1.5 text-start font-semibold text-highlighted border-r border-default last:border-r-0 whitespace-nowrap bg-elevated"
                  >
                    {{ h }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default/60 bg-default">
                <tr
                  v-for="(r, rIdx) in parsedTable.rows"
                  :key="rIdx"
                  class="odd:bg-elevated/20 hover:bg-primary/5 transition-colors"
                >
                  <td
                    v-for="(col, cIdx) in r"
                    :key="cIdx"
                    class="px-2.5 py-1.5 border-r border-default/50 last:border-r-0 text-default whitespace-nowrap"
                  >
                    {{ col }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Format 2: Render JSON Data -->
          <div v-else-if="detectedFormat === 'json'" class="space-y-3">
            <div v-if="!parsedJson.valid" class="p-3 rounded-(--ui-radius) bg-error/10 border border-error/20 text-xs text-error">
              <div class="flex items-center gap-1.5 font-medium mb-1">
                <UIcon name="i-lucide-alert-circle" class="size-4 shrink-0" />
                Cú pháp JSON chưa đúng
              </div>
              <p class="font-mono text-[11px] opacity-90">
                {{ parsedJson.error }}
              </p>
            </div>

            <div v-else-if="Array.isArray(parsedJson.data)" class="grid gap-2">
              <div
                v-for="(item, idx) in parsedJson.data"
                :key="idx"
                class="panel p-2.5 rounded-(--ui-radius) space-y-1.5 border border-default bg-elevated/40"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="font-medium text-xs text-highlighted truncate">
                    {{ item.name || item.title || `Mục #${idx + 1}` }}
                  </span>
                  <UBadge
                    v-if="item.price"
                    color="primary"
                    variant="soft"
                    size="sm"
                    class="mono font-semibold"
                  >
                    {{ typeof item.price === 'number' ? item.price.toLocaleString('vi-VN') + ' đ' : item.price }}
                  </UBadge>
                </div>

                <div v-if="item.variants && Array.isArray(item.variants)" class="flex flex-wrap gap-1 items-center pt-1">
                  <span class="text-[10px] text-muted">Biến thể:</span>
                  <UBadge
                    v-for="(v, vIdx) in item.variants"
                    :key="vIdx"
                    color="neutral"
                    variant="subtle"
                    size="xs"
                    class="text-[10px]"
                  >
                    {{ v }}
                  </UBadge>
                </div>

                <div v-if="item.code || item.unit || item.notes" class="text-[11px] text-muted flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
                  <span v-if="item.code"><strong class="font-normal text-dimmed">Mã:</strong> {{ item.code }}</span>
                  <span v-if="item.unit"><strong class="font-normal text-dimmed">ĐVT:</strong> {{ item.unit }}</span>
                  <span v-if="item.notes" class="truncate italic">{{ item.notes }}</span>
                </div>
              </div>
            </div>

            <!-- Single JSON Object -->
            <div v-else class="panel p-3 rounded-(--ui-radius) space-y-1 border border-default bg-elevated/40">
              <div
                v-for="(val, key) in (parsedJson.data as Record<string, unknown>)"
                :key="String(key)"
                class="flex items-start justify-between gap-2 py-0.5 border-b border-default/40 last:border-b-0 text-xs"
              >
                <span class="font-mono text-dimmed text-[11px]">{{ key }}:</span>
                <span class="font-medium text-end text-highlighted">{{ String(val) }}</span>
              </div>
            </div>
          </div>

          <!-- Format 3: Plain text / bullet lines formatted -->
          <div v-else class="space-y-1.5 font-mono text-xs leading-relaxed text-default whitespace-pre-wrap p-1">
            {{ sampleText }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
