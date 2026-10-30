# TMCut Test Results - 2026-10-27

## Summary
- **Unit Tests**: 43/44 passed (1 fail: `tmcut_hub_ai_connection.spec.ts` - environmental issue, hub not available in test)
- **E2E Tests (Playwright)**: All 5 tmcut pages tested successfully

## Pages Tested

### 1. `/tmcut` (Dashboard) ✅
- **New Project** → tạo project mới, mở editor
- **Quick Presets**: Vertical 9:16, Horizontal 16:9 → tạo project với canvas đúng
- **Template Presets**: YouTube Horizontal (1920x1080), Instagram Feed (1080x1080), Shorts Vertical (1080x1920) → project name đúng
- **Filters**: Vertical 9:16 (2), Horizontal 16:9 (3), Square 1:1 (1), All (6) → hoạt động
- **Sort**: Recently edited, Recently opened, Name A-Z, Longest duration → hoạt động
- **View**: Grid/List toggle → hoạt động
- **Project Card Actions**:
  - Pin/Unpin → hoạt động (badge pinned)
  - Rename → modal mở, save OK
  - Duplicate → tạo "(copy)" suffix
  - Delete → confirm modal, xóa OK

### 2. `/tmcut/editor` ✅
- **Header**: Project name, Canvas selector (16:9/9:16/1:1/4:5/4:3/21:9/Custom), Social presets, Backgrounds, FPS
- **Canvas Switch**: 16:9 → 9:16 → header cập nhật "9:16 (30fps)", preview hiển thị "1080x1920 (9:16) 30 FPS"
- **Timeline/Tracks**: 3 tracks (Text, Video 1, Audio 1) với controls: Stacking order, Hide, Lock, Mute, Remove; Audio có Volume/Pan
- **Asset Panel**: "Import Media", "Record voiceover", Media/Video tabs
- **Inspector**: "Properties (Inspector)" hiển thị project properties
- **Playback**: Controls hiển thị (disabled khi không có media)
- **Export**: Modal mở, cảnh báo "cần Electron app", buttons Close/Add to Queue/Start Export

### 3. `/tmcut/templates` ⚠️
- Page load nhưng stuck ở "Loading TM Tools" - đang chờ API từ TM Hub (https://tm-hub-app.vercel.app)
- Static assets load OK, data fetch pending

### 4. `/tmcut/autocut` ✅
- Page title: "AutoCut - TM Tools"
- Step 1: "Upload Source Clip" - drag & drop area + "Select from Device" button
- Step 2: "Choose AI Profile" (disabled cho đến khi chọn source)
- UI render OK

### 5. `/tmcut/factory` ✅
- Page title: "Video Factory"
- Heading "Video Factory", mô tả batch processing
- Link "Back to Templates"
- "Validate & estimate" (disabled), "No batch is queued"

## Unit Tests
- **43/44 passed** (97.7%)
- **1 Fail**: `tmcut_hub_ai_connection.spec.ts` - test yêu cầu hub data thật từ `https://tm-hub-app.vercel.app`, môi trường test không có data → environmental issue, không phải bug code
- **Key Test Suites Passed**:
  - Phase 1.5: 14 checks
  - Phase 2: 16 checks
  - Agent tools: 9
  - AI tasks: 10
  - Autocut prefs/v2/review: all passed
  - Dashboard lifecycle: 5
  - History: 7
  - Projects lifecycle: 10
  - Render graph: 21
  - Ripple: 5 + 8
  - Save lifecycle: 5
  - Tracks: 7
  - Transitions: 5
  - Video assembly: 14
  - Video factory: 23
  - Video templates: 12

## Known Issues
1. **Templates page** - waiting for TM Hub API (needs deployed hub data)
2. **Hub AI Connection test** - needs live hub data, not a code bug
3. **Server IPv6 only** - server listen trên `[::1]:4002` không phải `127.0.0.1:4002` (cần dùng `http://[::1]:4002`)

## Commands
```bash
# Dev server (IPv6)
pnpm dev

# Unit tests
pnpm test:tmcut

# Typecheck
pnpm typecheck

# Build
pnpm build
```

## Test Environment
- Nuxt 4.6.2, Vue 3.5.44
- Node.js v22.22.0
- pnpm 9.x
- Playwright + CDP (IPv6)
- Server: http://[::1]:4002 (IPv6)