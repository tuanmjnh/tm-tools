<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

/**
 * Right-click surface used by the file explorers and the activity list. The
 * menu renders at the pointer through UDropdownMenu, and nested menus win
 * because the innermost handler stops propagation.
 */
const props = withDefaults(defineProps<{
  items: DropdownMenuItem[][]
  disabled?: boolean
}>(), {
  disabled: false
})

const open = ref(false)
const position = ref({ x: 0, y: 0 })

function handleContextMenu(event: MouseEvent) {
  if (props.disabled || !props.items.some(group => group.length > 0)) return
  event.preventDefault()
  event.stopPropagation()
  position.value = { x: event.clientX, y: event.clientY }
  open.value = true
}
</script>

<template>
  <div @contextmenu="handleContextMenu">
    <slot />
    <div
      v-if="open"
      class="pointer-events-none fixed z-9999 h-1 w-1"
      :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    >
      <UDropdownMenu
        :items="items"
        :open="true"
        :popper="{ placement: 'bottom-start' }"
        class="pointer-events-auto"
        @update:open="(value) => !value && (open = false)"
      >
        <div />
      </UDropdownMenu>
    </div>
  </div>
</template>
