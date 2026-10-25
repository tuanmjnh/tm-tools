# TM Tools Documentation Hub

Chào mừng bạn đến với kho tài liệu hướng dẫn kỹ thuật và vận hành của **TM Tools Desktop & Studio**.

---

## 📚 Sổ Tay Hướng Dẫn Nhanh (User & System Guides)

Tất cả các tài liệu hướng dẫn thực hành đã được tổ chức gọn gàng trong thư mục **[`docs/guides/`](./guides/)**:

1. 📖 **[Hướng Dẫn Sử Dụng Dành Cho Người Dùng (User Guide)](./guides/user-guide.md)**
   - Hướng dẫn thao tác giao diện Studio TMCut, cắt ghép video trên Timeline, quản lý Browser Profiles chống phát hiện, quản lý Media và sử dụng các công cụ Utilities.

2. ⚙️ **[Hướng Dẫn Cài Đặt & Cấu Hình Hệ Thống (System Setup Guide)](./guides/system-setup-and-configuration-guide.md)**
   - Thiết lập kết nối giữa TM Hub (Port 4000) và TM Tools (Port 4002), cấu hình biến môi trường `.env`, phân bổ cổng dịch vụ và lệnh seed database.

3. 🚀 **[Hướng Dẫn Cấu Hình Hệ Thống Assets & Tích Hợp RunwayML (https://dev.runwayml.com)](./guides/assets-and-runwayml-setup-guide.md)**
   - Kiến trúc phân tầng tài nguyên (Local, Cloud, In-memory), cách lấy API Key từ Runway Developer Portal, cấu hình mô hình `gen3a` / `gen3a-turbo` và vòng đời sinh video AI bất đồng bộ.

4. 🏪 **[Hướng Dẫn Cấu Hình & Đẩy Asset Lên Marketplace](./guides/asset-marketplace-guide.md)**
   - Chuẩn bị file tài nguyên (Music, SFX, Fonts, LUT Presets), cấu trúc manifest `starter-catalog.json`, quy chuẩn License Review bắt buộc, tính mã băm SHA-256 và đóng gói Electron.

---

## 🏗️ Tài Liệu Kiến Trúc & Thiết Kế Chuyên Sâu (Architecture & Specs)

* 🎬 **[TMCut UI Components Reference](./capcut_editor_ui_components_reference.md)**: Đặc tả chi tiết các thành phần giao diện Timeline, Toolbar, Preview Canvas, Track Headers và Inspector theo chuẩn CapCut / Premiere Pro.
* 🗺️ **[TMCut Roadmap v3](./TMCut%20Roadmap%20v3.md)**: Lộ trình kiến trúc toàn diện của Studio biên tập video TMCut.
* 🤖 **[TMCut Roadmap v4 MCP & AI Automation](./TMCut_Roadmap_v4_MCP_AI_Automation.md)**: Tích hợp Model Context Protocol (MCP) và tự động hóa video bằng AI.
* 🌐 **[Browser Platform Architecture](./browser-platform/)**: Kiến trúc quản lý hồ sơ trình duyệt chống phát hiện vân tay (Anti-detect Browser Hub).
