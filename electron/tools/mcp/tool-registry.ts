// =============================================================================
// TMCut MCP Tool Registry — closed set of 20 tools matching useTmcutAgentTools
// Each tool has: name, description, Zod param schema, risk, requiresApproval
// =============================================================================

import {
  ToolRisk,
  ToolResult,
  // Param schemas
  GetContextParams, GetTimelineParams, ListAssetsParams,
  CreateProposalParams, GetProposalParams, ValidateProposalParams, DiscardProposalParams, ApplyProposalParams,
  AddClipParams, MoveClipParams, TrimClipParams, RemoveClipParams, SplitClipParams,
  SetVolumeParams, AddCaptionParams, SetTransitionParams, SetEffectParams,
  SeekParams, PlayParams, PauseParams,
  // Types
  ProjectSummary, TimelineSnapshot, AssetSummary, ProposalSnapshot, ProposalOperation,
  ServerCapabilities, SessionConfig, SessionInfo,
  McpEvent, ToolResult as ToolResultType
} from './schemas.js'
import { z, ZodTypeAny } from 'zod'

// -----------------------------------------------------------------------------
// Tool handler type
// -----------------------------------------------------------------------------
export type ToolHandler<TParams extends z.ZodTypeAny = z.ZodTypeAny> = (
  params: z.infer<TParams>,
  context: { projectId: string; sessionId: string; ipc: McpIpc }
) => Promise<ToolResultType>

// -----------------------------------------------------------------------------
// IPC interface (injected at runtime — server.mjs provides real impl)
// -----------------------------------------------------------------------------
export interface McpIpc {
  // Main → Renderer/Store calls (via main process)
  getProjectContext(projectId: string): Promise<ProjectSummary>
  getTimeline(projectId: string): Promise<TimelineSnapshot>
  listAssets(projectId: string, query?: string, kind?: string, limit?: number): Promise<AssetSummary[]>

  // Proposal lifecycle
  createProposal(projectId: string, intent: string): Promise<ProposalSnapshot>
  getProposal(projectId: string): Promise<ProposalSnapshot | null>
  validateProposal(projectId: string): Promise<{ ok: boolean; errors: string[] }>
  discardProposal(projectId: string): Promise<void>
  applyProposal(projectId: string): Promise<ToolResultType>

  // Queued edit operations (all route through proposal)
  queueAddClip(projectId: string, op: any): Promise<void>
  queueMoveClip(projectId: string, op: any): Promise<void>
  queueTrimClip(projectId: string, op: any): Promise<void>
  queueRemoveClip(projectId: string, op: any): Promise<void>
  queueSplitClip(projectId: string, op: any): Promise<void>
  queueSetVolume(projectId: string, op: any): Promise<void>
  queueAddCaption(projectId: string, op: any): Promise<void>
  queueSetTransition(projectId: string, op: any): Promise<void>
  queueSetEffect(projectId: string, op: any): Promise<void>

  // Playback
  seekPlayback(projectId: string, timeSec: number): Promise<void>
  playPlayback(projectId: string): Promise<void>
  pausePlayback(projectId: string): Promise<void>

  // Events (server pushes to host via stdio)
  emitEvent(event: any): void
}

// -----------------------------------------------------------------------------
// Tool definition
// -----------------------------------------------------------------------------
export interface ToolDef<TParams extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string
  description: string
  parameters: TParams
  risk: 'read' | 'reversible' | 'destructive' | 'cost'
  requiresApproval: boolean
  handler: ToolHandler<TParams>
}

// -----------------------------------------------------------------------------
// Registry (closed set — order = advertised capability order)
// -----------------------------------------------------------------------------
export const TOOL_REGISTRY: ToolDef[] = [
  // === Context (read) ===
  {
    name: 'project.get_context',
    description: 'Read current project name, canvas, duration, track counts',
    parameters: GetContextParams,
    risk: 'read',
    requiresApproval: false,
    handler: async (_params, { projectId, ipc }) => ({
      ok: true,
      data: await ipc.getProjectContext(projectId)
    })
  },
  {
    name: 'project.get_timeline',
    description: 'Read full timeline: tracks, clips, markers',
    parameters: GetTimelineParams,
    risk: 'read',
    requiresApproval: false,
    handler: async (_params, { projectId, ipc }) => ({
      ok: true,
      data: await ipc.getTimeline(projectId)
    })
  },
  {
    name: 'project.list_assets',
    description: 'List library assets available to drop on the timeline',
    parameters: ListAssetsParams,
    risk: 'read',
    requiresApproval: false,
    handler: async (params, { projectId, ipc }) => ({
      ok: true,
      data: await ipc.listAssets(projectId, params.query, params.kind, params.limit)
    })
  },

  // === Proposal lifecycle ===
  {
    name: 'edit.create_proposal',
    description: 'Start a proposal (undo group) for a batch of edits',
    parameters: CreateProposalParams,
    risk: 'reversible',
    requiresApproval: false,
    handler: async (params, { projectId, ipc }) => ({
      ok: true,
      data: await ipc.createProposal(projectId, params.intent)
    })
  },
  {
    name: 'edit.get_proposal',
    description: 'Read the pending proposal and its validation state',
    parameters: GetProposalParams,
    risk: 'read',
    requiresApproval: false,
    handler: async (_params, { projectId, ipc }) => {
      const p = await ipc.getProposal(projectId)
      return { ok: true, data: p }
    }
  },
  {
    name: 'edit.validate_proposal',
    description: 'Dry-run validate the pending proposal against the current timeline',
    parameters: ValidateProposalParams,
    risk: 'read',
    requiresApproval: false,
    handler: async (_params, { projectId, ipc }) => ({
      ok: true,
      data: await ipc.validateProposal(projectId)
    })
  },
  {
    name: 'edit.discard_proposal',
    description: 'Throw away the pending proposal without touching the timeline',
    parameters: DiscardProposalParams,
    risk: 'read',
    requiresApproval: false,
    handler: async (_params, { projectId, ipc }) => {
      await ipc.discardProposal(projectId)
      return { ok: true }
    }
  },
  {
    name: 'edit.apply_proposal',
    description: 'Apply the queued proposal as ONE undo step (requires user approval)',
    parameters: ApplyProposalParams,
    risk: 'reversible',
    requiresApproval: true, // UI must confirm
    handler: async (_params, { projectId, ipc }) => await ipc.applyProposal(projectId)
  },

  // === Timeline edits (queue into proposal) ===
  {
    name: 'timeline.add_clip',
    description: 'Add a clip to a track (queues into open proposal)',
    parameters: z.object({
      trackType: z.enum(['video', 'audio', 'text']),
      name: z.string().min(1).max(200),
      mediaRef: z.string().optional(),
      text: z.string().optional(),
      startSec: z.number().nonnegative(),
      durationSec: z.number().positive()
    }),
    risk: 'reversible',
    requiresApproval: false,
    handler: async (params, { projectId, ipc }) => {
      await ipc.queueAddClip(projectId, params)
      return { ok: true }
    }
  },
  {
    name: 'timeline.move_clip',
    description: 'Move a clip to a new start time (queues into open proposal)',
    parameters: MoveClipParams,
    risk: 'reversible',
    requiresApproval: false,
    handler: async (params, { projectId, ipc }) => {
      await ipc.queueMoveClip(projectId, params)
      return { ok: true }
    }
  },
  {
    name: 'timeline.trim_clip',
    description: 'Trim a clip in/out edge (queues into open proposal)',
    parameters: TrimClipParams,
    risk: 'reversible',
    requiresApproval: false,
    handler: async (params, { projectId, ipc }) => {
      await ipc.queueTrimClip(projectId, params)
      return { ok: true }
    }
  },
  {
    name: 'timeline.remove_clip',
    description: 'Remove a clip from the timeline (queues into open proposal)',
    parameters: RemoveClipParams,
    risk: 'reversible',
    requiresApproval: false,
    handler: async (params, { projectId, ipc }) => {
      await ipc.queueRemoveClip(projectId, params)
      return { ok: true }
    }
  },
  {
    name: 'timeline.split_clip',
    description: 'Split a clip at a time (queues into open proposal)',
    parameters: SplitClipParams,
    risk: 'reversible',
    requiresApproval: false,
    handler: async (params, { projectId, ipc }) => {
      await ipc.queueSplitClip(projectId, params)
      return { ok: true }
    }
  },
  {
    name: 'timeline.set_volume',
    description: 'Set track volume (queues into open proposal)',
    parameters: SetVolumeParams,
    risk: 'reversible',
    requiresApproval: false,
    handler: async (params, { projectId, ipc }) => {
      await ipc.queueSetVolume(projectId, params)
      return { ok: true }
    }
  },
  {
    name: 'timeline.add_caption',
    description: 'Add a caption (text clip) (queues into open proposal)',
    parameters: AddCaptionParams,
    risk: 'reversible',
    requiresApproval: false,
    handler: async (params, { projectId, ipc }) => {
      await ipc.queueAddCaption(projectId, params)
      return { ok: true }
    }
  },
  {
    name: 'timeline.set_transition',
    description: 'Add a transition to a clip cut (queues into open proposal)',
    parameters: SetTransitionParams,
    risk: 'reversible',
    requiresApproval: false,
    handler: async (params, { projectId, ipc }) => {
      await ipc.queueSetTransition(projectId, params)
      return { ok: true }
    }
  },
  {
    name: 'timeline.set_effect',
    description: 'Set effects on a clip (queues into open proposal)',
    parameters: SetEffectParams,
    risk: 'reversible',
    requiresApproval: false,
    handler: async (params, { projectId, ipc }) => {
      await ipc.queueSetEffect(projectId, params)
      return { ok: true }
    }
  },

  // === Playback ===
  {
    name: 'playback.seek',
    description: 'Move the playhead',
    parameters: SeekParams,
    risk: 'read',
    requiresApproval: false,
    handler: async (params, { projectId, ipc }) => {
      await ipc.seekPlayback(projectId, params.timeSec)
      return { ok: true }
    }
  },
  {
    name: 'playback.play',
    description: 'Start playback',
    parameters: PlayParams,
    risk: 'read',
    requiresApproval: false,
    handler: async (_params, { projectId, ipc }) => {
      await ipc.playPlayback(projectId)
      return { ok: true }
    }
  },
  {
    name: 'playback.pause',
    description: 'Pause playback',
    parameters: PauseParams,
    risk: 'read',
    requiresApproval: false,
    handler: async (_params, { projectId, ipc }) => {
      await ipc.pausePlayback(projectId)
      return { ok: true }
    }
  }
]

// -----------------------------------------------------------------------------
function zodToJsonSchema(schema: ZodTypeAny): any {
  // Zod v4: use instanceof checks on the public constructors
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, ZodTypeAny>
    const props: Record<string, any> = {}
    const required: string[] = []
    for (const [key, value] of Object.entries(shape)) {
      props[key] = zodToJsonSchema(value as ZodTypeAny)
      if (!(value instanceof z.ZodOptional)) required.push(key)
    }
    return { type: 'object', properties: props, required, additionalProperties: false }
  }
  if (schema instanceof z.ZodString) return { type: 'string' }
  if (schema instanceof z.ZodNumber) return { type: 'number' }
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' }
  if (schema instanceof z.ZodArray) return { type: 'array', items: zodToJsonSchema((schema as any).element as ZodTypeAny) }
  if (schema instanceof z.ZodOptional) return zodToJsonSchema((schema as any).unwrap() as ZodTypeAny)
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: (schema as any).options }
  if (schema instanceof z.ZodUnion) return { anyOf: ((schema as any).options as ZodTypeAny[]).map(zodToJsonSchema) }
  return { type: 'string' } // fallback
}
// -----------------------------------------------------------------------------
// Capability manifest builder
// -----------------------------------------------------------------------------
export function buildCapabilities(projectId?: string): ServerCapabilities {
  return {
    schemaVersion: 1,
    tools: TOOL_REGISTRY.map(t => ({
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(t.parameters),
      risk: t.risk,
      requiresApproval: t.requiresApproval
    })),
    project: projectId ? { currentProjectId: projectId, canSwitchProject: true } : undefined
  }
}

// -----------------------------------------------------------------------------
// Lookup helpers
// -----------------------------------------------------------------------------
export function getToolDef(name: string): ToolDef | undefined {
  return TOOL_REGISTRY.find(t => t.name === name)
}

export function getAllToolNames(): string[] {
  return TOOL_REGISTRY.map(t => t.name)
}