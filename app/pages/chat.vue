<script setup lang="ts">
interface ChatUIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  parts?: Array<{ type: 'text', text: string }>
  error?: boolean
}

interface ChatAPIRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }>
}

interface ChatAPIResponse {
  success: boolean
  data: {
    provider: string
    model: string
    message: { role: 'assistant', content: string }
  }
}

definePageMeta({})

const { t } = useI18n()
const toast = useToast()

const messages = ref<ChatUIMessage[]>([])
const input = ref('')
const status = ref<'ready' | 'submitted' | 'streaming' | 'error'>('ready')
const error = ref<Error | undefined>(undefined)
const scrollContainer = ref<HTMLElement | null>(null)

let counter = 0
function nextId(): string {
  counter += 1
  return `msg-${Date.now()}-${counter}`
}

function scrollToBottom() {
  nextTick(() => {
    scrollContainer.value?.scrollTo({ top: scrollContainer.value.scrollHeight })
  })
}

async function send() {
  const text = input.value.trim()
  if (!text || status.value === 'submitted' || status.value === 'streaming') return

  input.value = ''
  error.value = undefined

  const userMessage: ChatUIMessage = {
    id: nextId(),
    role: 'user',
    content: text
  }
  messages.value.push(userMessage)
  status.value = 'submitted'
  scrollToBottom()

  const apiMessages: ChatAPIRequest['messages'] = messages.value
    .filter(m => !m.error)
    .map(m => ({ role: m.role, content: m.content }))

  try {
    const res = await $fetch<ChatAPIResponse>('/api/chat', {
      method: 'POST',
      body: { messages: apiMessages }
    })

    if (!res?.success || !res.data?.message?.content) {
      throw new Error('empty response')
    }

    messages.value.push({
      id: nextId(),
      role: 'assistant',
      content: res.data.message.content
    })
    status.value = 'ready'
  } catch (e: unknown) {
    status.value = 'error'
    const message = e instanceof Error ? e.message : String(e)
    const isNotConfigured = message.includes('AI API key is not configured')
    error.value = new Error(isNotConfigured ? t('chat.errorNotConfigured') : t('chat.errorGeneric'))
    toast.add({ title: t('chat.errorGeneric'), color: 'error' })
  } finally {
    scrollToBottom()
  }
}

function stop() {
  status.value = 'ready'
}

function clearConversation() {
  messages.value = []
  input.value = ''
  error.value = undefined
  status.value = 'ready'
}
</script>

<template>
  <BasePage id="chat" :title="t('chat.title')">
    <template #right>
      <UButton
        icon="i-lucide-trash-2"
        color="neutral"
        variant="ghost"
        :label="t('chat.clear')"
        :disabled="messages.length === 0"
        @click="clearConversation"
      />
    </template>

    <UCard class="flex h-[calc(100vh-14rem)] flex-col">
      <div
        v-if="messages.length === 0"
        class="flex flex-1 items-center justify-center text-center text-muted"
      >
        <div class="space-y-2">
          <UIcon name="i-lucide-message-square" class="mx-auto text-4xl" />
          <p>{{ t('chat.empty') }}</p>
        </div>
      </div>

      <div
        v-else
        ref="scrollContainer"
        class="flex-1 overflow-y-auto px-1 py-4"
      >
        <UChatMessages
          :messages="messages"
          :status="status"
          :assistant="{ avatar: { icon: 'i-lucide-sparkles' }, side: 'left', variant: 'naked' }"
          :user="{ side: 'right', variant: 'soft' }"
        >
          <template #content="{ message }">
            <p class="whitespace-pre-wrap">
              {{ message.content }}
            </p>
            <p v-if="message.error" class="mt-1 text-sm text-error">
              {{ t('chat.errorGeneric') }}
            </p>
          </template>
        </UChatMessages>
      </div>

      <UChatPrompt
        v-model="input"
        :error="error"
        :placeholder="t('chat.placeholder')"
        class="mt-4"
        @submit="send"
      >
        <UChatPromptSubmit
          :status="status"
          @stop="stop"
          @reload="send"
        />
      </UChatPrompt>
    </UCard>
  </BasePage>
</template>
