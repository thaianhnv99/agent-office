# ADR-003: Kiểu hook

- **Trạng thái:** Chấp nhận (16/11/2026). Riêng ngưỡng overhead chờ duyệt ở go/no-go (#15).
- **Người quyết định:** chủ dự án
- **Liên quan:** plan v3.1 mục 4, 9.2; spike S1, S4 (`docs/spikes/s4-permission-hook.md`),
  S6 (`docs/spikes/s6-hook-overhead.md`), S8 (`docs/spikes/s8-packaging.md`), S9; ADR-002, ADR-007

## Bối cảnh

Hook có hai việc:
- **chuyển sự kiện** (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`,
  `Notification`, `SessionEnd`…) tới server;
- **xin quyết định duyệt** (`PermissionRequest`, ADR-002).

Số đo ở M0, tính theo thời gian agent bị chặn thêm mỗi tool call:

| Kiểu | Chặn agent | Khi server tắt | Khi server treo | Cần Node |
|---|---|---|---|---|
| Command `async`, Node (S6) | 0 | không chặn | không chặn | có, khoảng 35-40 ms khởi động |
| Command `async`, `sh` + `curl` (S8) | 0 | không chặn | không chặn (`curl -m 1`) | **không**, khoảng 8 ms |
| `http` (S6) | 1-16 ms | lỗi sau 1-8 ms | **chặn tới hết `timeout`** | không |
| Command đồng bộ, Node (S6) | 55-144 ms | | | có |

Các điểm khác cần tính đến:
- Hook `http` không kiểm tra được công tắc tắt nhanh trước khi gửi.
- Hook Node lỗi âm thầm khi PATH không có `node` (S8).
- Claude Code không áp `timeout` cho hook `async` (S6).
- Biến `CLAUDE_CODE_ENTRYPOINT` cho biết phiên có tương tác hay không: `cli` cho phiên tương tác, `sdk-cli` cho
  `-p` (S4, S9). Chỉ hook command đọc được biến này.

## Quyết định

1. **Hook chuyển sự kiện là hook command `async`, viết bằng `sh`, gửi bằng `curl`.**
   - Kiểm tra công tắc tắt nhanh trước tiên, bằng một phép thử file trong `${CLAUDE_PLUGIN_DATA}`.
   - Gửi payload từ stdin với `curl -s -m 1`, kèm token đọc từ `${CLAUDE_PLUGIN_DATA}` (ADR-007).
   - Không kết nối được (`curl` exit 7) thì gọi `ensure-running` qua shim một lần (bật lười, mục 9.2, ADR-007).
   - Luôn thoát 0 và không in gì.
   - Không cần Node, nên không dính nvm.
2. **Hook `PermissionRequest` là hook command đồng bộ, cũng viết bằng `sh` + `curl`,** không phải kiểu `http`.
   Lý do là chỉ hook command làm được hai việc:
   - kiểm tra công tắc tắt nhanh;
   - trả "không quyết định" ngay cho phiên không tương tác (`CLAUDE_CODE_ENTRYPOINT` bắt đầu bằng `sdk`).

   Cách chạy:
   - `curl -m <cửa sổ duyệt>` tới server, rồi in nguyên văn JSON quyết định mà server trả về;
   - `timeout` của hook đặt lớn hơn cửa sổ duyệt của `curl` một chút;
   - lỗi, hết giờ, hay server trả rỗng thì không in gì, tức không quyết định.
3. **Không dùng hook `http`** ở cả hai việc, vì server treo là chặn agent và không đọc được công tắc tắt.
4. **Mọi hook gọi bằng `${CLAUDE_PLUGIN_ROOT}/hooks/<tên>.sh`** (ADR-007). Dạng exec (có `args`) dùng được
   nếu cần bỏ qua `sh -c`. Cả hai dạng đều cho `ppid` là pid của `claude` (S8), đây là nguồn pid cho liveness
   (S9).
5. **Ngưỡng overhead (đề xuất, chờ duyệt ở go/no-go):** thời gian agent bị chặn thêm mỗi tool call p95 ≤ 20 ms,
   khi server chạy, tắt và treo. Hook `async` bằng `sh` + `curl` đạt với dư địa lớn.

## Hệ quả

- Không có Node trong đường nóng: mỗi hook khoảng 8 ms CPU thay vì khoảng 40 ms, và hook vẫn chạy khi PATH không
  có `node`.
- Script `sh` phải giữ nhỏ và có test:
  - chạy với payload mẫu;
  - chạy khi server tắt;
  - chạy khi server treo;
  - chạy khi công tắc tắt đang bật;
  - chạy với phiên `sdk-cli`.

  Logic phức tạp (validate, ghép yêu cầu) nằm ở server.
- Script `sh` không xử lý JSON, nên gửi payload nguyên văn. Payload có thể lớn khi `tool_response` lớn, nhưng chỉ
  đi qua localhost. Server cắt bớt trước khi ghi event log.
- macOS có sẵn `curl` và `/bin/sh`. Windows nằm ngoài phạm vi (plan mục 2).
- Hook `async` không có `timeout` từ Claude Code, nên `curl -m 1` là bắt buộc.
- Ở `-p`, hook `Stop` dạng `async` bị huỷ (S1, S6). Server không được dựa vào `Stop` của phiên `-p`.

## Phương án đã cân nhắc

- **Hook Node `async` (đề xuất của S6).** Bị thay bằng `sh` + `curl`, vì chậm hơn 4 lần, cần `node` trong PATH,
  và cần bundle.
- **Hook `http` cho `PermissionRequest` (cách S4 đã thử).** Nhanh, không cần script. Bị loại vì không bỏ qua
  được phiên `-p` và không đọc được công tắc tắt.
