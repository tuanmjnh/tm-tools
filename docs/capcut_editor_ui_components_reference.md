# Đặc tả giao diện Editor kiểu CapCut Desktop
## Danh mục thành phần, chức năng và hướng dẫn sử dụng

> **Mục đích:** Tài liệu tham khảo để phân tích và xây dựng giao diện trình biên tập video desktop theo cách tổ chức quen thuộc của CapCut: **khung công cụ bên trái – preview ở giữa – inspector/thuộc tính bên phải – timeline phía dưới**.
>
> **Lưu ý về độ chính xác:** CapCut thay đổi giao diện theo phiên bản, hệ điều hành, khu vực và loại dự án. Tên tab, nút và tính năng có thể khác nhau. Tài liệu này phân loại các nhóm tính năng phổ biến của trình biên tập video kiểu CapCut, không khẳng định mọi phiên bản đều có đúng tất cả mục được liệt kê. Nếu dùng cho sản phẩm riêng, nên xem đây là đặc tả chức năng tham khảo, không sao chép thương hiệu, biểu tượng hoặc thiết kế độc quyền nguyên trạng.

---

## 1. Tổng quan bố cục

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Thanh tiêu đề / Tên dự án / Hoàn tác / Làm lại / Xuất                         │
├───────────────┬──────────────────────────────────────┬───────────────────────┤
│               │                                      │                       │
│  KHUNG TRÁI   │          KHUNG GIỮA                   │   KHUNG PHẢI          │
│  Media/Tools  │          Preview / Canvas             │   Inspector           │
│               │                                      │   Thuộc tính clip     │
│ Media         │  Khung hình đang phát                 │   Video / Audio       │
│ Audio         │  Điều khiển phát                      │   Speed / Animation   │
│ Text          │  Tỉ lệ khung hình                     │   Adjust / Mask       │
│ Stickers      │                                      │                       │
│ Effects       │                                      │                       │
│ Transitions   │                                      │                       │
├───────────────┴──────────────────────────────────────┴───────────────────────┤
│ TOOLBAR TIMELINE: con trỏ, chia, snap, zoom, track, undo...                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ TIMELINE: video / overlay / text / audio / effects / captions                 │
│ Ruler, playhead, clip blocks, track headers, waveform, keyframes              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 1.1. Nguyên tắc hoạt động
- **Khung trái** thường dùng để chọn nội dung hoặc công cụ và đưa tài nguyên vào dự án.
- **Preview giữa** hiển thị kết quả tại vị trí playhead; một số editor cho phép kéo, đổi kích thước hoặc xoay đối tượng trực tiếp trên canvas.
- **Khung phải** là inspector: hiển thị thuộc tính của clip/đối tượng đang được chọn. Không chọn clip thì có thể hiển thị thuộc tính dự án hoặc để trống.
- **Timeline dưới** là nơi sắp xếp nội dung theo thời gian, chia/cắt clip, chỉnh thời lượng, lớp hiển thị, âm thanh và đồng bộ.
- Một thao tác có thể cập nhật đồng thời nhiều vùng: chọn clip trên timeline → inspector đổi nội dung → preview hiện khung hình của clip → thay đổi thuộc tính cập nhật preview.

## 2. Thanh tiêu đề và thanh công cụ chung

| Thành phần | Tác dụng | Cách sử dụng / hành vi cần có |
|---|---|---|
| Tên dự án | Cho biết dự án đang mở | Bấm để đổi tên; lưu tên cùng project metadata |
| Trạng thái lưu | Báo đã lưu hay còn thay đổi chưa lưu | Hiển thị “Đã lưu/Đang lưu”; đánh dấu dirty khi chỉnh sửa |
| Undo / Hoàn tác | Đảo ngược thao tác gần nhất | Hoàn tác theo command history; không chỉ hoàn tác giao diện |
| Redo / Làm lại | Khôi phục thao tác vừa undo | Chỉ bật khi có thao tác có thể làm lại |
| Project settings | Cấu hình dự án | Tỉ lệ, độ phân giải, frame rate, màu sắc nếu hỗ trợ |
| Export / Xuất | Mở thiết lập render | Chọn tên file, định dạng, độ phân giải, FPS, bitrate, âm thanh |
| Menu ứng dụng | Lệnh dự án và ứng dụng | New/Open/Save/Save As, import, preferences, help |
| Phím tắt | Tăng tốc thao tác | Hiển thị trong menu hoặc tooltip; cho phép cấu hình nếu cần |

## 3. Khung trái — Media, thư viện và công cụ

Khung trái nên chia thành **thanh danh mục** và **nội dung danh mục**. Tài nguyên thường được kéo từ khung này xuống timeline.

### 3.1. Media / Thư viện phương tiện

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| Media tab | Mở thư viện file của dự án | Chọn để xem video, ảnh, âm thanh đã nhập |
| Import / Nhập | Thêm file từ máy | Mở hộp thoại file; có thể hỗ trợ kéo-thả từ Explorer/Finder |
| Import folder | Nhập nhiều file trong thư mục | Quét thư mục và thêm file hợp lệ |
| Project media / Local | Danh sách tài nguyên dự án | Hiển thị thumbnail, tên, thời lượng, loại file |
| Search | Tìm tài nguyên | Lọc theo tên hoặc loại file |
| Sort | Sắp xếp thư viện | Tên, ngày thêm, thời lượng, loại file |
| Grid/List view | Đổi cách hiển thị | Lưới thumbnail để duyệt trực quan; danh sách để xem metadata |
| Preview source | Xem nhanh tài nguyên trước khi đưa vào timeline | Chọn item; phát thử trong source viewer nếu có |
| Add to timeline | Thêm tài nguyên vào timeline | Chèn tại playhead hoặc nối vào cuối tùy lệnh |
| Replace clip | Thay file của clip đang chọn | Giữ hoặc điều chỉnh thời lượng/thuộc tính theo quy tắc ứng dụng |
| Relink / Locate missing media | Tìm lại file bị mất đường dẫn | Chọn file mới; cập nhật tham chiếu trong project |
| Remove from project | Gỡ tài nguyên khỏi thư viện dự án | Cảnh báo nếu đang được dùng trong timeline; không tự xóa file gốc |
| Proxy / Optimized media (nếu hỗ trợ) | Tạo bản nhẹ để preview mượt | Tạo proxy, giữ liên kết đến file gốc khi export |

**Hành vi kéo-thả khuyến nghị**
1. Kéo media vào track phù hợp để đặt tại vị trí thả.
2. Kéo lên vùng trống timeline để tự tạo track mới nếu loại media cho phép.
3. Kéo media lên một clip có thể hiển thị gợi ý thay thế hoặc chèn; phải làm rõ bằng tooltip/overlay.
4. Không xóa file gốc khi người dùng chỉ xóa item khỏi thư viện dự án.

### 3.2. Audio / Âm thanh

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| Audio library | Thư viện nhạc/âm thanh có sẵn nếu sản phẩm cung cấp | Chọn tài nguyên và nghe thử |
| Import audio | Nhập MP3, WAV, AAC và định dạng được hỗ trợ | Chọn file hoặc kéo vào dự án |
| Sound effects | Hiệu ứng âm thanh | Tìm kiếm, nghe thử, thêm vào track audio |
| Music | Nhạc nền | Thêm vào timeline, cắt và chỉnh âm lượng |
| Voiceover / Record | Thu lời thoại trực tiếp nếu hỗ trợ | Chọn thiết bị, kiểm tra input, ghi vào track mới |
| Extract audio | Tách âm thanh từ video | Tạo audio clip riêng, không làm mất video gốc |
| Beat / Rhythm detection (nếu có) | Phân tích nhịp để hỗ trợ dựng nhạc | Tạo marker nhịp; người dùng vẫn có thể sửa |
| Noise reduction (nếu có) | Giảm tiếng ồn nền | Bật/tắt và điều chỉnh mức; nghe A/B trước-sau |
| Voice enhancement (nếu có) | Làm rõ giọng nói | Áp dụng xử lý và cho phép hoàn tác |

### 3.3. Text / Văn bản và phụ đề

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| Add text | Tạo lớp chữ | Tạo text clip tại playhead hoặc track text |
| Default text | Chữ cơ bản | Sửa nội dung trong preview hoặc inspector |
| Text templates | Mẫu chữ có bố cục/hoạt ảnh dựng sẵn | Chọn mẫu, thêm vào timeline, thay nội dung |
| Titles | Tiêu đề mở đầu hoặc tiêu đề phân đoạn | Đặt trên track phía trên video |
| Captions / Auto captions | Tạo phụ đề từ lời nói nếu hỗ trợ | Chọn ngôn ngữ, tạo, rà soát từng đoạn |
| Import subtitles | Nhập SRT/VTT nếu hỗ trợ | Chọn file, kiểm tra encoding và thời gian |
| Subtitle editor | Sửa câu, thời gian vào/ra | Chọn dòng để nhảy đến đoạn tương ứng |
| Text style presets | Kiểu chữ lưu sẵn | Áp dụng font, màu, viền, nền, bóng |
| Text-to-speech (nếu có) | Tạo giọng đọc từ văn bản | Chọn giọng, nghe thử, tạo audio clip |

### 3.4. Stickers / Graphics / Elements

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| Stickers | Nhãn dán trang trí | Kéo lên timeline; chỉnh vị trí/kích thước trong preview |
| Shapes | Hình cơ bản như hình chữ nhật, tròn, mũi tên | Dùng làm nền, callout hoặc che vùng |
| Emojis | Biểu tượng | Chèn như lớp đồ họa nếu được hỗ trợ |
| Frames / Borders | Khung viền | Áp dụng cho clip hoặc lớp hình |
| Overlay | Lớp phủ ảnh/video | Đặt ở track phía trên clip nền |
| Brand assets | Logo, watermark hoặc bộ nhận diện của người dùng | Lưu vào thư viện riêng; cho phép tái sử dụng |

### 3.5. Effects / Hiệu ứng hình ảnh

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| Video effects | Biến đổi hình ảnh theo thời gian | Kéo hiệu ứng lên clip hoặc track effect |
| Body effects (nếu có) | Hiệu ứng bám theo người/vật | Chọn clip và cấu hình vùng/đối tượng nếu cần |
| Lens / Blur / Distortion | Mờ, biến dạng, hiệu ứng ống kính | Áp dụng rồi điều chỉnh tham số ở inspector |
| Retro / Glitch / Stylize | Nhóm phong cách hình ảnh | Xem preview trước khi áp dụng |
| Effect search | Tìm hiệu ứng | Tìm theo tên hoặc tag |
| Favorites | Lưu hiệu ứng thường dùng | Đánh dấu sao để truy cập nhanh |
| Effect duration | Thời lượng hiệu ứng | Kéo mép effect block trên timeline |

**Quy tắc giao diện:** Phân biệt rõ hiệu ứng gắn trực tiếp vào clip và hiệu ứng nằm trên track riêng. Nếu effect là clip riêng, cần có thao tác di chuyển, cắt, đổi thời lượng và xóa.

### 3.6. Transitions / Chuyển cảnh

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| Transition library | Danh sách chuyển cảnh | Chọn loại chuyển cảnh và xem ví dụ |
| Transition search/categories | Lọc chuyển cảnh | Tìm theo nhóm như basic, camera, light, distortion |
| Apply transition | Áp dụng giữa hai clip | Kéo vào điểm nối hoặc dùng lệnh áp dụng |
| Transition duration | Độ dài chuyển cảnh | Kéo mép hoặc nhập thời lượng |
| Transition parameters | Hướng, cường độ, biến thể | Chỉnh trong inspector khi transition được chọn |
| Remove transition | Xóa chuyển cảnh | Trả điểm nối về cắt thẳng |

**Xử lý biên clip:** Nếu hai clip không đủ phần hình dư để tạo transition, ứng dụng phải xác định quy tắc: rút ngắn clip, dùng freeze/loop, hoặc từ chối và thông báo; không tự thay đổi âm thầm.

### 3.7. Filters / Bộ lọc màu

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| Filter library | Preset màu | Chọn preset và điều chỉnh cường độ |
| Filter strength | Cường độ filter | Thanh trượt 0–100% hoặc giá trị tương đương |
| Favorites | Lưu preset thường dùng | Đánh dấu để dùng lại |
| Apply to clip | Áp dụng cho clip | Chỉ tác động clip được chọn |
| Copy/paste attributes | Sao chép hiệu chỉnh màu | Chọn rõ thuộc tính nào được sao chép |

### 3.8. Adjust / Chỉnh màu thủ công

Tùy phiên bản, phần chỉnh màu có thể nằm ở inspector thay vì khung trái.

| Thuộc tính | Ý nghĩa | Sử dụng |
|---|---|---|
| Temperature | Ấm/lạnh | Tăng để ấm hơn, giảm để lạnh hơn |
| Tint | Lệch xanh lá/magenta | Cân bằng ám màu |
| Exposure | Phơi sáng tổng thể | Tăng/giảm độ sáng tổng thể |
| Brightness | Độ sáng | Điều chỉnh mức sáng theo thuật toán của ứng dụng |
| Contrast | Tương phản | Tăng độ tách sáng-tối |
| Highlights | Vùng sáng | Hạ để giữ chi tiết vùng sáng |
| Shadows | Vùng tối | Nâng để thấy chi tiết vùng tối |
| Whites / Blacks | Điểm trắng/đen | Điều chỉnh hai đầu dải tông |
| Saturation | Độ bão hòa | Tăng/giảm độ rực màu |
| HSL | Chỉnh hue/saturation/luminance theo màu | Chọn dải màu rồi điều chỉnh |
| Curves | Đường cong tông màu | Tạo điểm trên đường cong; cần có reset |
| Color wheels | Bánh xe màu | Cân bằng vùng shadow/midtones/highlights |
| Reset | Đưa thuộc tính về mặc định | Có thể reset một mục hoặc toàn bộ nhóm |

### 3.9. Animation / Hiệu ứng chuyển động có sẵn

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| In animation | Hiệu ứng lúc clip/đối tượng xuất hiện | Chọn preset và thời lượng |
| Out animation | Hiệu ứng lúc biến mất | Chọn preset và thời lượng |
| Combo animation | Hiệu ứng chạy trong clip | Chọn preset, thời lượng và cường độ nếu có |
| Animation duration | Thời gian chạy hiệu ứng | Điều chỉnh bằng input hoặc slider |
| Preview animation | Xem thử | Phát đoạn liên quan trước khi xác nhận |

### 3.10. Các công cụ AI (chỉ khi sản phẩm/phiên bản hỗ trợ)

| Thành phần | Tác dụng | Cách sử dụng / lưu ý |
|---|---|---|
| Auto captions | Tạo phụ đề tự động | Cần chọn ngôn ngữ và rà soát lỗi nhận dạng |
| Background removal | Tách nền chủ thể | Xử lý theo clip; hiển thị tiến trình và trạng thái |
| Smart cutout | Tách chủ thể | Cho phép sửa vùng sai nếu công cụ hỗ trợ |
| Speech enhancement | Làm rõ giọng nói | Có nút bật/tắt để so sánh |
| Auto reframe | Tái bố cục theo tỉ lệ khác | Hiển thị vùng crop và cho phép chỉnh tay |
| Scene detection | Phát hiện cảnh | Đề xuất điểm chia, không tự phá timeline nếu chưa xác nhận |
| Beat detection | Tìm nhịp nhạc | Tạo marker có thể xóa/sửa |
| Translation / dubbing | Dịch hoặc lồng tiếng nếu có | Cần hiển thị ngôn ngữ nguồn/đích và kiểm tra nội dung |

---

## 4. Khung giữa — Preview / Canvas

### 4.1. Khu vực xem trước

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| Preview canvas | Hiển thị kết quả tại playhead | Cập nhật khi playhead hoặc thuộc tính clip thay đổi |
| Safe area guides | Hướng dẫn vùng an toàn nếu có | Bật/tắt; không xuất hiện trong video cuối |
| Grid / Guides | Căn chỉnh đối tượng | Bật/tắt đường lưới và đường căn |
| Selection bounding box | Viền chọn đối tượng | Hiển thị khi chọn lớp có thể biến đổi |
| Resize handles | Đổi kích thước | Kéo góc/cạnh; giữ tỉ lệ khi nhấn phím bổ trợ nếu quy định |
| Rotation handle | Xoay đối tượng | Kéo núm xoay; inspector cập nhật góc |
| Anchor / Pivot | Điểm tâm biến đổi | Đổi điểm neo nếu sản phẩm hỗ trợ |
| Snap guides | Hướng dẫn căn theo tâm/cạnh | Xuất hiện tạm thời khi kéo gần vị trí căn |
| Crop frame | Cắt khung hình | Kéo cạnh/góc để chọn vùng crop |
| Mask outline | Đường biên mask | Chỉnh vùng che và feather nếu hỗ trợ |
| Transform controls | Vị trí, scale, rotation | Có thể chỉnh trực tiếp trên canvas hoặc qua inspector |

### 4.2. Điều khiển phát

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| Play / Pause | Phát hoặc dừng preview | Space hoặc nút phát |
| Previous frame | Lùi một frame | Di chuyển playhead theo frame |
| Next frame | Tiến một frame | Di chuyển playhead theo frame |
| Jump to start | Về đầu dự án/timeline | Đưa playhead về thời gian 0 |
| Jump to end | Đến cuối nội dung | Đưa playhead đến thời điểm kết thúc timeline |
| Current timecode | Thời gian hiện tại | Hiển thị theo định dạng timecode hoặc giây |
| Duration | Tổng thời lượng dự án | Cập nhật khi nội dung timeline thay đổi |
| Playback quality | Chất lượng preview | Chọn mức preview để cân bằng hiệu năng |
| Loop playback | Phát lặp vùng/dự án | Bật/tắt; nếu có vùng loop thì chỉ lặp vùng đó |
| Volume / Mute preview | Âm lượng nghe khi preview | Chỉ điều chỉnh nghe thử, không thay đổi gain clip |
| Fullscreen preview | Xem preview toàn màn hình | Thoát bằng Esc hoặc nút đóng |
| Aspect ratio selector | Tỉ lệ canvas | Chọn 16:9, 9:16, 1:1, 4:5 hoặc custom nếu hỗ trợ |
| Fit / 100% / Zoom | Phóng to/thu nhỏ canvas | Fit để vừa vùng preview; 100% xem kích thước gốc |
| Background canvas | Nền ngoài khung video | Dùng để dễ phân biệt vùng video và vùng trống; không nhất thiết xuất ra |

### 4.3. Thao tác trực tiếp trên canvas

- **Chọn đối tượng:** nhấp vào đối tượng đang hiển thị tại thời điểm playhead.
- **Di chuyển:** kéo đối tượng; cập nhật `x/y` hoặc transform tương ứng.
- **Đổi kích thước:** kéo handle; có thể khóa tỉ lệ.
- **Xoay:** kéo handle xoay hoặc nhập góc trong inspector.
- **Căn giữa:** dùng guides hoặc lệnh align center/horizontal/vertical.
- **Chỉnh chữ:** nhấp đúp vào text nếu chế độ chỉnh sửa nội dung được hỗ trợ.
- **Chỉnh crop/mask:** chuyển sang công cụ crop/mask trước khi kéo để tránh nhầm với di chuyển đối tượng.
- **Thoát chọn:** nhấp vùng trống hoặc nhấn Esc.

### 4.4. Quy tắc đồng bộ preview
1. Preview hiển thị đúng frame theo playhead và frame rate của dự án.
2. Chỉnh thuộc tính phải phản hồi nhanh, có debounce cho thao tác nhập liên tục nếu cần.
3. Overlay chọn, guides và handles chỉ là giao diện biên tập; không được render vào video.
4. Khi phát, playhead và preview phải đồng bộ; khi dừng, frame hiện tại vẫn được giữ.
5. Với dự án nặng, có thể dùng preview resolution thấp hoặc proxy, nhưng export phải dựa trên nguồn chất lượng cao theo cấu hình.
6. Nếu media bị thiếu hoặc decode lỗi, hiển thị placeholder và thông báo có thể xử lý; không làm treo toàn bộ UI.

---

## 5. Khung phải — Inspector / Properties

Inspector nên thay đổi theo **loại đối tượng đang chọn**. Dùng các nhóm có thể thu gọn; giữ giá trị chỉnh sửa khi chuyển tab nếu người dùng chưa xác nhận hoặc chưa hoàn tác.

### 5.1. Transform / Basic

| Thuộc tính | Tác dụng | Cách sử dụng |
|---|---|---|
| Position X | Vị trí ngang | Nhập số hoặc kéo trên canvas |
| Position Y | Vị trí dọc | Nhập số hoặc kéo trên canvas |
| Scale X / Width | Kích thước ngang | Nhập số; xác định đơn vị rõ ràng |
| Scale Y / Height | Kích thước dọc | Nhập số; có thể khóa tỉ lệ |
| Uniform scale / Lock ratio | Giữ tỉ lệ | Bật để thay đổi một chiều đồng thời đổi chiều kia |
| Rotation | Góc xoay | Nhập độ hoặc kéo handle |
| Opacity | Độ mờ | 0% trong suốt, 100% đục |
| Anchor point | Điểm neo | Thay đổi tâm xoay/scale nếu hỗ trợ |
| Flip horizontal/vertical | Lật ngang/dọc | Nút bật/tắt |
| Blend mode | Cách hòa trộn lớp | Chọn mode nếu renderer hỗ trợ |
| Reset transform | Đưa transform về mặc định | Xác nhận nếu thao tác làm mất bố cục đáng kể |

**Đơn vị nội bộ:** Nên thống nhất một hệ tọa độ cho project. UI có thể hiển thị pixel, phần trăm hoặc tọa độ chuẩn hóa; phải có hàm chuyển đổi giữa preview size và project resolution để vị trí không lệch khi đổi kích thước preview.

### 5.2. Video

| Thuộc tính | Tác dụng | Cách sử dụng |
|---|---|---|
| Basic | Nhóm thiết lập chung | Hiển thị các điều khiển phù hợp với clip video |
| Scale / Position / Rotate | Transform clip | Thay đổi kích thước, vị trí và góc |
| Blend / Opacity | Hòa trộn | Điều chỉnh độ mờ và chế độ hòa trộn nếu có |
| Crop | Cắt hình | Chọn vùng cần giữ; phân biệt crop với scale |
| Mask | Che một phần hình | Chọn dạng mask và chỉnh kích thước/vị trí |
| Feather | Làm mềm biên mask | Tăng để biên mờ hơn |
| Stabilization (nếu có) | Ổn định rung | Chạy phân tích; cho phép bật/tắt kết quả |
| Relight / Retouch (nếu có) | Xử lý hình ảnh nâng cao | Chỉ hiển thị nếu được hỗ trợ |
| Video speed | Tốc độ phát | Thay đổi thời lượng hiển thị; phải xác định cách xử lý audio |
| Reverse | Phát ngược | Tạo cache/đảo thứ tự frame; hiển thị trạng thái xử lý |
| Freeze frame | Đóng băng một frame | Chọn frame và thời lượng freeze |
| Remove background (nếu có) | Tách nền | Hiển thị tiến trình, trạng thái và tùy chọn tinh chỉnh |
| Stabilize/Enhance status | Trạng thái phân tích | Cho phép hủy tác vụ đang chạy nếu an toàn |

### 5.3. Audio

| Thuộc tính | Tác dụng | Cách sử dụng |
|---|---|---|
| Volume / Gain | Mức âm lượng clip | Dùng slider và giá trị số; có thể hiển thị dB |
| Fade in | Tăng âm dần đầu clip | Nhập thời lượng hoặc kéo handle |
| Fade out | Giảm âm dần cuối clip | Nhập thời lượng hoặc kéo handle |
| Pan / Balance | Cân bằng trái-phải | Điều chỉnh kênh nghe nếu hỗ trợ |
| Noise reduction | Giảm nhiễu | Bật/tắt, chỉnh mức và nghe so sánh |
| Voice enhancement | Tăng độ rõ lời nói | Bật/tắt, tránh mặc định xử lý phá hủy |
| Normalize / Loudness | Chuẩn hóa âm lượng | Hiển thị mục tiêu và kết quả nếu hỗ trợ |
| Pitch | Cao độ | Thay đổi cao độ; cần tránh gây méo tiếng |
| Speed | Tốc độ audio | Xác định có giữ pitch hay không |
| Detach audio | Tách âm thanh khỏi video | Tạo audio clip liên kết hoặc độc lập theo mô hình dữ liệu |
| Mute clip | Tắt tiếng clip | Không xóa dữ liệu âm thanh |

### 5.4. Speed / Tốc độ

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| Normal speed | Tốc độ cố định | Nhập hệ số như 0.5x, 1x, 2x |
| Speed curve | Thay đổi tốc độ theo thời gian | Chọn preset hoặc chỉnh các điểm trên đường cong |
| Curve points | Điểm điều khiển tốc độ | Di chuyển điểm; cập nhật thời lượng clip |
| Keep pitch | Giữ cao độ audio | Bật nếu thuật toán xử lý hỗ trợ |
| Reverse | Đảo chiều phát | Kiểm tra tương thích với transition và audio |
| Duration result | Thời lượng sau đổi tốc độ | Cập nhật ngay sau khi xác nhận giá trị |

### 5.5. Animation / Keyframes

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| In / Out / Combo | Preset chuyển động | Chọn preset và thời lượng |
| Add keyframe | Ghi giá trị tại thời điểm hiện tại | Đặt playhead, chọn thuộc tính, thêm keyframe |
| Keyframe marker | Dấu thời điểm có giá trị | Chọn để chỉnh hoặc xóa |
| Interpolation | Cách chuyển giữa keyframe | Linear, ease-in, ease-out, bezier nếu hỗ trợ |
| Easing curve | Tinh chỉnh độ tăng/giảm tốc | Chỉnh curve; preview kết quả |
| Keyframe navigation | Nhảy keyframe trước/sau | Dùng để chỉnh chính xác |
| Delete keyframe | Xóa keyframe đang chọn | Có thể giữ giá trị nội suy từ các điểm còn lại |
| Property animation toggle | Bật/tắt hoạt ảnh cho thuộc tính | Không xóa keyframe khi chỉ tắt tạm thời, trừ khi UI nói rõ |

### 5.6. Text / Typography

| Thuộc tính | Tác dụng | Cách sử dụng |
|---|---|---|
| Text content | Nội dung chữ | Nhập văn bản; hỗ trợ xuống dòng |
| Font family | Họ phông chữ | Chọn font có sẵn trong hệ thống/app |
| Font size | Kích thước chữ | Nhập số hoặc slider |
| Font weight | Độ đậm | Regular, Medium, Bold… tùy font |
| Italic / Underline / Strike | Kiểu chữ | Bật/tắt |
| Text color | Màu chữ | Chọn màu bằng picker hoặc mã màu |
| Alignment | Căn trái/giữa/phải | Áp dụng cho đoạn chữ |
| Line spacing | Khoảng cách dòng | Điều chỉnh khi có nhiều dòng |
| Letter spacing | Khoảng cách ký tự | Dùng cho tiêu đề hoặc nhãn |
| Stroke / Outline | Viền chữ | Chọn màu và độ dày |
| Shadow | Bóng chữ | Chỉnh màu, độ mờ, blur và offset nếu hỗ trợ |
| Background / Text box | Nền phía sau chữ | Màu, opacity, padding và bo góc nếu có |
| Text opacity | Độ mờ chữ | Điều chỉnh độc lập nếu mô hình hỗ trợ |
| Text transform | Vị trí, scale, xoay | Dùng nhóm Transform |
| Auto fit | Tự co chữ vào hộp | Nếu hỗ trợ, phải cho biết khi nào chữ bị thu nhỏ |
| Character/paragraph spacing | Giãn cách ký tự/đoạn | Chỉ hiện nếu loại text engine hỗ trợ |

### 5.7. Mask / Crop / Chroma key

| Thuộc tính | Tác dụng | Cách sử dụng |
|---|---|---|
| Mask type | Hình dạng vùng mask | Rectangle, circle, linear hoặc custom tùy renderer |
| Mask position/size | Vị trí/kích thước mask | Kéo trên canvas hoặc nhập số |
| Feather | Mềm biên | Tăng giảm độ chuyển mượt ở rìa |
| Rotation | Xoay mask | Điều chỉnh góc |
| Invert mask | Đảo vùng hiển thị/ẩn | Xem preview để xác nhận vùng tác động |
| Crop top/bottom/left/right | Cắt cạnh khung | Nhập số hoặc kéo tay nắm |
| Chroma key color | Màu cần loại bỏ | Chọn màu bằng picker hoặc eyedropper |
| Similarity/Tolerance | Độ rộng màu bị loại | Tăng từ từ để tránh mất chủ thể |
| Edge/Spill cleanup | Làm sạch viền và ám màu | Điều chỉnh cẩn thận, xem ở nền tương phản |

### 5.8. Filter / Adjust / Color

Inspector có thể nhóm theo các tab: **Basic, HSL, Curves, Color wheels**. Mỗi nhóm cần:
- Giá trị hiện tại và nút reset.
- Slider có thể kéo và nhập số chính xác.
- Preview cập nhật trực tiếp.
- Copy/paste thuộc tính có lựa chọn cụ thể.
- Không làm thay đổi file nguồn; lưu thông số trong project và áp dụng khi preview/render.

### 5.9. Transitions / Effects inspector

Khi chọn transition hoặc effect block, inspector cần hiển thị:
- Tên và loại effect.
- Duration.
- Các tham số riêng của effect.
- Nút bật/tắt tạm thời.
- Reset parameters.
- Xóa effect.
- Trạng thái phân tích/render nếu effect cần xử lý nền.

### 5.10. Thuộc tính project khi không chọn clip

| Thành phần | Tác dụng |
|---|---|
| Canvas ratio | Tỉ lệ khung hình dự án |
| Resolution | Kích thước khung hình xuất |
| Frame rate | FPS dự án |
| Background color | Màu nền vùng trống nếu hỗ trợ |
| Audio sample rate | Tần số lấy mẫu đầu ra nếu cấu hình |
| Color space / HDR | Không gian màu/HDR nếu sản phẩm hỗ trợ |
| Proxy/render preview | Cấu hình hiệu năng preview |
| Project duration | Tổng thời lượng nội dung |
| Media status | Số file thiếu hoặc lỗi nếu có |

---

## 6. Timeline — Thanh công cụ và vùng dựng phía dưới

Timeline gồm **toolbar**, **ruler/time scale**, **track headers**, **clip blocks**, **playhead**, và các lớp nội dung.

### 6.1. Toolbar timeline

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| Selection tool | Chọn và di chuyển clip | Công cụ mặc định |
| Split / Razor | Chia clip tại playhead | Chọn clip, đặt playhead, Split |
| Trim tool (nếu có) | Chỉnh điểm vào/ra | Kéo cạnh clip để đổi thời lượng |
| Delete | Xóa clip hoặc vùng chọn | Cần phân biệt xóa clip với ripple delete |
| Ripple delete | Xóa và kéo phần sau lấp khoảng trống | Chỉ tác động track/link phạm vi được xác định |
| Duplicate | Nhân bản clip | Tạo clip mới với thuộc tính tương tự |
| Copy / Paste | Sao chép/dán clip hoặc thuộc tính | Quy tắc dán tại playhead phải nhất quán |
| Undo / Redo | Hoàn tác/làm lại | Đồng bộ với lịch sử toàn ứng dụng |
| Snapping / Magnet | Hít vào cạnh clip, playhead, marker | Bật/tắt để căn chính xác |
| Link/unlink clips | Liên kết video và audio | Di chuyển/cắt cùng nhau khi liên kết |
| Group / Ungroup | Gom nhiều đối tượng | Giúp di chuyển nhiều clip cùng nhau nếu hỗ trợ |
| Lock tracks | Khóa track | Ngăn chỉnh sửa nhầm |
| Mute track | Tắt tiếng toàn track | Không xóa audio |
| Hide/Disable track | Ẩn hoặc vô hiệu hóa track | Phân biệt trạng thái preview và export |
| Zoom timeline + / - | Phóng to/thu nhỏ trục thời gian | Thay đổi pixels-per-second |
| Fit timeline | Vừa toàn bộ dự án vào chiều rộng | Tự tính mức zoom phù hợp |
| Add track | Thêm track | Có thể tự tạo khi kéo clip vào vùng trống |
| Mark in/out | Đánh dấu vùng | Dùng cho phát lặp hoặc export vùng nếu hỗ trợ |
| Add marker | Đánh dấu thời điểm | Đặt nhãn tại thời điểm cần nhớ |
| Auto captions / tools shortcut | Mở công cụ phụ trợ | Chỉ hiển thị nếu ứng dụng có tính năng |

### 6.2. Ruler / Thước thời gian

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| Time ruler | Hiển thị mốc thời gian | Đơn vị thay đổi theo mức zoom |
| Time ticks | Vạch chia thời gian | Mật độ tăng khi zoom in |
| Playhead / Current-time indicator | Chỉ vị trí phát hiện tại | Kéo để scrub; click ruler để nhảy |
| Playhead head | Tay nắm kéo playhead | Kéo dọc trục thời gian |
| In/Out markers | Đầu/cuối vùng chọn | Kéo để thay đổi phạm vi |
| Timeline marker | Mốc ghi chú | Nhấp để chọn, đổi tên hoặc xóa |
| Work area / Loop range | Vùng làm việc hoặc phát lặp | Nếu hỗ trợ, hiển thị rõ màu và hai đầu mút |

### 6.3. Track headers / Đầu track

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| Track name/type | Tên và loại track | Ví dụ Video 1, Overlay 1, Text, Audio |
| Track visibility | Bật/tắt hiển thị | Chỉ tác động track đó; quy tắc export phải rõ |
| Track mute | Tắt tiếng track audio | Không xóa dữ liệu |
| Track solo | Chỉ nghe track này | Hữu ích khi mix audio |
| Track lock | Khóa track | Ngăn kéo, cắt hoặc xóa clip |
| Track height | Chiều cao track | Kéo biên hoặc chọn compact/expanded |
| Track reorder | Đổi thứ tự track | Kéo đầu track; phải cập nhật thứ tự compositing |
| Track context menu | Lệnh theo track | Rename, duplicate, delete, add track, lock |
| Waveform display | Hiển thị dạng sóng | Có thể bật/tắt; không thay đổi dữ liệu audio |
| Track color/label | Phân biệt track | Màu nhãn hoặc tên, nếu hỗ trợ |

### 6.4. Clip block / Khối clip trên timeline

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| Clip body | Đại diện cho một đoạn media/đối tượng | Nhấp để chọn, kéo để di chuyển |
| Clip thumbnail | Giúp nhận diện nội dung | Hiển thị một hoặc nhiều thumbnail theo thời gian |
| Clip label | Tên media hoặc nội dung text | Cắt gọn khi thiếu chỗ; tooltip hiện tên đầy đủ |
| Left trim handle | Đổi điểm đầu clip | Kéo cạnh trái; có thể trim hoặc ripple tùy modifier/tool |
| Right trim handle | Đổi điểm cuối clip | Kéo cạnh phải |
| Clip selection border | Báo clip đang chọn | Phân biệt với trạng thái hover |
| Clip fade handles | Chỉnh fade audio/video nếu hỗ trợ | Kéo handle ở góc/đầu clip |
| Transition block | Đại diện chuyển cảnh | Chọn để chỉnh duration/parameters |
| Effect block | Đại diện effect theo track | Di chuyển, trim, chỉnh thông số |
| Text block | Khoảng thời gian chữ hiển thị | Chỉnh nội dung trong inspector; trim thời gian |
| Audio waveform | Dạng sóng âm thanh | Hỗ trợ tìm nhịp và lời thoại |
| Keyframe diamonds | Giá trị tại thời điểm cụ thể | Chọn/kéo/xóa theo hệ keyframe |
| Speed curve overlay | Hiển thị thay đổi tốc độ | Chỉnh điểm nếu UI hỗ trợ |
| Linked indicator | Cho biết clip được liên kết | Bật/tắt link |
| Missing media badge | Báo file nguồn bị mất | Mở relink |
| Processing badge | Đang phân tích/tạo proxy | Hiển thị tiến trình và khả năng hủy |

### 6.5. Thao tác chỉnh clip

- **Chọn:** nhấp clip; inspector và preview đồng bộ với clip.
- **Di chuyển:** kéo thân clip theo chiều ngang; vị trí bắt đầu thay đổi. Kéo sang track khác nếu loại clip cho phép.
- **Trim:** kéo cạnh trái/phải; clip ngắn/dài hơn nhưng phần bị trim vẫn thuộc media nguồn.
- **Split:** đặt playhead tại điểm cắt rồi dùng Split; tạo hai đoạn logic từ cùng nguồn.
- **Delete:** xóa clip khỏi timeline; không tự xóa file nguồn.
- **Ripple delete:** xóa clip và dồn phần sau theo quy tắc đã chọn; phải tránh làm lệch các track liên quan ngoài ý muốn.
- **Duplicate:** nhân bản clip, giữ các thuộc tính theo quy tắc rõ ràng.
- **Move playhead:** kéo playhead hoặc nhấp ruler.
- **Snap:** khi bật, cạnh clip hít vào playhead, marker hoặc cạnh clip khác.
- **Zoom:** zoom quanh playhead hoặc vị trí con trỏ để tránh mất vùng đang thao tác.
- **Multi-select:** Shift/Ctrl-click hoặc kéo vùng chọn; hiển thị trạng thái rõ.
- **Copy/paste:** dán tại playhead hoặc vị trí đã quy định; phải giữ liên kết media và keyframe.
- **Lock track:** khi track bị khóa, mọi thao tác chỉnh sửa lên clip trong track phải bị chặn.

### 6.6. Các loại track thường gặp

| Loại track | Nội dung | Quy tắc hiển thị/phát |
|---|---|---|
| Main video | Video nền/chính | Thường nằm dưới overlay |
| Overlay video | Video phủ lên track thấp hơn | Track cao hơn thường được compositing phía trước |
| Image | Ảnh tĩnh | Có thời lượng trên timeline |
| Text / Captions | Chữ và phụ đề | Hiện trong khoảng thời gian clip |
| Audio / Music | Nhạc, lời thoại, SFX | Có waveform và điều khiển âm lượng |
| Voiceover | Lời thoại thu riêng | Có thể cùng loại audio nhưng gắn nhãn riêng |
| Effects | Hiệu ứng kéo dài theo thời gian | Áp dụng cho clip hoặc vùng được chỉ định |
| Transitions | Chuyển cảnh | Thường gắn giữa hai clip hoặc là block độc lập |
| Adjustment layer (nếu có) | Hiệu chỉnh lên nhiều lớp phía dưới | Cần xác định phạm vi tác động |
| Markers | Mốc ghi chú | Không render thành nội dung video |

### 6.7. Quy tắc timeline cần thống nhất trong code

1. Dùng một đơn vị thời gian nội bộ thống nhất; không dùng số pixel của timeline làm dữ liệu thời gian.
2. Tách `sourceIn/sourceOut` khỏi `timelineStart/timelineDuration`.
3. Quy định rõ `duration` là thời lượng trên timeline hay thời lượng nguồn.
4. Các thao tác trim, split, speed change và ripple phải có test cho các trường hợp biên.
5. Playhead được lưu theo thời gian dự án, sau đó chuyển sang frame theo FPS.
6. Snap dùng ngưỡng theo pixel nhưng so sánh với các mốc thời gian thật.
7. Khi kéo clip, preview và inspector không được nhảy sang clip khác ngoài ý muốn.
8. Liên kết audio/video phải có ID liên kết; không dựa vào việc hai clip tình cờ cùng vị trí.
9. Undo/redo phải khôi phục cả dữ liệu timeline và thuộc tính liên quan.
10. Mỗi thao tác phá hủy hoặc ảnh hưởng nhiều track cần có phạm vi xác định rõ.

---

## 7. Thanh trạng thái / tác vụ nền

| Thành phần | Tác dụng | Cách sử dụng |
|---|---|---|
| Render/export progress | Tiến trình xuất video | Hiển thị phần trăm và thời gian ước tính nếu có cơ sở |
| Background task queue | Danh sách proxy, waveform, AI, render | Có trạng thái queued/running/completed/failed |
| Cancel task | Hủy tác vụ | Hủy an toàn; không làm hỏng project |
| Error details | Giải thích lỗi | Có nút xem chi tiết/log |
| Media warnings | Cảnh báo file thiếu/codec không hỗ trợ | Cho phép xử lý ngay |
| Disk/cache info | Thông tin cache nếu có | Có thể dọn cache an toàn, không xóa media gốc |

## 8. Luồng sử dụng mẫu

### Luồng A — Dựng video cơ bản
1. Tạo dự án và chọn tỉ lệ/FPS.
2. Import video, ảnh và audio vào Media.
3. Kéo clip chính xuống main video track.
4. Sắp xếp clip bằng kéo-thả; dùng Split và Trim để cắt.
5. Kéo nhạc vào audio track, chỉnh âm lượng và fade.
6. Chọn clip, dùng inspector để chỉnh scale, vị trí, màu và tốc độ.
7. Thêm text/caption ở track phía trên.
8. Xem preview từ đầu đến cuối, rà soát điểm nối và âm thanh.
9. Export, chọn độ phân giải/FPS/định dạng và lưu file.

### Luồng B — Chỉnh chữ trên preview
1. Thêm text từ khung trái.
2. Chọn text block trong timeline.
3. Nhập nội dung trong inspector hoặc canvas.
4. Chỉnh font, size, màu, outline, shadow và background.
5. Kéo chữ đến vị trí mong muốn trên preview.
6. Trim text block để quyết định thời điểm xuất hiện/kết thúc.
7. Thêm keyframe/animation nếu cần; xem lại toàn đoạn.

### Luồng C — Thêm transition
1. Đặt hai clip sát nhau trên timeline.
2. Mở danh mục Transitions.
3. Xem thử và kéo transition vào điểm nối.
4. Chọn transition để mở inspector.
5. Chỉnh duration/parameters.
6. Phát thử trước và sau điểm nối; kiểm tra không có khoảng đen hoặc lệch nhịp.

### Luồng D — Tạo chuyển động bằng keyframe
1. Chọn clip hoặc lớp text.
2. Đặt playhead ở thời điểm bắt đầu.
3. Thêm keyframe cho position/scale/opacity.
4. Di chuyển playhead đến thời điểm kết thúc.
5. Thay đổi thuộc tính để tạo keyframe thứ hai.
6. Chọn interpolation/easing nếu hỗ trợ.
7. Phát thử và sửa các điểm chưa mượt.

---

## 9. Quy tắc UX và trạng thái giao diện

- **Empty state:** khi chưa có media hoặc timeline, hiển thị lời mời Import và hướng dẫn kéo-thả.
- **Selected state:** phân biệt rõ clip đang chọn, clip hover, clip khóa và clip bị lỗi.
- **Disabled state:** nút không khả dụng phải có lý do dễ hiểu, ví dụ chưa chọn clip.
- **Loading state:** tác vụ AI, proxy, waveform hoặc phân tích phải hiển thị tiến trình nếu có.
- **Error state:** báo lỗi cụ thể và hướng xử lý; không chỉ hiện “Failed”.
- **Confirmation:** hỏi xác nhận với thao tác xóa nhiều nội dung hoặc reset hàng loạt; không hỏi với thao tác có thể undo dễ dàng nếu UX cho phép.
- **Keyboard accessibility:** các nút chính có phím tắt và focus state.
- **Tooltips:** tên và phím tắt cho icon khó nhận biết.
- **Responsive panels:** cho phép kéo thay đổi chiều rộng khung trái/phải; có thể thu gọn panel.
- **Persistence:** lưu kích thước panel, tab gần nhất và trạng thái timeline vào UI preferences.
- **Localization:** mọi label, tooltip, thông báo và đơn vị phải hỗ trợ bản địa hóa.
- **Performance:** thumbnail, waveform, proxy và phân tích chạy nền; tránh chặn UI thread.
- **Autosave:** lưu an toàn theo chu kỳ và sau thao tác quan trọng; báo rõ trạng thái.
- **Non-destructive editing:** chỉnh sửa nên lưu dưới dạng metadata/operation; không sửa file nguồn.

## 10. Gợi ý mô hình dữ liệu cho editor tự xây dựng

Đây là gợi ý kiến trúc, không phải schema nội bộ của CapCut.

### 10.1. Project
```ts
interface EditorProject {
  id: string
  name: string
  width: number
  height: number
  fps: number
  durationTicks: number
  tracks: TimelineTrack[]
  mediaAssets: MediaAsset[]
}
```

### 10.2. Media asset
```ts
interface MediaAsset {
  id: string
  sourcePath: string
  mediaType: 'video' | 'audio' | 'image'
  durationTicks?: number
  width?: number
  height?: number
  fps?: number
  audioChannels?: number
  missing?: boolean
}
```

### 10.3. Timeline track và clip
```ts
interface TimelineTrack {
  id: string
  type: 'video' | 'overlay' | 'image' | 'text' | 'audio' | 'effect'
  name: string
  order: number
  muted?: boolean
  hidden?: boolean
  locked?: boolean
  clips: TimelineClip[]
}

interface TimelineClip {
  id: string
  assetId?: string
  kind: 'video' | 'audio' | 'image' | 'text' | 'effect' | 'transition'
  timelineStartTicks: number
  timelineDurationTicks: number
  sourceInTicks?: number
  sourceOutTicks?: number
  speed?: number
  transform?: {
    x: number
    y: number
    scaleX: number
    scaleY: number
    rotation: number
    opacity: number
  }
  effects?: ClipEffect[]
  keyframes?: Keyframe[]
  linkedGroupId?: string
}
```

### 10.4. Keyframe và effect
```ts
interface Keyframe {
  id: string
  property: string
  timeTicks: number
  value: number | string | boolean | number[]
  interpolation?: 'linear' | 'ease-in' | 'ease-out' | 'bezier'
}

interface ClipEffect {
  id: string
  type: string
  enabled: boolean
  parameters: Record<string, number | string | boolean>
}
```

### 10.5. Quy tắc kỹ thuật quan trọng
- Trong ứng dụng thật, nên dùng kiểu dữ liệu và validation rõ hơn ví dụ tối giản ở trên.
- Không lưu đối tượng UI (pixel position của panel, hover state) lẫn vào dữ liệu timeline.
- Có thể dùng command pattern cho undo/redo: `SplitClip`, `TrimClip`, `MoveClip`, `SetProperty`, `AddKeyframe`, `DeleteClip`.
- Tách `Editor UI`, `Project model`, `Preview renderer`, `Timeline engine`, `Media services` và `FFmpeg/export pipeline`.
- Nếu app dùng Electron + Vue/Nuxt + FFmpeg, không chạy xử lý nặng trên renderer/UI thread; giao tiếp qua IPC có schema, kiểm tra đường dẫn và báo tiến trình.
- Dùng một hệ thời gian nội bộ thống nhất. Nếu dự án đang dùng `TICKS_PER_SECOND = 120_000`, nên quy định tất cả phép đổi giữa ticks, frame, giây và pixel timeline qua utility chung; không rải phép tính ở component.
- Preview có thể dùng canvas/WebGL/HTML media hoặc renderer riêng; export FFmpeg phải có quy tắc tương đương về transform, crop, text, opacity, effects và timing để hạn chế khác biệt preview/export.

## 11. Checklist triển khai

### Bố cục
- [ ] Khung trái có danh mục và vùng nội dung.
- [ ] Preview giữa có playhead/timecode, play/pause và chọn tỉ lệ.
- [ ] Inspector phải đổi theo loại đối tượng đang chọn.
- [ ] Timeline có ruler, playhead, track headers và clip blocks.
- [ ] Panel có thể thay đổi kích thước/thu gọn.

### Timeline
- [ ] Chọn, di chuyển, trim, split, delete, duplicate.
- [ ] Snap bật/tắt.
- [ ] Zoom, fit timeline, scroll ngang/dọc.
- [ ] Track lock/mute/hide.
- [ ] Multi-select và copy/paste.
- [ ] Undo/redo.
- [ ] Link/unlink audio-video.
- [ ] Marker và waveform nếu cần.

### Preview và inspector
- [ ] Preview theo đúng playhead.
- [ ] Transform từ inspector cập nhật preview.
- [ ] Transform trên preview cập nhật inspector.
- [ ] Text có thể chỉnh nội dung và style.
- [ ] Keyframe hoạt động đúng theo thời gian.
- [ ] Overlay guides không xuất hiện trong export.
- [ ] Thiếu media không làm crash ứng dụng.

### Tài nguyên và export
- [ ] Import video/ảnh/audio.
- [ ] Relink missing media.
- [ ] Lưu và mở lại project.
- [ ] Export có tiến trình và lỗi dễ hiểu.
- [ ] Kiểm tra đồng bộ preview/export.
- [ ] Tác vụ nền có thể hủy an toàn.
- [ ] Không xóa file gốc khi xóa clip khỏi timeline.

## 12. Những điểm cần xác minh trước khi coi là “đầy đủ CapCut”

Do giao diện và tính năng CapCut khác nhau theo phiên bản, trước khi dùng tài liệu này làm bản đối chiếu pixel-perfect cần:
1. Ghi lại hệ điều hành, phiên bản CapCut và loại tài khoản/khu vực.
2. Chụp ảnh toàn màn hình ở trạng thái mới mở dự án.
3. Chọn lần lượt video, audio, text, transition, effect để ghi lại inspector thực tế.
4. Ghi tên chính xác của từng tab, nút và submenu trong phiên bản đó.
5. Phân biệt tính năng có sẵn, tính năng phụ thuộc tài khoản/khu vực và tính năng AI.
6. Chỉ đưa vào sản phẩm của mình những tính năng cần thiết; không nhất thiết tái tạo mọi mục của CapCut.

---

## Tóm tắt
- **Trái:** nhập và quản lý media; truy cập audio, text, stickers, effects, transitions, filters và các công cụ phụ trợ.
- **Giữa:** preview/canvas, phát-dừng, timecode, tỉ lệ, zoom, transform trực tiếp.
- **Phải:** inspector động theo clip; transform, video, audio, speed, animation/keyframes, text, mask/crop, color và effect parameters.
- **Dưới:** timeline toolbar, ruler, playhead, track headers, clip blocks, waveform, transitions/effects, snapping, zoom, trim/split và quản lý track.
- **Toàn ứng dụng:** undo/redo, autosave, project settings, media relink, background task queue và export.

Tài liệu này là danh mục tham khảo có cấu trúc để thiết kế editor riêng. Tên hiển thị thực tế nên được đối chiếu với phiên bản CapCut mà nhóm phát triển muốn tham khảo.
