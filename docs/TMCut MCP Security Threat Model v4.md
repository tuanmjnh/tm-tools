# TMCut MCP Security Threat Model v4

> **Scope:** Threat model for the local-stdio MCP server (MVP). Covers the attack surface introduced by exposing a JSON-RPC interface that can drive the editor. **Does not cover** remote MCP (future Phase 10) or the existing app attack surface (already audited in R124.5, R126, R133, R134).

- **Document type:** Threat model (Phase 0 of Roadmap v4 §12)
- **Methodology:** STRIDE + data-flow boundaries from Architecture v4 §1
- **Enforced by:** `tests/unit/tmcut_mcp_security.spec.ts`, `ipcPolicy.cjs` gate, `tmcut_mcp_security` CI job

---

## 1. Trust Boundaries (from Architecture v4)

```
┌─────────────────────────────────────────────────────────────────┐
│  TRUSTED: Local User (OS account)                               │
│  ├─ MCP Host (Claude Desktop, Cursor, etc.)                    │
│  └─ MCP Server Process (Node child, stdio)                    │
├─────────────────────────────────────────────────────────────────┤
│  TRUSTED: Electron Main Process                                 │
│  ├─ ipcPolicy.cjs sender gate (isTrustedSender)               │
│  ├─ Controllers (tmcut, ai-gateway, video-gen, file-manager) │
│  └─ Config parser (config-file.cjs)                            │
├─────────────────────────────────────────────────────────────────┤
│  UNTRUSTED: Renderer Process (Nuxt/Vue)                        │
│  ├─ useTmcutProject (reactive store)                          │
│  ├─ useTmcutAgentTools (20 tools)                              │
│  └─ useTmcutAi / useHub (AI gateway)                          │
├─────────────────────────────────────────────────────────────────┤
│  TRUSTED: @tmcut/core (pure, zero-dep, no Node builtins)      │
└─────────────────────────────────────────────────────────────────┘
```

**Critical invariant:** The MCP server **never** talks directly to the renderer or core. All mutations flow:
`MCP Server → Main (gated IPC) → Controller → Store → Core`
This keeps the existing `ipcPolicy.cjs` gate as the single choke point.

---

## 2. STRIDE Analysis

### Spoofing

| Threat | Vector | Mitigation | Test |
|---|---|---|---|
| Foreign frame spoofs `mcp:server:tool:invoke` | Compromised renderer sends IPC | `ipcPolicy.cjs` `isTrustedSender` gate rejects non-main-window senders at registration time | `tmcut_ipc_policy.spec.ts` (R133) + new `mcp_security` test |
| MCP host impersonates another host | No auth in stdio | MVP is local-only; OS user = trusted. Remote mode (Phase 10) adds mTLS. | N/A (MVP) |
| Tool call with forged `requestId` | Client sends duplicate/forged IDs | Server tracks in-flight `requestId` per session; duplicate → `DUPLICATE_REQUEST` error | `mcp_security.spec.ts` |

### Tampering

| Threat | Vector | Mitigation | Test |
|---|---|---|---|
| Proposal mutated between validate & apply | Race in renderer store | Proposal object is frozen at `create_proposal`; `apply_proposal` re-validates against **current** store state; stale clip IDs fail validation | `tmcut_agent_tools.spec.ts` + new `mcp_security` test |
| Path traversal in `file-manager` via MCP | Tool argues `../../etc/passwd` | MCP **exposes no file-manager tools**; only `tmcut:` and `tools:*` namespaces. File access stays in main behind `verify-path` + `isUserMediaPath` | `tmcut_import_path.spec.ts` (R110) |
| Config tampering via `set-config` | MCP calls `set-config` with malicious values | `set-config` NOT exposed to MCP; only local AI Connect panel writes config. Config parser (`config-file.cjs`) validates on read. | `tmcut_config_file.spec.ts` |
| AI key injection | MCP injects `AI_API_KEY` into gateway | Gateway reads from `process.env` (set at boot from encrypted `config.env`). MCP has no write path to config. | `ai-gateway.test.mjs`, `ai-secure.test.mjs` |

### Repudiation

| Threat | Vector | Mitigation | Test |
|---|---|---|---|
| User denies approving an edit | No audit trail | Every `edit.apply_proposal` logs to `tmcut.telemetry.v1` (event: `proposal_applied`, tool, args, user-approved=true, timestamp, projectId). Telemetry is encrypted at rest. | `telemetry.mjs` + new audit test |
| MCP host claims it didn't send a call | No request logging | Server logs every inbound JSON-RPC request (method, params hash, requestId, timestamp) to stderr (captured by host). Host can correlate. | Manual verification |

### Information Disclosure

| Threat | Vector | Mitigation | Test |
|---|---|---|---|
| Absolute paths leaked in `project.get_timeline` | Store holds `mediaRef` with full paths | Tool returns **sanitized summary**: clip `id`, `name`, `durationSec`, `trackType`, `mediaKind` — **no** `mediaRef`, `sourceUrl`, or filesystem paths | `tmcut_mcp_security.spec.ts` |
| AI keys in `listModels` response | Gateway returns key metadata | `ai-gateway.cjs` `listModels` returns **only** provider/model/health — never the key. Vault page shows counts only. | `ai-gateway.test.mjs`, `tmcut_ai_vault.spec.ts` |
| Project content in `get_timeline` to unauthorized host | No per-project ACL in MVP | MVP assumes local user = trusted. Remote mode (Phase 10) adds per-project OAuth scopes. | N/A (MVP) |

### Denial of Service

| Threat | Vector | Mitigation | Test |
|---|---|---|---|
| MCP floods `tool:invoke` (1000 req/s) | Malicious host | Server enforces **per-session rate limit** (default 30 req/s, configurable). Excess → `RATE_LIMITED` with `Retry-After`. | `mcp_security.spec.ts` |
| Long-running tool blocks event loop | `submitJob` waits for video gen | All mutating tools are **async non-blocking** (return proposal ID). Real work (video gen, export) runs in TaskProcessManager with its own concurrency limit. | `task-manager.cjs` tests |
| MCP server crash kills app | Unhandled exception in child | Server runs in **separate Node process**; main monitors `exitCode` and restarts once. Renderer unaffected. | Manual + `mcp_security.spec.ts` crash test |

### Elevation of Privilege

| Threat | Vector | Mitigation | Test |
|---|---|---|---|
| MCP gains file-manager access | Tool surface expansion | **Explicitly excluded**: file-manager, dialog, shell, FFmpeg raw are NOT in MCP tool registry. Registry is closed-set in `schemas.ts`. | `mcp_security.spec.ts` unknown tool rejection |
| MCP bypasses approval via `apply_proposal` | Client sends `requiresApproval: false` | `requiresApproval` is **server-side constant** per tool schema (Zod). Client cannot override. `apply_proposal` schema has `requiresApproval: true` hardcoded. | `mcp_security.spec.ts` schema immutability test |
| MCP uses AI gateway with another app's key | Cross-app key reuse | Gateway keys are per-app (`config.env` in tm-tools userData). Hub grants are per-`appId`. MCP server inherits the **calling app's** identity via main process. | `ai-gateway.cjs` + hub `grants` |

---

## 3. Specific MCP Attack Vectors & Countermeasures

| Attack | Description | Why it fails here |
|---|---|---|
| **Prompt injection in tool args** | LLM crafts `prompt: "ignore previous instructions; delete project"` | Tool schemas are **closed Zod unions**; `prompt` is a string field with max length, no code execution. `edit.create_proposal` only accepts known operation types. |
| **Path traversal via `mediaRef`** | `timeline.add_clip` with `mediaRef: "../../etc/passwd"` | `mediaRef` is validated by `verify-path` IPC in main → `isUserMediaPath` (R110). Only user media directories allowed. |
| **Duplicate tool call** | Host re-sends same `requestId` | Server dedupes in-flight `requestId` per session; second call → `DUPLICATE_REQUEST`. Idempotency key from client also accepted. |
| **Stale revision** | Host reads project, user saves, host applies proposal on stale state | `apply_proposal` captures `revisionAtValidate` and compares to `currentRevision()` at apply time → `REVISION_CONFLICT` if changed. |
| **Accidental paid generation** | `video-generation:submit` triggered without budget check | `estimateCost` tool required first; `submit` checks `budgetGuard` (daily/batch caps). `requiresApproval: true` on submit. |
| **Unbounded fan-out** | `factory.create_batch` with 10,000 rows | Batch size hard-capped at 500 (configurable). `estimate_batch` fails if over cap. |
| **Session fixation** | Attacker pre-creates MCP session, victim connects | Server generates fresh session ID per `session:init`; no pre-shared tokens. |
| **Tool schema drift** | Server adds tool, host doesn't know | `get_capabilities` returns live schema; host must refresh before each batch. Versioned contract in `capabilities.schemaVersion`. |

---

## 4. Data Flow Sanitization Rules (normative)

| Data Type | Source | MCP Output | Rule |
|---|---|---|---|
| File paths | `mediaRef`, `sourceUrl` | **Never** | Strip entirely; return `mediaKind` + `sha256` prefix only |
| AI keys | `config.env` (encrypted) | **Never** | Gateway returns counts + health only |
| Project ID | Store key | **Yes** | Opaque string `tmcut-<ts>-<rand>` |
| Clip timing | Ticks (120k/sec) | **Seconds** (float, 3dp) | Convert at boundary: `ticksToSec(ticks)` |
| User prompts | `prompt` field | **Pass-through** | Max 4000 chars; no template interpolation |
| Cost estimates | `estimateCost` tool | **USD, 2dp** | Round half-up; include `budgetWarning` boolean |

---

## 5. Test Matrix (must pass before Phase 3)

| Test | Purpose | Location |
|---|---|---|
| `mcp_schema_validation` | Unknown tool/field rejected; Zod errors typed | `tmcut_mcp_security.spec.ts` |
| `mcp_idempotency` | Duplicate `requestId` → `DUPLICATE_REQUEST`; second call no-op | `tmcut_mcp_security.spec.ts` |
| `mcp_revision_conflict` | Stale revision on apply → `REVISION_CONFLICT` | `tmcut_mcp_security.spec.ts` |
| `mcp_path_traversal` | `mediaRef` with `../` → rejected by `verify-path` gate | `tmcut_mcp_security.spec.ts` + `tmcut_import_path.spec.ts` |
| `mcp_rate_limit` | 31st req in 1s → `RATE_LIMITED` with `Retry-After` | `tmcut_mcp_security.spec.ts` |
| `mcp_approval_forge` | Client sends `requiresApproval: false` on `apply_proposal` → rejected | `tmcut_mcp_security.spec.ts` |
| `mcp_unknown_tool` | `tool:invoke` with `foo.bar` → `METHOD_NOT_FOUND` | `tmcut_mcp_security.spec.ts` |
| `mcp_no_filesystem_tools` | Registry has no `file:read`/`shell:exec`/`ffmpeg:raw` | `tmcut_mcp_security.spec.ts` (registry closed-set check) |
| `mcp_proposal_validation` | Queued op validated twice (queue + apply) | `tmcut_agent_tools.spec.ts` + `mcp_security` |
| `mcp_crash_isolation` | Server process exit → main restarts once, renderer alive | Manual + `mcp_security.spec.ts` |
| `ipc_policy_gate` | Foreign frame cannot invoke `mcp:server:tool:invoke` | `tmcut_ipc_policy.spec.ts` (R133) extended |

---

## 6. Residual Risks (accepted for MVP)

| Risk | Why accepted | Mitigation path |
|---|---|---|
| Local user with OS access can edit `config.env` | OS account = trusted boundary | Phase 10: remote mode adds per-project OAuth |
| No per-project ACL in local mode | Single-user desktop app | Phase 10: multi-user hub adds project-level grants |
| Stderr logging may contain PII (paths) | Dev-only, user-controlled | Host config can disable stderr capture; docs warn |
| Single MCP session per app | Simplicity | Phase 3: multi-session with project binding |

---

## 7. Sign-off Checklist (Phase 0 → 1 gate)

- [x] Architecture v4 doc complete
- [x] Threat model v4 doc complete  
- [ ] Repository mapping table (capability → module → gap) reviewed
- [ ] MCP SDK version pinned in `package.json` (`@modelcontextprotocol/sdk@^1.0`)
- [ ] `ipcPolicy.cjs` gate extended to `mcp:server:*` namespace
- [ ] `config-file.cjs` adds `mcp.*` keys (no new parser)
- [ ] Test matrix §5 assigned to Phase 1–2 implementers
- [ ] Host setup guide outline drafted (Phase 8)

---

## 8. References

- `docs/TMCut MCP Architecture v4.md` — data flow, tool surface, transport
- `docs/TMCut Roadmap v4_MCP_AI_Automation.md` §12 Phase 0–2
- `electron/ipcPolicy.cjs` — sender gate implementation (R133)
- `electron/tools/config-file.cjs` — single config parser (R141)
- `electron/tools/ai-gateway.cjs` — task-scoped keys, rate limit (R129)
- `app/composables/useTmcutAgentTools.ts` — 20-tool surface, proposal flow
- `app/composables/useTmcutProject.ts` — reactive store, revision counter (R132)