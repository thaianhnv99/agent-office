# Kế hoạch dự án v2: "Agent Office", văn phòng pixel giám sát coding agent

> v2 (14/11/2026): viết lại từ v1 sau review và các câu trả lời của chủ dự án. v1 vẫn giữ nguyên ở `agent-office-plan.md`.

## 0. Thay đổi chính so với v1

| Chủ đề | v1 | v2 | Lý do |
|---|---|---|---|
| Nguồn trạng thái | Hooks + transcript | Thêm `claude agents --json` để đối chiếu, statusline, channel | Hooks không báo khi bạn đã duyệt, đã từ chối hay nhấn Esc |
| Mô hình trạng thái | Bảng "sự kiện → trạng thái" | Lưu session dưới dạng dữ liệu, suy ra trạng thái theo thứ tự ưu tiên | Tool chạy song song, subagent, sự kiện đến sai thứ tự |
| Offline | Im lặng quá N phút | Dựa vào tiến trình còn sống hay không | Chờ duyệt lâu hoặc build dài vẫn là đang sống |
| Duyệt quyền | Không làm | Làm qua channel permission relay; thiết kế bảo mật ngay từ đầu | Câu trả lời số 6 |
| Chi phí | Ước tính $ theo bảng giá | % quota 5 giờ / 7 ngày lấy từ statusline | Dùng gói thuê bao |
| Giao diện | CSS/SVG, PixiJS nếu muốn | Pixel art bằng PixiJS, asset có license rõ ràng | Câu trả lời số 5 |
| Đa công cụ | "Để sau" | Milestone riêng cho Codex CLI và Cursor, qua adapter | Câu trả lời số 2 |
| Lộ trình | 5 tuần cố định | Theo milestone, mốc nào xong cũng dùng hằng ngày được | Không có hạn chót; ưu tiên dùng thật |
| Cài đặt | Script tự sửa `settings.json` | Plugin Claude Code | Cài và gỡ sạch, có thư mục dữ liệu riêng |
| Realtime | WebSocket | SSE cho luồng trạng thái, POST cho lệnh | Tự kết nối lại, đơn giản hơn |
| Thiết kế UX/UI | Chỉ có bảng hiển thị trạng thái | Mục 10 đầy đủ: luồng sử dụng, màn hình, wireframe, panel duyệt, ngôn ngữ trạng thái, thông báo, design system, kiểm thử UX | Bản trước còn thiếu |

## 1. Bối cảnh (đã xác nhận)

- Claude Code CLI 2.1.325 chạy trong terminal tích hợp của VS Code, trên macOS 26.5.2, Node 22.21. Thường có 2-3 session song song, có thể ở các thư mục khác nhau.
- Dùng gói thuê bao claude.ai, nên hiển thị % quota thay vì $.
- Thành thạo React, TypeScript, Node. Khoảng 8-10 giờ/tuần, không có hạn chót.
- Khi phải đánh đổi: **ưu tiên dùng hằng ngày hơn portfolio**. Dự án cũng dùng để xin việc.
- Một máy, một người dùng, chỉ chạy trên `127.0.0.1`.
- *Giả định cần xác nhận:* mở mã nguồn công khai trên GitHub, license MIT.

## 2. Mục tiêu và phạm vi

**Mục tiêu:** liếc 2 giây là biết agent nào cần mình, xử lý được ngay từ màn hình phụ, và biết còn bao nhiêu quota.

**Điểm khác biệt, theo thứ tự làm:**
1. **Trạng thái chính xác, overhead đo được.** Đây là nền móng. Công bố số đo, không chỉ khẳng định suông.
2. **Duyệt quyền từ dashboard**, song song với hộp thoại trong terminal.
3. **Văn phòng pixel art** trên màn hình phụ.
4. **Quota và lịch sử**: % quota, dự báo khi nào chạm giới hạn, nhiệm vụ nào tốn nhiều.
5. **Đa công cụ**: Codex CLI trước, sau đó Cursor. Điểm này phục vụ portfolio nhiều hơn dùng hằng ngày, vì bạn chỉ dùng Claude Code, nên làm cuối.

**Không làm trong giai đoạn này:**
- Gửi prompt từ dashboard. Channel làm được việc này, nên để vào backlog.
- Truy cập qua LAN hoặc điện thoại. Khi không ngồi ở máy, dùng Remote Control có sẵn của Claude Code.
- Nhiều máy, cloud, nhiều người dùng.

## 3. Kiến trúc

```
Claude Code session (terminal VS Code)
  ├─ hooks (async hoặc http) ───────────► POST /ingest/hook
  ├─ statusline wrapper ────────────────► POST /ingest/status    (quota, pid)
  ├─ MCP server của plugin (channel) ◄──► /channel               (duyệt quyền, liveness)
  └─ transcript JSONL ◄─────────────────── tailer (theo transcript_path)
claude agents --json ◄──────────────────── reconciler (poll thích ứng)
Codex CLI / Cursor ─────────────────────► adapter riêng (M5)
                               │
                 Server cục bộ (Node + TS, 127.0.0.1)
                   ├─ ingest + Zod → event log gốc (SQLite)
                   ├─ adapter → sự kiện chuẩn hoá → reducer (shared) → snapshot
                   ├─ approvals: nonce, TTL, nhật ký kiểm toán
                   └─ SSE /stream + POST /decisions
                               │
                 Dashboard: React + PixiJS, Notification API, badge trên tab
```

**Nguyên tắc:**
- **Mỗi nguồn một vai trò.**
  - Hooks: đẩy sự kiện nhanh.
  - `claude agents --json` và tiến trình còn sống: nguồn sự thật về trạng thái.
  - Transcript: chi tiết.
  - Statusline: quota.

  Nguồn nào cũng có thể mất hoặc đổi định dạng, nên hệ thống phải suy giảm có kiểm soát.
- **Không bao giờ làm chậm hay làm hỏng agent:**
  - Hook chạy kiểu `async` hoặc `http`.
  - Không in gì ra stdout. stdout của `SessionStart`/`UserPromptSubmit` bị đưa vào context của Claude.
  - Luôn thoát với exit 0. Exit 2 sẽ chặn hành động.
  - Luôn đặt `timeout`. Mặc định là 600 giây.
- **Lưu dữ liệu gốc, suy ra dữ liệu chuẩn hoá**, để xử lý lại được khi sửa parser.
- **Reducer thuần, tất định**, chạy được ở cả server lẫn trình duyệt (cho demo và test).
- **Bảo mật từ ngày đầu.** Chức năng duyệt quyền tương đương quyền chạy lệnh trên máy (xem mục 6).

## 4. Nguồn dữ liệu Claude Code (chốt lại ở M0)

| Nguồn | Dùng cho | Lưu ý |
|---|---|---|
| Hooks | Sự kiện tức thời: prompt, tool bắt đầu/kết thúc, yêu cầu quyền, dừng, lỗi API, compact, subagent | Không có hook nào khi bạn duyệt hoặc từ chối thủ công, hay khi nhấn Esc. `PermissionRequest` không có `tool_use_id`. Hook chạy cả trong subagent (có `agent_id`) |
| `claude agents --json` | Trạng thái chính thức: `status` (`busy`/`waiting`/`idle`), `waitingFor`, `pid`, `sessionId` | Research preview, chỉ hỗ trợ poll; có thể khởi động supervisor chạy nền; cần đo chi phí mỗi lần gọi |
| Transcript JSONL | Chi tiết tool, dấu ngắt `[Request interrupted by user…`, token, `ai-title`, `system/away_summary` | Định dạng đổi theo phiên bản; có bản ghi không có trong tài liệu; token phải dedupe theo `message.id` (trên máy hiện tại, cộng thẳng ra gấp khoảng 2,2 lần) |
| Statusline | `rate_limits.five_hour` / `seven_day` (`used_percentage`, `resets_at`), `process.pid`, `cost.total_cost_usd` | `rate_limits` chỉ có với gói Pro/Max/Ultra và chỉ sau response đầu tiên; người dùng thường đã có statusline riêng nên cần wrapper |
| MCP server của plugin (channel) | Duyệt quyền; tín hiệu sống (stdin đóng nghĩa là session đã kết thúc, kể cả khi crash) | Channel đang là research preview; plugin tự viết cần cờ `--dangerously-load-development-channels` |
| OpenTelemetry (tuỳ chọn) | `claude_code.tool_decision` (accept/reject), `claude_code.api_request` | Mặc định 5 giây mới xuất một lần; để sau |

Bảng ánh xạ sang sự kiện chuẩn hoá (phải xác nhận bằng dữ liệu thật ở M0):

| Hook / nguồn | → `type` |
|---|---|
| `SessionStart` (`source`: startup / resume / clear / compact / fork) | `session_start` |
| `UserPromptSubmit` | `prompt` |
| `PreToolUse` | `tool_start` (riêng `AskUserQuestion`, `ExitPlanMode` → `waiting_input`) |
| `PostToolUse` / `PostToolUseFailure` (`error`, `is_interrupt`) | `tool_end` |
| `PostToolBatch` | `tools_batch_end` |
| `PermissionRequest`, `Notification` loại `permission_prompt`, channel `permission_request` | `permission_request` |
| Verdict qua channel, hoặc suy ra từ: tool chạy tiếp, `Stop`, bị ngắt, `status: busy` | `permission_resolved` |
| `Notification` loại `idle_prompt`, `elicitation_dialog` | `waiting_input` |
| `Stop` (`background_tasks`, `last_assistant_message`) | `stop` |
| `StopFailure` (`error`: `rate_limit`, `overloaded`, `billing_error`…) | `stop_failure` |
| `PreCompact` / `PostCompact` | `compact_start` / `compact_end` |
| `SubagentStart` / `SubagentStop` (`agent_transcript_path`) | `subagent_start` / `subagent_stop` |
| `SessionEnd` (`reason`) | `session_end` |
| Transcript: dấu ngắt | `interrupted` |
| Transcript: `usage` (dedupe theo `message.id`) | `usage` |
| Transcript: `ai-title` | `title` |
| `claude agents --json`, statusline, channel | `official_status`, `quota`, `liveness` |

## 5. Mô hình dữ liệu

### 5.1 Sự kiện chuẩn hoá

```ts
type AgentKind = 'claude-code' | 'codex' | 'cursor';
type Source = 'hook' | 'transcript' | 'agents-json' | 'statusline' | 'channel' | 'simulator';

type NormalizedEvent = {
  id: string;          // tất định, vd `${source}:${sessionId}:${toolUseId}:${type}`, để chống trùng
  seq: number;         // thứ tự server nhận
  ts: number;          // thời điểm ở nguồn
  source: Source;
  agentKind: AgentKind;
  sessionId: string;
  agentId?: string;    // subagent
  promptId?: string;   // gom sự kiện theo nhiệm vụ
  type: EventType;     // xem bảng ở mục 4
  cwd?: string;
  tool?: { name: string; useId?: string; target?: string;
           outcome?: 'ok' | 'error' | 'interrupted' | 'denied' };
  permission?: { requestId: string; toolName: string; inputPreview: string };
  usage?: { messageId: string; model: string; input: number; output: number;
            cacheRead: number; cacheWrite5m: number; cacheWrite1h: number };
  quota?: { fiveHourPct?: number; fiveHourResetsAt?: number;
            sevenDayPct?: number; sevenDayResetsAt?: number };
  official?: { status: 'busy' | 'waiting' | 'idle'; waitingFor?: string };
  pid?: number;
  rawRef?: number;     // trỏ tới bản ghi gốc (đã cắt và redact)
};
```

### 5.2 Session và trạng thái hiển thị

```ts
type Session = {
  sessionId: string; agentKind: AgentKind; cwd: string; title?: string;
  pid?: number; alive: boolean;
  inFlight: Map<string, { tool: string; agentId?: string; since: number; target?: string }>;
  pendingPermission?: { requestId?: string; tool: string; since: number };
  waitingInput?: { kind: 'question' | 'plan' | 'elicitation' | 'idle'; since: number };
  lastStop?: { at: number; backgroundTasks: number };
  lastError?: { kind: string; at: number };
  compacting: boolean;
  official?: { status: 'busy' | 'waiting' | 'idle'; waitingFor?: string; at: number };
  acknowledgedAt?: number;
};
```

Trạng thái hiển thị được **suy ra**, không lưu. Thứ tự ưu tiên:

`needs_approval` > `needs_input` > `error` > `running` (Bash) > `editing` (Edit/Write) > `working` (tool khác hoặc đang nghĩ) > `compacting` > `done` (chưa xem) > `idle` > `offline`

**Quy tắc:**
- Tool không biết tên thì xếp vào `working` và hiện tên tool.
- Nếu `official` mới hơn và mâu thuẫn với suy luận thì `official` thắng. Ví dụ: đang tưởng agent chờ duyệt nhưng `status: busy` thì xoá `pendingPermission`.
- Gặp dấu ngắt trong transcript thì xoá `inFlight` và `pendingPermission`.
- Sự kiện đến sai thứ tự thì ghép theo `tool_use_id`. Bỏ qua `tool_start` đến sau `tool_end` của cùng id.
- `done` chuyển sang `idle` khi bạn đã xem (mở panel hoặc gửi prompt mới).
- Không có quy tắc offline theo thời gian; chỉ dựa vào tiến trình.
- Bàn gắn với tiến trình (`pid`) nếu biết pid. `/clear` đổi `session_id` nhưng vẫn giữ bàn. *(Cần xác nhận ở M0.)*

**Test:**
- reducer thuần + test dạng bảng;
- golden replay từ fixture của M0;
- property test: xáo trộn thứ tự sự kiện thì reducer không crash và vẫn hội tụ.

## 6. Duyệt quyền từ dashboard

**Cơ chế, theo thứ tự ưu tiên:**

1. **Channel permission relay** (chính thức, đang research preview).
   - MCP server của plugin khai báo `capabilities.experimental['claude/channel']` và `capabilities.experimental['claude/channel/permission']`.
   - Claude Code gửi `notifications/claude/channel/permission_request` với `request_id`, `tool_name`, `description`, `input_preview`.
   - Dashboard trả lời bằng `notifications/claude/channel/permission` với `request_id` và `behavior: 'allow' | 'deny'`.
   - **Hộp thoại trong terminal vẫn mở song song; bên nào trả lời trước thì thắng.**
   - Hạn chế: plugin tự viết phải bật bằng `--dangerously-load-development-channels plugin:agent-office@<marketplace>` ở mỗi session, kèm một hộp thoại xác nhận. Có thể dùng alias shell. Giao thức có thể còn thay đổi.
2. **Dự phòng: hook `PermissionRequest` kiểu `http`**, trả về `decision.behavior`. Chỉ dùng nếu M0 cho thấy hook trong lúc chờ không chặn hộp thoại terminal quá lâu (tài liệu chưa nói rõ điểm này).
3. **Khi không ngồi ở máy:** dùng Remote Control của Claude Code, có tuỳ chọn đẩy thông báo khi cần hành động, thay vì mở dashboard ra LAN.

**Mô hình đe doạ:** ai gửi được verdict thì người đó chạy được lệnh trên máy bạn.

**Biện pháp:**
- Chỉ bind `127.0.0.1`. Kiểm tra `Host` (chống DNS rebinding) và `Origin` cho mọi request, kể cả SSE.
- Đăng nhập dashboard bằng link có token dùng một lần, in ra terminal (giống Jupyter). Sau đó dùng cookie `HttpOnly`, `SameSite=Strict`. Mọi POST đều cần CSRF token.
- Plugin nói chuyện với server bằng token riêng, lưu trong `${CLAUDE_PLUGIN_DATA}` với quyền 0600.
- Verdict gắn với `request_id` và một nonce của server, chỉ dùng được một lần, hết hạn sau vài phút. Không có nút "duyệt tất cả".
- Chỉ allow/deny cho từng lần. Dashboard không ghi rule vĩnh viễn (`updatedPermissions`).
- Coi `input_preview` là dữ liệu không tin cậy: escape, không render markdown hay HTML, hiện đầy đủ lệnh.
- Lệnh nguy hiểm phải xác nhận lần hai: `rm -rf`, `git push --force`, `curl … | sh`, ghi file ra ngoài thư mục dự án.
- Ghi nhật ký kiểm toán cho mọi quyết định. Có công tắc tắt nhanh; mặc định tắt khi mới cài.
- Viết `docs/threat-model.md`. Đây cũng là tài liệu tốt để trình bày khi phỏng vấn.

## 7. Quota và lịch sử

- **Nguồn:** `rate_limits` trong JSON của statusline, gồm cửa sổ 5 giờ và 7 ngày, mỗi cửa sổ có `used_percentage` và `resets_at`.
- **Cách lấy:** wrapper `agent-office statusline -- <lệnh statusline cũ>`. Wrapper gửi dữ liệu bất đồng bộ (không chặn), rồi chuyển JSON cho lệnh cũ và in ra kết quả của lệnh đó.
- **Hiển thị:**
  - thanh quota 5 giờ và 7 ngày;
  - dự báo giờ chạm 100% theo tốc độ hiện tại;
  - phân bổ *ước tính* theo session hoặc dự án, dựa trên `cost.total_cost_usd` (chi phí quy đổi theo giá API).
- **Lịch sử:** nhiệm vụ theo `promptId` (thời gian, tool, token), xem theo ngày hoặc dự án; ảnh chụp quota theo thời gian; có chính sách giữ dữ liệu.
- **Không** gọi endpoint không chính thức bằng token đăng nhập của bạn.

## 8. Tech stack

| Phần | Lựa chọn | Lý do |
|---|---|---|
| Monorepo | pnpm workspaces (`corepack enable`, vì máy chưa có pnpm) | Gồm `shared`, `server`, `web`, `plugin`, `simulator` |
| Server | Node 22 + TypeScript + Hono | Nhẹ, có sẵn `streamSSE` |
| Realtime | SSE cho luồng trạng thái + POST cho lệnh duyệt | Tự kết nối lại kèm `Last-Event-ID` |
| Lưu trữ | SQLite qua `node:sqlite` hoặc `better-sqlite3` (chốt ở M0) | Event log gốc, snapshot, lịch sử |
| Validate | Zod | Payload từ hook, statusline, channel, transcript |
| Đọc transcript | `fs.watch` + đọc tăng dần theo `transcript_path` | Không cần glob cả thư mục (chokidar v4+ đã bỏ glob) |
| Channel | `@modelcontextprotocol/sdk` (stdio) | Cho permission relay |
| Web | React + Vite + TypeScript; Zustand nhận snapshot từ server | Dùng chung reducer, không chạy hai máy trạng thái |
| Đồ hoạ | PixiJS v8 + bản đồ Tiled + sprite sheet xuất từ Aseprite | Pixel art 60 fps, tách phần render khỏi logic |
| Test | Vitest (reducer, parser, golden replay, property test); Playwright (E2E với simulator) | |
| Thông báo | Notification API + badge trên tiêu đề tab | Không cần thư viện native |
| Khởi động | LaunchAgent, hoặc để `SessionStart` tự bật server | Dùng hằng ngày mà không phải nhớ bật server |

## 9. Cấu trúc repo

```
agent-office/
├─ .claude-plugin/marketplace.json   # biến repo thành marketplace plugin
├─ packages/
│  ├─ shared/      # Zod schema, NormalizedEvent, reducer, deriveStatus
│  ├─ server/      # ingest, adapters, reconciler, tailer, approvals, SSE, SQLite
│  ├─ web/         # React + PixiJS
│  ├─ plugin/      # .claude-plugin/plugin.json, hooks/hooks.json, MCP server (channel), statusline wrapper
│  └─ simulator/   # phát lại fixture, sinh kịch bản
├─ assets/         # sprite, tileset + CREDITS.md, license của từng gói
├─ fixtures/       # sự kiện thu được ở M0, đã scrub
├─ docs/           # adr/, threat-model.md, kiến trúc
└─ README.md
```

## 10. Thiết kế UX/UI

### 10.1 Người dùng, bối cảnh và nguyên tắc

- **Người dùng:** một developer chạy 2-4 session Claude Code trong terminal VS Code. Dashboard nằm trên màn hình phụ, hoặc thu nhỏ bên cạnh VS Code.
- **Cách dùng:**
  - Phần lớn thời gian: liếc bằng khoé mắt trong vài giây.
  - Thỉnh thoảng: thao tác ngắn, như duyệt quyền hoặc xem agent đang hỏi gì.
  - Hiếm khi: xem sâu vào timeline hoặc quota.
- **Nguyên tắc:**
  1. **Cái gì cần bạn thì phải nổi nhất.** Mọi thứ khác lùi xuống.
  2. **Yên lặng khi không có việc gì cần làm.** Không nhấp nháy, không âm thanh.
  3. **Không thể duyệt nhầm.** Duyệt phải là hành động có chủ ý, và lúc nào cũng thấy đầy đủ lệnh trước khi bấm.
  4. **Pixel art chỉ là lớp trình bày.** Thông tin quan trọng luôn có ở dạng chữ đọc được.
  5. **Trung thực về độ chắc chắn.** Trạng thái chỉ là suy luận thì phải hiện rõ là chưa chắc.

### 10.2 Các luồng chính

1. **Liếc nhanh.** Ba tín hiệu cho biết ngay có ai cần mình hay không: badge trên tab, bộ đếm "N cần bạn" trên header, và nhân vật giơ tay.
2. **Duyệt quyền.** Bấm vào thông báo → dashboard mở đúng panel duyệt của agent đó → đọc lệnh → Từ chối hoặc Cho phép → panel đóng, nhân vật quay lại làm việc.
   - Nếu đã trả lời trong terminal trước: panel tự đóng và hiện "Đã xử lý trong terminal".
   - Nếu yêu cầu đã hết hạn: các nút bị khoá và hiện "Yêu cầu đã hết hạn".
3. **Agent hỏi hoặc cần nhập liệu** (dashboard không trả lời hộ được). Panel hiện câu hỏi kèm nút "Mở terminal" nếu có extension VS Code. Nếu không có extension thì hiện tên dự án, thư mục và tty để bạn tự tìm.
4. **Xem agent đang làm gì.** Bấm vào nhân vật hoặc vào dòng trong danh sách để mở panel bên phải: tiêu đề, trạng thái, thời gian, timeline.
5. **Kiểm tra quota.** Header luôn hiện quota 5 giờ và 7 ngày. Bấm vào để mở trang Quota & Lịch sử (M4).
6. **Lần đầu sử dụng.** Hiện checklist kết nối: server, hook, statusline, channel. Mục nào chưa xong thì có sẵn lệnh để cài.
7. **Khi có sự cố.** Mất kết nối server, hook lỗi, hoặc phiên bản Claude Code chưa được kiểm tra sẽ hiện banner trên cùng (xem 10.9).

### 10.3 Các màn hình

| Màn hình | Nội dung | Milestone |
|---|---|---|
| Màn hình chính | Header (bộ đếm "cần bạn", quota, chuyển Văn phòng/Danh sách, cài đặt), vùng chính, panel bên, thanh trạng thái kết nối | M1 (danh sách), M3 (văn phòng) |
| Panel chi tiết agent | Tiêu đề, trạng thái, thời gian, timeline 20 hành động, token | M1 |
| Panel duyệt | Hiện đè lên panel chi tiết; mô tả ở 10.5 | M2 |
| Quota & Lịch sử | Biểu đồ quota, nhiệm vụ theo ngày và theo dự án | M4 |
| Cài đặt | Thông báo; duyệt quyền (bật/tắt, danh sách lệnh nguy hiểm); hiển thị (văn phòng/danh sách, tỉ lệ pixel, giảm chuyển động); dữ liệu (thời gian lưu, xoá) | M1 → M4 |
| Chẩn đoán | Trạng thái từng nguồn dữ liệu (hook, `claude agents --json`, transcript, statusline, channel), sự kiện gần nhất, phiên bản | M1 |

### 10.4 Wireframe lo-fi

Màn hình chính ở chế độ văn phòng, đang chọn một agent cần duyệt:

```
+--------------------------------------------------------------------------+
| Agent Office  (!) 2 cần bạn     5h [######----] 62%  7d [##--------] 23% |
|                              [Văn phòng | Danh sách]   [Cài đặt]         |
+-----------------------------------------------+--------------------------+
|                                               | api-server               |
|  +--------------+     +--------------+        | CẦN DUYỆT · chờ 2:14     |
|  | api-server   |     | web-app      |        | Tool: Bash               |
|  | (!) giơ tay  |     | gõ phím      |        | +----------------------+ |
|  | Cần duyệt    |     | Sửa App.tsx  |        | | npm run test --      | |
|  +--------------+     +--------------+        | |   --watch            | |
|                                               | +----------------------+ |
|  +--------------+     [ phòng máy chủ ]       | Thư mục: ~/api-server    |
|  | docs         |      infra: pnpm i          |                          |
|  | (?) bong bóng|                             | [Từ chối]   [Cho phép]   |
|  | Đang hỏi bạn |                             |                          |
|  +--------------+                             | Timeline >               |
+-----------------------------------------------+--------------------------+
| Đã kết nối · 4 session · Claude Code 2.1.325 · hook OK · quota OK        |
+--------------------------------------------------------------------------+
```

Chế độ danh sách. Đây là UI của M1, đồng thời là chế độ dự phòng khi cửa sổ nhỏ hoặc khi cần hỗ trợ truy cập. Nhóm nào trống thì ẩn đi:

```
CẦN BẠN (2)
  (!) api-server   Cần duyệt · Bash: npm run test -- --watch      2:14
  (?) docs         Đang hỏi: "Dùng bảng hay danh sách?"           0:40
ĐANG LÀM (2)
  (>) infra        Chạy lệnh: pnpm install                        1:05
  (>) web-app      Sửa src/App.tsx                                3:12
```

### 10.5 Panel duyệt

- **Nội dung hiển thị:**
  - tên dự án, thời gian đã chờ, tool;
  - **toàn bộ lệnh**, font mono, tự xuống dòng, không cắt bớt;
  - thư mục làm việc.
- **Với Edit/Write:** hiện đường dẫn file và phần `input_preview` mà channel gửi sang. Channel giới hạn khoảng 3.500 ký tự nên không có diff đầy đủ; thay vào đó có nút "Xem trong VS Code".
- **Hai nút:** Từ chối bên trái, Cho phép bên phải.
  - Không nút nào được focus sẵn.
  - Ở v1 không có phím tắt cho "Cho phép".
- **Lệnh nguy hiểm:**
  - viền đỏ và nhãn "Lệnh nguy hiểm";
  - phải bấm Cho phép thêm một lần để xác nhận.
- **Sau khi quyết định:** hiện toast "Đã cho phép · 14:02", đồng thời ghi vào timeline và nhật ký kiểm toán.
- **Nhiều yêu cầu cùng lúc:** xếp hàng theo thời gian đã chờ, kèm số thứ tự kiểu "1/3".

### 10.6 Ngôn ngữ trạng thái

Có bốn mức chú ý. Chỉ mức 1 được dùng chuyển động và âm thanh.

| Trạng thái | Mức | Màu | Ký hiệu | Chuyển động | Nhãn | Thông báo |
|---|---|---|---|---|---|---|
| `needs_approval` | 1 · Cần bạn | Đỏ | `!` | Nhấp nháy chậm (tắt khi bật giảm chuyển động) | "Cần duyệt: <tool>" | Có |
| `needs_input` | 1 · Cần bạn | Vàng hổ phách | `?` | Nhấp nháy chậm | "Đang hỏi bạn" | Có |
| `error` | 2 · Nên xem | Tím | `×` | Không | "Lỗi: <loại lỗi>" | Tuỳ chọn, một lần |
| `done` (chưa xem) | 2 · Nên xem | Xanh lá | `✓` | Không | "Xong · <thời gian>" | Tuỳ chọn |
| `running` / `editing` / `working` / `compacting` | 3 · Đang làm | Xanh dương, xám xanh | `▶` `✎` `…` `⟳` | Animation nhẹ trong văn phòng | "Đang chạy <lệnh>", "Sửa <file>"… | Không |
| `idle` | 4 · Nền | Xám | — | Không | "Rảnh" | Không |
| `offline` | 4 · Nền | Mờ 40% | — | Không | "Đã tắt" | Không |

**Quy tắc:**
- Không bao giờ chỉ dựa vào màu. Lúc nào cũng có ký hiệu và nhãn chữ đi kèm.
- Trạng thái suy luận nhưng chưa xác nhận được thì hiện viền đứt nét và nhãn bắt đầu bằng "Có thể…". Ví dụ: tưởng đang chờ duyệt nhưng `claude agents --json` chưa khớp.

### 10.7 Thông báo

- **Mặc định** chỉ thông báo cho mức 1. Muốn nhận cả mức 2 thì bật trong cài đặt.
- **Gộp:** nhiều agent cùng cần bạn thì gửi một thông báo duy nhất, ví dụ "2 agent cần bạn".
- **Không lặp:** mỗi yêu cầu chỉ thông báo một lần. Có tuỳ chọn nhắc lại sau 2 phút nếu vẫn chưa xử lý.
- **Bấm vào thông báo** thì focus dashboard và mở đúng panel.
- **Đang nhìn dashboard** thì không gửi thông báo, chỉ làm nổi trên màn hình.
- **Tab và favicon:** tiêu đề tab dạng "(2) Agent Office"; favicon đổi màu theo mức chú ý cao nhất.
- **Âm thanh:** tắt mặc định.
- **Cài thành PWA:** Notification API chỉ chạy khi tab còn mở. Nên cài dashboard thành PWA (Chrome cho phép cài từ `localhost`) để có:
  - một cửa sổ riêng trên màn hình phụ;
  - badge trên Dock qua Badging API.

  Chế độ Focus của macOS vẫn được tôn trọng.

### 10.8 Bố cục, kích thước và hệ thống thiết kế

- **Kích thước mục tiêu:** cửa sổ 1920×1080 hoặc nửa màn hình 960×1080. Nhỏ nhất 800×600; nhỏ hơn nữa thì tự chuyển sang chế độ danh sách.
- **Phóng pixel art theo bội số nguyên** (2×, 3×, 4×) với `image-rendering: pixelated` để hình luôn nét. Cảnh gốc có kích thước 480×270 (tỉ lệ 16:9).
- **Chữ render bằng DOM, không vẽ trong canvas.** Nhờ vậy chữ sắc nét, copy được và trình đọc màn hình đọc được. Font pixel chỉ dùng cho tiêu đề trang trí, license OFL hoặc CC0.
- **Số bàn:** bố cục dựng sẵn cho 1-6 bàn. Nhiều hơn thì thêm phòng, hoặc gợi ý chuyển sang chế độ danh sách.
- **Design tokens:**
  - màu trạng thái, với chữ đạt độ tương phản ≥ 4.5:1;
  - màu nền, khoảng cách;
  - font UI (dùng font hệ thống) và font mono cho lệnh;
  - bảng màu pixel art giới hạn khoảng 32 màu để các asset đồng bộ với nhau.
- **Chế độ sáng/tối:** UI theo `prefers-color-scheme`. Văn phòng có thể đổi ánh sáng ngày/đêm (tuỳ chọn, từ M3 trở đi).
- **Component:** `StatusBadge`, `AgentRow`, `DeskLabel` (DOM đặt đè lên canvas), `ApprovalPanel`, `Timeline`, `QuotaBar`, `Banner`, `Toast`.

### 10.9 Các trạng thái đặc biệt

| Tình huống | Cách hiển thị |
|---|---|
| Chưa có session nào | Văn phòng trống, dòng "Mở Claude Code trong terminal để bắt đầu", kèm checklist kết nối |
| Mất kết nối server | Banner đỏ "Mất kết nối, dữ liệu có thể đã cũ"; làm mờ vùng chính; tự kết nối lại |
| Chưa cấu hình statusline | Ô quota hiện "Chưa cấu hình" kèm link hướng dẫn |
| Channel chưa bật | Ẩn nút duyệt, thay bằng dòng "Duyệt trong terminal" |
| Phiên bản Claude Code chưa được kiểm tra | Banner vàng, ghi phiên bản gần nhất đã kiểm tra |
| Trạng thái chưa chắc chắn | Viền đứt nét, nhãn "Có thể…" |

### 10.10 Văn phòng pixel

- **Bố cục:**
  - Mỗi session một bàn.
  - Có "phòng máy chủ" (Bash), "giá sách" (đọc, tìm kiếm, web) và "góc cà phê" (xong việc).
  - Subagent là "thực tập sinh" ngồi cạnh bàn chính.
  - Header hiện thanh quota và số agent đang cần bạn.

| Trạng thái | Nhân vật | Tín hiệu kèm |
|---|---|---|
| `needs_approval` | Giơ tay, bong bóng "!" | Đèn đỏ nhấp nháy, thông báo, badge trên tab |
| `needs_input` | Bong bóng "?" | Đèn vàng, thông báo |
| `error` | Ôm đầu, màn hình đỏ | Loại lỗi (rate limit, overloaded…) |
| `running` | Ở phòng máy chủ | Lệnh đang chạy (đã cắt ngắn) |
| `editing` | Gõ phím nhanh | Tên file |
| `working` | Đọc sách hoặc gõ chậm | Tên tool |
| `compacting` | Xếp giấy tờ | |
| `done` | Uống cà phê | Đèn xanh |
| `idle` | Ngồi chờ | |
| `offline` | Bàn trống, đèn tắt | Tự ẩn sau một lúc |

- Bấm vào nhân vật để mở timeline. Nhân vật đang giơ tay thì mở panel duyệt.
- **Asset:** chỉ dùng gói CC0 hoặc tự vẽ bằng Aseprite.
  - Ghi nguồn và license của từng gói vào `assets/CREDITS.md`.
  - Không lấy asset từ dự án khác, kể cả dự án có code MIT, nếu license của asset không ghi rõ.
  - Không dùng nhân vật hay phong cách nhận diện của tác phẩm có bản quyền.
- **Truy cập và hiệu năng:**
  - không chỉ dựa vào màu sắc;
  - tôn trọng `prefers-reduced-motion`;
  - luôn có chế độ danh sách;
  - dừng render khi tab bị ẩn.

### 10.11 Quy trình thiết kế và kiểm thử UX

| Bước | Khi nào | Sản phẩm | Ước tính |
|---|---|---|---|
| D1 | M0 | Wireframe lo-fi (Excalidraw hoặc giấy) cho màn hình chính, chế độ danh sách, panel duyệt và luồng duyệt | 3-5 giờ |
| D2 | M1-M2 | Design tokens và component cho UI danh sách. Dùng simulator làm prototype thay cho mockup hi-fi | 5-8 giờ |
| D3 | Đầu M3 | Art direction: moodboard, bảng màu, kích thước tile. Vẽ mẫu 1 nhân vật, 1 bàn và 3 trạng thái; duyệt xong mới vẽ phần còn lại | 6-10 giờ |
| Kiểm thử | Cuối M1, M2, M3 | 5-second test; tự dùng 1 tuần và ghi nhật ký những chỗ gây phiền; kiểm tra độ tương phản, giả lập mù màu, điều khiển bằng bàn phím, chế độ giảm chuyển động | 2-3 giờ mỗi lần |

**5-second test:**
- Simulator chạy một kịch bản ngẫu nhiên.
- Người kiểm tra nhìn màn hình 2 giây rồi chỉ ra agent nào đang cần mình.
- Đạt khi đúng ít nhất 9 trên 10 lần.

## 11. Lộ trình theo milestone

Tổng ước tính khoảng 155-255 giờ (đã tính phần thiết kế UX/UI), tức khoảng 4-8 tháng nếu làm 8-10 giờ/tuần. Phát hành công khai v0.1 sau M3.

### M0: Khảo sát, spike rủi ro và wireframe (11-17 giờ)

- [ ] Viết một hook async chỉ ghi lại mọi sự kiện ra file. Chạy các kịch bản sau và so sánh ba nguồn hooks, `claude agents --json`, transcript:
  - duyệt quyền; từ chối quyền;
  - nhấn Esc lúc agent đang nghĩ; nhấn Esc lúc Bash đang chạy;
  - Bash chạy lâu sau khi duyệt;
  - nhiều tool song song; 2 subagent song song;
  - `AskUserQuestion`; plan mode;
  - `/compact`, `/clear`, `--resume`;
  - đóng tab terminal đột ngột;
  - 2 session trong cùng thư mục.
- [ ] Thử `claude agents --json` trong terminal VS Code:
  - session tương tác có xuất hiện không;
  - có những trường nào;
  - mỗi lần gọi tốn bao nhiêu thời gian/CPU;
  - lệnh có tự khởi động supervisor không.
- [ ] Spike channel: viết MCP server tối thiểu có permission relay.
  - Xác nhận "bên nào trả lời trước thì thắng" khi dùng terminal VS Code.
  - Đánh giá mức phiền của cờ dev và hộp thoại xác nhận.
- [ ] Spike hook `PermissionRequest` kiểu `http`: khi hook đang chờ thì hộp thoại terminal có hiện không.
- [ ] MCP server của plugin:
  - có sống đúng bằng vòng đời session không;
  - lấy `pid` cha và `session_id` bằng cách nào.
- [ ] Đo overhead mỗi tool call với ba kiểu hook: command đồng bộ (Node), `async`, `http`. Kiểm tra hook `http` hoạt động thế nào khi server tắt.
- [ ] Statusline wrapper: có nhận được `rate_limits` và `process.pid` không.
- [ ] Đọc 2-3 dự án tương tự: pixel-agents, pixel-agent-desk, agents-observe. Ghi lại cách họ hiển thị trạng thái và thông báo.
- [ ] Thiết kế D1: wireframe lo-fi cho màn hình chính, chế độ danh sách, panel duyệt và luồng duyệt (mục 10.11).

**Xong khi có:**
- fixture đã scrub;
- bảng ánh xạ ở mục 4 được xác nhận bằng dữ liệu thật;
- ADR-001 (nguồn dữ liệu), ADR-002 (cơ chế duyệt), ADR-003 (kiểu hook).

### M1: Lõi trạng thái + UI dạng danh sách, dùng hằng ngày được (30-43 giờ)

- [ ] Monorepo, TS strict, lint, format, CI (lint, test, build).
- [ ] Plugin: `hooks/hooks.json` gửi tới `POST /ingest/hook` kèm token. Cắt bớt payload (`tool_response`) trước khi gửi.
- [ ] Server Hono: ingest + Zod, event log trong SQLite, reducer từ `shared`, SSE có `Last-Event-ID`.
- [ ] Reconciler cho `claude agents --json`, poll thích ứng: chậm khi rảnh, nhanh khi có agent chờ duyệt. Kiểm tra liveness theo tiến trình.
- [ ] Tailer transcript theo `transcript_path`:
  - đọc tăng dần, lưu offset, xử lý dòng ghi dở;
  - trích dấu ngắt, `ai-title`, token đã dedupe.
- [ ] Simulator: phát lại fixture và sinh kịch bản. Dùng cho dev, test và demo.
- [ ] Web dạng danh sách theo wireframe ở 10.4, sắp theo mức chú ý ở 10.6. Timeline 20 hành động gần nhất. Thông báo theo 10.7.
- [ ] Thiết kế D2: design tokens và component (10.8), các trạng thái đặc biệt (10.9), checklist kết nối cho lần đầu dùng, trang chẩn đoán, PWA manifest.
- [ ] Statusline wrapper đưa % quota lên header.
- [ ] Tự khởi động server (LaunchAgent, hoặc để `SessionStart` bật nếu server chưa chạy).
- [ ] Bảo mật nền: token, kiểm tra `Origin`/`Host`, file quyền 0600, redact.

**Xong khi:**
- đã dùng thật 1 tuần;
- trạng thái khớp `claude agents --json` ít nhất 99% thời gian trên bộ kịch bản;
- overhead hook p95 dưới ngưỡng đã chốt ở M0;
- chế độ danh sách qua được 5-second test.

### M2: Duyệt quyền từ dashboard (15-25 giờ)

- [ ] MCP server channel trong plugin, kết nối tới server bằng token.
- [ ] Dịch vụ approvals: nonce, TTL, dùng một lần, audit log, công tắc bật/tắt.
- [ ] Panel duyệt theo 10.5:
  - hiện toàn bộ lệnh;
  - nút Cho phép không được focus sẵn;
  - lệnh nguy hiểm phải xác nhận lần hai;
  - xếp hàng khi có nhiều yêu cầu;
  - xử lý các trường hợp "đã xử lý trong terminal" và "hết hạn".
- [ ] Đồng bộ khi terminal trả lời trước: đóng yêu cầu trên dashboard, suy ra từ hook hoặc từ `status: busy`.
- [ ] Dùng phương án dự phòng theo ADR-002 nếu channel không dùng được.
- [ ] (Tuỳ chọn) Extension VS Code nhỏ: bấm vào bàn thì focus đúng terminal, bằng cách ghép `pid` với `Terminal.processId`. Cần cho các câu hỏi mà dashboard không trả lời hộ được.

**Xong khi:**
- duyệt và từ chối được với 3 session song song;
- qua được các test race với terminal;
- đã viết xong `docs/threat-model.md`, và mọi đường duyệt đều phải có token + nonce.

### M3: Văn phòng pixel art (40-70 giờ)

- [ ] Thiết kế D3 (10.11):
  - moodboard, bảng màu, kích thước tile, góc nhìn;
  - vẽ mẫu 1 nhân vật, 1 bàn và 3 trạng thái, duyệt xong mới vẽ phần còn lại;
  - chốt nguồn asset và license.
- [ ] PixiJS v8 + bản đồ Tiled; sprite sheet xuất từ Aseprite; UI React đặt đè lên canvas.
- [ ] Nhân vật và animation cho từng trạng thái; subagent là "thực tập sinh" ngồi cạnh.
- [ ] Mỗi bàn hiển thị: dự án, `ai-title`, hành động hiện tại, 5 hành động gần nhất, thời gian, token.
- [ ] Bấm nhân vật để mở timeline; nhân vật giơ tay thì mở panel duyệt.
- [ ] Hỗ trợ `prefers-reduced-motion`; không chỉ dựa vào màu; có chế độ danh sách; dừng render khi tab ẩn.
- [ ] Demo tĩnh trên GitHub Pages, chạy simulator ngay trong trình duyệt.

**Xong khi:**
- chế độ văn phòng qua được 5-second test (đúng ít nhất 9/10 lần);
- đạt 60 fps với tối đa 10 agent;
- demo tĩnh chạy được.

**Sau M3: phát hành v0.1.**
- README có GIF, sơ đồ, ADR, số liệu đo (overhead, độ chính xác), hạn chế, các phiên bản đã kiểm tra.
- Marketplace plugin trên GitHub.
- LICENSE, CREDITS, CONTRIBUTING.

### M4: Quota và lịch sử (15-25 giờ)

- [ ] Ảnh chụp quota theo thời gian, dự báo giờ chạm giới hạn, phân bổ ước tính theo session/dự án.
- [ ] Lịch sử nhiệm vụ theo `promptId`; biểu đồ theo ngày và dự án; chính sách giữ dữ liệu; xuất dữ liệu.

**Xong khi** trả lời được hai câu: "hôm nay dự án nào tốn quota nhất" và "bao giờ hết quota 5 giờ".

### M5: Đa công cụ (20-35 giờ)

- [ ] Interface `AgentAdapter` (kind, capabilities, start/stop) sinh ra `NormalizedEvent`. UI ẩn những tính năng mà adapter không hỗ trợ.
- [ ] Codex CLI: hooks (`~/.codex/hooks.json`) và rollout JSONL trong `~/.codex/sessions/`. Cần xác nhận tên sự kiện và cờ bật.
- [ ] Cursor: `~/.cursor/hooks.json` (`beforeShellExecution`, `afterFileEdit`, `stop`…).
  - Diễn đàn Cursor có báo hook không chạy hoặc không chặn được, nên cần thử kỹ.
  - Xem thêm trang "third-party hooks".

**Xong khi** cùng một văn phòng hiển thị đúng 1 session Claude Code và 1 session Codex.

### Backlog

- Gửi prompt từ dashboard qua channel.
- Tóm tắt nhiệm vụ: thử dùng `away_summary` có sẵn trước khi tính đến gọi LLM.
- Âm thanh, theme.
- Nhảy tới đúng terminal, nếu chưa làm ở M2.
- OpenTelemetry.

## 12. Rủi ro và cách giảm

| Rủi ro | Cách giảm |
|---|---|
| Định dạng hook, transcript, agent view, channel đổi theo phiên bản (trên máy đã thấy 2 phiên bản chỉ trong vài ngày) | Cô lập trong adapter; golden test với fixture; gặp dạng lạ thì ghi log chứ không crash; README ghi các phiên bản đã kiểm tra |
| Channel còn là research preview và cần cờ dev | Tách chức năng duyệt khỏi phần giám sát; có phương án dự phòng theo ADR-002; có công tắc tắt |
| Chức năng duyệt bị lạm dụng (CSRF, DNS rebinding, tiến trình lạ) | Các biện pháp ở mục 6, threat model, test bảo mật trong CI |
| Hook làm chậm hoặc làm hỏng agent | Dùng `async`/`http`, không in stdout, exit 0, đặt `timeout`; benchmark overhead |
| Poll `claude agents --json` tốn CPU | Poll thích ứng; đo ở M0; chuyển sang liveness của MCP server nếu ổn định |
| Số liệu token và quota sai | Dedupe theo `message.id`; ưu tiên số do Claude Code tự tính; ghi rõ là "ước tính" |
| Sa đà vào pixel art | M1 đã có UI danh sách dùng được ngay; vẽ theo vòng (placeholder → v1 → chỉnh sửa); giới hạn số animation |
| Asset vi phạm license | Chỉ dùng CC0 hoặc tự vẽ; có `assets/CREDITS.md`; không lấy asset của dự án khác |
| Trùng với agent view và các dự án có sẵn | Bám vào 5 điểm khác biệt ở mục 2; công bố số đo |
| Lộ dữ liệu nhạy cảm | Cắt payload, redact, file quyền 0600, chính sách giữ dữ liệu; fixture tổng hợp và kiểm tra trong CI |

## 13. Đo thành công

- Overhead hook trên mỗi tool call, p50/p95. Đặt mục tiêu sau khi đo ở M0.
- Độ chính xác trạng thái so với `claude agents --json`: ít nhất 99% thời gian trên bộ kịch bản.
- Từ lúc agent cần duyệt đến khi có thông báo: dưới 1 giây.
- Thời gian trung bình từ khi có thông báo đến khi đã duyệt. Đây là chỉ số dùng hằng ngày.
- 5-second test: nhìn 2 giây là chỉ đúng agent đang cần mình, ít nhất 9/10 lần (10.11).
- RAM/CPU của server lúc rảnh; FPS của văn phòng.
- Số kịch bản golden; độ phủ test của reducer.
- Thứ yếu: số sao GitHub, issue/PR từ người khác.

**Điểm để kể khi phỏng vấn:**
- hợp nhất nhiều nguồn sự kiện không tin cậy (event sourcing + đối chiếu);
- overhead có số đo cụ thể;
- threat model cho chức năng duyệt quyền chạy cục bộ;
- render pixel art hiệu năng cao;
- kiến trúc adapter.

## 14. Câu hỏi còn mở

1. Bạn có hay dùng subagent hoặc background session (`/bg`, `claude agents`) không?
2. Mở mã nguồn công khai từ M1 hay đợi đến v0.1?
3. Nhân vật có đi lại được không (cần tìm đường), hay chỉ có animation tại chỗ? Hai lựa chọn chênh nhau khoảng 10-20 giờ.
4. Phong cách pixel:
   - tile 16×16 hay 32×32;
   - nhìn từ trên xuống hay góc 3/4;
   - tự vẽ hay dùng gói CC0.
5. Ngôn ngữ giao diện: tiếng Việt, tiếng Anh, hay cả hai? Nếu chọn cả hai thì phải làm i18n ngay từ đầu.
6. Dùng dashboard trong một tab trình duyệt, hay cài thành PWA chạy trong cửa sổ riêng?

## 15. Bước tiếp theo

Bắt đầu M0 bằng 3 thí nghiệm rủi ro nhất:
1. `claude agents --json` trong terminal VS Code.
2. Channel permission relay.
3. Đo overhead của hook.

## Tài liệu tham khảo

- Claude Code: [Hooks](https://code.claude.com/docs/en/hooks) · [Agent view](https://code.claude.com/docs/en/agent-view) · [Channels](https://code.claude.com/docs/en/channels) · [Channels reference](https://code.claude.com/docs/en/channels-reference) · [Remote Control](https://code.claude.com/docs/en/remote-control) · [Plugins reference](https://code.claude.com/docs/en/plugins-reference) · [Statusline](https://code.claude.com/docs/en/statusline) · [Monitoring (OTel)](https://code.claude.com/docs/en/monitoring-usage)
- Codex: [Hooks](https://developers.openai.com/codex/hooks) · [Rollout files (bên thứ ba)](https://codex.danielvaughan.com/2026/04/29/codex-cli-rollout-files-session-recording-replay-audit-trails/)
- Cursor: [Hooks](https://cursor.com/docs/agent/hooks) · [Third-party hooks](https://cursor.com/docs/agent/third-party-hooks) · [Báo lỗi trên diễn đàn](https://forum.cursor.com/t/hook-ask-output-not-stopping-agent/149002)
- Dự án tương tự: [pixel-agents](https://awesome.ecosyste.ms/projects/github.com%2Fpablodelucca%2Fpixel-agents) · [pixel-agent-desk](https://github.com/Mgpixelart/pixel-agent-desk) · [PixelOffice](https://github.com/KalebKE/PixelOffice) · [claude-office](https://cdn.jsdelivr.net/gh/paulrobello/claude-office@main/README.md) · [agents-observe](https://awesome.ecosyste.ms/projects/github.com%2Fsimple10%2Fagents-observe) · [ccmon](https://github.com/appaquet/ccmon)
