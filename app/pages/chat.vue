<script setup lang="ts">
import { getErrorMessage } from '~/shared/utils/errors'
import type { DropdownMenuItem } from '@nuxt/ui'
import {
  CHAT_ATTACHMENT_IMAGE_LIMIT,
  CHAT_ATTACHMENT_LIMIT,
  CHAT_ATTACHMENT_TEXT_LIMIT,
  type ConversationColor
} from '#shared/utils/chat'
import type { ChatAttachment } from '#shared/types/chat'
import type { HeaderAction } from '~/components/base/HeaderActions.vue'
import type { AvailableModel, ChatMessage, ConversationItem, SendMessageResponse } from '~/types/chat'
import { isTextFile } from '~/utils/chat'

const { t } = useI18n()
const notify = useNotify()
const { copy } = useClipboard()
const { uploadToCloudinary } = useCloudinary()

const title = computed(() => t('chat.title'))
const description = computed(() => t('chat.description'))

// Mobile bar
const mobileBar = useMobileBar()

// State
const availableModels = ref<AvailableModel[]>([])
const selectedModelKey = ref<string>('') // format: `${connectionId}:${modelId}`
const conversations = ref<ConversationItem[]>([])
const currentConversationId = ref<string | null>(null)
const messages = ref<ChatMessage[]>([])
const promptInput = ref('')
const systemPrompt = ref('')
const showSystemPrompt = ref(false)
const attachments = ref<ChatAttachment[]>([])
const attachmentInput = ref<HTMLInputElement | null>(null)

const loadingModels = ref(false)
const loadingConversations = ref(false)
const loadingMessages = ref(false)
const loadingOlderMessages = ref(false)
const sending = ref(false)
const uploadingAttachment = ref(false)
const modelsError = ref('')
const sendError = ref('')
const lastFailedPrompt = ref('')

const MESSAGE_PAGE_SIZE = PAGE_SIZE.default
const hasOlderMessages = ref(false)
const olderCursor = ref<string | null>(null)

// Confirm Delete Modal
const confirmModalOpen = ref(false)
const deletingConvId = ref<string | null>(null)
const confirmModalTitle = ref('')
const confirmModalDesc = ref('')
const isDeleting = ref(false)

// Rename Modal
const renameModalOpen = ref(false)
const renamingConversation = ref<ConversationItem | null>(null)
const renameInput = ref('')
const isRenaming = ref(false)

// Mobile conversation drawer (the sidebar is desktop-only)
const historyOpen = ref(false)

// Messages container auto-scroll
const scrollContainer = ref<HTMLElement | null>(null)

function scrollToBottom(smooth = true) {
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTo({
        top: scrollContainer.value.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      })
    }
  })
}

const selectedModel = computed<AvailableModel | null>(() => {
  if (!selectedModelKey.value) return null
  const [connId, ...rest] = selectedModelKey.value.split(':')
  const modelId = rest.join(':')
  return availableModels.value.find(m => m.connectionId === connId && m.modelId === modelId) || null
})

const canSend = computed(() =>
  (promptInput.value.trim().length > 0 || attachments.value.length > 0)
  && !sending.value
  && !loadingMessages.value)

// Fetch available models
async function fetchModels() {
  loadingModels.value = true
  modelsError.value = ''
  try {
    const res = await $fetch<{ success: boolean, data: AvailableModel[] }>('/api/v1/chat/models')
    availableModels.value = Array.isArray(res?.data) ? res.data : []
    const currentStillValid = availableModels.value.some(
      model => `${model.connectionId}:${model.modelId}` === selectedModelKey.value
    )
    if (!currentStillValid) {
      const primary = availableModels.value.find(model => model.isPrimary) ?? availableModels.value[0]
      selectedModelKey.value = primary ? `${primary.connectionId}:${primary.modelId}` : ''
    }
  } catch (err: unknown) {
    modelsError.value = getErrorMessage(err, key => t(key))
  } finally {
    loadingModels.value = false
  }
}

// Fetch user conversations
async function fetchConversations() {
  loadingConversations.value = true
  try {
    const res = await $fetch<{ success: boolean, data: ConversationItem[] }>('/api/v1/chat/conversations')
    conversations.value = Array.isArray(res?.data) ? res.data : []
  } catch (err: unknown) {
    notify.error(getErrorMessage(err, key => t(key)))
  } finally {
    loadingConversations.value = false
  }
}

async function refreshAll() {
  await Promise.all([fetchModels(), fetchConversations()])
}

// Select a conversation
async function selectConversation(convId: string) {
  if (sending.value) return
  historyOpen.value = false
  currentConversationId.value = convId
  sendError.value = ''
  lastFailedPrompt.value = ''
  loadingMessages.value = true
  hasOlderMessages.value = false
  olderCursor.value = null
  try {
    const res = await $fetch<{
      success: boolean
      data: {
        messages: ChatMessage[]
        model: string
        connectionId: string
        hasMore?: boolean
        nextCursor?: string | null
      }
    }>(`/api/v1/chat/conversations/${convId}?limit=${MESSAGE_PAGE_SIZE}`)
    if (res?.success && res.data) {
      messages.value = res.data.messages || []
      hasOlderMessages.value = res.data.hasMore === true
      olderCursor.value = res.data.nextCursor ?? null
      const matchedKey = `${res.data.connectionId}:${res.data.model}`
      if (availableModels.value.some(m => `${m.connectionId}:${m.modelId}` === matchedKey)) {
        selectedModelKey.value = matchedKey
      }
      scrollToBottom(false)
    }
  } catch (err: unknown) {
    notify.error(getErrorMessage(err, key => t(key)))
  } finally {
    loadingMessages.value = false
  }
}

// Prepend the previous page while keeping the reading position anchored.
async function loadOlderMessages() {
  const conversationId = currentConversationId.value
  const cursor = olderCursor.value
  if (!conversationId || !cursor || !hasOlderMessages.value || loadingOlderMessages.value || loadingMessages.value) {
    return
  }

  const container = scrollContainer.value
  const previousHeight = container?.scrollHeight ?? 0
  const previousTop = container?.scrollTop ?? 0

  loadingOlderMessages.value = true
  try {
    const res = await $fetch<{
      success: boolean
      data: {
        messages: ChatMessage[]
        hasMore?: boolean
        nextCursor?: string | null
      }
    }>(`/api/v1/chat/conversations/${conversationId}?limit=${MESSAGE_PAGE_SIZE}&before=${encodeURIComponent(cursor)}`)

    if (currentConversationId.value !== conversationId) return
    if (res?.success && res.data) {
      const loaded = new Set(messages.value.map(m => m.id))
      const older = (res.data.messages || []).filter(m => !loaded.has(m.id))
      if (older.length) messages.value = [...older, ...messages.value]
      hasOlderMessages.value = res.data.hasMore === true
      olderCursor.value = res.data.nextCursor ?? null
      await nextTick()
      if (container) {
        container.scrollTop = container.scrollHeight - previousHeight + previousTop
      }
    }
  } catch (err: unknown) {
    notify.error(getErrorMessage(err, key => t(key)))
  } finally {
    loadingOlderMessages.value = false
  }
}

function handleMessagesScroll() {
  const container = scrollContainer.value
  if (!container || container.scrollTop > 80) return
  void loadOlderMessages()
}

// Start a new chat
function startNewChat() {
  if (sending.value) return
  historyOpen.value = false
  currentConversationId.value = null
  messages.value = []
  promptInput.value = ''
  attachments.value = []
  sendError.value = ''
  lastFailedPrompt.value = ''
  hasOlderMessages.value = false
  olderCursor.value = null
}

// Attachments
function triggerAttachmentPicker() {
  attachmentInput.value?.click()
}

function removeAttachment(index: number) {
  attachments.value.splice(index, 1)
}

function warnAttachment(key: string, name: string) {
  notify.warning(t(key, { name }))
}

async function handleAttachmentSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) return

  uploadingAttachment.value = true
  try {
    for (const file of files) {
      if (attachments.value.length >= CHAT_ATTACHMENT_LIMIT) {
        notify.warning(t('chat.attachmentLimit', { limit: CHAT_ATTACHMENT_LIMIT }))
        break
      }

      if (isTextFile(file)) {
        if (file.size > CHAT_ATTACHMENT_TEXT_LIMIT) {
          warnAttachment('chat.attachmentTooLarge', file.name)
          continue
        }
        try {
          const content = await file.text()
          attachments.value.push({
            name: file.name,
            type: file.type,
            size: file.size,
            kind: 'text',
            content: content.slice(0, CHAT_ATTACHMENT_TEXT_LIMIT)
          })
        } catch {
          warnAttachment('chat.attachmentUnsupported', file.name)
        }
        continue
      }

      if (file.type.startsWith('image/')) {
        if (file.size > CHAT_ATTACHMENT_IMAGE_LIMIT) {
          warnAttachment('chat.attachmentTooLarge', file.name)
          continue
        }
        try {
          const uploaded = await uploadToCloudinary(file, 'chat')
          if (!uploaded.secure_url) throw new Error('Missing upload URL')
          attachments.value.push({
            name: file.name,
            type: file.type,
            size: file.size,
            kind: 'image',
            url: uploaded.secure_url
          })
        } catch {
          warnAttachment('chat.attachmentUploadFailed', file.name)
        }
        continue
      }

      warnAttachment('chat.attachmentUnsupported', file.name)
    }
  } finally {
    uploadingAttachment.value = false
  }
}

// Send message
async function handleSendMessage() {
  const content = promptInput.value.trim()
  if ((!content && attachments.value.length === 0) || sending.value) return

  if (!selectedModel.value) {
    notify.warning(t('chat.noModels'))
    return
  }

  const outgoingAttachments = attachments.value.length ? attachments.value.map(item => ({ ...item })) : undefined

  // Optimistic UI for user message
  const userMsg: ChatMessage = {
    id: `temp-${Date.now()}`,
    role: 'user',
    content,
    attachments: outgoingAttachments,
    createdAt: new Date(),
    model: selectedModel.value.modelId,
    connectionId: selectedModel.value.connectionId
  }
  messages.value.push(userMsg)
  promptInput.value = ''
  sending.value = true
  sendError.value = ''
  lastFailedPrompt.value = ''
  scrollToBottom(true)

  try {
    const res = await $fetch<{
      success: boolean
      data: SendMessageResponse
    }>('/api/v1/chat/message', {
      method: 'POST',
      body: {
        conversationId: currentConversationId.value || undefined,
        connectionId: selectedModel.value.connectionId,
        model: selectedModel.value.modelId,
        message: content,
        attachments: outgoingAttachments,
        systemPrompt: systemPrompt.value.trim() || undefined
      }
    })

    if (res?.success && res.data) {
      currentConversationId.value = res.data.conversationId
      attachments.value = []
      // Replace last temp message and push assistant response
      messages.value.splice(messages.value.length - 1, 1, res.data.userMessage, res.data.assistantMessage)
      scrollToBottom(true)
      // Refresh conversation list in sidebar
      await fetchConversations()
    }
  } catch (err: unknown) {
    // The turn was never stored server-side, so drop the optimistic bubble and
    // hand the text back instead of leaving a phantom message in the thread.
    messages.value = messages.value.filter(entry => entry.id !== userMsg.id)
    lastFailedPrompt.value = content
    sendError.value = getErrorMessage(err, key => t(key))
  } finally {
    sending.value = false
  }
}

function retrySend() {
  if (!lastFailedPrompt.value || sending.value) return
  promptInput.value = lastFailedPrompt.value
  sendError.value = ''
  lastFailedPrompt.value = ''
  void handleSendMessage()
}

// Quick prompt click
function applyQuickPrompt(promptText: string) {
  promptInput.value = promptText
}

// Copy message
async function copyMessage(msg: ChatMessage) {
  await copy(msg.content)
  notify.success(t('chat.copied'))
}

function messageMenuItems(msg: ChatMessage): DropdownMenuItem[][] {
  return [[
    { label: t('chat.copy'), icon: 'i-lucide-copy', disabled: !msg.content, onSelect: () => copyMessage(msg) }
  ]]
}

// Conversation metadata
async function patchConversation(id: string, body: Record<string, unknown>) {
  return await $fetch(`/api/v1/chat/conversations/${id}`, { method: 'PATCH', body })
}

function openRename(conversation: ConversationItem) {
  renamingConversation.value = conversation
  renameInput.value = conversation.title
  renameModalOpen.value = true
}

async function handleConfirmRename() {
  const conversation = renamingConversation.value
  const nextTitle = renameInput.value.trim()
  if (!conversation || !nextTitle) return

  isRenaming.value = true
  try {
    await patchConversation(conversation.id, { title: nextTitle })
    conversation.title = nextTitle
    notify.success(t('chat.renamed'))
    renameModalOpen.value = false
    renamingConversation.value = null
  } catch (err: unknown) {
    notify.error(getErrorMessage(err, key => t(key)))
  } finally {
    isRenaming.value = false
  }
}

async function handleArchive(conversation: ConversationItem, archived: boolean) {
  try {
    await patchConversation(conversation.id, { archived })
    notify.success(archived ? t('chat.archived') : t('chat.unarchived'))
    await fetchConversations()
  } catch (err: unknown) {
    notify.error(getErrorMessage(err, key => t(key)))
  }
}

async function handleColor(conversation: ConversationItem, color: ConversationColor) {
  if (conversation.color === color) return
  const previous = conversation.color
  conversation.color = color
  try {
    await patchConversation(conversation.id, { color })
  } catch (err: unknown) {
    conversation.color = previous
    notify.error(getErrorMessage(err, key => t(key)))
  }
}

// Delete conversation confirmation
function openDeleteConfirm(convId: string) {
  deletingConvId.value = convId
  confirmModalTitle.value = t('chat.deleteChat')
  confirmModalDesc.value = t('chat.confirmDelete')
  confirmModalOpen.value = true
}

async function handleConfirmDelete() {
  if (!deletingConvId.value) return
  isDeleting.value = true
  try {
    await $fetch(`/api/v1/chat/conversations/${deletingConvId.value}`, {
      method: 'DELETE'
    })
    notify.success(t('chat.deleted'))
    if (currentConversationId.value === deletingConvId.value) {
      startNewChat()
    }
    await fetchConversations()
    confirmModalOpen.value = false
  } catch (err: unknown) {
    notify.error(getErrorMessage(err, key => t(key)))
  } finally {
    isDeleting.value = false
    deletingConvId.value = null
  }
}

const headerActions = computed<HeaderAction[]>(() => [
  {
    key: 'new-chat',
    icon: 'i-lucide-plus',
    label: t('chat.newChat'),
    color: 'primary',
    variant: 'soft',
    primary: true,
    onSelect: startNewChat
  },
  {
    key: 'refresh',
    icon: 'i-lucide-refresh-cw',
    label: t('common.refresh'),
    disabled: loadingModels.value || loadingConversations.value,
    onSelect: refreshAll
  },
  {
    key: 'system-instructions',
    icon: 'i-lucide-sliders',
    label: t('chat.systemPrompt'),
    onSelect: () => {
      showSystemPrompt.value = !showSystemPrompt.value
    }
  },
  {
    key: 'configure-ai',
    icon: 'i-lucide-cpu',
    label: t('chat.configureAi'),
    onSelect: () => navigateTo('/system/ai-keys')
  }
])

// Register mobile bar actions
mobileBar.registerActions(computed(() => [
  {
    icon: 'i-lucide-plus',
    label: t('chat.newChat'),
    primary: true,
    color: 'primary' as const,
    onSelect: startNewChat
  },
  {
    icon: 'i-lucide-refresh-cw',
    label: t('common.refresh'),
    onSelect: refreshAll
  },
  {
    icon: 'i-lucide-sliders',
    label: t('chat.systemPrompt'),
    onSelect: () => {
      showSystemPrompt.value = !showSystemPrompt.value
    }
  },
  {
    icon: 'i-lucide-cpu',
    label: t('chat.configureAi'),
    onSelect: () => navigateTo('/system/ai-keys')
  }
]))

mobileBar.registerInfo(computed(() => ({
  count: conversations.value.length,
  loading: loadingConversations.value || loadingModels.value
})))

onMounted(async () => {
  await refreshAll()
})
</script>

<template>
  <BasePage id="ai-chat" :title="title" :description="description" :flush="true">
    <template #right>
      <BaseHeaderActions :actions="headerActions" :max-inline="1" />
    </template>

    <div class="flex flex-1 min-h-0 overflow-hidden bg-background">
      <!-- SIDEBAR: Conversation History -->
      <aside
        class="hidden md:flex flex-col min-h-0 w-72 lg:w-80 border-r border-(--ui-border) bg-(--ui-bg-muted)/30 shrink-0 select-none">
        <div class="px-3 py-4 border-b border-(--ui-border) flex items-center justify-between shrink-0">
          <span class="text-xs font-medium text-muted">{{ t('chat.conversations') }}</span>
          <span class="text-[10px] text-dimmed">{{ conversations.length }}</span>
        </div>

        <!-- Conversations List -->
        <ChatConversationList :conversations="conversations" :loading="loadingConversations"
          :current-id="currentConversationId" @select="selectConversation" @remove="openDeleteConfirm"
          @rename="openRename" @archive="handleArchive" @color="handleColor" />

        <!-- Bottom Link to Settings -->
        <div class="p-3 border-t border-(--ui-border) text-xs flex items-center justify-between text-muted shrink-0">
          <span class="flex items-center gap-1.5 font-medium">
            <UIcon name="i-lucide-database" class="text-sm text-dimmed" />
            {{ t('chat.storageBadge') }}
          </span>
          <NuxtLink to="/system/ai-keys" class="hover:text-primary transition-colors flex items-center gap-1">
            <UIcon name="i-lucide-external-link" class="text-xs" />
            <span>{{ t('nav.ai_keys') }}</span>
          </NuxtLink>
        </div>
      </aside>

      <!-- MAIN CHAT AREA -->
      <main class="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden relative">
        <!-- Top Toolbar: Model Selector & Status -->
        <header
          class="px-4 py-2.5 border-b border-(--ui-border) bg-(--ui-bg)/60 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
          <div class="flex items-center gap-2 min-w-0">
            <!-- Mobile sidebar trigger -->
            <UButton class="md:hidden" icon="i-lucide-history" color="neutral" variant="ghost" size="sm"
              :aria-label="t('chat.conversations')" @click="historyOpen = true" />

            <div class="flex items-center gap-2 min-w-0">
              <span class="text-xs text-muted hidden sm:inline">{{ t('chat.selectModel') }}:</span>
              <AiProvidersModelSelect v-model="selectedModelKey" :models="availableModels" :loading="loadingModels"
                :disabled="availableModels.length === 0" />
            </div>

            <!-- Provider Badge -->
            <UBadge v-if="selectedModel" color="neutral" variant="subtle" size="sm"
              class="hidden sm:inline-flex items-center gap-1 capitalize">
              <UIcon :name="getProviderIcon(selectedModel.provider)" class="text-xs" />
              <span>{{ selectedModel.provider }}</span>
            </UBadge>
          </div>
        </header>

        <!-- System Prompt Drawer/Card (Collapsible) -->
        <transition enter-active-class="transition duration-200 ease-out"
          enter-from-class="transform -translate-y-4 opacity-0" enter-to-class="transform translate-y-0 opacity-100"
          leave-active-class="transition duration-150 ease-in" leave-from-class="transform translate-y-0 opacity-100"
          leave-to-class="transform -translate-y-4 opacity-0">
          <div v-if="showSystemPrompt" class="p-3 bg-(--ui-bg-muted)/40 border-b border-(--ui-border) shrink-0">
            <div class="max-w-3xl mx-auto flex flex-col gap-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="font-medium text-foreground flex items-center gap-1">
                  <UIcon name="i-lucide-terminal" class="text-sm text-primary" />
                  {{ t('chat.systemPrompt') }}
                </span>
                <span class="text-muted hidden sm:inline">{{ t('chat.systemPromptDesc') }}</span>
              </div>
              <UTextarea v-model="systemPrompt" name="system-prompt" :rows="2" size="sm" class="w-full"
                :placeholder="t('chat.systemPromptPlaceholder')" />
            </div>
          </div>
        </transition>

        <!-- MESSAGES FEED -->
        <div ref="scrollContainer" class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-6 space-y-6"
          @scroll.passive="handleMessagesScroll">
          <!-- Empty State / Welcome Screen -->
          <div v-if="messages.length === 0 && !loadingMessages"
            class="flex flex-col items-center justify-center max-w-2xl mx-auto text-center px-4 py-12 animate-fade-in">
            <div v-if="modelsError" class="w-full max-w-md">
              <UAlert color="error" variant="subtle" icon="i-lucide-circle-alert" :title="t('chat.modelsUnavailable')"
                :description="modelsError">
                <template #actions>
                  <UButton color="primary" variant="soft" size="sm" icon="i-lucide-refresh-cw"
                    :label="t('common.refresh')" :loading="loadingModels" @click="fetchModels()" />
                  <UButton to="/system/ai-keys" color="neutral" variant="ghost" size="sm" icon="i-lucide-cpu"
                    :label="t('chat.configureAi')" />
                </template>
              </UAlert>
            </div>

            <template v-else>
              <div class="p-4 rounded-2xl bg-primary/10 text-primary mb-4 ring-1 ring-primary/20 shadow-inner">
                <UIcon name="i-lucide-bot" class="text-4xl" />
              </div>
              <h2 class="text-xl sm:text-2xl font-bold text-foreground mb-2">
                {{ t('chat.welcomeTitle') }}
              </h2>
              <p class="text-sm text-muted max-w-md mb-8">
                {{ availableModels.length === 0 && !loadingModels ? t('chat.noModels') : t('chat.welcomeSubtitle') }}
              </p>

              <div v-if="availableModels.length === 0 && !loadingModels" class="mb-6">
                <UButton to="/system/ai-keys" icon="i-lucide-cpu" color="primary" variant="soft"
                  :label="t('chat.configureAi')" />
              </div>

              <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg text-left">
                <button
                  class="p-3 rounded-xl border border-(--ui-border) bg-(--ui-bg-elevated) hover:border-primary/50 hover:bg-primary/5 transition-all text-left flex items-start gap-2.5 group cursor-pointer"
                  @click="applyQuickPrompt(t('chat.quickPrompts.summary'))">
                  <UIcon name="i-lucide-file-text"
                    class="text-lg text-primary shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                  <div>
                    <div class="text-xs font-semibold text-foreground">
                      {{ t('chat.quickPrompts.summary') }}
                    </div>
                    <div class="text-[11px] text-muted">
                      {{ t('chat.quickPrompts.summaryDesc') }}
                    </div>
                  </div>
                </button>

                <button
                  class="p-3 rounded-xl border border-(--ui-border) bg-(--ui-bg-elevated) hover:border-primary/50 hover:bg-primary/5 transition-all text-left flex items-start gap-2.5 group cursor-pointer"
                  @click="applyQuickPrompt(t('chat.quickPrompts.code'))">
                  <UIcon name="i-lucide-code-2"
                    class="text-lg text-primary shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                  <div>
                    <div class="text-xs font-semibold text-foreground">
                      {{ t('chat.quickPrompts.code') }}
                    </div>
                    <div class="text-[11px] text-muted">
                      {{ t('chat.quickPrompts.codeDesc') }}
                    </div>
                  </div>
                </button>

                <button
                  class="p-3 rounded-xl border border-(--ui-border) bg-(--ui-bg-elevated) hover:border-primary/50 hover:bg-primary/5 transition-all text-left flex items-start gap-2.5 group cursor-pointer"
                  @click="applyQuickPrompt(t('chat.quickPrompts.brainstorm'))">
                  <UIcon name="i-lucide-lightbulb"
                    class="text-lg text-primary shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                  <div>
                    <div class="text-xs font-semibold text-foreground">
                      {{ t('chat.quickPrompts.brainstorm') }}
                    </div>
                    <div class="text-[11px] text-muted">
                      {{ t('chat.quickPrompts.brainstormDesc') }}
                    </div>
                  </div>
                </button>

                <button
                  class="p-3 rounded-xl border border-(--ui-border) bg-(--ui-bg-elevated) hover:border-primary/50 hover:bg-primary/5 transition-all text-left flex items-start gap-2.5 group cursor-pointer"
                  @click="applyQuickPrompt(t('chat.quickPrompts.explain'))">
                  <UIcon name="i-lucide-compass"
                    class="text-lg text-primary shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                  <div>
                    <div class="text-xs font-semibold text-foreground">
                      {{ t('chat.quickPrompts.explain') }}
                    </div>
                    <div class="text-[11px] text-muted">
                      {{ t('chat.quickPrompts.explainDesc') }}
                    </div>
                  </div>
                </button>
              </div>
            </template>
          </div>

          <!-- Loading Messages Skeleton -->
          <div v-else-if="loadingMessages" class="max-w-6xl mx-auto space-y-4">
            <USkeleton class="h-20 w-3/4 rounded-2xl ml-auto" />
            <USkeleton class="h-28 w-4/5 rounded-2xl" />
          </div>

          <!-- Messages Stream -->
          <div v-else class="max-w-6xl mx-auto space-y-6">
            <div v-if="hasOlderMessages || loadingOlderMessages" class="flex justify-center">
              <UButton icon="i-lucide-history" color="neutral" variant="ghost" size="xs" :loading="loadingOlderMessages"
                :label="t('chat.loadOlder')" @click="loadOlderMessages" />
            </div>

            <UContextMenu v-for="msg in messages" :key="msg.id" :items="messageMenuItems(msg)">
              <div class="flex gap-3 animate-slide-up" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
                <!-- Assistant Avatar -->
                <div v-if="msg.role === 'assistant'"
                  class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-1 ring-1 ring-primary/20">
                  <UIcon name="i-lucide-bot" class="text-lg" />
                </div>

                <!-- Message Bubble -->
                <div class="relative max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 shadow-sm transition-all" :class="[
                  msg.role === 'user'
                    ? 'bg-primary text-white rounded-tr-none'
                    : 'bg-(--ui-bg-elevated) border border-(--ui-border) text-foreground rounded-tl-none'
                ]">
                  <!-- Header / Model Label -->
                  <div v-if="msg.role === 'assistant' && msg.model"
                    class="flex items-center gap-2 mb-1.5 text-[11px] text-muted">
                    <span class="font-medium text-foreground">{{ msg.model }}</span>
                    <span v-if="msg.outputTokens" class="text-dimmed">
                      • {{ msg.outputTokens }} {{ t('chat.tokens') }}
                    </span>
                  </div>

                  <!-- Message Content (pre-wrap preserve formatting) -->
                  <div v-if="msg.content" class="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {{ msg.content }}
                  </div>

                  <!-- Attachments -->
                  <div v-if="msg.attachments?.length" class="mt-2 flex flex-wrap gap-1.5">
                    <div v-for="att in msg.attachments" :key="att.name"
                      class="flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[10px]"
                      :class="msg.role === 'user' ? 'border-white/30 text-white/90' : 'border-(--ui-border) text-muted'">
                      <img v-if="att.kind === 'image' && att.url" :src="att.url" alt=""
                        class="h-5 w-5 rounded object-cover">
                      <UIcon v-else name="i-lucide-file-text" class="text-xs" />
                      <span class="max-w-40 truncate">{{ att.name }}</span>
                    </div>
                  </div>

                  <!-- Timestamp -->
                  <div class="mt-2 pt-1 border-t border-(--ui-border)/40 text-[11px]"
                    :class="msg.role === 'user' ? 'text-white/80' : 'text-muted'">
                    <span class="text-[10px] opacity-75">
                      {{ new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                    </span>
                  </div>
                </div>

                <!-- User Avatar -->
                <div v-if="msg.role === 'user'"
                  class="w-8 h-8 rounded-lg bg-neutral-800 text-white flex items-center justify-center shrink-0 mt-1 shadow-sm">
                  <UIcon name="i-lucide-user" class="text-lg" />
                </div>
              </div>
            </UContextMenu>

            <!-- Assistant Typing Indicator -->
            <div v-if="sending" class="flex gap-3 justify-start animate-fade-in">
              <div
                class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 ring-1 ring-primary/20">
                <UIcon name="i-lucide-bot" class="text-lg animate-pulse" />
              </div>
              <div
                class="rounded-2xl rounded-tl-none px-4 py-3 bg-(--ui-bg-elevated) border border-(--ui-border) text-foreground flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                <span class="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                <span class="w-2 h-2 rounded-full bg-primary animate-bounce" />
              </div>
            </div>
          </div>
        </div>

        <!-- INPUT BOX -->
        <footer class="py-0 border-t border-(--ui-border) bg-(--ui-bg)/80 backdrop-blur-md shrink-0">
          <div class="max-w-full mx-auto flex flex-col gap-2">
            <UAlert v-if="sendError" color="error" variant="subtle" icon="i-lucide-circle-alert"
              :title="t('chat.errorGeneric')" :description="sendError" class="mx-2 mt-2">
              <template #actions>
                <UButton v-if="lastFailedPrompt" color="primary" variant="soft" size="sm" icon="i-lucide-rotate-ccw"
                  :label="t('chat.retry')" @click="retrySend" />
              </template>
            </UAlert>

            <div
              class="relative flex flex-col gap-2 bg-(--ui-bg-elevated) rounded-xs border border-(--ui-border) p-2 shadow-sm ">
              <!-- Selected attachments -->
              <div v-if="attachments.length" class="flex flex-wrap gap-2">
                <div v-for="(att, index) in attachments" :key="`${att.name}-${index}`"
                  class="flex items-center gap-2 rounded-sm border border-(--ui-border) bg-(--ui-bg-muted)/50 px-2 py-1.5 text-xs max-w-full">
                  <img v-if="att.kind === 'image' && att.url" :src="att.url" alt=""
                    class="w-8 h-8 rounded object-cover">
                  <UIcon v-else name="i-lucide-file-text" class="text-muted" />
                  <span class="max-w-40 truncate">{{ att.name }}</span>
                  <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" square
                    :aria-label="t('chat.removeAttachment')" @click="removeAttachment(index)" />
                </div>
              </div>

              <div class="flex items-end gap-2">
                <UTextarea v-model="promptInput" name="message" :placeholder="t('chat.placeholder')" :rows="1"
                  :maxrows="5" :autoresize="true"
                  class="w-full border-0 focus:ring-0 shadow-none bg-transparent resize-none text-sm leading-relaxed"
                  :disabled="sending || loadingModels || availableModels.length === 0"
                  :ui="{ base: 'rounded-sm focus-visible:outline-2' }"
                  @keydown.enter.exact.prevent="handleSendMessage" />

                <div class="flex items-center gap-1 shrink-0 pr-1">
                  <UButton icon="i-lucide-paperclip" color="neutral" variant="ghost" size="sm" square
                    class="rounded-sm w-8 h-8 p-0 flex items-center justify-center"
                    :disabled="sending || uploadingAttachment || attachments.length >= CHAT_ATTACHMENT_LIMIT"
                    :loading="uploadingAttachment" :aria-label="t('chat.attachFiles')" :title="t('chat.attachFiles')"
                    @click="triggerAttachmentPicker" />
                  <UButton icon="i-lucide-arrow-up" color="primary" variant="soft" size="sm"
                    class="rounded-sm w-8 h-8 p-0 flex items-center justify-center"
                    :disabled="!canSend || availableModels.length === 0" :loading="sending" :aria-label="t('chat.send')"
                    @click="handleSendMessage" />
                </div>
              </div>

              <input ref="attachmentInput" type="file" multiple class="hidden"
                accept="image/*,text/*,.md,.json,.csv,.log,.yml,.yaml,.xml,.html,.css,.js,.ts,.tsx,.jsx,.vue,.py,.sql,.sh"
                @change="handleAttachmentSelect">
            </div>

            <!-- Footer Meta (desktop only) -->
            <div class="hidden sm:flex items-center justify-between text-[11px] text-muted px-1 pb-4">
              <span>{{ t('chat.newLineHint') }}</span>
              <span v-if="selectedModel" class="flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {{ selectedModel.displayName }}
              </span>
            </div>
          </div>
        </footer>
      </main>
    </div>

    <!-- Mobile conversation history (the sidebar is desktop-only) -->
    <LazyBaseResponsiveSlideover v-model:open="historyOpen" :title="t('chat.conversations')"
      icon="i-lucide-message-square" side="left" :ui="{ content: 'w-screen max-w-sm' }">
      <template #body>
        <ChatConversationList :conversations="conversations" :loading="loadingConversations"
          :current-id="currentConversationId" @select="selectConversation" @remove="openDeleteConfirm"
          @rename="openRename" @archive="handleArchive" @color="handleColor" />
      </template>
    </LazyBaseResponsiveSlideover>

    <!-- Confirmation Modal for Deleting Conversation -->
    <LazyBaseConfirmModal v-model:open="confirmModalOpen" :title="confirmModalTitle" :description="confirmModalDesc"
      color="error" icon="i-lucide-trash-2" :loading="isDeleting" @confirm="handleConfirmDelete"
      @cancel="confirmModalOpen = false" />

    <!-- Rename Conversation Modal -->
    <LazyUModal v-model:open="renameModalOpen" :title="t('chat.rename')" :ui="{ footer: 'justify-end' }">
      <template #body>
        <UFormField :label="t('chat.renamePlaceholder')">
          <UInput v-model="renameInput" name="conversation-title" class="w-full" :maxlength="200" autofocus
            @keydown.enter.prevent="handleConfirmRename" />
        </UFormField>
      </template>
      <template #footer>
        <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="renameModalOpen = false" />
        <UButton :label="t('common.save')" color="primary" variant="soft" :loading="isRenaming"
          :disabled="!renameInput.trim()" @click="handleConfirmRename" />
      </template>
    </LazyUModal>
  </BasePage>
</template>
