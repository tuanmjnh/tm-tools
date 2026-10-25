// =============================================================================
// TMCut MCP Renderer Bridge — handles forwarded tool calls from MCP server
// =============================================================================

import { onBeforeUnmount, shallowRef } from 'vue'
import { useTmcutAgentTools } from './useTmcutAgentTools'

/**
 * Sets up the MCP renderer-side bridge.
 * Listens for forwarded tool calls from the MCP server (via main process)
 * and dispatches them to the agent tools.
 * Returns an unsubscribe function.
 */
export function useMcpRendererBridge() {
  const agent = useTmcutAgentTools()
  const unsubscribe = shallowRef<() => void>(() => {})

  function setup() {
    if (!window.electronAPI?.mcp?.onToolInvoke) {
      console.warn('[MCP] electronAPI.mcp.onToolInvoke not available')
      return
    }

    unsubscribe.value = window.electronAPI.mcp.onToolInvoke(async ({ tool, params, requestId, projectId }) => {
      try {
        // Dispatch through the agent's callTool which handles the full flow:
        // read tools execute immediately, mutating tools queue into proposal
        const result = await agent.callTool(tool, params)

        // Send response back to main process (which forwards to MCP server)
        if (window.electronAPI?.mcp?.respond) {
          window.electronAPI.mcp.respond(requestId, result)
        }
      } catch (err) {
        const errorResult = {
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: (err as Error)?.message || 'Renderer MCP bridge error', retryable: true }
        }
        if (window.electronAPI?.mcp?.respond) {
          window.electronAPI.mcp.respond(requestId, errorResult)
        }
      }
    })
  }

  function teardown() {
    if (unsubscribe.value) {
      unsubscribe.value()
      unsubscribe.value = () => {}
    }
  }

  // Auto-setup on mount
  setup()

  // Auto-teardown on unmount
  onBeforeUnmount(() => {
    teardown()
  })

  return { setup, teardown }
}