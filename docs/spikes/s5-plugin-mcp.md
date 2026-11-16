# S5: MCP server của plugin

Spike S5 của M0 (issue #8, time-box 1 giờ, dùng khoảng 30 phút). Thử ngày 16/11/2026 với Claude Code 2.1.325
trên macOS. Spike này dùng lại dữ liệu của S3 (MCP server khai báo trong `.mcp.json` của dự án) và S9 (kill,
sleep/wake), rồi thử thêm phần còn thiếu: MCP server **nằm trong plugin**, và chuyện gì xảy ra với nó khi
`/clear`.

## Cách thử

- Plugin mẫu đặt ở `.dev-data/s5/plugin/`, do tay tạo, chỉ là dữ liệu dev. Nó gồm:
  - `plugin.json`;
  - `.mcp.json` khai báo server `ao-s5`, chính là channel server của S3 (`scripts/spikes/channel/server.mjs`),
    ghi log vào `.dev-raw/s5`;
  - `hooks.json` gọi logger S1 với tag `s5/hooks`.
- Chạy `claude -p --plugin-dir .dev-data/s5/plugin` trong sandbox. Môi trường đã được làm sạch như S9, để
  không thành phiên con.
- `scripts/spikes/lifecycle/clear-session.sh` mở một phiên tương tác trong pty, tự gõ `/clear` rồi `/exit`,
  và in sự kiện của hook cạnh sự kiện của MCP server.

## Kết quả

### Vòng đời

| Lúc | MCP server | Nguồn |
|---|---|---|
| Mở phiên (tương tác hoặc `-p`) | Được bật cùng lúc với `SessionStart`, chênh 10-300 ms; mỗi tiến trình `claude` một server | S3, S5 |
| `/clear` (session id mới) | **Không bị bật lại**: cùng pid, không nhận message nào | S5 |
| Máy ngủ rồi thức | Sống tiếp, không nhận tín hiệu nào | S9 |
| `/exit` | Nhận `SIGINT` trước hook `SessionEnd` khoảng 120-230 ms | S3, S5 |
| `kill -TERM`, `kill -HUP` (đóng terminal) | Nhận `SIGINT` sau khoảng 260 ms | S9 |
| `kill -9` (crash) | **stdin đóng sau 8-9 ms** | S9 |

Theo tài liệu, sau `SIGINT` Claude Code gửi tiếp `SIGTERM` (100 ms sau) rồi `SIGKILL` (400 ms sau nữa).

Vậy **MCP server sống đúng bằng tiến trình `claude`, không phải bằng `session_id`.** Một tiến trình có thể
trải qua nhiều `session_id`:
- `/clear` cho `SessionEnd` với `reason: clear`, rồi `SessionStart` với `source: clear` và id mới, cùng `ppid`;
- `/resume` ngay trong phiên có lẽ cũng vậy, nhưng chưa thử.

### Lấy pid và `session_id`

- **pid:** `process.ppid` của MCP server là pid của `claude`. Giá trị này bằng `ppid` của hook (S1), của
  statusline (S7), và bằng `pid` trong `claude agents --json`. Đúng ở cả phiên tương tác lẫn `-p`, với cả
  server của plugin lẫn server của dự án.
- **`session_id`:** biến `CLAUDE_CODE_SESSION_ID` chỉ đúng **lúc server được bật**.
  - Sau `/clear`, biến này vẫn giữ id cũ, và Claude Code không báo gì cho server.
  - Vì vậy phải lấy `session_id` hiện tại từ hook, rồi ghép với MCP server theo pid.
- **Biến môi trường** của MCP server trong plugin:
  - `CLAUDE_CODE_SESSION_ID`;
  - `CLAUDE_PROJECT_DIR`;
  - `CLAUDE_CODE_ENTRYPOINT` (`cli` hoặc `sdk-cli`);
  - `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`;
  - `CLAUDE_CODE_MESSAGING_SOCKET`, `CLAUDE_CODE_MESSAGING_TOKEN` (không ghi giá trị);
  - `CLAUDECODE`.

### Phát hiện khác

- **MCP server của plugin bị chặn nếu trùng lệnh với một server khai báo tay.** Lần chạy đầu, server của plugin
  không được bật, và log debug ghi: `Suppressing plugin MCP server "plugin:agent-office-s5:ao-s5": duplicates
  manually-configured "ao-channel"`, vì cùng `node .../server.mjs`. Thêm một tham số khác là chạy.
  - Khi dev, nếu sandbox vừa có server khai báo tay vừa có plugin thì chỉ một cái chạy.
  - Bản phát hành nên có lệnh riêng cho server của plugin.
- Một MCP server Node rảnh chiếm khoảng **50 MB RSS**. Mỗi phiên có một server, nên 3-5 phiên tốn 150-250 MB.
- `claude plugin details <tên>` (cùng `--plugin-dir` đặt trước lệnh con) liệt kê hook và MCP server của
  plugin. `claude plugin validate <thư mục>` kiểm tra manifest.

## Trả lời các câu của S5

- **Có sống đúng bằng vòng đời session không:** đúng bằng vòng đời **tiến trình** `claude`. Nó sống qua `/clear`
  và qua giấc ngủ, và biết ngay khi tiến trình chết, kể cả `kill -9`, vì stdin đóng sau 8-9 ms. Một tiến trình
  có thể chứa nhiều `session_id` liên tiếp.
- **Lấy pid và `session_id` bằng cách nào:**
  - pid lấy bằng `process.ppid`;
  - `session_id` thì lấy từ hook. `CLAUDE_CODE_SESSION_ID` chỉ dùng được cho tới lần `/clear` đầu tiên.

## Đề xuất cho ADR (chốt cùng ADR-002, go/no-go #15)

- Nếu ADR-002 chọn hook `PermissionRequest` thay channel (S4), thì MCP server **không bắt buộc**. Lợi ích duy
  nhất còn lại là biết tiến trình chết nhanh hơn (8-9 ms so với chu kỳ kiểm tra 30-60 s). Cái giá là 50 MB và
  một tiến trình Node cho mỗi phiên.
- **Đề xuất:** M1-M2 không dùng MCP server.
  - Liveness dựa vào pid lấy từ `ppid` của hook, kiểm tra bằng `kill -0` định kỳ, đối chiếu bằng
    `claude agents --json` (S2, S9).
  - Chỉ thêm MCP server khi làm channel (backlog: gửi prompt từ dashboard).
- **Mô hình dữ liệu (mục 5):**
  - khoá liveness theo pid;
  - ghép `session_id` vào pid theo hook `SessionStart`;
  - coi `SessionEnd` với `reason: clear` là "phiên này kết thúc" chứ **không** phải "tiến trình đã tắt".

## Giới hạn

- Phiên tương tác chạy trong pty giả lập (`script`), không phải terminal VS Code thật.
- Chưa thử:
  - `/resume` ngay trong phiên;
  - MCP server bị crash giữa chừng (Claude Code có bật lại không);
  - plugin cài thật từ marketplace.
- Số đo bộ nhớ là của channel server mẫu khi rảnh. Server thật dùng `@modelcontextprotocol/sdk` sẽ nặng hơn.
