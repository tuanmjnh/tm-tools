# TMCut MCP Host Setup Guide

> **Target audience:** Users who want to connect Claude Desktop, Cursor, or any MCP-compatible client to TMCut.
> **Prerequisites:** TMCut desktop app installed and running.

---

## Quick Start

### 1. Install TMCut Desktop App

Download from [releases](https://github.com/tuanmjnh/tm-tools/releases) or build from source:

```bash
# From source
cd tm-tools
pnpm install
pnpm build
pnpm dev  # Development mode
# OR
pnpm build:electron  # Production build
```

### 2. Enable MCP in TMCut

1. Open TMCut desktop app
2. Go to **Settings → AI & MCP** (or press `Ctrl+,` → AI & MCP tab)
3. Toggle **Enable MCP Server** ON
3. Note the **MCP Server Port** (default: stdio, no port needed for stdio transport)

### 3. Configure Your MCP Client

#### **Claude Desktop** (macOS/Windows)

Edit `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "tmcut": {
      "command": "/Applications/TMCut.app/Contents/MacOS/TMCut",
      "args": ["--mcp-server"],
      "env": {}
    }
  }
}
```

**Windows:**
```json
{
  "mcpServers": {
    "tmcut": {
      "command": "C:\\Program Files\\TMCut\\TMCut.exe",
      "args": ["--mcp-server"],
      "env": {}
    }
  }
}
```

**Linux:**
```json
{
  "mcpServers": {
    "tmcut": {
      "command": "/opt/tmcut/tmcut",
      "args": ["--mcp-server"],
      "env": {}
    }
  }
}
```

> **Note:** The `--mcp-server` flag tells TMCut to start in MCP server mode (stdio transport). The main app window won't open.

#### **Cursor** (VS Code fork)

Add to `~/.cursor/mcp.json` (or project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "tmcut": {
      "command": "/Applications/TMCut.app/Contents/MacOS/TMCut",
      "args": ["--mcp-server"],
      "env": {}
    }
  }
}
```

#### **Continue.dev** (VS Code extension)

Add to `~/.continue/config.json`:

```json
{
  "mcpServers": {
    "tmcut": {
      "command": "/Applications/TMCut.app/Contents/MacOS/TMCut",
      "args": ["--mcp-server"]
    }
  }
}
```

#### **Generic MCP Client** (any stdio client)

```bash
# Direct stdio test
/Applications/TMCut.app/Contents/MacOS/TMCut --mcp-server
```

You should see JSON-RPC initialization messages on stderr.

---

## Available Tools (38 Total)

### Context & Project (Read)
| Tool | Description |
|------|-------------|
| `project.get_context` | Current project name, canvas, duration, track counts |
| `project.get_timeline` | Full timeline: tracks, clips, markers |
| `project.list_assets` | Library assets available to drop on timeline |

### Proposal Lifecycle
| Tool | Description |
|------|-------------|
| `edit.create_proposal` | Start a proposal (undo group) for a batch of edits |
| `edit.get_proposal` | Read pending proposal and validation state |
| `edit.validate_proposal` | Dry-run validate proposal against current timeline |
| `edit.discard_proposal` | Throw away pending proposal without touching timeline |
| `edit.apply_proposal` | Apply queued proposal as ONE undo step (requires approval) |

### Timeline Edits (Queue into Proposal)
| Tool | Description |
|------|-------------|
| `timeline.add_clip` | Add clip to track (video/audio/text) |
| `timeline.move_clip` | Move clip to new start time |
| `timeline.trim_clip` | Trim clip in/out edge |
| `timeline.remove_clip` | Remove clip from timeline |
| `timeline.split_clip` | Split clip at time |
| `timeline.set_volume` | Set track volume |
| `timeline.add_caption` | Add caption (text clip) |
| `timeline.set_transition` | Add transition to clip cut |
| `timeline.set_effect` | Set effects on clip |

### Playback
| Tool | Description |
|------|-------------|
| `playback.seek` | Move playhead |
| `playback.play` | Start playback |
| `playback.pause` | Pause playback |

### Asset Center (Phase 4)
| Tool | Description |
|------|-------------|
| `asset.list_catalog` | List asset catalog with filtering |
| `asset.install` | Install asset from catalog (queues download) |
| `asset.uninstall` | Uninstall installed asset |
| `asset.install_status` | Get installation status |

### Templates (Phase 4)
| Tool | Description |
|------|-------------|
| `template.list` | List templates (built-in + user) |
| `template.apply` | Apply template to create/insert project |
| `template.save_as` | Save current project as user template |
| `template.delete` | Delete user template |
| `template.import` | Import `.tmcut-template.json` file |
| `template.export` | Export template to `.tmcut-template.json` |

### Export Queue (Phase 4)
| Tool | Description |
|------|-------------|
| `export.list_jobs` | List export jobs with status filter |
| `export.add_job` | Add export job to queue (cost, requires approval) |
| `export.pause_job` | Pause running/waiting job |
| `export.resume_job` | Resume paused job |
| `export.cancel_job` | Cancel waiting/running job |
| `export.retry_job` | Retry failed job |
| `export.clear_history` | Clear history by status |

---

## Events (Server → Client)

| Event | Payload |
|-------|---------|
| `event:job_status` | `{ jobId, status: 'running'\|'done'\|'failed'\|'cancelled', progress, projectId, error? }` |
| `event:job_progress` | `{ jobId, progress, speed, downloaded, projectId }` |
| `event:proposal_changed` | `{ proposal: { intent, operations[], createdAt } }` |
| `event:project_changed` | `{ projectId, name, canvas, durationSec }` |

---

## Security Model

| Layer | Protection |
|-------|------------|
| **Transport** | stdio only (no network exposure) |
| **Authentication** | OS user = trusted (no auth needed for local) |
| **Authorization** | `isTrustedSender` gate on every IPC handler |
| **Tool Risk** | `read`/`reversible`/`destructive`/`cost` classification |
| **Approval** | `requiresApproval: true` tools need user confirmation |
| **Proposal System** | All mutations queued, validated, then applied as ONE undo group |
| **Secrets** | API keys encrypted at rest (OS keychain/DPAPI) |

---

## Troubleshooting

### MCP Server Won't Start
```bash
# Check TMCut executable path
/Applications/TMCut.app/Contents/MacOS/TMCut --help

# Check logs
# macOS: ~/Library/Logs/TMCut/
# Windows: %APPDATA%\TMCut\logs\
# Linux: ~/.config/TMCut/logs/
```

### "Untrusted Sender" Errors
- Ensure the MCP client is running on the same machine
- Check Electron's `webSecurity: true` (default)
- Verify `isTrustedSender` origin check passes

### Tools Not Found
- Ensure TMCut is running with `--mcp-server` flag
- Check client config points to correct executable
- Restart MCP client after config changes

### Export Jobs Not Streaming Progress
- Ensure TMCut main window is open (renderer needed for event bridge)
- Check `event:job_progress` events in client logs
- Verify `mcp:forward` / `mcp:forward:respond` channels work

---

## Development / Debugging

### Run MCP Server Directly (for testing)
```bash
cd tm-tools
MCP_TEST_MODE=1 npx tsx electron/tools/mcp/server.mjs
```

### Test Tool Call Manually
```json
// Initialize
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}

# List tools
{"jsonrpc":"2.0","id":2,"method":"tools/list"}

# Call a tool
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"project.get_context","arguments":{}}}
```

### Debug Logs
```bash
# Enable debug logging
DEBUG=tmcut:mcp* /Applications/TMCut.app/Contents/MacOS/TMCut --mcp-server 2>&1 | tee mcp.log
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Client (Claude/Cursor)                   │
│  JSON-RPC 2.0 over stdio                                        │
└─────────────────────────┬───────────────────────────────────────┘
                          │ stdio (JSON-RPC 2.0)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  TMCut MCP Server (Node child process)                          │
│  - JSON-RPC 2.0 server (stdio transport)                        │
│  - Tool registry (38 tools)                                     │
│  - Session management                                           │
│  - Rate limiting (30 req/s default)                             │
│  - Idle timeout (5 min default)                                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │ IPC (mcp:forward / mcp:forward:respond)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Electron Main Process                                          │
│  - isTrustedSender gate (R134 choke point)                      │
│  - Forward tool calls to renderer via mcp:forward              │
│  - Wait for mcp:forward:respond (30s timeout)                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │ IPC (webContents.send)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Renderer (Nuxt/Vue)                                            │
│  - useMcpRendererBridge: dispatches to composables             │
│  - useTmcutAgentTools: 20 core tools                           │
│  - useTmcutAssetCenter: 4 asset tools                          │
│  - useTmcutTemplates: 6 template tools                         │
│  - useTmcutExportQueue: 8 export tools + progress events       │
│  - Proposal system: validation → approval → atomic apply       │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Locations

| Platform | Config / Logs |
|----------|---------------|
| **macOS** | `~/Library/Application Support/TMCut/` |
| **Windows** | `%APPDATA%\TMCut\` |
| **Linux** | `~/.config/TMCut/` |

---

## Support

- **Issues:** [GitHub Issues](https://github.com/tuanmjnh/tm-tools/issues)
- **Discussions:** [GitHub Discussions](https://github.com/tuanmjnh/tm-tools/discussions)
- **Docs:** [TMCut Docs](https://tmcut.dev/docs)

---

*Last updated: 2026-10-25 | TMCut v1.0.0 | MCP Protocol 2024-11-05*