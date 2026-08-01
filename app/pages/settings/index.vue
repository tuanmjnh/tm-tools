<script setup lang="ts">
import { z } from 'zod'

const auth = useAuth()
const toast = useToast()
const { t } = useI18n()

const profile = reactive({
  name: auth.user.value?.name || '',
  email: auth.user.value?.email || '',
  username: auth.user.value?.username || '',
  avatar: auth.user.value?.avatar || undefined,
  bio: ''
})

const schema = computed(() => z.object({
  name: z.string().min(2, t('auth.nameMin')),
  email: z.string().min(1, t('auth.emailRequired')).email(t('auth.emailInvalid')),
  username: z.string().min(1, t('admin.usernameRequired')),
  avatar: z.string().optional(),
  bio: z.string().optional()
}))

const fileRef = ref<HTMLInputElement>()
const saving = ref(false)

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  profile.avatar = URL.createObjectURL(input.files[0]!)
}

function onFileClick() {
  fileRef.value?.click()
}

async function onSubmit() {
  if (saving.value) return
  saving.value = true
  try {
    await $fetch(`/api/users?id=${auth.user.value?.id}`, {
      method: 'PUT',
      body: { name: profile.name, email: profile.email, username: profile.username || undefined, avatar: profile.avatar }
    })
    toast.add({ title: t('settings.profileUpdated'), icon: 'i-lucide-check', color: 'success' })
  } catch (err: any) {
    toast.add({ title: err?.data?.message || err?.message || t('global.error'), color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <UForm
    id="settings"
    :schema="schema"
    :state="profile"
    @submit="onSubmit"
  >
    <UPageCard
      :title="$t('settings.profile')"
      :description="$t('settings.profileDesc')"
      variant="naked" orientation="horizontal" class="mb-4"
    >
      <UButton
        form="settings"
        :label="$t('settings.saveChanges')"
        color="neutral" type="submit" :loading="saving"
        class="w-fit lg:ms-auto"
      />
    </UPageCard>

    <UPageCard variant="subtle">
      <UFormField name="name" :label="$t('auth.name')" :description="$t('settings.nameDesc')" required class="flex max-sm:flex-col justify-between items-start gap-4">
        <UInput v-model="profile.name" autocomplete="off" />
      </UFormField>
      <USeparator />
      <UFormField name="email" :label="$t('auth.email')" :description="$t('settings.emailDesc')" required class="flex max-sm:flex-col justify-between items-start gap-4">
        <UInput v-model="profile.email" type="email" autocomplete="off" />
      </UFormField>
      <USeparator />
      <UFormField name="username" :label="$t('admin.username')" :description="$t('settings.usernameDesc')" required class="flex max-sm:flex-col justify-between items-start gap-4">
        <UInput v-model="profile.username" autocomplete="off" />
      </UFormField>
      <USeparator />
      <UFormField name="avatar" :label="$t('settings.avatar')" :description="$t('settings.avatarDesc')" class="flex max-sm:flex-col justify-between sm:items-center gap-4">
        <div class="flex flex-wrap items-center gap-3">
          <UAvatar :src="profile.avatar" :alt="profile.name" size="lg" />
          <UButton :label="$t('settings.choose')" color="neutral" @click="onFileClick" />
          <input ref="fileRef" type="file" class="hidden" accept=".jpg, .jpeg, .png, .gif" @change="onFileChange" />
        </div>
      </UFormField>
      <USeparator />
      <UFormField name="bio" :label="$t('settings.bio')" :description="$t('settings.bioDesc')" class="flex max-sm:flex-col justify-between items-start gap-4" :ui="{ container: 'w-full' }">
        <UTextarea v-model="profile.bio" :rows="5" autoresize class="w-full" />
      </UFormField>
    </UPageCard>
  </UForm>
</template>
