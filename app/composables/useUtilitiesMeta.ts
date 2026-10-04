import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

export interface UtilityMetaItem {
  key: string
  title: string
  description: string
  icon: string
  to: string
  tags?: string[]
}

export function useUtilitiesMeta() {
  const { t } = useI18n()
  const route = useRoute()

  const utilityList = computed<UtilityMetaItem[]>(() => [
    {
      key: 'icons',
      title: t('utilities.icons.title'),
      description: t('utilities.icons.description'),
      icon: 'i-lucide-shapes',
      to: '/utilities/icons',
      tags: ['Iconify', 'Lucide', 'Simple Icons', 'SVG', 'Copy']
    },
    {
      key: 'text',
      title: t('utilities.text.title'),
      description: t('utilities.text.description'),
      icon: 'i-lucide-type',
      to: '/utilities/text',
      tags: ['Case Convert', 'Slug', 'Vietnamese', 'Line Tools', 'Base64']
    },
    {
      key: 'encode',
      title: t('utilities.crypto.title'),
      description: t('utilities.crypto.description'),
      icon: 'i-lucide-binary',
      to: '/utilities/encode',
      tags: ['Base64', 'URL', 'Hash', 'JWT', 'Decode']
    },
    {
      key: 'random',
      title: t('utilities.random.title'),
      description: t('utilities.random.description'),
      icon: 'i-lucide-dices',
      to: '/utilities/random',
      tags: ['Password', 'UUID', 'Number', 'String']
    },
    {
      key: 'editor',
      title: t('utilities.editor.title'),
      description: t('utilities.editor.description'),
      icon: 'i-lucide-text-cursor-input',
      to: '/utilities/editor',
      tags: ['Tiptap', 'TinyMCE', 'Rich Text', 'HTML']
    }
  ])

  const currentUtility = computed<UtilityMetaItem>(() => {
    const seg = route.path.split('/').filter(Boolean).pop() || ''
    const match = utilityList.value.find(item => item.key === seg)
    if (match) return match

    return {
      key: 'utilities',
      title: t('utilities.title'),
      description: t('utilities.subtitle'),
      icon: 'i-lucide-wrench',
      to: '/utilities'
    }
  })

  // Synchronize document/tab title
  useHead(() => ({
    title: currentUtility.value.title
  }))

  return {
    utilityList,
    currentUtility
  }
}
