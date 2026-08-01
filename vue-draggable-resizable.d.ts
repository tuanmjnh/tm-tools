declare module 'vue-draggable-resizable' {
  import type { DefineComponent } from 'vue'

  interface VueDraggableResizableProps {
    className?: string
    classNameDraggable?: string
    classNameResizable?: string
    classNameDragging?: string
    classNameResizing?: string
    classNameActive?: string
    classNameHandle?: string
    disableUserSelect?: boolean
    enableNativeDrag?: boolean
    preventDeactivation?: boolean
    active?: boolean
    draggable?: boolean
    resizable?: boolean
    lockAspectRatio?: boolean
    w?: number | string
    h?: number | string
    minWidth?: number
    minHeight?: number
    maxWidth?: number | null
    maxHeight?: number | null
    x?: number
    y?: number
    z?: string | number
    handles?: string[]
    dragHandle?: string | null
    dragCancel?: string | null
    axis?: 'x' | 'y' | 'both'
    grid?: number[]
    parent?: boolean
    scale?: number | [number, number]
    onDragStart?: (...args: unknown[]) => boolean
    onDrag?: (...args: unknown[]) => boolean
    onResizeStart?: (...args: unknown[]) => boolean
    onResize?: (...args: unknown[]) => boolean
  }

  const VueDraggableResizable: DefineComponent<VueDraggableResizableProps>
  export default VueDraggableResizable
}
