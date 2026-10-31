# Hướng Dẫn Cấu Hình, Xây Dựng Asset & Đẩy Lên Marketplace (TM Tools)

Tài liệu này hướng dẫn chi tiết quy trình chuẩn bị, đóng gói, xác thực bản quyền (License Review) và phát hành tài nguyên (Music, SFX, Fonts, LUT Presets, Titles, Transitions) lên **TM Tools Asset Marketplace**.

---

## 1. Tổng Quan Kiến Trúc Asset Marketplace

Hệ sinh thái TM Tools quản lý tài nguyên số theo mô hình phân tầng chặt chẽ giữa **Main Process (Electron)**, **Renderer Process (Vue/Nuxt UI)** và thư viện tính toán thuần **@tmcut/core**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          TM TOOLS MARKETPLACE                          │
├────────────────────────────────────┬───────────────────────────────────┤
│  STARTER CATALOG (Bundled)         │  REMOTE CATALOG (CDN / HTTPS)     │
│  - Loại nguồn: sample / embedded   │  - Loại nguồn: remote             │
│  - Đi kèm bộ cài đặt (Offline)     │  - Tải về theo nhu cầu (On-demand)│
│  - Bản quyền duyệt sẵn (Approved)  │  - Xác thực mã băm SHA-256 bắt buộc│
└────────────────────────────────────┴───────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       ASSET CENTER (Main Process)                      │
│  - License Gate: Chỉ cho phép cài đặt khi license.status = 'approved'   │
│  - Download Queue: Hỗ trợ concurrency, auto-retry, resume tải gián đoạn│
│  - Checksum Verifier: Kiểm tra SHA-256 trước khi giải nén / lưu đĩa    │
│  - Registry: Quản lý danh mục đã cài (%APPDATA%/tmcut-assets/)         │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        CONSUMERS (Renderer / UI)                       │
│  - Audio Orchestration: Nhạc nền (music bed), hiệu ứng âm thanh (SFX)  │
│  - Video Factory: Cấu hình kịch bản tự động hóa assemblyProfile        │
│  - Template Studio: Kiểu chữ (captionStyle.fontFamily), Title presets  │
│  - TMCut Editor: Kéo thả trực tiếp từ Asset Panel vào Timeline         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Chuẩn Bị File Tài Nguyên (Local Assets)

### 2.1. Cấu trúc thư mục Catalog
Tất cả các tài nguyên bundled nội bộ được lưu tại:

```
resources/tmcut-catalog/
├── starter-catalog.json          # Manifest danh mục gốc (Bắt buộc)
├── music-lofi-chill.mp3          # File nhạc nền mẫu
├── music-upbeat-pop.mp3
├── sfx-whoosh-fast.wav           # Hiệu ứng âm thanh mẫu
├── font-inter.woff2              # Font chữ nhúng
└── ...
```

### 2.2. Định dạng file hỗ trợ & Khuyến nghị kỹ thuật

| Loại Asset | Định dạng hỗ trợ | Quy chuẩn khuyến nghị |
| :--- | :--- | :--- |
| **Music (Nhạc nền)** | `.mp3`, `.wav`, `.ogg`, `.flac` | Ưu tiên file có khả năng lặp vô tận (Seamless Loop), chuẩn hóa âm lượng -14 LUFS. |
| **Sound Effects (SFX)** | `.wav`, `.mp3`, `.ogg` | Thời lượng ngắn (< 5 giây), tỉ lệ lấy mẫu 44.1kHz hoặc 48kHz, peak < -1 dB. |
| **Fonts (Phông chữ)** | `.woff2`, `.ttf`, `.otf` | Ưu tiên `.woff2` hoặc Variable Fonts để dung lượng nhẹ và tốc độ load nhanh. |
| **LUT Presets / Filters**| `.cube` (file ngoài) hoặc JSON inline | Khuyến nghị nhúng payload trực tiếp trong manifest (`source.type = "embedded"`). |
| **Title / Text Presets** | JSON inline | Nhúng cấu trúc chữ, màu sắc, font size trong manifest (`source.type = "embedded"`). |

---

## 3. Cấu Trúc Manifest (Catalog Entry Specification)

Mỗi tài nguyên cần một định nghĩa JSON hợp lệ trong mảng `entries` của `starter-catalog.json` (hoặc Remote Catalog JSON).

### 3.1. Ví dụ mẫu Music Entry (Bundled Sample)
```json
{
  "id": "marketplace-music-my-track",
  "title": "My Chill Loop",
  "description": "Relaxed lo-fi beat for vlogs. Seamless 30s loop.",
  "category": "music",
  "assetKind": "media",
  "tags": ["lofi", "chill", "vlog", "loop", "marketplace"],
  "version": "1.0.0",
  "sizeBytes": 2048000,
  "sha256": "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
  "source": {
    "type": "sample",
    "sampleId": "music-my-track"
  },
  "sourceUrl": "",
  "previewRef": null,
  "creator": "My Studio",
  "priceUsd": 0,
  "salesChannel": "bundled",
  "license": {
    "status": "approved",
    "name": "Royalty-Free (TM Tools)",
    "url": "https://tmtools.dev/licenses/royalty-free",
    "attribution": "Royalty-free via TM Tools",
    "commercialUse": true,
    "redistrbutable": true,
    "territories": ["worldwide"],
    "expiresAt": null,
    "proof": "TM Tools Royalty-Free License",
    "reviewer": "tmcut-publisher",
    "reviewedAt": "2026-10-24T00:00:00.000Z",
    "review": {
      "decision": "approved",
      "by": "tmcut-publisher",
      "at": "2026-10-24T00:00:00.000Z",
      "note": "Approved for commercial use"
    }
  }
}
```

### 3.2. Bảng quy định các trường bắt buộc (Strict Contract)

Bộ kiểm tra `@tmcut/core` (`src/catalogPublish.mjs`) kiểm tra nghiêm ngặt các quy tắc sau:

| Tên trường | Kiểu dữ liệu | Quy tắc & Ràng buộc |
| :--- | :--- | :--- |
| `id` | `string` | **Bắt buộc**. Chỉ gồm ký tự chữ, số, dấu chấm, gạch dưới, gạch ngang (`^[a-z0-9][a-z0-9._-]*$`). Khuyến nghị tiền tố `marketplace-`. |
| `title` | `string` | **Bắt buộc**. Tên hiển thị người dùng nhìn thấy. |
| `category` | `string` | **Bắt buộc**. Phải thuộc 1 trong 8 danh mục chuẩn: `filters`, `music`, `sound-effects`, `titles`, `fonts`, `effects`, `transitions`, `other`. |
| `assetKind` | `string` | Phân loại kỹ thuật: `media` (nhạc/ảnh/sfx), `effect-preset` (LUT/Filter), `title-preset`. |
| `source.type` | `string` | `sample` (file đi kèm trong installer), `remote` (tải qua HTTPS), `embedded` (payload JSON nhúng thẳng). |
| `source.sampleId` | `string` | **Bắt buộc nếu type = sample**. Tên file không bao gồm phần mở rộng nằm trong `resources/tmcut-catalog/`. |
| `source.url` | `string` | **Bắt buộc nếu type = remote**. Phải bắt đầu bằng giao thức bảo mật `https://`. |
| `sha256` | `string` | Mã băm SHA-256 (64 ký tự hex). **Bắt buộc đối với remote entry có license approved**. |
| `sizeBytes` | `number` | Dung lượng file tính bằng bytes (> 0 đối với file media tải về). |
| `license.status` | `string` | **Bắt buộc**. Giá trị là `'approved'` hoặc `'review'`. Asset chỉ có thể cài đặt được khi là `'approved'`. |
| `license.reviewer` | `string` | **Bắt buộc nếu status = 'approved'**. Danh tính người duyệt bản quyền (Audit Trail). Nếu thiếu, validator sẽ chặn xuất bản. |
| `license.reviewedAt` | `string` | Thời điểm duyệt dạng ISO-8601 (ví dụ `2026-10-24T00:00:00.000Z`). |

---

## 4. Công Cụ Tự Động Tính SHA-256 & Sinh Catalog

Để tự động duyệt qua các file media trong `resources/tmcut-catalog/` và sinh ra cấu trúc `starter-catalog.json` chuẩn, bạn có thể sử dụng các script sau:

### 4.1. Sử dụng PowerShell (Windows)
```powershell
$files = Get-ChildItem resources\tmcut-catalog\*.mp3, resources\tmcut-catalog\*.wav, resources\tmcut-catalog\*.woff2
foreach ($f in $files) {
    $hash = (Get-FileHash -Algorithm SHA256 $f.FullName).Hash.ToLower()
    Write-Host "$($f.Name): $hash (Size: $($f.Length) bytes)"
}
```

### 4.2. Script Tự Động Hóa Bằng Node.js (`scripts/gen-catalog.mjs`)
Tạo file `scripts/gen-catalog.mjs`:

```javascript
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const CATALOG_DIR = path.resolve('resources/tmcut-catalog')
const EXTS = ['.mp3', '.wav', '.ogg', '.flac', '.woff2', '.ttf', '.otf', '.cube']

function getSha256(filePath) {
  const buf = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(buf).digest('hex')
}

const entries = []

for (const file of fs.readdirSync(CATALOG_DIR)) {
  const ext = path.extname(file).toLowerCase()
  if (!EXTS.includes(ext)) continue

  const fullPath = path.join(CATALOG_DIR, file)
  const stat = fs.statSync(fullPath)
  const baseName = path.parse(file).name
  const id = `marketplace-${baseName.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`

  let category = 'other'
  if (file.startsWith('music-') || ['.mp3', '.flac'].includes(ext)) category = 'music'
  else if (file.startsWith('sfx-') || ext === '.wav') category = 'sound-effects'
  else if (['.woff2', '.ttf', '.otf'].includes(ext)) category = 'fonts'
  else if (ext === '.cube') category = 'filters'

  entries.push({
    id,
    title: baseName.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: `Bundled asset for ${file}`,
    category,
    assetKind: 'media',
    tags: ['marketplace', category],
    version: '1.0.0',
    sizeBytes: stat.size,
    sha256: getSha256(fullPath),
    source: {
      type: 'sample',
      sampleId: baseName
    },
    sourceUrl: '',
    previewRef: null,
    creator: 'TM Tools Publisher',
    priceUsd: 0,
    salesChannel: 'bundled',
    license: {
      status: 'approved',
      name: 'Royalty-Free (TM Tools)',
      url: 'https://tmtools.dev/licenses/royalty-free',
      attribution: 'Royalty-free via TM Tools',
      commercialUse: true,
      redistrbutable: true,
      territories: ['worldwide'],
      expiresAt: null,
      proof: 'TM Tools Standard License',
      reviewer: 'tmcut-publisher',
      reviewedAt: new Date().toISOString(),
      review: {
        decision: 'approved',
        by: 'tmcut-publisher',
        at: new Date().toISOString(),
        note: 'Approved for distribution'
      }
    }
  })
}

const manifestPath = path.join(CATALOG_DIR, 'starter-catalog.json')
let existingDoc = { schemaVersion: 1, generatedAt: new Date().toISOString(), entries: [] }
if (fs.existsSync(manifestPath)) {
  try { existingDoc = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch {}
}

existingDoc.generatedAt = new Date().toISOString()
existingDoc.entries = entries

fs.writeFileSync(manifestPath, JSON.stringify(existingDoc, null, 2), 'utf8')
console.log(`Successfully generated ${entries.length} catalog entries in ${manifestPath}`)
```

Chạy script để cập nhật catalog:
```bash
node scripts/gen-catalog.mjs
```

---

## 5. Cấu Hình Đóng Gói Ứng Dụng Electron

### 5.1. Cấu hình `electron-builder.yml` của TM Tools
Trong dự án TM Tools, cấu hình đóng gói tệp tài nguyên được quản lý tại file gốc `electron-builder.yml` thông qua khối `extraResources`:

```yaml
# electron-builder.yml
extraResources:
  - from: resources
    to: resources
    filter:
      - "**/*.exe"
      - "**/*.json"
      - "**/*.node"
      # Asset Center starter catalog & sample media:
      - "tmcut-catalog/**"
```

> **Lưu ý quan trọng**:
> TM Tools đã cấu hình sẵn dòng `- "tmcut-catalog/**"`. Khi chạy lệnh build, toàn bộ file media và `starter-catalog.json` sẽ tự động được copy nguyên vẹn vào thư mục unpacked resources (`dist/win-unpacked/resources/tmcut-catalog/`), đảm bảo người dùng có thể cài đặt và sử dụng offline ngay sau khi cài ứng dụng.

### 5.2. Kiểm tra kết quả sau khi build
```bash
# Thực hiện build Electron
pnpm build:electron

# Kiểm tra thư mục đầu ra
ls dist/win-unpacked/resources/tmcut-catalog/
# Kết quả hợp lệ phải thấy starter-catalog.json cùng các file .mp3, .wav, .woff2...
```

---

## 6. Mô Hình Remote Catalog (CDN / Cloud Hosting)

Khi mở rộng thư viện lên hàng nghìn asset, bạn không nên bundle tất cả vào bộ cài đặt mà nên chuyển sang mô hình **Remote Catalog**.

### 6.1. Cấu trúc Remote Catalog Manifest trên CDN
Lưu file tại: `https://cdn.yourdomain.com/tmcut/catalog.json`
```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-24T00:00:00.000Z",
  "entries": [
    {
      "id": "marketplace-music-cinematic-epic",
      "title": "Cinematic Epic Trailer",
      "category": "music",
      "assetKind": "media",
      "sizeBytes": 5242880,
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "source": {
        "type": "remote",
        "url": "https://cdn.yourdomain.com/tmcut/assets/cinematic-epic.mp3"
      },
      "license": {
        "status": "approved",
        "name": "CC BY 4.0",
        "url": "https://creativecommons.org/licenses/by/4.0/",
        "attribution": "Royalty-free via TM Tools",
        "commercialUse": true,
        "reviewer": "tmcut-team",
        "reviewedAt": "2026-10-24T00:00:00.000Z"
      }
    }
  ]
}
```

### 6.2. Đồng bộ Remote Catalog trong Electron
Trong `electron/tools/asset-center.controller.cjs`, Asset Center đã hỗ trợ lưu và đọc cache catalog (`tmcut:assetCenter:writeCatalogCache`). Giao diện Renderer chỉ cần gọi:
```javascript
// Tải catalog mới nhất từ CDN và lưu vào cache cục bộ
const res = await fetch('https://cdn.yourdomain.com/tmcut/catalog.json')
const remoteCatalog = await res.json()
await window.electronAPI.tmcut.assetCenter.writeCatalogCache(remoteCatalog.entries)
```

---

## 7. Tích Hợp Tài Nguyên Nguồn Mở & Miễn Phí Thương Mại (Open Source & Commercial Assets)

**Bạn HOÀN TOÀN CÓ THỂ nạp các tài nguyên miễn phí, mã nguồn mở được phép thương mại hóa từ các nền tảng online vào TM Tools Marketplace.**

Kiến trúc Asset Center và `@tmcut/core` được thiết kế có chủ đích với trường `license` chi tiết (`commercialUse: true`, `redistrbutable: true`, `attribution`, `proof`) để kiểm soát nghiêm ngặt bản quyền, đảm bảo người dựng video an toàn 100% khi xuất bản nội dung lên YouTube, Facebook, TikTok hoặc các dự án quảng cáo trả phí.

### 7.1. Các loại Giấy phép Nguồn mở Cho phép Thương mại hóa (Open Licenses)

| Giấy phép | Tên chuẩn | Cho phép thương mại? | Yêu cầu ghi công (Attribution)? | Thích hợp cho |
| :--- | :--- | :---: | :---: | :--- |
| **CC0 1.0** | Creative Commons Zero (Public Domain) | ✅ Có | ❌ Không bắt buộc | Nhạc nền, SFX, Hình ảnh, Textures |
| **CC BY 4.0** | Creative Commons Attribution | ✅ Có | ✅ Bắt buộc ghi tên tác giả | Nhạc nền, Sound FX, 3D LUTs |
| **SIL OFL 1.1**| Open Font License | ✅ Có | ❌ Không cần trong video (chỉ cần khi bundle font gốc) | Phông chữ đồ họa (Fonts) |
| **MIT / Apache 2.0**| MIT / Apache Open Source License | ✅ Có | ❌ Không cần trong video thành phẩm | Title Presets, LUT JSON, Effects |
| **Pixabay / Pexels**| Custom Commercial License | ✅ Có | ❌ Không bắt buộc | Video B-roll, Âm thanh, Hình ảnh |

> ⚠️ **LƯU Ý CÁC GIẤY PHÉP BỊ CẤM / CHẶN**:
> Tuyệt đối **KHÔNG** đưa vào Marketplace các tài nguyên có gắn thẻ:
> - **NC (Non-Commercial)**: Ví dụ `CC BY-NC` (Chặn kiếm tiền/thương mại).
> - **ND (No-Derivatives)**: Ví dụ `CC BY-ND` (Cấm cắt ghép, remix trong video).

---

### 7.2. Các Kho Tài Nguyên Nguồn Mở & Miễn Phí Uy Tín Có Thể Nạp Ngay

1. **Âm thanh & Nhạc nền (Music & SFX)**:
   - **Freesound.org**: Kho hiệu ứng âm thanh lớn nhất thế giới. Lọc theo filter `License: Creative Commons 0` hoặc `Attribution`.
   - **Free Music Archive (FMA)**: Lọc theo tag `Allows for commercial use`.
   - **Incompetech (Kevin MacLeod)**: Hàng nghìn bản nhạc nền kinh điển cho YouTube/Vlog (Giấy phép `CC BY 4.0`).
   - **Pixabay Music & Sound Effects**: Hoàn toàn miễn phí cho mục đích cá nhân và thương mại.
2. **Phông chữ đồ họa (Fonts)**:
   - **Google Fonts ([fonts.google.com](https://fonts.google.com))**: Hàng nghìn font chữ (Inter, Roboto, Montserrat, Be Vietnam Pro...) theo giấy phép `SIL Open Font License 1.1`, an toàn tuyệt đối cho video YouTube/TikTok thương mại.
3. **Màu sắc & Bộ lọc (LUTs / Color Grading)**:
   - Các bộ Open Cinematic LUTs định dạng `.cube` chia sẻ dưới giấy phép MIT hoặc CC0.

---

### 7.3. Ví dụ Cấu Hình Manifest Cho Tài Nguyên Nguồn Mở

#### 1. Mẫu Nhạc nền Giấy phép CC BY 4.0 (Incompetech / FMA)
```json
{
  "id": "marketplace-music-fluffing-a-duck",
  "title": "Fluffing a Duck",
  "description": "Upbeat comedic background track by Kevin MacLeod.",
  "category": "music",
  "assetKind": "media",
  "tags": ["comedy", "funny", "upbeat", "vlog"],
  "version": "1.0.0",
  "sizeBytes": 2451000,
  "sha256": "4b2c1d3e...",
  "source": {
    "type": "remote",
    "url": "https://cdn.yourdomain.com/assets/music/fluffing-a-duck.mp3"
  },
  "creator": "Kevin MacLeod",
  "license": {
    "status": "approved",
    "name": "CC BY 4.0",
    "url": "https://creativecommons.org/licenses/by/4.0/",
    "attribution": "Music: Fluffing a Duck by Kevin MacLeod (incompetech.com), licensed under CC BY 4.0",
    "commercialUse": true,
    "redistrbutable": true,
    "reviewer": "tmcut-license-team",
    "reviewedAt": "2026-10-24T00:00:00.000Z",
    "review": {
      "decision": "approved",
      "by": "tmcut-license-team",
      "at": "2026-10-24T00:00:00.000Z",
      "note": "Verified CC BY 4.0 from incompetech.com"
    }
  }
}
```

#### 2. Mẫu Phông chữ Giấy phép SIL Open Font License 1.1 (Google Fonts)
```json
{
  "id": "marketplace-font-be-vietnam-pro",
  "title": "Be Vietnam Pro (Bold / ExtraBold)",
  "description": "Modern Vietnamese typography optimized for video captions and titles.",
  "category": "fonts",
  "assetKind": "media",
  "tags": ["vietnamese", "typography", "bold", "captions"],
  "version": "1.0.0",
  "sizeBytes": 85400,
  "sha256": "8f3a1b...",
  "source": {
    "type": "remote",
    "url": "https://cdn.yourdomain.com/assets/fonts/BeVietnamPro-Bold.woff2"
  },
  "creator": "Vietnamese Typography Project",
  "license": {
    "status": "approved",
    "name": "SIL Open Font License 1.1",
    "url": "https://openfontlicense.org/",
    "attribution": "Copyright (c) 2019 The Be Vietnam Pro Project Authors",
    "commercialUse": true,
    "redistrbutable": true,
    "reviewer": "tmcut-font-team",
    "reviewedAt": "2026-10-24T00:00:00.000Z"
  }
}
```

#### 3. Mẫu Hiệu ứng Âm thanh Public Domain CC0 (Freesound / Pixabay)
```json
{
  "id": "marketplace-sfx-camera-shutter",
  "title": "Camera Shutter Click",
  "description": "Crisp DSLR camera shutter sound effect for photo montage transitions.",
  "category": "sound-effects",
  "assetKind": "media",
  "tags": ["camera", "click", "transition", "photo"],
  "version": "1.0.0",
  "sizeBytes": 125000,
  "sha256": "9e2d1c...",
  "source": {
    "type": "sample",
    "sampleId": "sfx-camera-shutter"
  },
  "creator": "Public Domain",
  "license": {
    "status": "approved",
    "name": "Creative Commons Zero (CC0 1.0)",
    "url": "https://creativecommons.org/publicdomain/zero/1.0/",
    "attribution": "No attribution required (Public Domain)",
    "commercialUse": true,
    "redistrbutable": true,
    "reviewer": "tmcut-audit",
    "reviewedAt": "2026-10-24T00:00:00.000Z"
  }
}
```

---

## 8. Quy Trình Tự Tạo Mới Asset, Custom Source & Template Động

### 8.1. Phân biệt 3 loại Asset tự tạo

Hệ thống TM Tools hỗ trợ 3 hình thức tạo mới tài nguyên tùy theo nhu cầu lưu trữ:

| Loại hình | Nơi lưu trữ file gốc | Định dạng nguồn | Điểm mạnh |
| :--- | :--- | :--- | :--- |
| **1. Custom Remote Media** (Nhạc, SFX, Video B-roll, Fonts) | Máy chủ cá nhân / Cloudinary / Supabase Storage / S3 | `source.type = "remote"` | Quản lý được file dung lượng lớn, có link tải trực tiếp HTTPS. |
| **2. Embedded Preset** (Title, LUT màu, Style chữ, Hiệu ứng) | Nhúng trực tiếp trong cấu trúc JSON | `source.type = "embedded"` | **0 Byte tải về**. Không cần máy chủ lưu file, cài đặt ngay lập tức vào Timeline. |
| **3. Video Template Studio** (Dự án mẫu nhiều track hoàn chỉnh) | Cấu trúc `VideoTemplate` schema | JSON template family | Chứa toàn bộ timeline items, placeholder thay ảnh/chữ, âm thanh cue. |

---

### 8.2. Hướng dẫn tạo Asset từ nguồn tự lưu trữ (Custom Cloud Source)

Nếu bạn có kho nhạc, hiệu ứng âm thanh hoặc phông chữ riêng muốn đưa lên Marketplace:

1. **Bước 1: Tải file lên kho lưu trữ & Quản lý thư mục**:
   - **Phân tách thư mục trên Cloudinary**: Khi dùng chung tài khoản Cloudinary cho cả media chung và asset Marketplace, bạn nên tách biệt theo thư mục (Folder Prefix):
     - `tm-media/`: Dành cho media chung của app, ảnh đại diện, banner, thumbnail.
     - `tm-assets/`: Dành cho tài nguyên Marketplace (chia tiếp: `tm-assets/fonts/`, `tm-assets/audio/`, `tm-assets/templates/`).
     - TM-Hub đã hỗ trợ cấu hình field `CLOUDINARY_ASSET_FOLDER` để phân định tự động.
   - **Quản lý đa nền tảng qua module Connections (`/resources/connections`)**:
     - Cả TM Hub và TM Tools đã tích hợp sẵn danh mục **Media / Storage / CDN (`media_storage`)** bao gồm:
       - **Cloudflare R2** (`cloudflare_r2`): Miễn phí 10 GB + **0đ băng thông tải**.
       - **Amazon S3** (`aws_s3`): Lưu trữ chuẩn công nghiệp AWS.
       - **Supabase Storage** (`supabase_storage`): Lưu trữ trực tiếp trên Postgres Supabase của dự án (hỗ trợ Quick Connect 1-click).
       - **Cloudinary** (`cloudinary`): Xử lý tối ưu hóa ảnh và video tự động.
     - Bạn chỉ cần vào **Resources -> Connections** trên TM Hub hoặc TM Tools, chọn **Add Connection -> Media Storage**, điền khóa API và bấm **Test & Save**. TM-Tools sẽ tự động nạp toàn bộ cấu hình này.
   - Đảm bảo file sau khi upload có đường dẫn tải trực tiếp dạng `https://cdn.yourdomain.com/assets/music/track-01.mp3` hoặc link CDN của nhà cung cấp.
2. **Bước 2: Tính toán SHA-256 và dung lượng file**:
   ```powershell
   # PowerShell trên Windows
   $hash = (Get-FileHash -Algorithm SHA256 "D:\MyAssets\track-01.mp3").Hash.ToLower()
   $size = (Get-Item "D:\MyAssets\track-01.mp3").Length
   Write-Host "Size: $size | SHA-256: $hash"
   ```
3. **Bước 3: Khai báo vào Catalog**:
   ```json
   {
     "id": "marketplace-music-my-custom-track",
     "title": "Corporate Presentation Theme",
     "description": "Original uplifting piano background music for product launches.",
     "category": "music",
     "assetKind": "media",
     "tags": ["corporate", "presentation", "piano", "original"],
     "version": "1.0.0",
     "sizeBytes": 3145728,
     "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
     "source": {
       "type": "remote",
       "url": "https://cdn.yourdomain.com/assets/music/track-01.mp3"
     },
     "creator": "My Media Studio",
     "license": {
       "status": "approved",
       "name": "Proprietary Commercial License",
       "url": "https://yourdomain.com/license",
       "commercialUse": true,
       "redistrbutable": true,
       "reviewer": "studio-admin",
       "reviewedAt": "2026-10-24T00:00:00.000Z"
     }
   }
   ```

---

### 8.3. Hướng dẫn tạo Title Preset & LUT màu nhúng (Embedded Preset)

Đối với các mẫu chữ động (Motion Titles), bộ lọc màu LUTs hoặc danh thiếp mạng xã hội (Lower-thirds), bạn **không cần tốn tiền thuê máy chủ lưu file** mà có thể nhúng thẳng thuộc tính vào catalog (`source.type = "embedded"`):

```json
{
  "id": "marketplace-title-cinematic-minimal",
  "title": "Cinematic Minimalist Title",
  "description": "Clean typography preset for documentary intro and chapter headers.",
  "category": "titles",
  "assetKind": "title-preset",
  "tags": ["title", "cinematic", "minimal", "documentary"],
  "version": "1.0.0",
  "sizeBytes": 0,
  "sha256": "",
  "source": {
    "type": "embedded",
    "payload": {
      "text": "CHAPTER I: THE BEGINNING",
      "fontFamily": "Be Vietnam Pro",
      "fontSize": 48,
      "fontWeight": "bold",
      "letterSpacing": 6,
      "color": "#f8fafc",
      "shadowColor": "rgba(0, 0, 0, 0.75)",
      "animation": "fade-up",
      "durationMs": 4000
    }
  },
  "creator": "TMCut Community",
  "license": {
    "status": "approved",
    "name": "CC0 1.0 (Public Domain)",
    "commercialUse": true,
    "reviewer": "tmcut-publisher",
    "reviewedAt": "2026-10-24T00:00:00.000Z"
  }
}
```

---

### 8.4. Quản lý & Phát hành ĐỘNG Từ TM Hub Control Plane

Để người dùng TM Tools nhận được tài nguyên mới ngay tức khắc mà **không cần đóng gói lại bản cài đặt Electron**:

1. Mở trình duyệt và đăng nhập TM Hub tại: [`https://tm-hub-app.vercel.app/administration/content`](https://tm-hub-app.vercel.app/administration/content).
2. Tìm hoặc tạo mới tài liệu:
   - **App ID**: `tm-tools_bbx58v`
   - **Key**: `marketplace_catalog`
   - **Tiêu đề**: `TMCut Asset Marketplace Catalog`
   - **Kiểu nội dung**: `JSON`
   - **Dữ liệu**: Nhập cấu trúc JSON Catalog (chứa mảng `entries` gồm các asset mới bạn muốn phân phối).
3. Gạt nút **Xuất bản (Publish)** và bấm **Lưu**.
4. **Cơ chế cập nhật tự động**:
   - Khi ứng dụng TM Tools khởi động, `useTmcutAssetCenter` sẽ tự động gọi API `GET /api/v1/content?appId=tm-tools_bbx58v&key=marketplace_catalog`.
   - Danh sách tài nguyên mới sẽ xuất hiện ngay trong tab Marketplace của Studio.

---

### 8.5. Phát hành tự động qua REST API (Dành cho CI/CD hoặc CMS)

Nếu bạn có hệ thống CMS tự động xuất bản asset, chỉ cần gửi một request `HTTP POST`:

```bash
curl -X POST https://tm-hub-app.vercel.app/api/v1/content \
  -H "Authorization: Bearer <YOUR_JWT_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "tm-tools_bbx58v",
    "key": "marketplace_catalog",
    "title": "TMCut Dynamic Catalog",
    "contentType": "json",
    "category": "marketplace",
    "isPublished": true,
    "data": {
      "schemaVersion": 1,
      "generatedAt": "2026-10-24T00:00:00.000Z",
      "entries": [ /* Danh sách các asset mới */ ]
    }
  }'
```

---

## 9. Quy Trình Kiểm Thử & Xuất Bản (Publishing Checklist)

### 8.1. Chạy lệnh kiểm tra tính toàn vẹn (Pre-publish Verification)
Chạy đoạn mã sau để xác thực tài liệu bằng chính module `@tmcut-core`:

```bash
node -e "
import { validateCatalogDocument } from '@tmcut-core'
import fs from 'node:fs'

const raw = fs.readFileSync('resources/tmcut-catalog/starter-catalog.json', 'utf8')
const doc = JSON.parse(raw)
const res = validateCatalogDocument(doc)

console.log('Result OK:', res.ok)
console.log('Stats:', res.stats)
if (!res.ok) {
  console.error('Validation Errors:')
  res.errors.forEach(err => console.error('  - ' + err))
  process.exit(1)
} else {
  console.log('All catalog entries are 100% compliant and ready to publish!')
}
"
```

### 8.2. Bảng đối chiếu lỗi phổ biến & Cách khắc phục

| Thông báo lỗi | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| `license status must be set` | Thiếu trường `license.status` | Đặt `"status": "approved"` |
| `approved license needs a reviewer stamp` | Đặt trạng thái approved nhưng không ghi rõ ai duyệt | Thêm trường `"reviewer": "tên_người_duyệt"` và `"reviewedAt"` |
| `remote source must be an https:// URL` | Sử dụng liên kết `http://` không an toàn | Bắt buộc đổi sang liên kết bảo mật `https://` |
| `approved remote entries require a sha256` | Asset tải qua mạng thiếu mã băm SHA-256 | Tính toán mã băm SHA-256 của file tải về và điền vào trường `sha256` |
| `id must be alphanumeric with . _ -` | ID chứa ký tự lạ hoặc khoảng trắng | Đổi ID theo chuẩn kebab-case (chỉ gồm `a-z`, `0-9`, dấu `-`, `_`, `.`) |
| `duplicate id "..."` | Có 2 entry trùng cùng một mã ID | Đảm bảo mỗi ID là duy nhất trên toàn hệ thống |

---

## 9. Trải Nghiệm Người Dùng & Nâng Cấp Phiên Bản (Versioning)

1. **Cập nhật Asset (Upgrade Path)**:
   - Khi muốn nâng cấp một bản nhạc hoặc phông chữ lên bản mới, chỉ cần tăng trường `"version": "1.1.0"` và cập nhật mã `"sha256"` mới trong catalog.
   - Composable `useTmcutAssetCenter` trên giao diện sẽ tự động so sánh phiên bản đã cài (`installed.version`) với phiên bản trên catalog (`catalog.version`). Nếu thấy bản mới hơn, nút **Install** sẽ tự chuyển thành **Update**.
2. **Quy trình gỡ bỏ an toàn (Takedown & Recall)**:
   - Nếu một asset có tranh chấp bản quyền, Catalog Document hỗ trợ khai báo danh sách `takedowns`:
     ```json
     "takedowns": [
       { "entryId": "marketplace-music-disputed-track", "reason": "Copyright dispute", "at": "2026-10-24" }
     ]
     ```
   - Hàm `canInstall` và `takedownAudit` trong `@tmcut-core` sẽ ngay lập tức chặn cài đặt mới và cảnh báo người dùng.

---

## 10. Tóm Tắt Các Lệnh Cần Thiết

```bash
# 1. Sinh manifest tự động từ thư mục resources
node scripts/gen-catalog.mjs

# 2. Kiểm thử hợp lệ
node -e "import('@tmcut-core').then(m => console.log(m.validateCatalogDocument(JSON.parse(fs.readFileSync('resources/tmcut-catalog/starter-catalog.json')))))"

# 3. Chạy thử nghiệm môi trường Electron
pnpm dev:electron

# 4. Đóng gói bộ cài đặt hoàn chỉnh
pnpm build:electron
```

