# ADR-002: Cơ chế duyệt quyền từ dashboard

- **Trạng thái:** Chấp nhận (16/11/2026)
- **Người quyết định:** chủ dự án
- **Liên quan:** plan v3.1 mục 6; spike S3 (`docs/spikes/s3-channel.md`), S4 (`docs/spikes/s4-permission-hook.md`),
  S5 (`docs/spikes/s5-plugin-mcp.md`); ADR-003, ADR-007

## Bối cảnh

M2 cần cho phép duyệt hoặc từ chối yêu cầu xin quyền của agent ngay từ dashboard, mà hộp thoại trong
terminal vẫn dùng được. Plan v3 đặt hai cơ chế theo thứ tự: channel permission relay là cách chính, hook
`PermissionRequest` là dự phòng. M0 đã thử cả hai.

**Channel (S3):**
- Relay chạy được, và bên trả lời trước thắng.
- Nhưng:
  - với Pro/Max, cách duy nhất để bật channel tự viết là cờ `--dangerously-load-development-channels`
    ở **mọi phiên**, kèm một lần bấm xác nhận, kể cả khi plugin nằm ở marketplace riêng;
  - Team/Enterprise cần admin bật;
  - không chạy ở `-p`;
  - **không relay** câu hỏi có lựa chọn (`AskUserQuestion`) và duyệt kế hoạch (`ExitPlanMode`);
  - đang là research preview.
- Channel cần một MCP server cho mỗi phiên, khoảng 50 MB (S5).

**Hook `PermissionRequest` (S4):**
- Hộp thoại terminal hiện **ngay** trong lúc hook đang chờ, và bên trả lời trước thắng.
- Không cần cờ nào, chạy với mọi gói.
- Trả lời được cả `AskUserQuestion` (`updatedInput.answers`) lẫn `ExitPlanMode`.
- Có `tool_input` đầy đủ, không bị cắt.
- Bấm No trong terminal làm Claude Code đóng kết nối hook ngay. Bấm Yes thì hook chạy tiếp tới hết `timeout`.

## Quyết định

1. **Cơ chế duyệt của M2 là hook `PermissionRequest`.** Kiểu hook và cách gọi chốt ở ADR-003.
2. **Channel và MCP server bỏ khỏi M1-M2,** đưa vào backlog cùng tính năng "gửi prompt từ dashboard" (tính
   năng duy nhất thật sự cần channel). Plugin của M1-M2 không có MCP server.
3. **Terminal luôn là đường dự phòng.**
   - Dashboard chỉ trả quyết định khi người dùng bấm.
   - Hết `timeout`, server tắt hay treo thì hook trả "không quyết định", và hộp thoại terminal xử lý như bình
     thường.
4. **Phiên không tương tác** (`-p`, Agent SDK) nhận "không quyết định" ngay, vì không có ai ngồi ở dashboard
   chờ. Nếu chờ, một app treo sẽ làm agent đứng tới hết `timeout` (S4).
5. **Quyết định gửi về Claude Code:**
   - `allow` hoặc `deny` cho từng lần, không gửi `updatedPermissions` (mục 6: không ghi rule vĩnh viễn);
   - `deny` kèm `message` để Claude biết lý do;
   - `AskUserQuestion` trả `allow` kèm `updatedInput`, gồm nguyên `questions` và `answers` (key là chữ của câu
     hỏi, giá trị là `label` của đáp án);
   - `ExitPlanMode` trả `allow` kèm `updatedInput` là input gốc.
6. **Dashboard đánh dấu một yêu cầu "đã xử lý"** khi:
   - kết nối hook đóng (bấm No trong terminal);
   - hoặc có `PostToolUse`, `Stop`, `UserPromptSubmit` của cùng phiên, sau yêu cầu đó (bấm Yes trong terminal);
   - hoặc dashboard đã gửi quyết định.
7. **Mô hình đe doạ và biện pháp ở mục 6 giữ nguyên:**
   - chỉ bind `127.0.0.1`;
   - token cho hook;
   - quyết định gắn với yêu cầu và chỉ dùng được một lần;
   - lệnh nguy hiểm phải xác nhận lần hai;
   - có công tắc tắt nhanh.

## Hệ quả

- **Được:**
  - không cần cờ dev và không phụ thuộc research preview;
  - duyệt được cả câu hỏi và kế hoạch;
  - panel duyệt hiện được toàn bộ lệnh hoặc diff;
  - mỗi phiên bớt một tiến trình Node khoảng 50 MB;
  - kiến trúc bớt một thành phần.
- **Mất:**
  - không biết phiên crash sau 8-9 ms như MCP server (S9). Liveness dựa vào kiểm tra pid định kỳ, chậm tới một
    chu kỳ (30-60 s). Chỉ ảnh hưởng `kill -9` và crash, vì `/exit` và đóng terminal vẫn có `SessionEnd`;
  - không gửi được prompt từ dashboard (đã ở backlog).
- **Phải làm:**
  - Duyệt kế hoạch bằng hook sẽ chuyển phiên sang `acceptEdits`, giống lựa chọn "Yes, and auto-accept edits"
    (S4). Panel duyệt phải nói rõ điều này. Muốn giữ `default` thì phải dùng `setMode`, một dạng
    `updatedPermissions`. Để M2 quyết định sau khi thử.
  - Khi phiên chạy ở chế độ `auto` (cách chủ dự án thường dùng), hộp thoại ít khi xuất hiện, nên tính năng duyệt
    ít được dùng. Đây là điểm cần cân nhắc ở go/no-go (#15).
- **Rủi ro:** định dạng `PermissionRequest` và `updatedInput` có thể đổi giữa các phiên bản (changelog
  2.1.300, 2.1.323). Giữ golden test với fixture và `compat.json`.

## Phương án đã cân nhắc

- **Channel làm cách chính, hook làm dự phòng** (plan v3). Bị loại vì vướng cờ dev ở mọi phiên, không duyệt được
  câu hỏi và kế hoạch, và phải có MCP server cho mỗi phiên.
- **Dùng cả hai.** Bị loại vì hai đường cùng trả lời một yêu cầu làm phức tạp việc ghép yêu cầu, mà channel
  không thêm được gì hook chưa có.
- **Không làm duyệt quyền**, chỉ thông báo và nhảy tới terminal. Đây vẫn là phương án lùi nếu go/no-go thấy
  tính năng duyệt không đáng công.
