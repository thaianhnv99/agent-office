# Kế hoạch dự án: "Agent Office", dashboard giám sát Claude agent

## 1. Giả định hiện tại

- Dùng **Claude Code** (CLI) trên macOS, chạy 2-3 session song song, có thể ở các thư mục dự án khác nhau
- Dashboard chạy **cục bộ**, chỉ để một người xem, không cần đăng nhập hay deploy
- Mục tiêu kép: **dùng thật hàng ngày** và **làm dự án portfolio** (có thể mở mã nguồn)
- Dùng React + TypeScript (hoặc sẵn sàng học)

## 2. Mục tiêu và phạm vi

**Mục tiêu:** nhìn một màn hình là biết mỗi agent đang làm gì, có cần mình can thiệp không, tốn bao nhiêu.

**MVP (bắt buộc có):**
- Hiển thị 2-3 agent theo thời gian thực với trạng thái đúng
- Biết agent nào đang chờ duyệt (và có thông báo)
- Xem 10-20 hành động gần nhất của mỗi agent
- Giao diện kiểu văn phòng

**Làm sau MVP:** thống kê token/chi phí, lịch sử, tóm tắt bằng AI, âm thanh, theme.

**Không làm (giai đoạn này):** điều khiển agent từ dashboard (gửi prompt, duyệt quyền), hỗ trợ nhiều máy, đăng nhập, deploy lên cloud.

## 3. Kiến trúc

```
Claude Code session ─ hook (script nhỏ) ─ HTTP POST ─┐
Claude Code session ─ hook ──────────────────────────┤
Claude Code session ─ hook ──────────────────────────┼─→ Server cục bộ (Node/TS)
                                                     │      ├─ Event store (SQLite)
~/.claude/projects/**/*.jsonl ─ file watcher ────────┘      ├─ Agent state machine
                                                            └─ WebSocket/SSE
                                                                    ↓
                                                         Dashboard (React) + macOS notification
```

**Nguyên tắc thiết kế:**
- **Hook cho trạng thái** (nhanh, nhẹ), **transcript cho chi tiết** (token, nội dung)
- Hook script **không bao giờ được làm chậm hoặc làm hỏng agent**: timeout ngắn, lỗi thì im lặng bỏ qua
- Server chỉ bind `127.0.0.1`
- Mọi thứ đi qua một **schema sự kiện chuẩn hoá** để sau này thêm nguồn khác (Cursor, Codex...) mà không phải sửa UI

## 4. Dữ liệu

**Sự kiện chuẩn hoá (server tạo ra từ hook/transcript):**

```ts
type AgentEvent = {
  id: string;
  sessionId: string;
  timestamp: number;
  type: 'session_start' | 'prompt' | 'tool_start' | 'tool_end'
      | 'needs_approval' | 'stopped' | 'session_end';
  cwd: string;            // thư mục dự án
  tool?: string;          // Edit, Bash, Read...
  target?: string;        // file hoặc lệnh (đã cắt ngắn)
  tokens?: { input: number; output: number; cached: number };
};
```

**Trạng thái agent:** `idle`, `thinking`, `editing`, `running`, `waiting_approval`, `done`, `offline`.

**Bảng chuyển trạng thái:**

| Sự kiện | → Trạng thái |
|---|---|
| session_start | idle |
| prompt | thinking |
| tool_start (Edit/Write) | editing |
| tool_start (Bash) | running |
| tool_start (Read/Grep...) | thinking (hiện "đang đọc file") |
| needs_approval | waiting_approval |
| stopped | done |
| session_end hoặc im lặng > N phút | offline |

Dùng **XState** (hoặc reducer thuần + test kỹ) để quản lý. Đây là điểm đáng khoe khi phỏng vấn.

> Lưu ý: tên sự kiện hook và định dạng transcript thực tế phải được xác nhận ở Phase 0, vì có thể thay đổi theo phiên bản Claude Code.

## 5. Tech stack

| Phần | Lựa chọn | Lý do |
|---|---|---|
| Monorepo | pnpm workspaces | Chia `server`, `web`, `shared` (schema dùng chung) |
| Server | Node + TypeScript + Hono | Nhẹ, hỗ trợ WebSocket/SSE |
| Theo dõi file | chokidar | Chuẩn, ổn định |
| Lưu trữ | SQLite (better-sqlite3) | Không cần cài DB, đủ cho lịch sử |
| Validate | Zod | Kiểm tra payload hook và transcript |
| Web | React + Vite + TypeScript | Chạy cục bộ, không cần Next.js |
| State | Zustand + XState | Store gọn, máy trạng thái rõ ràng |
| Đồ hoạ | CSS/SVG trước, PixiJS nếu muốn pixel art | Đi từ đơn giản |
| Test | Vitest, Playwright | Unit cho state machine, E2E cho luồng chính |
| Thông báo | node-notifier hoặc `osascript` | Notification macOS |

## 6. Cấu trúc repo

```
agent-office/
├─ packages/
│  ├─ shared/      # schema Zod, type AgentEvent
│  ├─ server/      # nhận hook, watcher, state machine, WS
│  ├─ web/         # dashboard React
│  └─ hook-cli/    # script gửi sự kiện (nhỏ, ít phụ thuộc)
├─ docs/           # kiến trúc, ảnh GIF demo
├─ fixtures/       # transcript mẫu đã ẩn dữ liệu nhạy cảm, dùng để test
└─ README.md
```

## 7. Giao diện "văn phòng"

Mỗi agent là một nhân vật ngồi ở bàn làm việc:

| Trạng thái | Hiển thị |
|---|---|
| thinking | Ngồi gõ phím, bong bóng "..." |
| editing | Gõ nhanh, hiện tên file đang sửa |
| running | Đứng cạnh "máy chủ", hiện lệnh đang chạy |
| waiting_approval | Giơ tay, đèn đỏ nhấp nháy, có thể kèm âm thanh |
| done | Uống cà phê, đèn xanh |
| offline | Mờ đi |

Mỗi bàn hiển thị: tên dự án, tác vụ hiện tại, 5 hành động gần nhất, thời gian làm, token/chi phí ước tính. Bấm vào nhân vật để mở timeline chi tiết.

## 8. Lộ trình chi tiết (5 tuần, ~8-10 giờ/tuần)

### Phase 0: Khảo sát (1-2 ngày)
- [ ] Đọc tài liệu hooks hiện tại của Claude Code, xác định chính xác tên sự kiện và payload
- [ ] Cấu hình thử 1 hook ghi payload ra file log, chạy vài session thật để xem dữ liệu
- [ ] Mở 1-2 file `.jsonl` trong `~/.claude/projects/` xem cấu trúc (token, tool, message...)
- [ ] Chốt **schema sự kiện** ở mục 4 dựa trên dữ liệu thật

**Xong khi:** có bảng "sự kiện hook thật ↔ trạng thái agent" chính xác.

### Phase 1: Đường ống dữ liệu (tuần 1)
- [ ] Khởi tạo monorepo, TypeScript, lint, format
- [ ] Server `POST /events` nhận payload, validate bằng Zod
- [ ] `hook-cli`: đọc stdin, gửi HTTP tới server, timeout ngắn, lỗi thì bỏ qua
- [ ] State machine + unit test cho mọi chuyển trạng thái
- [ ] WebSocket đẩy trạng thái tới client
- [ ] Web tối thiểu: danh sách agent dạng chữ, cập nhật real-time

**Xong khi:** chạy 2 session Claude thật, trang web hiện đúng trạng thái của cả hai.

### Phase 2: Chi tiết và độ tin cậy (tuần 2)
- [ ] File watcher đọc transcript **tăng dần** (nhớ offset, chỉ đọc dòng mới)
- [ ] Trích xuất token, tên công cụ, file đang sửa
- [ ] Lưu sự kiện vào SQLite, tải lại trang vẫn còn lịch sử
- [ ] Tự kết nối lại WebSocket, hiển thị trạng thái "mất kết nối"
- [ ] Phát hiện agent offline (timeout)
- [ ] Xử lý: session crash, nhiều session cùng thư mục, server khởi động lại giữa chừng

**Xong khi:** tắt/bật server hoặc trình duyệt giữa chừng mà dashboard vẫn đúng.

### Phase 3: Giao diện văn phòng (tuần 3)
- [ ] Thiết kế bố cục: mỗi agent một bàn, thêm khu "máy chủ", "góc cà phê"
- [ ] Nhân vật + hoạt ảnh theo các trạng thái
- [ ] Mỗi bàn hiển thị: tên dự án, tác vụ hiện tại, 5 hành động gần nhất, thời gian, token
- [ ] Bấm vào agent mở panel timeline chi tiết
- [ ] Hiệu ứng nổi bật cho `waiting_approval` (đèn đỏ, nhấp nháy)
- [ ] Responsive cơ bản, dark mode

**Xong khi:** liếc 2 giây là biết agent nào cần mình.

### Phase 4: Thông báo và thống kê (tuần 4)
- [ ] Notification macOS + âm thanh khi cần duyệt hoặc agent xong việc (có nút bật/tắt)
- [ ] Trang thống kê: token theo agent, thời gian mỗi nhiệm vụ, biểu đồ theo ngày
- [ ] Ước tính chi phí (bảng giá theo model đặt trong file config)
- [ ] (Tuỳ chọn) Tóm tắt bằng AI: "agent này vừa làm gì" thành 1 câu

### Phase 5: Hoàn thiện và đóng gói (tuần 5)
- [ ] E2E test bằng Playwright với sự kiện giả lập
- [ ] Lệnh cài đặt một dòng: tự thêm hook vào cấu hình Claude Code (có sao lưu và hỏi xác nhận trước khi ghi)
- [ ] Chế độ demo (dữ liệu giả) để người khác xem thử mà không cần Claude Code
- [ ] README: GIF demo, vấn đề giải quyết, kiến trúc, quyết định kỹ thuật, hạn chế
- [ ] CI (GitHub Actions: lint, test, build), license, hướng dẫn đóng góp
- [ ] Đăng bài giới thiệu (Reddit, X, cộng đồng Claude Code) để lấy người dùng thật

## 9. Rủi ro và cách giảm

| Rủi ro | Cách xử lý |
|---|---|
| Định dạng hook/transcript đổi theo phiên bản Claude Code | Cô lập parser trong một module, có test với fixture, ghi phiên bản đã kiểm tra trong README |
| Hook làm chậm agent | Timeout ~1 giây, gửi bất đồng bộ, lỗi thì bỏ qua |
| Lộ dữ liệu nhạy cảm trong transcript | Chỉ lắng nghe localhost, cắt ngắn nội dung, không gửi ra ngoài, có tuỳ chọn ẩn đường dẫn |
| Sa đà vào đồ hoạ, không xong | Phase 1-2 phải chạy được với giao diện chữ trước, đồ hoạ làm sau |
| Nhiều session cùng thư mục bị nhầm | Định danh theo `session_id`, không theo thư mục |

## 10. Cách đo thành công (để ghi vào CV)

- Độ trễ từ sự kiện đến khi UI đổi: dưới 300ms
- Số sự kiện/giây xử lý được, mức dùng RAM của server
- Độ phủ test cho state machine
- Số sao GitHub, số người dùng thật, số issue/PR từ người khác

## 11. Các điểm cần xác nhận

| # | Câu hỏi | Trả lời |
|---|---|---|
| 1 | Công cụ đang dùng: Claude Code (CLI), hay Claude trong Cursor/ứng dụng khác? | |
| 2 | Phong cách giao diện: pixel art / phẳng hiện đại / nhìn từ trên xuống? | |
| 3 | Có mở mã nguồn trên GitHub công khai không? | |
| 4 | Số giờ/tuần và hạn chót (đợt xin việc/thực tập)? | |
| 5 | Mức quen React + TypeScript + Node? | |
| 6 | Các agent chạy trong terminal, VS Code, hay app Claude desktop? | |
| 7 | Phiên bản macOS và Claude Code đang dùng? | |
| 8 | Có muốn dashboard điều khiển agent (duyệt quyền, gửi prompt) về sau không? | |

## 12. Bước tiếp theo

Sau khi xác nhận các điểm trên, bắt đầu **Phase 0**: cấu hình hook thử để thu dữ liệu thật, từ đó chốt schema chính xác trước khi viết code.
