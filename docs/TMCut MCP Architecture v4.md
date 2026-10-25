# TMCut MCP Architecture v4

> **Scope:** This doc describes how an external MCP client (Claude Desktop, Cursor, etc.) connects to the local TMCut desktop app and safely drives editing through the existing validated command layer. It is the **normative contract** for Phase 1–2 implementation; any deviation requires a doc update in the same round.

- **Document type:** Architecture contract (Phase 1–2 of Roadmap v4 §12)
- **Supersedes:** Nothing — first MCP architecture doc
- **Enforced by:** `tests/unit/tmcut_mcp_*.spec.ts` (to be added in Phase 2), `ipcPolicy.cjs` gate
- **Transport:** Local stdio (JSON-RPC 2.0 over stdin/stdout) — no network, no remote host in MVP
- **Process model:** Dedicated Node child process (`electron/tools/mcp/server.mjs`) spawned by main on demand; communicates with main via **existing privileged IPC** (`tools:*`, `tmcut:*`) behind `ipcPolicy.cjs` sender gate

---

## 1. High-level data flow

```text
MCP Client (stdio JSON-RPC)
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  MCP Server Process  (electron/tools/mcp/server.mjs)        │
│  - JSON-RPC 2.0 framing (stdio)                             │
│  - Tool registry + schema validation (Zod)                  │
│  - NO direct Electron/Node fs/child_process imports         │
│  - Delegates ALL mutations to main via IPC                  │
└──────────────────────────────────────────────────────────────┘
       │ IPC (privileged, sender-gated)
       ▼
┌──────────────────────────────────────────────────────────────┐
│  Electron Main Process                                       │
│  - ipcPolicy.cjs: gate EVERY ipcMain.handle registration    │
│  - Registers controllers: tmcut, ai-gateway, video-gen,     │
│    asset-center, file-manager, dialog, task-manager          │
│  - Spawns/manages MCP server child process                  │
└──────────────────────────────────────────────────────────────┘
       │ IPC (renderer ↔ main, same gate)
       ▼
┌──────────────────────────────────────────────────────────────┐
│  Renderer (Nuxt/Vue) — source of truth for project state    │
│  - useTmcutProject: single reactive store (ticks + DSL v3)  │
│  - useTmcutAgentTools: 20 self-describing tools (read/      │
│    proposal/reversible) — MCP tool surface is a SUBSET      │
│  - useTmcutAi / useHub: AI gateway + hub provider plane     │
└──────────────────────────────────────────────────────────────┘
       │ Core (pure, zero-dep)
       ▼
┌──────────────────────────────────────────────────────────────┐
│  @tmcut/core (D:/Applications/tmcut-core)                    │
│  - timeline/editing/transitions/effects/keyframes/audio/    │
│    canvas/retime/caption/analysis/stabilize/folders/        │
│    templates/assetCenter/marketplaceCatalog/autocutPlan/    │
│    aiPlan/templatePlan/audioOrchestration/generationAdapter │
│  - 350+ node:test, boundaries check (no Node builtins)      │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. MCP Tool Surface (Phase 2 Read-only → Phase 3 Edit)

| Category | Tools (from `useTmcutAgentTools.ts`) | Risk | Approval | Notes |
|---|---|---|---|---|
| **Context (read)** | `project.get_context`, `project.get_timeline`, `project.list_assets` | `read` | no | Return bounded, sanitized JSON (max 50 clips, no absolute paths) |
| **Proposal** | `edit.create_proposal`, `edit.get_proposal`, `edit.validate_proposal`, `edit.discard_proposal` | `read`/`reversible` | no (create) / yes (apply) | Proposal = declarative op queue; validation runs twice |
| **Edit (reversible)** | `timeline.add_clip`, `timeline.move_clip`, `timeline.trim_clip`, `timeline.remove_clip`, `timeline.split_clip`, `timeline.set_volume`, `timeline.add_caption`, `timeline.set_transition`, `timeline.set_effect` | `reversible` | yes (apply) | Mutating tools NEVER touch timeline directly — they queue into the open proposal |
| **Playback** | `playback.seek`, `playback.play`, `playback.pause` | `read` | no | UI sync only |

**Key invariant:** Every mutating tool **queues** an operation into a pending proposal. `edit.apply_proposal` is the **only** tool that mutates the store, and it requires `requiresApproval: true` (user confirms in UI). The proposal is applied as **one undo group** (`beginHistoryGroup` / `endHistoryGroup`).

---

## 3. Transport & Process Model (MVP)

| Aspect | Decision | Rationale |
|---|---|---|
| **Transport** | Local stdio (JSON-RPC 2.0) | Simplest secure channel; no network surface; works with all MCP hosts |
| **Server process** | Dedicated Node child (`electron/tools/mcp/server.mjs`) | Isolated from renderer/main; crashes don't kill app; can enforce timeouts |
| **Auth** | None (local user = trusted) | MVP is local-only; `ipcPolicy.cjs` gate prevents foreign frames from reaching main |
| **Lifecycle** | Main spawns on first `mcp:start` IPC; kills on app quit or `mcp:stop` | No persistent daemon; explicit user action to enable |
| **Host support** | Claude Desktop, Cursor, Continue, any stdio MCP client | Standard MCP SDK (`@modelcontextprotocol/sdk`) |
| **Capability negotiation** | `get_capabilities` tool returns current tool list + schemas | Host can discover dynamically |

---

## 4. Capability → Module Map (for audit table)

| Capability | Current Module | API Available | Security Gap | Reuse/Change |
|---|---|---|---|---|
| Read project context | `useTmcutProject` (renderer) | `project.get_context` tool | None — read-only | Reuse store selectors |
| Read timeline | `useTmcutProject` | `project.get_timeline` | None | Reuse store |
| List assets | `useTmcutMedia` | `project.list_assets` | None | Reuse store |
| Create proposal | `useTmcutAgentTools` | `edit.create_proposal` | None | Reuse composable |
| Validate proposal | `useTmcutAgentTools` + core validators | `edit.validate_proposal` | None | Reuse composable + core |
| Apply proposal | `useTmcutAgentTools` + store | `edit.apply_proposal` | **Requires user approval UI** | Reuse composable + store |
| Add/move/trim/remove clip | `useTmcutAgentTools` | `timeline.*` tools | **Queued only, never direct** | Reuse composable |
| Set volume/effect/transition/caption | `useTmcutAgentTools` | `timeline.set_*` tools | **Queued only** | Reuse composable |
| Playback control | `useTmcutPlayback` | `playback.*` tools | None | Reuse composable |
| AI gateway (plan/transcribe) | `useTmcutAi` | not yet exposed | **Task-scoped keys, rate limit** | New tool wrapper |
| Video generation | `useTmcutAgentTools` → video-gen | not yet exposed | **Budget guard, provider verified** | New tool wrapper |
| Export/render | `useTmcutExportQueue` | not yet exposed | **Queue + confirmation** | New tool wrapper |
| File system access | `file-manager.cjs` | **NOT exposed** | Path traversal risk | Explicitly excluded |
| Shell/FFmpeg raw | `ffmpeg.controller.cjs` | **NOT exposed** | Arbitrary command risk | Explicitly excluded |

---

## 5. IPC Contract for MCP Server

The MCP server **does not** import Electron. It communicates with main via a dedicated namespace:

```typescript
// electron/tools/mcp/ipc.ts (new)
namespace: 'mcp:server'
methods: {
  // Main → Server (commands from host)
  'tool:invoke': (toolName: string, args: unknown, requestId: string) => Promise<ToolResult>
  'session:init': (config: { projectId?: string }) => Promise<SessionInfo>
  'session:close': () => Promise<void>

  // Server → Main (events to host)
  'event:proposal_changed': (proposal: ProposalSnapshot) => void
  'event:project_changed': (summary: ProjectSummary) => void
  'event:job_status': (jobId: string, status: JobStatus) => void
}
```

Main registers `ipcMain.handle('mcp:server:tool:invoke', gate, handler)` — the **same `isTrustedSender` gate** from `ipcPolicy.cjs` applies, so a compromised renderer cannot inject tool calls.

---

## 6. Session & Project Binding

- Each MCP session binds to **at most one project** (`session:init({ projectId? })`).
- If no `projectId`, the session uses the **currently open project** in the renderer.
- Switching projects in the UI while MCP is connected → MCP receives `event:project_changed` with new summary; host decides whether to continue or request rebind.
- Project ID format: `tmcut-<timestamp>-<random>` (see `buildDefaultProject`).

---

## 7. Configuration (no new files)

MCP server reads config from **existing Electron config**:

| Setting | Source | Default |
|---|---|---|
| `mcp.enabled` | `config.env` (via `config-file.cjs`) | `false` |
| `mcp.transport` | `config.env` | `"stdio"` |
| `mcp.autoStart` | `config.env` | `false` |
| `mcp.idleTimeoutMs` | `config.env` | `300000` (5 min) |

No new config file — single config parser (`config-file.cjs`) stays the only reader.

---

## 8. Deliverables for Phase 1–2

| Doc | Status | Owner |
|---|---|---|
| `docs/TMCut MCP Architecture v4.md` | **this file** | — |
| `docs/TMCut MCP Security Threat Model v4.md` | next file | — |
| `electron/tools/mcp/server.mjs` | Phase 1 | impl |
| `electron/tools/mcp/ipc.ts` | Phase 1 | impl |
| `electron/tools/mcp/schemas.ts` (Zod) | Phase 1 | impl |
| `tests/unit/tmcut_mcp_tools.spec.ts` | Phase 2 | test |
| `tests/unit/tmcut_mcp_security.spec.ts` | Phase 2 | test |
| `docs/MCP Host Setup Guide.md` | Phase 8 | doc |

---

## 9. Gates (must pass before Phase 3)

1. `pnpm test:core && pnpm check:core && pnpm typecheck:core` — core unchanged
2. `npx nuxt typecheck && npx eslint <touched>` — renderer unchanged
3. `pnpm test:tmcut` — store/agent tools still pass
4. New: `pnpm test:mcp` (unit) — schema validation, idempotency, auth gate
5. New: `pnpm test:mcp:security` — path traversal, prompt injection, duplicate calls, stale revision
6. Manual: Claude Desktop connects via stdio, lists tools, reads project, proposes edit, user approves, edit applies, undo works