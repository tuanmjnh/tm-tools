<script setup lang="ts">
import { formatTimeAgo } from '@vueuse/core'
import type { DropdownMenuItem } from '@nuxt/ui'
import { CONVERSATION_COLORS, type ConversationColor } from '#shared/utils/chat'
import type { ConversationItem } from '~/types/chat'
import { CONVERSATION_COLOR_DOT_CLASS, CONVERSATION_COLOR_ICON_CLASS } from '~/utils/chat'

// Shared conversation history list. Used by both the desktop sidebar and the
// mobile slideover, so the two surfaces cannot drift apart.
defineProps<{
  conversations: ConversationItem[]
  loading: boolean
  currentId: string | null
}>()

const emit = defineEmits<{
  (e: 'select' | 'remove', id: string): void
  (e: 'rename', conversation: ConversationItem): void
  (e: 'archive', conversation: ConversationItem, archived: boolean): void
  (e: 'color', conversation: ConversationItem, color: ConversationColor): void
}>()

const { t } = useI18n()

function menuItems(conv: ConversationItem): DropdownMenuItem[][] {
  const colorItems: DropdownMenuItem[] = CONVERSATION_COLORS.map(color => ({
    label: t(`chat.colors.${color}`),
    icon: conv.color === color ? 'i-lucide-circle-dot' : 'i-lucide-circle',
    ui: { itemLeadingIcon: CONVERSATION_COLOR_ICON_CLASS[color] },
    onSelect: () => emit('color', conv, color)
  }))

  return [
    [{ label: t('chat.rename'), icon: 'i-lucide-pencil', onSelect: () => emit('rename', conv) }],
    [{
      label: conv.archived ? t('chat.unarchive') : t('chat.archive'),
      icon: conv.archived ? 'i-lucide-archive-restore' : 'i-lucide-archive',
      onSelect: () => emit('archive', conv, !conv.archived)
    }],
    [{ label: t('chat.color'), icon: 'i-lucide-palette', children: colorItems }],
    [{ label: t('chat.deleteChat'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => emit('remove', conv.id) }]
  ]
}
</script>

<template>
  <div class="flex-1 overflow-y-auto p-2 space-y-1">
    <div v-if="loading" class="flex flex-col gap-2 p-3">
      <USkeleton v-for="i in 5" :key="i" class="h-10 w-full rounded-lg" />
    </div>

    <div
      v-else-if="conversations.length === 0"
      class="flex flex-col items-center justify-center p-6 text-center text-muted"
    >
      <UIcon name="i-lucide-message-square-dashed" class="text-3xl mb-2 text-dimmed" />
      <p class="text-xs">
        {{ t('chat.noConversations') }}
      </p>
    </div>

    <UContextMenu v-for="conv in conversations" :key="conv.id" :items="menuItems(conv)">
      <div
        class="group relative flex items-center gap-2 p-2.5 rounded-lg text-sm transition-all cursor-pointer"
        :class="[
          currentId === conv.id
            ? 'bg-primary/10 text-primary font-medium'
            : 'hover:bg-(--ui-bg-elevated) text-muted hover:text-foreground',
          conv.archived ? 'opacity-60' : ''
        ]"
        @click="emit('select', conv.id)"
      >
        <span class="w-2 h-2 rounded-full shrink-0" :class="CONVERSATION_COLOR_DOT_CLASS[conv.color]" />

        <div class="flex-1 min-w-0 flex flex-col">
          <span class="flex items-center gap-1 min-w-0">
            <UIcon v-if="conv.archived" name="i-lucide-archive" class="shrink-0 text-[10px] text-dimmed" />
            <span class="truncate text-xs font-medium">{{ conv.title }}</span>
          </span>
          <span class="text-[10px] text-dimmed">{{ formatTimeAgo(new Date(conv.lastMessageAt)) }}</span>
        </div>

        <UDropdownMenu :items="menuItems(conv)" :content="{ align: 'end' }">
          <UButton
            class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0"
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('common.more')"
            @click.stop
          />
        </UDropdownMenu>
      </div>
    </UContextMenu>
  </div>
</template>
