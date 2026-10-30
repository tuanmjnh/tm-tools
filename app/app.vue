<script setup lang="ts">
const colorMode = useColorMode()
const { locale } = useI18n()

const color = computed(() => colorMode.value === 'dark' ? '#1b1718' : 'white')

const { fetchUser } = useAuth()
onMounted(async () => {
  await fetchUser()
})

useHead({
  titleTemplate: (titleChunk) => {
    if (!titleChunk) return 'TM Tools'
    if (titleChunk.endsWith('TM Tools')) return titleChunk
    return `${titleChunk} - TM Tools`
  },
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: locale
  }
})

const description = 'TM Tools Desktop - Professional Video Creation, Downloader & Automation Suite'

useSeoMeta({
  description,
  ogDescription: description
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
