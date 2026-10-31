# Archive — tm-tools documentation v1 (pre-TMCut extraction)

> Frozen on **2026-10-31**, the day the TMCut video suite was lifted out of
> `tm-tools` into its own repository (`tm-studio`).

Everything in this folder describes the application **before** that split. It is
kept verbatim for history and archaeology: code paths, file names, test names and
screens referenced here no longer exist in `tm-tools`, and some of them now live
in `tm-studio` under different paths.

**Do not treat these documents as current behaviour.** The living documentation
is one level up in [`docs/`](../../README.md).

## What is archived here

| File | What it documented |
| --- | --- |
| `TMCut Architecture v2.md`, `TMCut Architecture v3.md` | Timeline engine, store, render graph, UI system |
| `TMCut Roadmap v3.md` | Rounds R1–R150 of the TMCut build |
| `TMCut_Roadmap_v4_MCP_AI_Automation.md` | MCP + AI automation roadmap |
| `TMCut MCP Architecture v4.md`, `TMCut MCP Security Threat Model v4.md` | MCP server design and threat model |
| `MCP_HOST_SETUP_GUIDE.md` | Wiring external MCP hosts to tm-tools |
| `capcut_editor_ui_components_reference.md` | CapCut-style editor component spec |
| `architecture/tmcut-cross-platform-fx-audit.md` | Cross-platform effects audit |
| `generation-adapters-audit.md` | AI video-generation adapter gate (roadmap v3 §25) |
| `tmcut-*.md` (5 files) | Feature roadmaps, HTML/CSS studio, page test report |
| `guides/user-guide.md` | End-user guide for the TMCut Studio UI |
| `guides/asset-marketplace-guide.md` | Asset Center starter catalog packaging |
| `guides/assets-and-runwayml-setup-guide.md` | Layered assets + Runway integration |
| `ai-key-ownership-and-hub-sharing.md` | Local AI vault vs hub provider plane (local vault removed) |
| `production-process/*.md` (3 files) | Anime production SOPs built around TMCut |

## Where this content went

- Product code and its roadmap moved to the **tm-studio** repository.
- Shared identity, connections and AI credentials stay in **tm-hub**; the current
  contract for tm-tools is described in
  [`docs/ai-and-hub-connections.md`](../../ai-and-hub-connections.md).
- Anything that still applies to browser profiles, downloader/FFmpeg tools,
  utilities, auth or auto-update was rewritten into the live v2 docs rather than
  copied.

## Retrieval

The files are plain Markdown; use search (`grep -ri "term" docs/archive`) when
you need to know why a v1 decision was made. When a v1 fact is still relevant,
copy it into the v2 docs and cite the archive file — never link archived pages as
if they were current guides.
