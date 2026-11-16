# Architecture Decision Records

Mỗi quyết định kiến trúc quan trọng có một file `ADR-NNN-<chủ đề>.md`. Mẫu chung: trạng thái, bối cảnh,
quyết định, hệ quả, các phương án đã cân nhắc. Danh sách ADR dự kiến nằm trong plan v3.1, M0.

| ADR | Chủ đề | Trạng thái |
|---|---|---|
| ADR-001 | Nguồn dữ liệu và bảng ánh xạ sự kiện | Chưa viết |
| [ADR-002](ADR-002-approval-mechanism.md) | Cơ chế duyệt quyền: hook `PermissionRequest`, channel vào backlog | Chấp nhận (16/11/2026) |
| [ADR-003](ADR-003-hook-type.md) | Kiểu hook: `sh` + `curl`, không dùng hook `http` | Chấp nhận (16/11/2026), ngưỡng overhead chờ go/no-go |
| ADR-004 | Event sourcing và reducer thuần | Chưa viết |
| ADR-005 | Lưu trữ | Chưa viết |
| ADR-006 | Renderer (M3) | Chưa viết |
| [ADR-007](ADR-007-packaging.md) | Đóng gói plugin, shim trong `${CLAUDE_PLUGIN_DATA}`, bật server, đường dẫn Node | Chấp nhận (16/11/2026) |
| ADR-008 | Biên bản go/no-go của M0 | Chưa viết |
