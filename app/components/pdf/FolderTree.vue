<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useDebounceFn } from '@vueuse/core'
import type { PdfFileArea, PdfFolderTreeNode } from '#shared/types/pdf'

interface Props {
  tree: PdfFolderTreeNode[]
  currentFolder: string
  area?: PdfFileArea
  loading?: boolean
  title?: string
  /** Extra key prefix for explorers that show several areas at once. */
  selectedKey?: string
  canCreate?: boolean
  /** Label of the virtual root node; defaults to the area root label. */
  rootLabel?: string
  /** Shows the folder filter above the tree. */
  searchable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  area: 'sources',
  loading: false,
  title: undefined,
  selectedKey: undefined,
  canCreate: true,
  rootLabel: undefined,
  searchable: true
})

const emit = defineEmits<{
  (e: 'select' | 'create', folderPath: string, area?: PdfFileArea): void
  (e: 'rename' | 'delete', folder: { path: string, name: string, area?: PdfFileArea }): void
  (e: 'collapse'): void
}>()

const { t } = useI18n()

const searchInput = ref('')
const query = ref('')

const applySearch = useDebounceFn(() => {
  query.value = searchInput.value.trim().toLowerCase()
}, 180)

watch(searchInput, applySearch)

function filterTree(nodes: PdfFolderTreeNode[], term: string): PdfFolderTreeNode[] {
  if (!term) return nodes
  const out: PdfFolderTreeNode[] = []
  for (const node of nodes) {
    if (node.label.toLowerCase().includes(term)) {
      out.push(node)
      continue
    }
    const children = node.children ? filterTree(node.children, term) : []
    if (children.length) out.push({ ...node, children })
  }
  return out
}

const visibleTree = computed(() => filterTree(props.tree, query.value))
const isSearching = computed(() => query.value.length > 0)

// Root virtual node wrapped around real subfolders
const rootTreeData = computed<PdfFolderTreeNode[]>(() => {
  return [
    {
      id: '',
      label: props.rootLabel ?? t('pdf.folder.root'),
      path: '',
      relativePath: '',
      fileCount: 0,
      system: true,
      children: visibleTree.value
    }
  ]
})

// Expanded ids: include root ('') and current ancestor paths
const expandedIds = ref<(string | number)[]>([''])

const selectionPath = computed(() => props.selectedKey ?? props.currentFolder)

watch(selectionPath, (key) => {
  if (!key) return
  const separator = key.indexOf(':')
  const prefix = separator >= 0 ? key.slice(0, separator + 1) : ''
  const folder = separator >= 0 ? key.slice(separator + 1) : key
  const toAdd: string[] = [prefix || '']
  let acc = ''
  for (const part of folder.split('/').filter(Boolean)) {
    acc = acc ? `${acc}/${part}` : part
    toAdd.push(`${prefix}${acc}`)
  }
  const currentSet = new Set(expandedIds.value)
  for (const id of toAdd) currentSet.add(id)
  expandedIds.value = Array.from(currentSet)
}, { immediate: true })

const selectedKeys = computed(() => [selectionPath.value])

function handleNodeClick(node: PdfFolderTreeNode) {
  emit('select', node.relativePath ?? '', node.area)
}

function isSystemRoot(node: PdfFolderTreeNode): boolean {
  return Boolean(node.system) || !node.relativePath
}

function getNodeActions(node: PdfFolderTreeNode): DropdownMenuItem[] {
  if (node.readonly) return []
  const items: DropdownMenuItem[] = [
    {
      label: t('pdf.tree.newSubfolder'),
      icon: 'i-lucide-folder-plus',
      onSelect: () => emit('create', node.relativePath ?? '', node.area)
    }
  ]

  if (!isSystemRoot(node)) {
    items.push(
      {
        label: t('pdf.actions.rename'),
        icon: 'i-lucide-pencil',
        onSelect: () => emit('rename', { path: node.relativePath, name: node.label, area: node.area })
      },
      {
        label: t('pdf.tree.deleteFolder'),
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        onSelect: () => emit('delete', { path: node.relativePath, name: node.label, area: node.area })
      }
    )
  }

  return items
}
</script>

<template>
  <div
    class="pdf-folder-tree flex flex-col h-full min-h-0 bg-white/40 dark:bg-gray-900/40 rounded-lg border border-default p-2"
  >
    <div class="flex items-center justify-between px-2 py-1.5 border-b border-default mb-2">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-folder-tree" class="size-4 text-primary-500" />
        <span class="text-xs font-semibold uppercase tracking-wider text-muted truncate">
          {{ title || t('pdf.tree.folders') }}
        </span>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <UButton
          v-if="canCreate"
          icon="i-lucide-folder-plus"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="t('pdf.folder.new')"
          :title="t('pdf.folder.new')"
          @click="emit('create', currentFolder)"
        />
        <UButton
          icon="i-lucide-panel-left-close"
          color="neutral"
          variant="ghost"
          size="xs"
          class="hidden lg:inline-flex"
          :aria-label="t('pdf.explorer.collapse')"
          :title="t('pdf.explorer.collapse')"
          @click="emit('collapse')"
        />
      </div>
    </div>

    <UInput
      v-if="searchable"
      v-model="searchInput"
      icon="i-lucide-search"
      :placeholder="t('pdf.explorer.search')"
      size="xs"
      class="mb-2"
    >
      <template v-if="searchInput" #trailing>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="link"
          size="xs"
          :aria-label="t('pdf.explorer.clearSearch')"
          @click="searchInput = ''"
        />
      </template>
    </UInput>

    <div class="flex-1 min-h-0 overflow-y-auto pr-1">
      <p v-if="isSearching && visibleTree.length === 0" class="px-2 py-3 text-xs text-muted">
        {{ t('pdf.explorer.noMatch') }}
      </p>
      <SharedHeTreeMenu
        :model-value="rootTreeData"
        :expanded-ids="expandedIds"
        :selected-keys="selectedKeys"
        :draggable="false"
        card-clickable
        :field-names="{ id: 'id', label: 'label', children: 'children' }"
        :default-expand-all="true"
        class-node="mb-1 py-1 px-2 cursor-pointer transition-colors"
        :action-options="getNodeActions"
        @node:click="handleNodeClick"
        @update:expanded-ids="val => expandedIds = val"
      >
        <template #icon="{ node }">
          <UTooltip v-if="isSystemRoot(node)" :text="t('pdf.tree.systemRootHint')">
            <UIcon
              name="i-lucide-folder-lock"
              class="size-4 shrink-0"
              :class="node.id === selectionPath ? 'text-primary-600 dark:text-primary-400' : 'text-sky-600/80 dark:text-sky-400/80'"
            />
          </UTooltip>
          <UIcon
            v-else
            name="i-lucide-folder"
            class="size-4 shrink-0"
            :class="node.id === selectionPath ? 'text-primary-600 dark:text-primary-400' : 'text-amber-500'"
          />
        </template>

        <template #title="{ node }">
          <div class="flex items-center justify-between gap-1 w-full min-w-0">
            <span
              class="text-xs font-medium truncate"
              :class="node.id === selectionPath ? 'text-primary-600 dark:text-primary-400 font-semibold' : 'text-foreground'"
            >
              {{ node.label }}
            </span>
          </div>
        </template>

        <template #actions="{ node }">
          <UDropdownMenu v-if="getNodeActions(node).length" :items="getNodeActions(node)">
            <UButton
              icon="i-lucide-more-vertical"
              color="neutral"
              variant="ghost"
              size="xs"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
              @click.stop
            />
          </UDropdownMenu>
        </template>

        <template #last-item>
          <div class="h-4" />
        </template>
      </SharedHeTreeMenu>
    </div>
  </div>
</template>
