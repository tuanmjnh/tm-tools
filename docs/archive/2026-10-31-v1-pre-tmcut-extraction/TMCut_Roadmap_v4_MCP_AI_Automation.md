# TMCut Roadmap v4 — MCP Server, AI Agent Automation & End-to-End Editing

- **Document type:** Implementation roadmap and execution contract for AI coding agents
- **Version:** 4.0
- **Date:** 2026-10-18
- **Status:** Proposed — repository audit and security review are mandatory before implementation
- **Supersedes:** No existing roadmap. This document extends `TMCut Roadmap v3.md` and `tmcut-v3-ai-asset-template-autocut-roadmap-v2.md`; it does not replace either file.
- **Primary stack from current roadmap:** Nuxt/Vue app at `D:/Applications/tm-tools/app`, Electron runtime at `D:/Applications/tm-tools/electron`, pure `@tmcut/core` at `D:/Applications/tmcut-core`, FFmpeg/FFprobe render pipeline.
- **Main goal:** Let an external AI client connect to TMCut through MCP, inspect available state, plan edits, invoke approved operations, monitor jobs, review output, and complete repeatable editing workflows safely.

> Important status distinction: the supplied v3 roadmap documents a multi-provider AI gateway and an Electron MCP/security audit, but does **not** establish that a complete production MCP server and its tool contracts already exist. Phase 0 must verify the actual repository before implementation. Do not mark MCP integration as already implemented based only on the audit mention.

---

## 0. Executive direction

TMCut v4 adds a controlled **MCP Automation Layer** to the existing editor and AI roadmap. It should not be a second editing engine and must not bypass the existing project store, `@tmcut/core`, validated edit operations, job queue, or FFmpeg compiler.

### Desired user experience

An AI client such as an MCP-capable desktop assistant or coding agent can, with the user's permission:

1. Discover TMCut capabilities and supported operations.
2. Ask what project is open and inspect a **bounded, sanitized** summary of the timeline and media inventory.
3. Find/import approved media, inspect clips, and obtain thumbnails or metadata.
4. Propose a structured edit plan and explain assumptions.
5. Run a dry-run validation and show a human-readable diff.
6. Apply safe edits through TMCut's existing command/store layer, preserving undo/redo and autosave.
7. Run AutoCut or template workflows, monitor progress, cancel jobs, and inspect warnings.
8. Request a preview render, ask the user to review it, and export only after policy checks/confirmation.
9. Read job status, render diagnostics, and output metadata without gaining unrestricted access to the computer.

### Core design rule

**MCP is a narrow, typed control plane for TMCut capabilities — not remote shell access and not arbitrary mouse/keyboard control.**

Preferred control order:

1. **Domain/API tools:** project, timeline, asset, AutoCut, template, preview, export services.
2. **Approved UI actions:** only when a task truly requires a UI-only feature; expose semantic operations, not arbitrary DOM selectors.
3. **Desktop/UI automation fallback:** separate, opt-in, visible, bounded, and disabled by default. It must not be the primary way to edit a project.

AI providers do not receive direct filesystem, shell, process, or unrestricted FFmpeg access.

---

## 1. Baseline from supplied v3 documents

The coding agent must preserve these established constraints unless a repository audit proves the source documents are stale:

- App/UI: `D:/Applications/tm-tools/app`; rendering and UI code call composables/core rather than duplicating pure time logic.
- Engine: `D:/Applications/tmcut-core` (`@tmcut/core`), zero-dependency boundary, no Vue/Nuxt/Electron/Node built-ins/browser globals; time domain uses ticks with `TICKS_PER_SECOND = 120_000`.
- Electron runtime/IPC: `D:/Applications/tm-tools/electron`; main/preload changes require a full Electron restart.
- Render compiler: `app/utils/tmcut/compiler.ts`; existing FFmpeg pipeline remains the baseline.
- Existing app has an AI gateway with provider configuration, task-level routing for PLAN/TRIAGE/TRANSCRIBE, schemas/prompts in an AI task registry, and AutoCut AI triage according to the supplied v3 roadmap.
- Existing roadmap rules: no dead controls; i18n uses `t()` and en/vi parity; comments/constants/variable names in English; do not add runtime dependencies without explicit approval; verify types, lint, tests, core boundaries, and render smoke tests as applicable.
- Security work already recorded includes trusted-sender checks for privileged IPC, removal of `webSecurity:false`, and Electron upgrade. These protections are baseline requirements, not optional future cleanup.

### Important gaps to verify in Phase 0

The documents do not conclusively specify:
- Whether an MCP server package exists, and which MCP SDK/version is installed.
- Whether an external process can safely attach to the running Electron app.
- Whether a stable application-service API already exists between the renderer, preload, and main process.
- Whether the current project store exposes an intentional automation facade.
- Which MCP hosts will be supported first (for example, local stdio clients versus a future authenticated remote endpoint).
- Whether the app's security audit report and remaining MCP audit checklist are available in the repository.

Do not infer these. Record evidence and choose an implementation after the audit.

---

## 2. Scope and non-goals

### In scope

- Local-first MCP server for the desktop application.
- Explicit tool contracts, resource URIs, prompt templates, schemas, and capability discovery.
- A safe bridge from MCP tools to application services and validated Core commands.
- Project/timeline read access, dry-run edit plans, approved edits, asset discovery, AutoCut/template jobs, preview/export lifecycle, diagnostics, and audit trail.
- Consent, scopes, confirmation gates, cancellation, rate limits, input validation, and tests.
- Optional future remote mode only after local mode and authentication are secure.

### Not in scope for the first release

- General-purpose remote desktop control.
- Arbitrary PowerShell/CMD/shell execution.
- Arbitrary file read/write or directory traversal.
- Directly accepting FFmpeg arguments from the model.
- Running arbitrary JavaScript, plugins, or downloaded code inside TMCut.
- Uploading media to an AI provider without explicit disclosure and applicable consent.
- Replacing `@tmcut/core`, the project model, the existing render compiler, or the existing provider gateway.
- Automatically clicking through consumer websites or private APIs to bypass service restrictions.
- Unattended destructive edits or paid generation/export without configured authorization.

---

## 3. Target architecture

```text
External MCP Host / AI Client
        |
        | MCP transport (first release: local stdio)
        v
TMCut MCP Server (separate process/package)
  ├── Protocol adapter + capability discovery
  ├── Tool registry + JSON schema validation
  ├── Auth/session + consent/scope policy
  ├── Request limits + audit log + cancellation
  └── TMCut Automation Facade client
        |
        | narrow, versioned local bridge
        v
Electron Main / Application Services
  ├── Automation Bridge (allowlisted methods only)
  ├── Project/Timeline Service
  ├── Asset & Template Service
  ├── AutoCut/AI task service
  ├── Render/Export Job Service
  ├── Permission & Confirmation Broker
  └── Job registry + event stream
        |
        +------------------------------+
        |                              |
        v                              v
Renderer / Vue store               @tmcut/core
  ├── UI reflects state             ├── validation
  ├── existing history/undo         ├── edit operations
  ├── human approval dialogs        ├── time/timeline math
  └── visible automation status     └── capability checks
        |
        v
Existing FFmpeg/FFprobe pipeline + provider gateway
```

### Boundaries

- MCP server is an adapter, not a second source of truth.
- The MCP process must not import renderer internals or manipulate Pinia state directly.
- All mutations go through a versioned Automation Facade and then the existing application services/store/Core edit path.
- All times crossing the public MCP boundary use **seconds with explicit units** or named frame/time objects. Convert to Core ticks only at the application boundary. Never expose bare ambiguous numbers such as `start: 10`.
- The facade must report `projectId`, `revision`, operation IDs, job IDs, and normalized errors.
- The renderer remains the user-facing approval and review surface.
- The AI gateway continues to handle model/provider calls. MCP is how an external AI client controls TMCut; it does not replace the provider gateway inside TMCut.
- If the app is closed or not ready, MCP returns a typed `APP_NOT_READY` error; it must not start a second invisible editing engine.

---

## 4. Transport and process model

### 4.1 First release: local stdio

Prefer a local stdio MCP server for the first release because it avoids exposing a network listener. The MCP host launches the server as a child process, and messages travel over stdin/stdout.

Requirements:
- stdout is protocol-only. All diagnostics go to stderr or a rotating log file.
- Never print tokens, API keys, source file contents, or full private prompts to logs.
- Validate client configuration and fail closed if the local bridge cannot establish trust.
- Do not assume that “local process” means “trusted”; any process able to launch the server may be able to request tools.
- Bind a session to a host/client identity where the host protocol allows it; otherwise require an explicit local pairing/approval step and keep the exposed tool set conservative.
- Start with read-only capabilities until pairing and consent are established.
- Shutdown cleanly on stdin close, host cancellation, or application shutdown.

### 4.2 Bridge choice: audit first

After Phase 0, choose one bridge:

**Option A — local authenticated IPC/RPC (preferred if Electron conventions support it):**
- Use a named pipe or another OS-local IPC mechanism supported by the app.
- Use an unpredictable per-session capability token exchanged through a protected local bootstrap path.
- Validate every request schema, origin/session, operation scope, and size.
- Never create an unauthenticated localhost HTTP server as a shortcut.

**Option B — app-owned MCP server launched by Electron:**
- Electron main launches and supervises the MCP child process.
- Main creates a private channel and passes only a short-lived session capability through a protected mechanism.
- Ensure process lifetime, restart behavior, Windows path quoting, and app shutdown are tested.
- Do not expose renderer IPC to the MCP process directly.

**Option C — authenticated loopback HTTP:**
- Only if local IPC is unsuitable and after a threat-model review.
- Bind strictly to loopback; reject non-loopback interfaces and Host/Origin mismatches.
- Require per-session random credentials, CSRF/origin protections where applicable, request size limits, and rate limits.
- Never rely on CORS as authentication.

The coding agent must document why the chosen option fits the existing app and must not implement all three.

### 4.3 Remote mode: future phase only

Remote MCP is a separate security project. It requires user identity, TLS, authentication, authorization scopes, revocation, tenant isolation, rate limits, secure secret storage, and explicit disclosure of media leaving the device. Do not expose the local bridge to the LAN or Internet in v4 MVP.

---

## 5. Automation permission model

Implement policy in the application layer, not only in the model prompt.

### 5.1 Scopes

Use a small explicit scope set:

- `project.read`
- `media.read`
- `timeline.plan`
- `timeline.edit`
- `assets.manage`
- `template.read`
- `template.write`
- `autocut.run`
- `render.preview`
- `render.export`
- `filesystem.import` (user-selected files only)
- `provider.use` (only configured providers and allowed tasks)

A client receives only the scopes approved by the user. Unknown scopes are rejected. Do not add a general `admin` or `shell` scope.

### 5.2 Risk tiers

| Tier | Examples | Default policy |
|---|---|---|
| R0 read-only | app status, project summary, timeline inspection, job status | Allowed after pairing |
| R1 reversible | create draft plan, add text, move/trim a clip, apply a reversible effect | Dry-run first; may auto-apply only if user enables it |
| R2 expensive/external | provider call, media upload, asset download, generated media | Explicit confirmation or a user-defined policy with limits |
| R3 destructive/final | delete many clips, overwrite project, replace source media, final export to an existing path | Always confirm; show exact consequences |
| R4 prohibited | arbitrary shell, unrestricted filesystem, arbitrary FFmpeg, credential retrieval, bypassing app security | Never exposed as MCP tools |

### 5.3 Confirmation requirements

Confirmation is required for:
- Full timeline replacement or changes affecting more than a configurable number of clips.
- Delete, overwrite, or operations without a reliable undo path.
- Paid generation, provider use that uploads local media, and downloads from an untrusted source.
- Final render/export, especially if overwriting an existing file.
- Changing provider credentials, privacy settings, or MCP permissions.
- Any request that increases its own permissions or attempts to disable safety policy.

Confirmation must be shown in the TMCut UI with a summary of operations, target project, output path, external data transfer, estimated cost if known, and approve/cancel buttons. A tool argument like `confirmed: true` from the model is **not** proof of human consent.

### 5.4 Undo, rollback, and idempotency

- Group one MCP edit batch into one meaningful undo entry when supported by the existing store.
- Every mutating request includes an `operationId`/idempotency key generated by the client or server.
- Repeated requests with the same key return the original result rather than applying twice.
- Include the base project revision in mutating requests. If it changed since planning, return `REVISION_CONFLICT` and require a new dry-run.
- If an operation partially fails, report exactly which operations were applied; do not claim atomicity unless the service actually guarantees it.
- Never roll back a user edit that occurred after the MCP operation.

---

## 6. MCP capability contract

Implement the smallest useful set first. Tool names below are proposed stable public names; align naming with existing conventions during Phase 0 and version the public contract before release.

### 6.1 Read-only tools (MVP)

1. `tmcut.get_app_status`
   - Returns app version, readiness, runtime mode, supported contract version, and feature flags.
   - Must not return secrets, environment variables, arbitrary paths, or private user data.

2. `tmcut.get_capabilities`
   - Returns available features, supported operations, export formats, effect/transition IDs, and policy restrictions.
   - Capability list must be generated from actual registries/runtime availability, not duplicated static claims.

3. `tmcut.list_projects`
   - Returns paginated project metadata only.
   - Do not expose all project contents by default.

4. `tmcut.get_project_summary`
   - Input: `projectId` or an explicit `useCurrentProject` option.
   - Output: revision, canvas, duration, track/clip counts, media summary, missing assets, and warnings.
   - Apply limits and redact local paths unless the user specifically grants path visibility.

5. `tmcut.get_timeline`
   - Input: project ID, optional time range, track filters, pagination/maximum clip count.
   - Output: normalized clip summaries, time units, track IDs, stable clip IDs, effects and transitions only where supported.
   - Never return a giant project JSON blob by default.

6. `tmcut.list_media`
   - Returns imported media IDs, type, duration, dimensions, audio/video streams, and analysis status.
   - Use media IDs rather than trusting model-supplied filesystem paths.

7. `tmcut.get_job_status`
   - Returns state, progress, cancellation support, stage, warnings, and result references for a known job ID.

8. `tmcut.get_recent_activity`
   - Returns bounded, redacted audit entries for the current user/session only.

### 6.2 Planning and validation tools

9. `tmcut.create_edit_plan`
   - Input: project ID, natural-language goal, optional constraints and selected clip IDs.
   - Uses the existing AI gateway/task registry when configured.
   - Output is a structured `AIEditPlan`, assumptions, warnings, and plan ID.
   - Planning must not mutate the project or invoke paid generation by itself.

10. `tmcut.validate_edit_plan`
    - Validates schema, clip/media references, time ranges, operation allowlist, render compatibility, scopes, project revision, and budget.
    - Returns `valid`, errors, warnings, and a normalized diff.
    - Reject unknown operation names and unknown properties.

11. `tmcut.preview_edit_plan`
    - Returns a human-readable before/after summary and optionally a low-cost preview job request.
    - Must not commit edits.

12. `tmcut.apply_edit_plan`
    - Requires plan ID, expected revision, and explicit policy approval token from the app-side confirmation broker for operations that require approval.
    - Applies only validated Core commands.
    - Returns operation result, new revision, history/undo reference if available, and warnings.
    - Never accepts arbitrary project JSON as a trusted replacement.

### 6.3 Editing tools (phase after read-only gate)

13. `tmcut.add_clip` — media ID, target track, source range, timeline position, fit mode.
14. `tmcut.trim_clip` — clip ID, edge, new time, expected revision.
15. `tmcut.move_clip` — clip ID, destination track/time, expected revision.
16. `tmcut.update_clip_properties` — allowlisted properties only (volume, scale, position, opacity, rotation, speed, supported effect parameters).
17. `tmcut.add_text` — text, style preset ID, duration, position, target track.
18. `tmcut.add_transition` — clip ID, transition ID from `KNOWN_TRANSITIONS`, duration; validate neighbors and render support.
19. `tmcut.undo_last_ai_batch` — only for the latest identifiable AI batch if it remains safe to undo; must not undo unrelated user work.
20. `tmcut.save_project` — explicit project save only if current architecture exposes a safe service; no arbitrary save path.

Prefer `create_edit_plan` + `apply_edit_plan` over exposing a huge number of fine-grained tools initially. Fine-grained tools can be added only when their validation and undo semantics are stable.

### 6.4 Asset and template tools

21. `tmcut.search_assets` — search the local/authorized catalog; return license/compatibility metadata.
22. `tmcut.get_asset_details` — include version, rights status, compatibility, size, and provenance.
23. `tmcut.install_asset` — confirmation for download/install; safe archive validation and hash checks remain mandatory.
24. `tmcut.list_templates`
25. `tmcut.get_template`
26. `tmcut.create_template_from_project`
27. `tmcut.apply_template`
28. `tmcut.import_media_from_user_selection` — the app opens a native file picker; MCP must not pass arbitrary paths to bypass user selection.
29. `tmcut.get_media_thumbnail` — returns a bounded image/content reference; enforce image size limits.

### 6.5 AutoCut and render tools

30. `tmcut.create_autocut_job` — source media IDs, brief, profile ID, target settings, and policy constraints.
31. `tmcut.review_autocut_plan` — exposes assumptions, chosen segments, media provenance, and warnings.
32. `tmcut.approve_autocut_stage` — approval token issued by the UI; not a model-authored boolean.
33. `tmcut.start_preview_render` — low-cost preview/proxy only.
34. `tmcut.start_export` — final export; requires confirmation and validated render graph.
35. `tmcut.cancel_job` — only a cancellable job owned by the current session/user.
36. `tmcut.get_render_result` — metadata and a safe result reference, not arbitrary file reads.

The first milestone does not need all 36 tools. Ship a minimal, testable set and add tools by capability family.

---

## 7. MCP resources and prompt templates

### 7.1 Resources

Use read-only resources for stable, inspectable context, where supported by the chosen MCP SDK:

- `tmcut://app/capabilities`
- `tmcut://project/current/summary`
- `tmcut://project/{projectId}/timeline`
- `tmcut://project/{projectId}/media`
- `tmcut://jobs/{jobId}`
- `tmcut://templates/catalog`
- `tmcut://assets/catalog`
- `tmcut://policies/automation`

Resource responses must be bounded and sanitized. Do not expose arbitrary `file://` URIs, secrets, provider configuration keys, or unrestricted project files.

### 7.2 Prompt templates

Provide optional reusable prompts:
- `tmcut.plan_short_video`
- `tmcut.review_timeline`
- `tmcut.autocut_from_media`
- `tmcut.prepare_social_export`
- `tmcut.create_template`
- `tmcut.diagnose_render_failure`

Prompts guide the model but are not a security boundary. Every request must still pass schema validation, scope checks, policy evaluation, revision checks, and Core validation.

---

## 8. Tool schema and response standards

Every tool must define:
- Stable name and versioned input/output schema.
- Required scopes and risk tier.
- Whether it mutates data, incurs cost, uploads media, or needs UI confirmation.
- Timeouts, cancellation behavior, maximum input/output sizes, and rate limits.
- Idempotency and revision requirements.
- Typed errors and a redacted audit event.
- Tests for valid input, invalid input, permission denial, app-not-ready, cancellation, stale revision, and duplicate request.

### Example normalized response

```json
{
  "contractVersion": "1.0",
  "requestId": "req_...",
  "ok": true,
  "data": {
    "projectId": "project_...",
    "revision": 42
  },
  "warnings": [],
  "error": null
}
```

This envelope is illustrative. If MCP's protocol response shape or the selected SDK imposes a different structure, follow the protocol and keep the same semantic guarantees.

### Standard error codes

- `APP_NOT_READY`
- `APP_NOT_CONNECTED`
- `PERMISSION_DENIED`
- `CONFIRMATION_REQUIRED`
- `INVALID_ARGUMENT`
- `SCHEMA_VALIDATION_FAILED`
- `UNSUPPORTED_OPERATION`
- `UNSUPPORTED_CAPABILITY`
- `PROJECT_NOT_FOUND`
- `REVISION_CONFLICT`
- `CLIP_NOT_FOUND`
- `MEDIA_NOT_FOUND`
- `ASSET_NOT_FOUND`
- `JOB_NOT_FOUND`
- `JOB_NOT_CANCELLABLE`
- `BUDGET_EXCEEDED`
- `PROVIDER_UNAVAILABLE`
- `RATE_LIMITED`
- `OPERATION_TIMEOUT`
- `OPERATION_CANCELLED`
- `RENDER_FAILED`
- `INTERNAL_ERROR`

Errors must be actionable but must not reveal stack traces, credentials, or sensitive local paths to the MCP client.

---

## 9. Secure execution model

### 9.1 Trust boundaries

Treat all of the following as untrusted:
- Natural-language instructions from the user or external AI.
- Model-produced JSON, tool arguments, media descriptions, filenames, and metadata.
- Imported project/template/asset packages.
- Content extracted from video, captions, subtitles, transcripts, or external provider responses.
- MCP client identity until the pairing/authorization step has succeeded.

Prompt injection inside subtitles, filenames, project metadata, or media content must never change tool permissions. Tool policy is enforced in code.

### 9.2 Filesystem rules

- Do not expose `read_file`, `write_file`, `delete_file`, `list_directory`, or arbitrary path-based tools.
- Import uses a native file picker or registered media ID. A user-selected path is converted into a media ID after validation.
- Export uses the existing export flow and a confirmed destination. Reject traversal, device paths, reserved names, and invalid extensions where applicable.
- Normalize and canonicalize paths in main process; do not trust renderer checks alone.
- Keep temporary files in app-owned temporary/cache locations and clean them according to a bounded policy.
- Never read arbitrary `.env`, credential stores, browser profiles, SSH keys, or unrelated documents for AI context.

### 9.3 Process and render rules

- No shell MCP tool.
- No arbitrary executable name or argument array from a model.
- Render is invoked by a typed request that compiles a validated Render Graph through the existing compiler.
- Only known FFmpeg binary path, supported flags, bounded resources, and app-managed task queue are allowed.
- Enforce max duration, resolution, concurrency, temp storage, and cancellation according to settings.
- Do not allow an MCP client to kill unrelated processes.

### 9.4 Provider and privacy rules

- Reuse the existing provider gateway and task routing; do not create a second credential store.
- API keys remain in OS-secure storage/trusted backend according to current architecture and never appear in MCP results.
- Before sending local media to an external provider, show exactly which media/derived data is sent, to which configured provider, and for what task.
- Do not silently switch to a paid provider or upload media to a fallback provider.
- Log provider/model identifiers and usage metadata, not secrets or unnecessarily complete prompts.

### 9.5 Abuse controls

- Per-session and per-tool rate limits.
- Maximum payload sizes, clip counts, timeline span, output bytes, and job concurrency.
- Timeout and bounded retries; no unbounded repair loops.
- Cancellation propagated to underlying job when supported.
- Repeated failures trigger backoff, not rapid retries.
- Session revocation and emergency “Disable MCP automation” switch in TMCut settings.
- Audit log records client/session, tool name, risk tier, approval event, operation ID, result, and timestamp; redact sensitive values.

---

## 10. Application-side Automation Facade

Create a typed service boundary after the repository audit. Proposed conceptual contract:

```ts
interface TmcutAutomationFacade {
  getAppStatus(): Promise<AppStatus>;
  getCapabilities(): Promise<AutomationCapabilities>;
  listProjects(input: ListProjectsInput): Promise<Page<ProjectSummary>>;
  getProjectSummary(input: ProjectRef): Promise<ProjectSummary>;
  getTimeline(input: GetTimelineInput): Promise<TimelineSnapshot>;
  createEditPlan(input: CreateEditPlanInput): Promise<EditPlanResult>;
  validateEditPlan(input: ValidateEditPlanInput): Promise<ValidationResult>;
  applyEditPlan(input: ApplyEditPlanInput): Promise<ApplyEditResult>;
  createAutoCutJob(input: CreateAutoCutInput): Promise<JobRef>;
  getJobStatus(input: JobRef): Promise<JobStatus>;
  cancelJob(input: JobRef): Promise<CancelResult>;
}
```

This is a target contract, not a directive to duplicate services that already exist. Reuse current services and name files according to repository conventions.

### Required semantics

- All inputs validated at runtime.
- Every mutating call carries `sessionId`, `operationId`, expected project revision, and authorized scopes through trusted server-side context; never trust those fields solely because the model supplied them.
- `applyEditPlan` accepts only validated plan IDs or a validated, bounded operation list; never arbitrary project serialization.
- The facade returns stable IDs and normalized errors.
- Facade does not accept raw provider API keys, shell strings, raw FFmpeg commands, or arbitrary paths.
- UI-originated edits and MCP-originated edits converge on the same store/Core command path so undo, autosave, and validation remain consistent.

---

## 11. Repository layout proposal

Adapt to the actual monorepo; do not create a package until the audit verifies package conventions.

Potential layout:

```text
D:/Applications/tm-tools/
  app/
    composables/tmcut/                 # existing UI-facing composables
    utils/tmcut/                        # existing compiler/helpers
    services/automation/                # only if app already uses this pattern
    components/tmcut/                   # visible permission/status UI
  electron/
    main.cjs                            # existing main entry
    preload.cjs                         # expose narrow APIs only
    automation-bridge.cjs               # proposed main-process bridge
    automation-policy.cjs               # proposed scope/risk policy
  packages/
    tmcut-mcp/                           # optional new package, audit dependent
      src/server.ts
      src/tool-registry.ts
      src/resources.ts
      src/prompts.ts
      src/schemas/
      src/transport/
      test/
  tests/
    unit/
    integration/
    e2e/
D:/Applications/tmcut-core/
  src/                                  # existing zero-dependency core
  test/
```

Do not put MCP SDK imports into `@tmcut/core`. Core must remain runtime-independent and must not gain Node/Electron/MCP dependencies.

---

## 12. Implementation phases and gates

Do not implement the whole roadmap in one PR. Every phase ends with a report, tests, and a clear go/no-go decision.

### Phase 0 — Repository audit and threat model (P0, mandatory)

Tasks:
1. Read `AGENTS.md`, both supplied roadmaps, `docs/TMCut Architecture v3.md`, package manifests, Electron main/preload, AI gateway, project store, Core command APIs, job queue, export flow, and current security audit.
2. Search for existing MCP server/client packages and current SDK versions.
3. Map renderer ↔ preload ↔ main ↔ store/Core ↔ render pipeline data flow.
4. Identify how the app is started, how paths and project IDs are represented, and how jobs/events/cancellation are handled.
5. Produce a table: `capability → current module → API available → security gap → reuse/change`.
6. Threat-model local stdio, child process, bridge authentication, session lifecycle, prompt injection, path traversal, duplicate tool calls, stale revisions, and accidental paid operations.
7. Decide transport and supported host(s) for MVP. Document why.

Deliverables:
- `docs/TMCut MCP Architecture v4.md`
- `docs/TMCut MCP Security Threat Model v4.md`
- Repository mapping and decision record
- No broad code changes before review.

Exit gate: the team can trace a read-only request from MCP tool to a real current-project snapshot without inventing a parallel state store.

### Phase 1 — Contracts, schemas, and policy engine (P0)

Tasks:
- Define `AutomationCapabilities`, `ProjectSummary`, `TimelineSnapshot`, `EditPlan`, `ValidationResult`, `JobStatus`, `ToolError`, `Scope`, `RiskTier`, and `ApprovalRequest`.
- Add runtime validation with the existing schema tooling if possible. Do not add a new runtime dependency without approval.
- Define public contract version and compatibility policy.
- Implement policy evaluation independent from the MCP SDK: scope, risk, confirmation, budget, rate limits, revision, idempotency.
- Define redaction and audit-event schema.

Tests:
- Unknown fields and operation names rejected.
- Invalid IDs, time units, negative durations, oversized payloads rejected.
- Unknown scope denied.
- Confirmation cannot be forged by a model boolean.
- Duplicate idempotency key does not mutate twice.
- Stale revision returns `REVISION_CONFLICT`.

Exit gate: policy unit tests pass before any mutating tool exists.

### Phase 2 — Read-only MCP server (P0)

Implement only:
- `get_app_status`
- `get_capabilities`
- `list_projects`
- `get_project_summary`
- `get_timeline`
- `list_media`
- `get_job_status`

Tasks:
- Create server and transport using the chosen, verified MCP SDK/API.
- stdout protocol purity and stderr logging.
- bounded pagination and sanitized output.
- server lifecycle, app-not-ready behavior, connection timeout, and graceful shutdown.
- Add a TMCut UI status panel: MCP disabled/enabled, paired client, current scopes, disconnect/revoke, recent activity.
- Start with read-only scopes and no mutation tools.

Tests:
- Protocol handshake and tool discovery using a real compatible test client.
- App closed, app starting, app disconnected, and stale session.
- Very large project response remains bounded.
- No secrets or raw absolute paths in default output.
- Tool errors conform to contract.
- Security test: an untrusted/remote origin cannot invoke the privileged bridge.

Exit gate: a real MCP client can inspect the actual current project and timeline while the editor remains the source of truth.

### Phase 3 — Planning and dry-run (P0)

Implement:
- `create_edit_plan`
- `validate_edit_plan`
- `preview_edit_plan`

Tasks:
- Reuse the current AI gateway and task registry where feasible.
- Use existing `EditOperation`/plan schema if present; align rather than duplicate.
- Validate media/clip IDs against the current project snapshot.
- Include assumptions, warnings, required assets, provider usage, and revision.
- Produce a concise before/after diff.
- Planning must not mutate project state or run paid generation implicitly.

Tests:
- Malformed LLM output is rejected.
- Unknown clip IDs rejected.
- Unsupported render operation flagged before apply.
- Plan based on old revision cannot be applied.
- Prompt injection inside a subtitle/file name cannot add scopes or bypass policy.
- Provider unavailable degrades with a typed error; manual editing still works.

Exit gate: the AI can propose a valid plan and the user can inspect it without any project mutation.

### Phase 4 — Controlled edits and confirmation broker (P0/P1)

Implement:
- `apply_edit_plan`
- limited direct edit tools only if needed
- operation history and `undo_last_ai_batch`
- confirmation UI and approval token lifecycle

Tasks:
- Route mutations through current project store and `@tmcut/core` validated operations.
- Show confirmation for destructive or high-impact edits.
- Use expected revision and idempotency keys.
- Preserve undo/redo, autosave, selection correctness, and project migration compatibility.
- Confirm a user edit made during planning triggers revision conflict rather than overwriting it.
- Record an AI batch ID so its changes can be explained and, where safe, undone.

Tests:
- Apply one small edit, verify timeline, save/reopen, and undo/redo.
- Repeating the same request does not duplicate clips.
- A stale plan does not overwrite a newer user change.
- Denied confirmation produces no mutation.
- A partially failed batch reports the exact partial result.
- Lock/track/clip constraints are honored by Core.

Exit gate: at least one real edit is applied safely in the running desktop app and remains correct after save/reopen.

### Phase 5 — Asset and template operations (P1)

Implement in slices:
- read/search catalog and template tools first;
- user-selected media import;
- template apply/create;
- asset download/install only after license, integrity, and confirmation checks.

Tasks:
- Use media IDs instead of arbitrary local paths.
- Reuse existing asset/template schema and versioning from the v3 roadmap.
- Preserve license metadata and provenance.
- Validate package hashes, archive paths, file count, decompressed size, and compatibility.
- Do not let downloaded assets execute code.

Exit gate: the AI can apply a valid editable template or import a user-selected media file and the project can be reopened offline.

### Phase 6 — AutoCut job orchestration (P1)

Implement:
- `create_autocut_job`
- `review_autocut_plan`
- `cancel_job`
- job status/progress
- approval checkpoints for external/paid tasks

Tasks:
- Reuse existing AutoCut analysis, segment scoring/triage, EDL conversion, captions, and render job queue.
- Represent each stage explicitly: ingest → analyze → plan → resolve assets → build → validate → preview → approval → final render → save.
- Propagate cancellation where supported.
- Keep job state recoverable after a server/client disconnect.
- Store provenance, model/provider metadata, cost estimates where available, and warnings.
- Do not require image/video generation to ship the first usable automation workflow.

Exit gate: the MCP client can create an editable AutoCut draft from user-selected media, monitor it, cancel it, review the plan, and export only after user approval.

### Phase 7 — Preview and final export (P1)

Implement:
- preview/proxy render
- `start_export`
- `get_render_result`
- explicit destination selection/confirmation

Tasks:
- Use existing render graph/compiler and FFmpeg task queue.
- Never accept raw FFmpeg arguments.
- Prevent accidental overwrite; if the destination exists, require explicit UI confirmation.
- Validate output profile, codecs, resolution, frame rate, audio tracks, missing media, and unsupported effects.
- Surface progress, errors, logs (redacted), and output metadata.

Exit gate: real FFmpeg smoke render passes from an MCP-initiated validated job, and the resulting editable project and exported file are both usable.

### Phase 8 — Host setup, UX, and documentation (P1)

Deliver:
- documented setup for one verified MCP host first;
- local-only connection configuration;
- permission and revoke UI;
- example workflows;
- troubleshooting guide;
- version/compatibility matrix;
- security disclosure and known limitations.

Any host-specific JSON config must be tested against the actual installed host and server command. Do not invent a package name, command, or SDK option before the implementation is selected.

Exit gate: a user can set up the connection by following the document, verify the server, grant read-only access, and revoke access without editing application source.

### Phase 9 — Hardening and release (P0 release gate)

- Run dependency/license audit for the MCP SDK and transitive dependencies.
- Add fuzz/negative tests for schemas, paths, large payloads, protocol framing, and malformed client messages.
- Run an external security review of trust boundaries and Electron IPC.
- Verify Electron production packaging, Windows paths/spaces, clean install, upgrade, and uninstall.
- Test with MCP disabled, disconnected, and server-crashed; manual editor must continue to work.
- Verify logs contain no secrets or full local media content.
- Document data flows, consent, limitations, and incident response.
- Add a kill switch and session revocation test.

Exit gate: no open critical/high security issue; all required tests pass; user can revoke a client immediately; manual TMCut use remains functional.

### Future Phase 10 — Optional remote MCP (not MVP)

Only after local mode is stable:
- authenticated remote identity and scopes;
- TLS and token rotation/revocation;
- tenant/project isolation;
- rate/cost controls and audit;
- explicit media transfer policy;
- deployment and incident response plan.

---

## 13. Suggested implementation order for the first 10 coding rounds

1. **R1 Audit only:** architecture map, current APIs, threat model, transport decision.
2. **R2 Contract only:** public types, schema tests, error model, policy matrix.
3. **R3 Read-only bridge:** expose a narrow app status + project summary API; no MCP server yet.
4. **R4 MCP read-only server:** handshake and two tools (`get_app_status`, `get_project_summary`).
5. **R5 Read-only expansion:** timeline, media, capabilities, jobs; integration tests.
6. **R6 Plan/dry-run:** use current AI gateway; validate and render diff, no mutation.
7. **R7 Approval UX:** app-side confirmation broker, approval tokens, revoke/session UI.
8. **R8 First mutation:** apply one minimal reversible edit plan through the existing store/Core.
9. **R9 Job lifecycle:** AutoCut preview job, status, cancellation, and error handling.
10. **R10 Export + packaging hardening:** final export confirmation, Windows host setup, security regression.

Do not advance merely because code compiles. Each round must meet its exit gate with real integration evidence.

---

## 14. Required tests and quality gates

### Unit tests
- Schema parsing and unknown-field rejection.
- Scope/risk/confirmation policy.
- Revision conflict and idempotency.
- Redaction.
- Tool registry capability consistency.
- Job lifecycle state machine.
- Error normalization and cancellation.

### Integration tests
- MCP tool → bridge → real app service → current project store/Core.
- Read-only snapshot matches the UI.
- Apply plan updates the UI, creates history, and survives save/reopen.
- User edits during planning trigger conflict.
- App restart invalidates/re-establishes sessions safely.
- Provider outage does not break manual editing.
- Export uses the real render pipeline.

### Security tests
- Untrusted sender/origin denied by privileged IPC.
- Path traversal and arbitrary path arguments denied.
- Tool cannot request an unapproved scope.
- Model-supplied `confirmed: true` is ignored.
- No shell/process/FFmpeg escape route.
- Oversized requests, too many clips, and too many concurrent jobs rejected.
- Secrets absent from MCP output, logs, project files, and tool errors.
- Prompt injection in captions/media metadata cannot change authorization.
- Client disconnect and cancellation stop or detach jobs according to documented semantics.
- Revoked session cannot invoke further tools.

### End-to-end tests
- Start app, connect MCP host, list projects, inspect timeline.
- Ask AI to plan a 15–30 second vertical edit from selected media.
- Review diff and approve one reversible edit.
- Verify timeline and undo/redo.
- Run AutoCut preview, inspect warnings, cancel one job.
- Approve final export, verify file and editable project.
- Disable MCP and verify normal editor workflows still work.

### Existing project gates to preserve

Follow the actual current `AGENTS.md` and roadmap checklist. At minimum, run the applicable:
- `pnpm typecheck`
- ESLint on all touched files
- Core tests, boundaries, lint, and typecheck when `@tmcut/core` is touched
- current unit/integration suites and real FFmpeg render smoke test when render/job behavior changes
- en/vi i18n parity for all new user-facing strings
- production build and real Electron launch/probe when main/preload/packaging changes

Do not trust a TypeScript command that does not actually include the changed files; verify the real repository's typecheck script. Main/preload changes require a full Electron restart.

---

## 15. Operational state machine

Use explicit states for every long-running job:

```text
created
  -> awaiting-approval (if required)
  -> queued
  -> running
  -> succeeded | failed | cancelled
```

Optional substates may include `validating`, `analyzing`, `planning`, `building`, `previewing`, `rendering`, and `saving`, but preserve a normalized terminal state.

Rules:
- State transitions are validated server-side.
- A cancelled job cannot later report success unless the underlying system proves completion before cancellation.
- Reconnecting clients can query known job IDs within their authorized session.
- Job IDs are opaque; do not encode paths or secrets in them.
- Progress is monotonic where possible and must not be fabricated.
- Unknown or stale job IDs return `JOB_NOT_FOUND`.
- Persist enough state for recovery if current job infrastructure supports it; otherwise clearly document which jobs cannot survive an app restart.

---

## 16. Example workflows

### Workflow A — Inspect project

1. AI calls `get_app_status`.
2. AI calls `get_capabilities`.
3. AI calls `get_project_summary` and `get_timeline` with bounded output.
4. AI reports duration, tracks, missing media, and limitations.
5. No mutation, provider call, or file upload occurs.

### Workflow B — Edit with approval

1. User: “Make a 20-second vertical promo from the selected clips, preserve dialogue.”
2. AI reads selected clip IDs and project revision.
3. `create_edit_plan` returns a structured plan and assumptions.
4. `validate_edit_plan` checks references, timing, capabilities, and permissions.
5. `preview_edit_plan` shows a before/after diff.
6. TMCut UI displays a confirmation dialog for the planned batch.
7. On approval, `apply_edit_plan` applies validated Core operations.
8. AI reports the result and provides an undo path.
9. User previews the result; final export is a separate approval.

### Workflow C — AutoCut with privacy boundary

1. User chooses media through TMCut's native picker/import UI.
2. MCP receives media IDs, not raw arbitrary paths.
3. Local metadata and scene analysis run where feasible.
4. Before any external provider upload, TMCut shows the provider and data to be sent.
5. AI builds a plan; user reviews segments and assumptions.
6. Preview renders locally through the existing FFmpeg pipeline.
7. User approves final export.
8. Output and editable project metadata are reported through safe references.

### Workflow D — Recover from failure

1. MCP receives `PROVIDER_UNAVAILABLE` or `RENDER_FAILED`.
2. It reports the failed stage, sanitized diagnostic, and retry/cancel options.
3. It does not silently switch to another paid provider.
4. The project remains intact and manual editing remains available.

---

## 17. AI coding-agent execution prompt

Copy the following prompt into the coding agent working in the TMCut repository.

```text
You are implementing TMCut v4 MCP automation. Read these files first:
- AGENTS.md
- TMCut Roadmap v3.md
- tmcut-v3-ai-asset-template-autocut-roadmap-v2.md
- docs/TMCut Architecture v3.md
- this document: docs/TMCut MCP Roadmap v4.md (or the path where it is saved)

NON-NEGOTIABLE RULES
1. Start with an audit. Do not edit code in the first response.
2. Inspect actual files and scripts; never assume APIs, packages, paths, SDK versions, or MCP host configuration.
3. Reuse existing project store, @tmcut/core, AI gateway, task registry, job queue, render compiler, and Electron IPC conventions. Do not create duplicate sources of truth.
4. @tmcut/core stays runtime-independent: no MCP SDK, Node built-ins, Electron, Vue, Nuxt, or browser globals.
5. Never expose shell execution, arbitrary filesystem access, arbitrary FFmpeg arguments, credential reads, or unbounded UI automation as MCP tools.
6. All mutations must pass schema validation, permission/risk checks, revision checks, Core validation, and existing undo/autosave behavior.
7. Read-only tools come first. No mutation tool until the read-only integration tests pass.
8. Model arguments such as confirmed=true are not human approval. High-risk actions need an app-side confirmation broker.
9. Do not upload media to a provider or switch to a paid provider without policy and user consent.
10. Keep all user-facing strings in i18n en/vi with parity. Comments/constants/variable names in English. Do not add runtime dependencies without approval.
11. Work in small rounds. At the end of each round report changed files, tests actually run, exact pass/fail results, known gaps, and the next smallest round. Do not claim a test passed unless it ran.
12. Do not commit unless explicitly asked.

ROUND 1 — AUDIT ONLY
- Map current app, Electron main/preload, @tmcut/core, AI gateway, project store, job queue, AutoCut, template/asset code, and export pipeline.
- Search for existing MCP code/dependencies and inspect the current Electron security audit.
- Identify how a separate MCP process can reach a narrow trusted app bridge.
- Compare stdio child process, app-owned child process, and local IPC options.
- Produce a capability→module→gap→risk table and a threat model.
- Recommend the smallest safe MVP tool list and one transport.
- Do not modify code until the audit report is ready.

After the audit, implement phases from this roadmap one at a time:
Phase 1 contracts/policy tests;
Phase 2 read-only MCP;
Phase 3 planning/dry-run;
Phase 4 confirmation + first reversible edit;
then assets/templates, AutoCut, render/export, and hardening.

Before each phase, list the exact files expected to change and the acceptance tests. If repository reality conflicts with this roadmap, stop and explain the evidence and a minimal adjustment instead of forcing the design.
```

---

## 18. Definition of done for TMCut v4 MCP MVP

MVP is complete only when all of the following are true:

- [ ] A real MCP host connects to the packaged local server using documented steps.
- [ ] User can enable/disable MCP and revoke a client/session from TMCut.
- [ ] Read-only tools return the real current app/project state with bounded, sanitized data.
- [ ] AI can produce a schema-valid edit plan and dry-run diff without mutating the project.
- [ ] At least one reversible edit is applied through the existing store/Core path after explicit approval.
- [ ] Undo/redo, autosave, save/reopen, and project revision checks work.
- [ ] AutoCut job status and cancellation are reliable for supported stages.
- [ ] Preview and final export use the existing validated render graph and FFmpeg pipeline.
- [ ] No arbitrary shell, filesystem, raw FFmpeg, secret, or permission-escalation tool is exposed.
- [ ] Security tests prove confirmation cannot be forged by model arguments and revoked sessions are denied.
- [ ] Existing editing works when MCP is disabled, disconnected, or broken.
- [ ] Existing typecheck/lint/core/build/i18n gates pass, plus MCP integration and real render smoke tests.
- [ ] Documentation states exactly which host, tools, operations, privacy boundaries, and limitations are supported.

---

## 19. Decisions intentionally left open until audit

The coding agent must resolve these with repository evidence, not guesses:

1. Exact MCP SDK/package and version.
2. Whether the MCP server is a separate package or a child process owned by Electron.
3. Local bridge transport and authentication mechanism.
4. First supported MCP host.
5. Existing runtime schema library and whether it can validate MCP tool schemas.
6. Current stable project revision/history interface.
7. Whether jobs can persist/recover across app restarts.
8. Exact file-picker and export destination APIs.
9. Which operations have reliable undo semantics.
10. Whether any current security audit findings remain open.

The preferred solution is the smallest architecture that reuses current code and can be tested end-to-end. Do not overbuild remote mode, general-purpose desktop automation, marketplace workflows, or a second agent framework before the local MCP MVP is proven.

---

## 20. Versioning and maintenance

- Keep this roadmap as the implementation plan; keep `TMCut Roadmap v3.md` as the historical app/core progress log unless the project owner explicitly merges them.
- Add a separate `docs/TMCut MCP Architecture v4.md` for final decisions, tool schemas, trust boundaries, and implementation logs.
- Record each implementation round with date, files changed, test commands/results, and any deviation from this plan.
- If a public tool's input/output contract changes incompatibly, increment the MCP contract major version and document migration.
- Feature flags must reflect real runtime availability. A tool that is not implemented or not safe must not be advertised as available.
- Never report an operation as successful before the application service confirms it.

**Final principle:** the external AI should be able to understand and operate TMCut through a small, auditable set of domain-level capabilities while TMCut retains ownership of project state, validation, user consent, rendering, and safety.
