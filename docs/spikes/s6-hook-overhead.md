# S6: Overhead của hook

Spike S6 của M0 (issue #9, time-box 1 giờ, dùng khoảng 45 phút làm việc). Thử ngày 16/11/2026 với Claude
Code 2.1.325 trên macOS.

## Cách đo

- Mỗi lần chạy là một phiên `claude -p --model haiku` trong sandbox, `--setting-sources project,local`,
  cho Claude gọi `Bash(true)` 15 lần nối tiếp. Hook đăng ký cho `UserPromptSubmit`, `PreToolUse`,
  `PostToolUse`, `PostToolBatch`, `Stop`.
- Output `stream-json` (kèm `--include-hook-events`) được gắn dấu thời gian từng dòng lúc nhận.
  **Thời gian chặn** của một hook = từ `hook_started` tới `hook_response` cùng `hook_id`. Với hook
  `async`, khoảng đó là lúc tiến trình hook chạy xong, không phải thời gian agent phải chờ; nên so thêm
  khoảng **`PreToolUse` → `PostToolUse`** (thời gian chặn của hook trước + thời gian chạy tool).
- Hook command là logger của S1 (`scripts/spikes/log-event.ts`, Node). Hook `http` gửi tới một server
  thử trên `127.0.0.1`: trả 200 ngay, hoặc nhận kết nối mà không bao giờ trả lời.
- Công cụ: `scripts/spikes/hook-overhead/` (`make-configs.sh`, `run.sh`, `server.mjs`, `stamp.mjs`,
  `analyze.mjs`); dùng lại được khi đo lại ở M1.

## Kết quả (15 tool call mỗi cấu hình, đơn vị ms)

| Cấu hình | Chặn mỗi hook, p50 | Chặn mỗi hook, p95 | `PreToolUse` → `PostToolUse`, p50 | Kết quả hook |
|---|---|---|---|---|
| C2: command `async` (Node) | 0 (agent không chờ) | 0 | 23 | success; `Stop` bị huỷ ở `-p` |
| C4: `http`, server tắt | 1 | 6 | 26 | error `ECONNREFUSED`, agent chạy tiếp |
| C3: `http`, server chạy | 1-2 | 16 | 31 | success |
| C1: command đồng bộ (Node) | 55-78 | 66-144 | 95 | success |
| C5: `http`, server treo, timeout 2 s | 2.002 | 2.022 | 2.034 | cancelled ở mọi hook |

Chi tiết C1 (đồng bộ): `PreToolUse` 78/144, `PostToolUse` 57/99, `PostToolBatch` 55/66 (p50/p95). Ba hook
mỗi tool call cộng lại khoảng 190 ms (p50). C5: cả phiên mất 123 giây, so với khoảng 30 giây ở các cấu
hình khác.

## Trả lời các câu của S6

- **p50/p95 của từng kiểu hook:** bảng trên. Command `async` không làm agent chờ; `http` nhanh nhất khi
  server chạy hoặc tắt hẳn; command đồng bộ viết bằng Node tốn 55-144 ms mỗi hook.
- **Hook `http` làm gì khi server tắt:** báo lỗi "non-blocking" (`ECONNREFUSED`) sau 1-8 ms và agent chạy
  tiếp bình thường. **Nhưng khi server treo** (nhận kết nối mà không trả lời), mỗi hook chặn agent tới
  hết `timeout`. Timeout mặc định là 600 giây (30 giây với `UserPromptSubmit`), nên một server treo có thể
  làm agent đứng 10 phút cho mỗi hook.

## Phát hiện khác

- Hook `http` luôn chạy đồng bộ (`async` chỉ có cho hook command) và không tự kiểm tra được công tắc tắt
  nhanh (mục 9.2).
- Claude Code **không áp `timeout` cho hook command `async`**: script tự phải đặt timeout cho request (vd
  khoảng 1 giây), nếu không tiến trình treo sẽ dồn lại khi server treo.
- Mỗi hook command (kể cả `async`) là một lần khởi động Node, khoảng 40 ms CPU (S1); 3 hook mỗi tool call.
  Không làm agent chậm, nhưng là chi phí CPU chạy nền. Bundle nhỏ gọn (S8) giảm phần này.
- Ở `-p`, hook `async` của `Stop` bị huỷ vì tiến trình thoát ngay (giống S1). Phiên tương tác không bị.
- **Cổng 47321 đang được VS Code dùng** trên máy này. Cổng mặc định của server phải kiểm tra trước khi
  dùng và đổi được bằng cấu hình (mục 9.2).
- Lần chạy C4 và C5 đầu tiên dừng vì phiên đăng nhập OAuth hết hạn giữa chừng (không liên quan tới hook),
  nên đã chạy lại sau khi đăng nhập lại. Dữ liệu lần đầu giữ ở `.dev-raw/s6/auth-expired/`.

## Đề xuất cho ADR-003 (chốt cùng S3, S4)

- **Chuyển sự kiện tới server: hook command `async`.** Không làm agent chờ, kiểm tra được công tắc tắt
  nhanh trước tiên, và không bị server treo làm đứng agent. Script tự đặt timeout khoảng 1 giây cho
  request và luôn thoát 0.
- **Không dùng hook `http` để chuyển sự kiện:** nhanh khi server chạy hoặc tắt, nhưng server treo là
  agent đứng tới hết timeout, và không đọc được công tắc tắt nhanh.
- **Hook đồng bộ chỉ dùng khi phải trả quyết định** (vd phương án dự phòng `PermissionRequest` ở S4), với
  timeout ngắn.
- **Ngưỡng đề xuất** cho "overhead hook p95" (chủ dự án duyệt): thời gian agent bị chặn thêm mỗi tool call
  **p95 ≤ 20 ms**, trong cả ba trường hợp server chạy, tắt và treo. Hook command `async` đạt; `http` không
  đạt khi server treo; command đồng bộ bằng Node không đạt (p95 144 ms).

## Liên quan S9

"Hook gọi khi server tắt có chặn agent không": **không**, với cả `http` (lỗi trong 1-8 ms) và command
`async` (agent không chờ). Server treo thì `http` chặn tới hết timeout; command `async` không chặn.

## Giới hạn

- Đo ở chế độ `-p` với haiku; phiên tương tác có thể khác chút ít.
- 15 mẫu cho mỗi kiểu hook trong mỗi cấu hình, nên p95 chỉ là ước lượng thô.
- Đo thời gian theo lúc dòng stream tới tay, nên có thêm vài ms trễ của pipe.
