# TMCut — Phương án nâng cấp Editor chuyên nghiệp & roadmap

Cập nhật: 2026-10-30 (đợt 2) · Phạm vi: `app/pages/tmcut`, `app/components/tmcut`,
`app/composables`, `app/utils/tmcut`, `server/api/v1/stock`, `electron/tools` ·
Trạng thái: **đợt 1 + đợt 2 đã triển khai**, đợt 3–5 là đề xuất có thứ tự ưu tiên.

Tài liệu ghi lại (a) những gì đã có trong code, (b) phương án để TMCut thành editor
“đủ nghề”, và (c) các nguyên tắc kỹ thuật phải giữ để preview/export không lệch nhau.

---

## 1. Đã triển khai

### Đợt 1 — “Cảm giác chuyên nghiệp”

#### 1.1 Nhãn (text) kéo giãn / xoay ngay trên player
`TmcutPreviewPlayer.vue`: 4 tay nắm góc → ghi `scale` (10–300%, đúng trường Inspector
sở hữu), núm tròn phía trên → `rotation` (−180°…180°). Tay nắm tự bù tỉ lệ
(counter-scale) nên luôn dễ bấm; nhãn đang chọn có viền `ring-primary`. Toán kéo dùng
khoảng cách từ tâm hộp tại thời điểm grab → bất biến với rotation, cùng quy ước
transform box của clip video.

#### 1.2 Thumbnail hiệu ứng / bộ lọc có animation
`TmcutFxThumb.vue` + `app/utils/tmcut/fxPreview.ts`:

- Tile **nằm trong khung nhìn** là tự chạy reveal chậm; ra khỏi khung nhìn thì
  `animationPlayState: paused` (không đốt CPU cho cả lưới), tôn trọng
  `prefers-reduced-motion`.
- Nội dung tile do registry quyết định: transition chạy đúng primitive của nó, grade
  tĩnh quét A→B, filter quét before/after, hiệu ứng có chuyển động tự chạy loop.
- Badge trung thực: `exact` / `approximate` / `illustrative` / `export-unsupported`;
  định nghĩa không có adapter → “no preview”, không bịa animation.
- Spec `tmcut_fx_preview` chặn việc resolver gọi keyframe CSS không tồn tại.

#### 1.3 Tab **Bộ lọc** cho object đã chọn (panel phải)
`TmcutInspector.vue`: lưới preset LUT (cùng enum `lut3d` của core), thumbnail động,
✓ cho preset đang dùng, nút xoá nhanh, bấm lại preset đang chọn = bỏ lọc.

#### 1.4 Kho tài nguyên stock
`TmcutStockLibrary.vue` + `useTmcutStock.ts` + `stockProviders.ts` (+ proxy):

| Nguồn | Loại | Key | Giấy phép |
| --- | --- | --- | --- |
| Openverse | Ảnh, Nhạc | Không cần | CC0 / PDM / CC BY / CC BY-SA (query ghim `license_type=commercial,modification`, parser lọc lần hai) |
| Pexels | Ảnh, Video | Key miễn phí | Pexels license — dùng thương mại, không cần ghi công |
| Pixabay | Ảnh, Video | Key miễn phí | Pixabay Content License — dùng thương mại |

Mỗi kết quả hiện giấy phép + tác giả + nút copy dòng credit; kết quả CC BY nhắc ghi công.

### Đợt 2 — “Không còn object nào không có hiệu ứng / chuyển động”

#### 2.1 Kho tài nguyên chạy được trên **web**
Trước đây web không tìm được gì: không có IPC, và Pexels trả preflight không kèm
`Access-Control-Allow-Origin` → `Failed to fetch`. Nay:

- `POST /api/v1/stock/proxy` — bản Nitro của `electron/tools/stock-proxy.cjs`:
  https-only, allowlist host tìm kiếm, chỉ chuyển tiếp header `Authorization`,
  `redirect: 'error'`, timeout 15 s, cap 2 MiB, chỉ nhận JSON.
- `POST /api/v1/stock/download` — tải asset khi CDN không trả CORS: https-only,
  allowlist **theo domain boundary** (`host === suffix || host.endsWith('.'+suffix)`),
  từ chối IP literal / host một nhãn (chống SSRF), bắt buộc content-type
  `image|video|audio`, timeout 60 s, cap 128 MiB.
- `shared/utils/stockGuards.ts` giữ luật dùng chung; spec
  `tmcut_stock.spec.ts` assert **allowlist web ≡ allowlist desktop** nên hai runtime
  không thể lệch nhau.
- `useTmcutStock` chọn đường: IPC (desktop) → proxy (web); import: tải trực tiếp,
  thất bại thì qua proxy (web) hoặc `downloadMedia` (desktop).

#### 2.2 Trình sửa **thuộc tính chuyển động** (panel phải)
`TmcutKeyframeEditor.vue` — trước đây keyframe chỉ ghi được bằng nút ⏱ và **không thể
xem/sửa/xoá**; nay:

- Liệt kê keyframe theo từng kênh, sửa **thời điểm / giá trị / kiểu chuyển động /
  xoá**, thêm keyframe tại vị trí phát, xoá tất cả của clip.
- Chỉ mở đúng các kênh mà `keyframeExpr` thật sự render:
  video `opacity/scale/x/y`, nhãn `opacity/x/y`, audio `volume`.
- Thời điểm là **tick clip-local** (0 = đầu clip) → keyframe đi theo clip, khớp lane
  keyframe trên timeline và nút ⏱.
- Easing lấy từ `KEYFRAME_EASINGS` của core (linear / ease-in / ease-out /
  ease-in-out / step): khung giữa hai keyframe nội suy theo kiểu của keyframe bên trái.
- Undo: sửa rời rạc = 1 entry (`pushHistory`), kéo/typing = coalesce theo hàng.

Audio nay có tab **Hiệu ứng động** (trước chỉ có Âm thanh/Tốc độ) cho volume envelope.

#### 2.3 Hiệu ứng của object đã chọn — có preview động
- Tab **Hiệu ứng** (video): mỗi effect đang áp có **thumbnail động** ngay trên card
  tham số (`TmcutFxThumb kind="effect" :params`), nên chỉnh slider là thấy look đổi;
  effect không có adapter hiện “no preview”.
- Tab **Hiệu ứng chữ** (nhãn — mới): đúng ba look mà `drawtext` render được —
  **bóng đổ (màu)**, **viền chữ (màu)**, **nền sau chữ (plate)**; bật/tắt bằng switch,
  chọn màu bằng color input.
  - Export: `shadowcolor=`, `bordercolor=`, `box=1:boxcolor=…:boxborderw=` trong
    `render/text.ts`.
  - Preview: `text-shadow`, `-webkit-text-stroke`, `background-color` + padding trong
    `TmcutPreviewPlayer.vue`.
  - Padding/nét/bóng dùng **cùng** `app/utils/tmcut/textStyle.ts` (một nguồn số đo) nên
    preview và export không lệch.
  - Ba trường là optional: project cũ không có → filter string y như trước
    (byte-identical), tức không phá bản export đã có.

---

## 2. Nguyên tắc kiến trúc (giữ cho mọi đợt sau)

1. **Registry là nguồn sự thật**: effect/LUT/transition lấy từ `@tmcut-core`; UI không
   tự khai báo bảng riêng (`tmcut_fx_preview` chặn).
2. **Preview trung thực**: mỗi tile/panel nói rõ `exact`/`approximate`/`illustrative`
   và cảnh báo khi export bỏ qua. Không thêm hiệu ứng “chỉ để đẹp preview”.
3. **Desktop/web parity**: tính năng mới phải có đường web (proxy/upload) hoặc nói rõ
   desktop-only ngay trong UI.
4. **Biên IPC/HTTP hẹp**: renderer/browser không tự do gọi URL; server và main process
   validate host, path, kích thước, content-type — và dùng **chung** module luật
   (`shared/utils/stockGuards.ts`).
5. **Một nguồn số đo cho style**: mọi con số hiển thị trên khung hình (font, bóng, viền,
   padding) nằm trong `textStyle.ts`/`canvas.ts`, cả preview lẫn export import từ đó.
6. **Một nguồn undo**: rời rạc → `pushHistory()`, kéo/typing → `pushHistoryCoalesced(key)`.
7. **i18n bắt buộc**: `en.json` và `vi.json` khớp key (`tmcut_i18n_keys` chặn).
8. **Không phá project cũ**: trường mới luôn optional, mặc định = hành vi cũ.

---

## 3. Phương án tiếp theo (đợt 3–5)

### Đợt 3 — Hệ sinh thái tài nguyên (ưu tiên cao, chi phí vừa)

Mục tiêu: mọi asset nhập vào đều **truy vết được nguồn + giấy phép + credit**, và web
dùng được y như desktop.

1. **Thêm nguồn nhạc free-thương mại** (hiện nhạc chỉ có Openverse CC):
   - **Jamendo** (`api.jamendo.com/v3.0/tracks`, cần `client_id` miễn phí): lọc
     `include=licenses`, chỉ nhận track có license cho phép thương mại; thêm host vào
     cả `stock-proxy.cjs` và `shared/utils/stockGuards.ts` (spec parity sẽ tự kiểm).
   - **Free Music Archive** (API/`freemusicarchive.org`): lọc `license_url` CC BY/BY-SA/CC0.
   - Khi thêm provider: cập nhật `STOCK_PROVIDERS`, `buildStockRequest`,
     `parseStockResponse`, allowlist (2 phía), spec + i18n nhãn; giữ nguyên gate
     `isCommercialSafeLicense`.
2. **Bộ sưu tập & tìm kiếm nâng cao**: lọc orientation/thời lượng/màu, “tải cả bộ”,
   cache offline (SQLite/index) để dùng lại không cần mạng.
3. **License manager**: lưu credit theo project, xuất `CREDITS.txt` cạnh video, cảnh báo
   khi dùng CC BY mà chưa có credit.
4. **Trải nghiệm tải**: progress thật cho file lớn (hiện chỉ spinner), retry, hàng đợi
   nhiều file (tái dùng `useTmcutExportQueue` pattern).

### Đợt 4 — Hiệu ứng & chuyển động “đủ nghề” (ưu tiên cao, chi phí lớn)

1. **Text effects nâng cao**: gradient fill, glow, typewriter, karaoke word-timing.
   Hướng: render **text layer** (RGBA) bằng canvas/HTML rồi overlay như sticker thay vì
   `drawtext` — khi đó LUT/filter mới áp được lên chữ, và `box`/gradient/glow mới khớp
   100% giữa preview và export.
2. **Motion presets dùng chung** cho video/nhãn/sticker: slide, pop, whip, overshoot,
   rotation; preset chỉ là “macro” ghi keyframe qua `setKeyframe` (đã có editor để sửa
   lại), kèm easing mặc định theo preset.
3. **Keyframe nâng cao**: thêm `rotation` vào pipeline (`keyframeExpr` + preview CSS),
   copy/paste curve, kéo keyframe trực tiếp trên lane, “fit to clip”, đường cong
   bezier tùy chọn.
4. **Audio FX thật** (chỉ làm khi export hỗ trợ): EQ 3 dải, compressor, noise gate,
   ducking nhạc dưới giọng đọc (sidechaincompress), normalize loudness (loudnorm).
   Hiện pipeline chỉ có volume/pan/fade → chưa mở tab “hiệu ứng âm thanh” để tránh giả.
5. **Mask follow keyframe** (mask box animate được), speed ramp + keyframe cùng lúc.

### Đợt 5 — Màu, hiệu năng, quy trình

1. Import `.cube` (LUT thật) + quản lý LUT cá nhân; preview WebGL để khớp export.
2. Scopes (waveform/vectorscope), HSL secondary, auto-enhance, smart reframe.
3. Proxy/preview resolution tự động theo máy; render queue có % thật (web hiện là 1
   request chờ, chưa có tiến trình).
4. Brand kit (màu + font + nhạc), batch export, chapter markers, phụ đề đa ngôn ngữ,
   dịch phụ đề.
5. Công tắc “giảm chuyển động” trong Settings cho lưới thumbnail lớn trên máy yếu.

---

## 4. Khoảng trống đã biết (ghi rõ để không “hứa ảo”)

1. **LUT cho nhãn**: export dùng `drawtext` nên LUT không áp lên glyph; cần render text
   layer (đợt 4.1) trước khi mở tab Bộ lọc cho text.
2. **Audio effects**: pipeline hiện chỉ có volume/pan/fade/keyframe volume → chưa có
   tab hiệu ứng âm thanh.
3. **Media effect cho audio clip**: registry `EFFECT_REGISTRY` là hiệu ứng **hình ảnh**
   (FFmpeg filter trên frame), nên tab hiệu ứng chỉ mở cho video.
4. **Stock web phụ thuộc mạng tới server**: nếu Nitro không chạy (build tĩnh) thì tìm
   kiếm web không hoạt động — UI báo lỗi HTTP rõ ràng thay vì treo.
5. **Pexels/Pixabay cần key miễn phí**: panel chặn tìm kiếm khi thiếu key thay vì 401.
6. **Thumbnail animation**: chạy khi tile trong khung nhìn; lưới rất dài trên máy yếu
   vẫn có thể nặng → công tắc giảm chuyển động ở đợt 5.5.
7. **Text plate**: `boxborderw` là padding đều quanh khối chữ; preview dùng CSS padding
   nên sai khác ≤ 1–2 px do font metrics (đã ghi nhận, không ảnh hưởng đọc).

---

## 5. Vị trí mã nguồn

| Việc | File |
| --- | --- |
| Transform box cho nhãn | `app/components/tmcut/TmcutPreviewPlayer.vue` |
| Tab Bộ lọc / Hiệu ứng chữ / Hiệu ứng (panel phải) | `app/components/tmcut/TmcutInspector.vue` |
| Trình sửa chuyển động (keyframe + easing) | `app/components/tmcut/TmcutKeyframeEditor.vue` |
| Animation thumbnail | `app/components/tmcut/TmcutFxThumb.vue`, `app/utils/tmcut/fxPreview.ts` |
| Số đo style chữ dùng chung | `app/utils/tmcut/textStyle.ts` |
| Export drawtext (bóng/viền/nền) | `app/utils/tmcut/render/text.ts` |
| Kiểu clip (thêm `shadowColor`/`strokeColor`/`bgColor`) | `app/composables/useTmcutProject.ts` |
| Provider stock (pure) | `app/utils/tmcut/stockProviders.ts` |
| Composable stock (IPC/proxy) | `app/composables/useTmcutStock.ts` |
| UI kho tài nguyên | `app/components/tmcut/TmcutStockLibrary.vue` |
| Proxy desktop | `electron/tools/stock-proxy.cjs` |
| Proxy web (Nitro) | `server/api/v1/stock/proxy.post.ts`, `server/api/v1/stock/download.post.ts` |
| Luật allowlist dùng chung | `shared/utils/stockGuards.ts` |
| Spec | `tests/unit/tmcut_stock.spec.ts`, `tmcut_fx_preview.spec.ts`, `tmcut_i18n_keys.spec.ts`, `tmcut_component_hygiene.spec.ts` |

---

## 6. Cách kiểm thử nhanh

```bash
cd tm-tools
npx tsx tests/unit/run-all.mts            # toàn bộ spec tmcut_*.spec.ts
npx nuxt typecheck                        # 0 lỗi
npx eslint app/components/tmcut app/composables/useTmcutStock.ts \
  app/utils/tmcut/textStyle.ts app/utils/tmcut/render/text.ts \
  server/api/v1/stock shared/utils/stockGuards.ts
```

Kiểm thử tay trên editor:

1. Chọn một **nhãn** → kéo góc để phóng to, kéo núm tròn để xoay; mở tab **Hiệu ứng**
   → bật bóng/viền/nền, đổi màu; tab **Hiệu ứng động** → thêm keyframe `opacity` ở
   0 s và 2 s với easing khác nhau, xác nhận chữ mờ dần đúng nhịp.
2. Chọn **clip video** → tab **Hiệu ứng**: thêm `vignette`, thumbnail chạy animation
   theo tham số; tab **Bộ lọc**: các tile tự chạy quét before/after, chọn preset → ✓.
3. Chọn **clip audio** → tab **Hiệu ứng động** → thêm keyframe `volume`.
4. Mở **Kho tài nguyên** (web): tìm “sunset” với Openverse (không cần key) → thêm vào
   thư viện; nếu CDN chặn CORS, panel vẫn nhập được nhờ `/api/v1/stock/download`.
   Kiểm tra Network: request đi `/api/v1/stock/proxy` (không phải gọi thẳng Pexels).
