# Generation Adapters Audit — Roadmap v3 §25 (Phase 9)

> Status: **OPEN** — no provider is cleared for adapter implementation yet.
> Rule (§25 rule 12/13): an adapter may only be built against an **officially
> documented, supported API** that the maintainer has verified against the
> provider's own docs **in that development session**. Until then the app
> offers **manual import** through the Asset Center (already shipped), and the
> UI marks every generation provider as `planned`.

## Why this gate exists

Generation providers change endpoints, auth schemes, and pricing frequently.
Third-party wrappers exist for most models (Seedance, Veo, Flow) but a wrapper
is not the provider's supported API: rights terms, cost disclosure, and data
handling all flow through whoever serves the request. TMCut only promises
cost/rights transparency it can actually verify, so adapter work is blocked
per provider until the checklist below passes against primary sources.

## Verification checklist (per provider)

Before any code goes into `electron/tools/generation/<provider>.cjs` and the
provider is registered via `registerGenerationAdapter()` (core
`generationAdapter.mjs`), ALL of these must be documented here with the
official URL and a verification date:

1. **Endpoint & auth** — official REST/SDK contract (base URL, auth header,
   key issuance page).
2. **Job lifecycle** — is generation async? job-submit / status-poll /
   result-fetch URLs; progress reporting; cancel support.
3. **Inputs** — prompt limits, reference-image/video inputs, resolution and
   duration caps, aspect ratios, seed support.
4. **Outputs** — formats, max resolution, expiry of result URLs (we must
   download into the Asset Center immediately, not link).
5. **Rate limits & concurrency** — RPM, parallel jobs, queue behavior.
6. **Cost** — public price per second/image/credit; we surface an estimate
   before submit (`estimateCost`) and record spend in the usage tracker.
7. **Rights** — commercial use of outputs, attribution requirements,
   whether outputs may be redistributed; training/retention of prompts.
8. **Region/ToS availability** — whether the API can be used from the user's
   region and whether our usage model (local desktop app, user's own key) is
   allowed by the ToS.

## Provider register

| Provider | Modality | Status | Notes |
| --- | --- | --- | --- |
| **Runway** | video | **verified=false** / **needs update** | Adapter uses deprecated Gen-3 Alpha (sunset Jul 30 2026), wrong base URL (`api.runwayml.com` vs `api.dev.runwayml.com`), old model IDs (`gen3a`, `gen3a-turbo`). Current supported: Gen-4, Gen-4 Turbo, Gen-4.5. Must update adapter before marking verified. |
| Seedance 2.5 (ByteDance) | video | `planned` / **unverified** | No official self-serve REST contract confirmed from primary docs this session. Do NOT code against community endpoints. |
| Google Flow / Veo 3.1 | video | `planned` / **unverified** | Flow is a product surface; the supported API path is the Gemini API video generation family (Veo 3.1 Standard/Fast). Must be verified per checklist, incl. regional availability and pricing. |
| OpenAI (Sora family) | video | **DEPRECATED** — API shut down Sep 24 2026 | Sora 2 + Videos API no longer available. No one-to-one replacement API. Access via ChatGPT subscription only (Plus/Pro), not API. Do NOT build adapter. |
| Kuaishou Kling 3.0 Pro | video | `not started` | Official docs at kling.ai/document-api. Models: kling3.0_pro, klingO3_pro. Need to verify self-serve REST contract, pricing, regional availability. |
| fal.ai / Replicate (aggregators) | image+video | `rejected-as-substitute` | Useful products, but serving through an aggregator is a different rights/cost chain than the model owner; only allowed if explicitly labeled as aggregator in the capability manifest (`providerId`, `rights.license`). |

Every row stays `unverified`/`not started` until checklist items 1–8 are
filled in below that row with links + dates. `registerGenerationAdapter`
refuses to surface `verified: true` manifests with invalid fields, and the UI
must hide providers whose manifest reports `verified: false`.

## What IS implemented (core contract, no provider code)

`tmcut-core/src/generationAdapter.mjs` defines the host-side contract only:

- `createCapabilityManifest()` — cost model, rights, privacy, limits,
  `verified` flag (default false).
- Job shapes: `createGenerationJobInput`, `createJobStatusResponse`,
  `createGenerationResult`, `createCostEstimate`, `GENERATION_JOB_STATUS`.
- Registry: `registerGenerationAdapter` (requires `manifest`, `submitJob`,
  `pollJob`, `cancelJob`, `downloadResult`, `estimateCost`), `getGenerationAdapter`,
  `listGenerationAdapters`, `isProviderVerified`.

Adapter implementations, when verified, live in tm-tools main process
(never renderer — keys must stay in the safeStorage vault like the AI
gateway), queue downloads through the Asset Center, record cost via
`recordGenerationCost` (Phase 10 usage tracker), and label every installed
asset with provider + model provenance.

## Manual-import fallback (shipping today)

Until a provider is verified, users obtain generated media from any provider's
own app/site and import it: Asset Center → Add media → probe → license
status. This path is fully offline-safe and already passes the Phase 2 gates.
