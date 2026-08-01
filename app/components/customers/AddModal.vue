<script setup lang="ts">
import * as z from 'zod'

const schema = z.object({
  name: z.string().min(2, 'Too short'),
  email: z.string().email('Invalid email')
})
const open = ref(false)

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  name: '',
  email: ''
})

const toast = useToast()
const saving = ref(false)

async function onSubmit() {
  if (saving.value) return
  saving.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 500))
    toast.add({ title: 'Success', description: `New customer ${state.name} added`, color: 'success' })
    open.value = false
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <UButton label="New customer" icon="i-lucide-plus" @click="open = true" />

    <BaseFormModal
      v-model:open="open"
      title="New customer"
      description="Add a new customer to the database"
      :schema="schema"
      :state="state"
      :loading="saving"
      submit-label="Create"
      @submit="onSubmit"
    >
      <UFormField label="Name" name="name">
        <UInput v-model="state.name" placeholder="John Doe" class="w-full" />
      </UFormField>
      <UFormField label="Email" name="email">
        <UInput
          v-model="state.email"
          type="email"
          placeholder="john.doe@example.com"
          class="w-full"
        />
      </UFormField>
    </BaseFormModal>
  </div>
</template>
