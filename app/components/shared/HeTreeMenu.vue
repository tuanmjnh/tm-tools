<script setup lang="ts" generic="TNode extends object">
import { HeTreeMenu as TmHeTreeMenu } from '@tuanmjnh/tm-ui'
import type { DropdownMenuItem } from '@nuxt/ui'

defineOptions({ inheritAttrs: false })

type TreeMenuItems = DropdownMenuItem[] | DropdownMenuItem[][]

defineProps<{
  modelValue?: TNode[]
  fieldNames?: { id: string, label: string, children: string }
  selectedKeys?: Set<string | number> | (string | number)[]
  classNode?: string
  defaultIcon?: string
  hideIcon?: boolean
  defaultExpandAll?: boolean
  expandedIds?: (string | number)[]
  draggable?: boolean
  cardClickable?: boolean
  hideCheckbox?: boolean
  actionOptions?: (node: TNode) => TreeMenuItems
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TNode[]]
  'node:click': [node: TNode]
  'node:toggle': [payload: { node: TNode, isOpen: boolean }]
  'node:select': [payload: { node: TNode, isSelected: boolean }]
  'node:drop': [payload: unknown]
  'node:after-drop': [payload: unknown]
  'update:expandedIds': [value: (string | number)[]]
}>()
</script>

<template>
  <TmHeTreeMenu v-bind="$attrs" :model-value="modelValue" :field-names="fieldNames" :selected-keys="selectedKeys"
    :class-node="classNode" :default-icon="defaultIcon" :hide-icon="hideIcon"
    :default-expand-all="defaultExpandAll" :expanded-ids="expandedIds" :draggable="draggable"
    :card-clickable="cardClickable" :hide-checkbox="hideCheckbox" :action-options="actionOptions"
    @update:model-value="emit('update:modelValue', $event)"
    @node:click="emit('node:click', $event)"
    @node:toggle="emit('node:toggle', $event)"
    @node:select="emit('node:select', $event)"
    @node:drop="emit('node:drop', $event)"
    @node:after-drop="emit('node:after-drop', $event)"
    @update:expanded-ids="emit('update:expandedIds', $event)"
  >
    <template v-for="(_, name) in $slots" #[name]="data">
      <slot :name="name" v-bind="data ?? {}" />
    </template>
  </TmHeTreeMenu>
</template>
