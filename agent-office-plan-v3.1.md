# Kế hoạch dự án v3.1: "Agent Office", văn phòng pixel giám sát coding agent

> v3.1 (16/11/2026): thêm vòng đời server và gỡ LaunchAgent ở mọi giai đoạn, theo `agent-office-server-lifecycle.md` và `agent-office-v3-patch-lifecycle.md`. Các thay đổi đã làm và chỗ chưa chắc ở cuối file. v3 giữ nguyên ở `agent-office-plan-v3.md`.
>
> v3 (15/11/2026): cập nhật từ v2 theo `agent-office-plan-review.md`, `agent-office-dev-isolation.md` và một số phát hiện bổ sung khi đối chiếu. v2 vẫn giữ nguyên ở `agent-office-plan-v2.md`, v1 ở `agent-office-plan.md`.

## 0. Lịch sử thay đổi

### 0.1 Thay đổi so với v2

| Chủ đề | v2 | v3 | Lý do |
|---|---|---|---|
| Cổng quyết định M0 | Spike không giới hạn thời gian | Time-box từng spike, phương án khi không đạt, buổi chốt go/no-go ghi vào ADR-008 | Review 2.1 |
| Vệ sinh dữ liệu | Chỉ ghi "fixture đã scrub" | Dữ liệu thô trong `.dev-raw/` (ngoài git); script scrub có test; quét secret ở pre-commit và CI; làm xong trước commit đầu tiên | Review 2.2 |
| Tương thích phiên bản | Golden test với fixture | `compat.json`; script `compat-run` chạy trên máy; CI hằng tuần theo dõi phiên bản mới; phát hiện drift khi đang chạy | Review 2.3, có điều chỉnh: CI không chạy được kịch bản thật |
| Banner phiên bản | Bật khi phiên bản chưa được kiểm tra | Chỉ bật khi phát hiện định dạng lạ; phiên bản chưa kiểm tra chỉ ghi ở thanh trạng thái | Claude Code cập nhật vài ngày một lần, banner bật thường trực sẽ thành nhiễu |
| Kiểm thử | Có công cụ trong stack nhưng không có task | E2E + axe ở M1 và M3, test bảo mật tự động ở M2, soak test ở M3.5 | Review 2.5 |
| Phát hành | Vài đầu mục sau M3 | Milestone M3.5: semver, changelog, migration, rollback, gỡ cài đặt, soak test, hồ sơ mã nguồn mở, tài liệu người dùng | Review 2.4, 3.3, 3.5, 4.1 |
| Sau phát hành | Không có | Ra mắt, bài viết case study, triage issue, chính sách hỗ trợ phiên bản | Review 3.6 |
| Vận hành server nền | LaunchAgent hoặc `SessionStart` | Chỉ `SessionStart`; log xoay vòng, giới hạn DB, cổng và file config, `/health`; hook bật lại server khi crash (khoá nguyên tử, giới hạn tần suất); phát hiện sleep/wake (mục 5.4) | Review 3.1; vòng đời server; không dùng LaunchAgent |
| Chuỗi cung ứng | Không có | Lockfile, Renovate/Dependabot, audit, license phụ thuộc, 2FA, bundle plugin | Review 3.2 |
| Quản lý dự án | Không có | Board, review hằng tuần, quy tắc cắt phạm vi, Định nghĩa hoàn thành (mục 11.1) | Review 3.4 |
| ADR | ADR-001 đến 003 | Thêm ADR-004 đến ADR-008 | Review 3.7; thêm ADR-007 (đóng gói) và ADR-008 (kết luận M0) |
| Ước tính | Ghi 155-255 giờ, nhưng cộng các milestone chỉ ra 131-215 | 195-320 giờ, có bảng cộng theo milestone (mục 11.2) | Review 4.1; dev-isolation |
| Câu hỏi còn mở | 6 câu, không có hạn chốt, câu về mã nguồn mở bị lặp | 17 câu có hạn chốt và ảnh hưởng; câu 1, 2 và 10 đã chốt | Review 4.2, 4.3; dev-isolation §10 |
| Mô hình dữ liệu | `id` chứa `source`, dùng `Map`, chỉ một `pendingPermission`, chưa định nghĩa `EventType` | Khoá trong nguồn + `correlationKey` giữa các nguồn; `EventType` đầy đủ; `Record`; hàng đợi `pendingPermissions`; mục 5.3 phục hồi khi khởi động lại | Phát hiện khi đối chiếu chuẩn spec |
| Đo độ chính xác | So với `claude agents --json` | So với nhãn ghi tay khi chạy kịch bản | `claude agents --json` cũng là đầu vào của reducer, phép đo cũ tự so với chính nó |
| Đóng gói plugin | Chưa đề cập | Spike S8 + ADR-007 | `${CLAUDE_PLUGIN_ROOT}` đổi đường dẫn mỗi khi plugin cập nhật |
| Cô lập khi phát triển | Chưa đề cập | Mục 9.2: không đụng hệ thống khi dev; 4 mức cô lập; không hook toàn cục; dữ liệu dev, dữ liệu thô và cache đều nằm trong repo; ranh giới tin cậy ghi vào threat model | dev-isolation §1-5; máy còn dùng cho nhiều dự án khác |
| Khởi động server | LaunchAgent với `KeepAlive` ở M1 | Khi dev: `pnpm dev:up`. Bản phát hành: chỉ hook `SessionStart` tự bật server (cộng bật lười); `agent-office start`/`stop` bằng tay; **không có LaunchAgent** | Chốt 16/11/2026 |
| pnpm, Node và cache | `corepack enable` | `corepack pnpm` (không `enable`); ghim pnpm và Node; `COREPACK_HOME`, store của pnpm và trình duyệt Playwright đặt trong `.cache/` | `corepack enable` sửa thư mục cài Node; máy đã có store pnpm và trình duyệt Playwright dùng chung với dự án khác |
| Quét secret | gitleaks ở pre-commit | Công cụ quét cài qua pnpm ở pre-commit (vd secretlint), gitleaks ở CI | Máy chưa có gitleaks; cài qua Homebrew là sửa hệ thống |
| Bật hook cho dự án thật | Chưa nói rõ | 2 bước, mỗi bước hoàn tác bằng một lệnh: từng dự án → plugin phạm vi người dùng | dev-isolation §6 |
| Hàng rào an toàn | Không có | Test "không ghi ngoài repo", test tailer chỉ đọc, công tắc tắt nhanh mọi hook | dev-isolation §8 |
| Mã nguồn mở | Chưa chốt | Công khai repo: giữ hồ sơ mã nguồn mở, ra mắt và triage; quét secret trên toàn bộ lịch sử git trước lần push công khai đầu tiên | Câu hỏi 1, chốt ngày 15/11 |
| Subagent, background session | Chưa rõ | Không dùng: S1 chỉ giữ một kịch bản subagent để kiểm tra độ bền; hình "thực tập sinh" chuyển vào backlog | Câu hỏi 2, chốt ngày 15/11 |
| Vị trí sandbox | Chưa chốt | `~/agent-office-sandbox/` | Câu hỏi 10, chốt ngày 15/11 |
| Vòng đời server | Tự tắt sau một khoảng thời gian không còn session (đề xuất 30 phút); bật lại khi crash ở hook kế tiếp; chưa xử lý sleep/wake | Quy tắc "session sống" (SessionEnd + kiểm tra tiến trình), ân hạn cấu hình được, phát hiện sleep/wake bằng chênh lệch đồng hồ, bật lười có khoá nguyên tử và giới hạn tần suất, cờ tắt có chủ đích, kịch bản kiểm thử sleep/wake | `agent-office-server-lifecycle.md`; chủ dự án hay sleep máy |
| LaunchAgent | Tuỳ chọn opt-in ở M3.5, gọi qua shim | **Không dùng ở tất cả giai đoạn**; bỏ bước 3 của lộ trình bật hook; shim ổn định chỉ cho hook `SessionStart` | Chốt 16/11/2026: không đụng hệ thống, hay sleep nên dịch vụ nền gần như không có lợi, giảm việc ở M3.5 |

### 0.2 Thay đổi so với v1 (lưu lại để tham khảo)

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
- **Mở mã nguồn công khai** trên GitHub (chốt ngày 15/11/2026). License và thời điểm công khai: câu hỏi 16 và 17.
- Không dùng subagent hay background session (chốt ngày 15/11/2026).

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
- **Phát triển không đụng tới hệ thống.** Máy còn dùng cho nhiều dự án khác, nên khi phát triển: không đặt hook vào cấu hình toàn cục, không dùng LaunchAgent ở mọi giai đoạn, mọi dữ liệu dev nằm trong repo và xoá được bằng một lệnh (mục 9.2). Một hook lỗi (in ra stdout, exit 2) mà đặt toàn cục sẽ ảnh hưởng mọi session của mọi dự án.
- **Dữ liệu thô không bao giờ vào git.** Chỉ commit fixture đã scrub hoặc fixture tổng hợp (xem M0).

## 4. Nguồn dữ liệu Claude Code (chốt lại ở M0)

| Nguồn | Dùng cho | Lưu ý |
|---|---|---|
| Hooks | Sự kiện tức thời: prompt, tool bắt đầu/kết thúc, yêu cầu quyền, dừng, lỗi API, compact, subagent | Không có hook nào khi bạn duyệt hoặc từ chối thủ công, hay khi nhấn Esc. `PermissionRequest` không có `tool_use_id`. Hook chạy cả trong subagent (có `agent_id`) |
| `claude agents --json` | Trạng thái chính thức: `status` (`busy`/`waiting`/`idle`), `waitingFor`, `pid`, `sessionId` | Research preview, chỉ hỗ trợ poll; có thể khởi động supervisor chạy nền; cần đo chi phí mỗi lần gọi |
| Transcript JSONL | Chi tiết tool, dấu ngắt `[Request interrupted by user…`, token, `ai-title`, `system/away_summary` | Định dạng đổi theo phiên bản; có bản ghi không có trong tài liệu; token phải dedupe theo `message.id` (trên máy hiện tại, cộng thẳng ra gấp khoảng 2,2 lần) |
| Statusline | `rate_limits.five_hour` / `seven_day` (`used_percentage`, `resets_at`), `process.pid`, `cost.total_cost_usd` | `rate_limits` chỉ có với gói Pro/Max/Ultra và chỉ sau response đầu tiên; người dùng thường đã có statusline riêng nên cần wrapper |
| MCP server của plugin (channel) | Duyệt quyền; tín hiệu sống (stdin đóng nghĩa là session đã kết thúc, kể cả khi crash) | Channel đang là research preview; plugin tự viết cần cờ `--dangerously-load-development-channels` |
| OpenTelemetry (tuỳ chọn) | `claude_code.tool_decision` (accept/reject), `claude_code.api_request` | Mặc định 5 giây mới xuất một lần; để sau |

Bảng ánh xạ sang sự kiện chuẩn hoá (đã đối chiếu bằng dữ liệu thật ở S1: đúng phần lớn, cần sửa 5 dòng, xem `docs/spikes/s1-events.md`; ADR-001 chốt bảng đã sửa):

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

type EventType =
  | 'session_start' | 'session_end' | 'prompt'
  | 'tool_start' | 'tool_end' | 'tools_batch_end'
  | 'permission_request' | 'permission_resolved' | 'waiting_input'
  | 'stop' | 'stop_failure' | 'interrupted'
  | 'compact_start' | 'compact_end' | 'subagent_start' | 'subagent_stop'
  | 'usage' | 'title' | 'official_status' | 'quota' | 'liveness';

type NormalizedEvent = {
  id: string;              // khoá chống trùng trong cùng một nguồn (quy tắc bên dưới)
  correlationKey?: string; // khoá ghép cùng một sự việc giữa các nguồn
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

**Quy tắc khoá:**
- `id` chỉ dùng để chống trùng **trong một nguồn**, ví dụ khi đọc lại transcript sau lúc khởi động lại. Lấy từ:
  - transcript: `uuid` của dòng;
  - hook về tool: `tool_use_id` + type;
  - hook prompt: `prompt_id`;
  - channel: `request_id`;
  - nguồn không có khoá tự nhiên: hash nội dung + `ts`.
- `correlationKey` dùng để **ghép giữa các nguồn**: `tool_use_id` cho tool, `message.id` cho token, `request_id` cho yêu cầu duyệt. Reducer chỉ áp dụng mỗi sự việc một lần; nguồn đến sau chỉ bổ sung thông tin.
- Cách ghép yêu cầu duyệt từ hook `PermissionRequest` (không có `tool_use_id`) với channel: cần xác nhận ở M0.

### 5.2 Session và trạng thái hiển thị

```ts
type Session = {
  sessionId: string; agentKind: AgentKind; cwd: string; title?: string;
  pid?: number; alive: boolean;
  inFlight: Record<string, { tool: string; agentId?: string; since: number; target?: string }>; // Record để serialize JSON (SSE, demo)
  pendingPermissions: Array<{ requestId?: string; tool: string; agentId?: string; since: number }>; // hàng đợi, có thể nhiều yêu cầu cùng lúc
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
- Nếu `official` mới hơn và mâu thuẫn với suy luận thì `official` thắng. Ví dụ: đang tưởng agent chờ duyệt nhưng `status: busy` thì xoá yêu cầu tương ứng trong `pendingPermissions`.
- Gặp dấu ngắt trong transcript thì xoá `inFlight` và `pendingPermissions`.
- Sự kiện đến sai thứ tự thì ghép theo `tool_use_id`. Bỏ qua `tool_start` đến sau `tool_end` của cùng id.
- `done` chuyển sang `idle` khi bạn đã xem (mở panel hoặc gửi prompt mới).
- Không có quy tắc offline theo thời gian; chỉ dựa vào tiến trình.
- Bàn gắn với tiến trình (`pid`) nếu biết pid. `/clear` đổi `session_id` nhưng vẫn giữ bàn. *(Cần xác nhận ở M0.)*

**Test:**
- reducer thuần + test dạng bảng;
- golden replay từ fixture của M0;
- property test: xáo trộn thứ tự sự kiện thì reducer không crash và vẫn hội tụ.

### 5.3 Khởi động lại và phục hồi

Khi server khởi động (sau crash, sau khi cập nhật, hoặc khi máy khởi động lại):
1. Nạp snapshot và offset transcript đã lưu trong SQLite.
2. Lấy danh sách session đang sống từ `claude agents --json`, cộng thêm quét tiến trình nếu chọn ở câu hỏi 5.
3. Với mỗi session còn sống: đọc tiếp transcript từ offset đã lưu để dựng lại tool đang chạy, dấu ngắt, tiêu đề và token.
4. Sự kiện hook phát ra trong lúc server tắt sẽ bị mất. Các session đó hiện trạng thái "chưa chắc chắn" (viền đứt nét, mục 10.6) cho tới khi có sự kiện hook mới hoặc trạng thái chính thức.
5. Yêu cầu duyệt phát ra trong lúc server tắt chỉ duyệt được trong terminal. S3 cho thấy Claude Code không đặt thời hạn chờ channel và terminal vẫn duyệt bình thường. Đề xuất: MCP server giữ yêu cầu đang chờ trong bộ nhớ và gửi lại khi kết nối lại; dashboard xoá yêu cầu khi hook cho biết đã xử lý (verdict muộn bị bỏ nên an toàn). Chốt ở ADR-002.
6. Session đã kết thúc trong lúc server tắt: chuyển sang offline dựa trên tiến trình.

> Máy sleep rồi wake **không** khởi động lại tiến trình server: tiến trình chỉ bị tạm dừng rồi chạy tiếp. Trường hợp đó xử lý theo mục 5.4, không theo 5.3.

### 5.4 Sleep và wake

Người dùng hay sleep máy. Khi sleep, tiến trình `claude` và server chỉ bị tạm dừng, không bị tắt. Khi wake, cả hai chạy tiếp, nhưng đồng hồ thật đã nhảy về phía trước (có thể nhiều giờ) và kết nối đã đứt.

| Vấn đề | Xử lý |
|---|---|
| Đồng hồ nhảy làm mọi bộ đếm "im lặng quá N phút" kích hoạt sai, thậm chí tắt server nhầm hoặc đánh dấu mọi agent là offline | Phát hiện nhảy thời gian: so chênh lệch đồng hồ thật (`Date.now`) với đồng hồ đơn điệu (`process.hrtime`/`performance.now`) giữa hai lần kiểm tra định kỳ; nếu đồng hồ thật nhảy vượt hẳn đồng hồ đơn điệu thì coi là vừa wake. **[chưa kiểm chứng]** đồng hồ đơn điệu có dừng khi ngủ trên macOS không (spike S9) |
| Sau khi phát hiện wake | Đặt lại bộ đếm ân hạn và bộ đếm offline; **không** kết luận gì trong khoảng thời gian bị nhảy; đối chiếu lại sau một thời gian ngắn |
| SSE đứt khi máy ngủ | Dashboard tự kết nối lại kèm `Last-Event-ID`, hiện "đang kết nối lại" (mục 10.9), không hiển thị dữ liệu cũ như còn mới |
| Trạng thái session có thể đã đổi trong lúc ngủ | Đối chiếu lại bằng `claude agents --json` (nếu có) và đọc tiếp transcript từ offset đã lưu; session chưa xác nhận lại hiện "chưa chắc chắn" (viền đứt nét, mục 10.6) |
| Tailer có thể bỏ lỡ sự kiện file lúc ngủ | Sau wake, quét lại offset của các file transcript đang theo dõi |
| Server sống nhiều ngày qua nhiều lần sleep | Soak test có chu kỳ sleep/wake (M3.5) |

**Quy tắc cứng:** quyết định tắt server và quyết định "agent offline" **không bao giờ** chỉ dựa vào việc im lặng theo đồng hồ thật. Phải dựa vào session còn sống thật (mục 9.2).

## 6. Duyệt quyền từ dashboard

**Cơ chế, theo thứ tự ưu tiên:**

1. **Channel permission relay** (chính thức, đang research preview).
   - MCP server của plugin khai báo `capabilities.experimental['claude/channel']` và `capabilities.experimental['claude/channel/permission']`.
   - Claude Code gửi `notifications/claude/channel/permission_request` với `request_id`, `tool_name`, `description`, `input_preview`.
   - Dashboard trả lời bằng `notifications/claude/channel/permission` với `request_id` và `behavior: 'allow' | 'deny'`.
   - **Hộp thoại trong terminal vẫn mở song song; bên nào trả lời trước thì thắng.**
   - Hạn chế: plugin tự viết phải bật bằng `--dangerously-load-development-channels plugin:agent-office@<marketplace>` ở mỗi session, kèm một hộp thoại xác nhận. Có thể dùng alias shell. Giao thức có thể còn thay đổi.
   - Kết quả S3 (`docs/spikes/s3-channel.md`):
     - relay chạy được với cả `allow` lẫn `deny`;
     - "bên trả lời trước thắng" đúng trong terminal VS Code; verdict đến muộn bị bỏ âm thầm và channel không được báo;
     - câu hỏi có lựa chọn và duyệt kế hoạch **không** được relay;
     - theo tài liệu, với Pro/Max cờ dev là cách duy nhất, kể cả khi plugin nằm ở marketplace riêng; Team/Enterprise cần admin bật `channelsEnabled`.
2. **Dự phòng: hook `PermissionRequest` kiểu `http`**, trả về `decision.behavior`. Chỉ dùng nếu M0 cho thấy hook trong lúc chờ không chặn hộp thoại terminal quá lâu (tài liệu chưa nói rõ điểm này).
   - Kết quả S4 (`docs/spikes/s4-permission-hook.md`):
     - hộp thoại terminal hiện ngay trong lúc hook chờ, và bên trả lời trước thắng;
     - hook trả lời được cả câu hỏi có lựa chọn và duyệt kế hoạch, điều channel không làm được;
     - không cần cờ dev.
   - **Đề xuất (chờ ADR-002):** đưa hook lên làm cơ chế chính và đưa channel vào backlog.
3. **Khi không ngồi ở máy:** dùng Remote Control của Claude Code, có tuỳ chọn đẩy thông báo khi cần hành động, thay vì mở dashboard ra LAN.

**Mô hình đe doạ:** ai gửi được verdict thì người đó chạy được lệnh trên máy bạn.

**Ranh giới tin cậy:** chỉ chống các trang web đang mở trong trình duyệt và các request từ bên ngoài máy. Tiến trình chạy dưới chính user của bạn thì đọc được token trong `${CLAUDE_PLUGIN_DATA}` và vốn đã chạy được lệnh, nên nằm ngoài phạm vi. Ghi rõ điều này trong `docs/threat-model.md` để không thiết kế thừa.

**Biện pháp:**
- Chỉ bind `127.0.0.1`. Kiểm tra `Host` (chống DNS rebinding) và `Origin` cho mọi request, kể cả SSE.
- Đăng nhập dashboard bằng link có token dùng một lần, in ra terminal (giống Jupyter). Sau đó dùng cookie `HttpOnly`, `SameSite=Strict`. Mọi POST đều cần CSRF token.
- Plugin nói chuyện với server bằng token riêng, lưu trong `${CLAUDE_PLUGIN_DATA}` với quyền 0600. Khi dev, token nằm trong `AGENT_OFFICE_HOME` (mục 9.2).
- Verdict gắn với `request_id` và một nonce của server, chỉ dùng được một lần, hết hạn sau vài phút. Không có nút "duyệt tất cả".
- Chỉ allow/deny cho từng lần. Dashboard không ghi rule vĩnh viễn (`updatedPermissions`).
- Coi `input_preview` là dữ liệu không tin cậy: escape, không render markdown hay HTML, hiện đầy đủ lệnh.
- Lệnh nguy hiểm phải xác nhận lần hai: `rm -rf`, `git push --force`, `curl … | sh`, ghi file ra ngoài thư mục dự án.
- Ghi nhật ký kiểm toán cho mọi quyết định. Có công tắc tắt nhanh; mặc định tắt khi mới cài.
- Viết `docs/threat-model.md`. Đây cũng là tài liệu tốt để trình bày khi phỏng vấn.

## 7. Quota và lịch sử

- **Nguồn:** `rate_limits` trong JSON của statusline, gồm cửa sổ 5 giờ và 7 ngày, mỗi cửa sổ có `used_percentage` và `resets_at`.
- **Cách lấy:** wrapper `agent-office statusline -- <lệnh statusline cũ>`. Wrapper gửi dữ liệu bất đồng bộ (không chặn), rồi chuyển JSON cho lệnh cũ và in ra kết quả của lệnh đó. Khi dev, wrapper chỉ được đặt trong cấu hình của dự án sandbox, không sửa statusline toàn cục (cần xác nhận ở S0 là statusline đặt ở cấp dự án được).
- **Hiển thị:**
  - thanh quota 5 giờ và 7 ngày;
  - dự báo giờ chạm 100% theo tốc độ hiện tại;
  - phân bổ *ước tính* theo session hoặc dự án, dựa trên `cost.total_cost_usd` (chi phí quy đổi theo giá API).
- **Lịch sử:** nhiệm vụ theo `promptId` (thời gian, tool, token), xem theo ngày hoặc dự án; ảnh chụp quota theo thời gian; có chính sách giữ dữ liệu.
- **Không** gọi endpoint không chính thức bằng token đăng nhập của bạn.

## 8. Tech stack

| Phần | Lựa chọn | Lý do |
|---|---|---|
| Monorepo | pnpm workspaces, gọi qua `corepack pnpm …` (không chạy `corepack enable`); `packageManager` trong `package.json` ghim pnpm; `.nvmrc` và `engines.node` ghim Node 22 | Gồm `shared`, `server`, `web`, `plugin`, `simulator`; không sửa môi trường Node dùng chung (mục 9.2) |
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
| Khởi động | Khi dev: `pnpm dev:up`, tắt bằng Ctrl+C hoặc `pnpm dev:down`. Bản phát hành: hook `SessionStart` tự bật server qua shim ổn định (mục 9.2, ADR-007); tắt tay bằng `agent-office stop` (ghi cờ tắt có chủ đích). **Không dùng LaunchAgent.** Server tự tắt khi hết session theo quy tắc ở mục 9.2 | Không đụng hệ thống; không có dịch vụ nào chạy lúc đăng nhập |
| Đóng gói | Bundle hook, MCP server và wrapper thành file JS không cần cài phụ thuộc lúc chạy (ví dụ dùng esbuild); chốt ở ADR-007 | Cài nhanh, giảm rủi ro chuỗi cung ứng |
| Chất lượng và bảo mật | Quét secret ở pre-commit bằng công cụ cài qua pnpm (vd secretlint), gitleaks ở CI; Renovate hoặc Dependabot; `pnpm audit`; `@axe-core/playwright` | Secret, phụ thuộc, accessibility; không phải cài công cụ hệ thống |

## 9. Cấu trúc repo và quy tắc cô lập khi phát triển

### 9.1 Cấu trúc repo

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
├─ scripts/        # scrub dữ liệu, compat-run, dev:up/down/clean, claude-ao, bật/tắt hook theo dự án, gỡ cài đặt
├─ docs/           # adr/, threat-model.md, kiến trúc, hướng dẫn cài đặt, troubleshooting, journal.md
├─ .github/        # CI, issue/PR template, cấu hình Renovate/Dependabot
├─ compat.json     # bảng các phiên bản Claude Code đã kiểm tra
├─ SECURITY.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md, CHANGELOG.md, LICENSE
├─ .dev-data/      # (gitignore) AGENT_OFFICE_HOME khi dev: DB, token, log, cấu hình
├─ .dev-raw/       # (gitignore) dữ liệu thô thu ở M0, chưa scrub, không bao giờ commit
├─ .cache/         # (gitignore) COREPACK_HOME, store của pnpm, trình duyệt Playwright
└─ README.md
```

### 9.2 Quy tắc cô lập khi phát triển

**Ràng buộc từ chủ dự án:** khi phát triển không được đụng tới hệ thống của máy Mac, vì máy còn dùng cho nhiều dự án khác. Cụ thể:
- không ghi cấu hình hay hook vào phạm vi toàn cục;
- không cài thứ chạy nền hệ thống (LaunchAgent) ở bất kỳ giai đoạn nào;
- mọi dữ liệu dev nằm trong thư mục repo và xoá sạch được bằng một lệnh;
- khi chạm tới dự án thật thì đi từng bước nhỏ và quay lại được.

#### Nguyên tắc

1. **Phần lớn việc phát triển không cần Claude Code thật.** Reducer, server, UI danh sách, văn phòng pixel và panel duyệt đều phát triển và test được bằng simulator.
2. **Chỉ tiếp xúc Claude Code thật ở phạm vi nhỏ nhất:** M0 (thu dữ liệu thật), test tích hợp, và giai đoạn dùng thử hằng ngày.
3. **Mặc định cô lập, mở rộng dần.** Chỉ nới phạm vi khi mức trước đã ổn định.
4. **Chỉ đọc dữ liệu của Claude Code.** Code của dự án và script dev không bao giờ ghi, sửa hay xoá gì trong `~/.claude/`. Ngoại lệ là những thứ chính Claude Code tự ghi theo cơ chế của nó: transcript của session sandbox, và thư mục dữ liệu plugin sau khi đã cài plugin ở bước 2.

#### Các mức cô lập khi cần Claude Code thật

| Mức | Cách làm | Ảnh hưởng tới dự án khác | Dùng khi |
|---|---|---|---|
| 0 | Chỉ dùng simulator | Không | Mặc định khi phát triển |
| 1 | **Dự án sandbox**: một thư mục test riêng, hook đặt trong `.claude/settings.local.json` của chính thư mục đó | Không, vì hook chỉ có hiệu lực khi chạy Claude Code trong thư mục đó | M0 và test tích hợp |
| 2 | Thư mục cấu hình Claude riêng (biến môi trường `CLAUDE_CONFIG_DIR`) và nạp plugin từ thư mục dev (`--plugin-dir`) | Không | Thử plugin, channel |
| 3 | Tài khoản macOS riêng hoặc máy ảo | Không | Kiểm thử cài đặt từ đầu, đo thời gian cài |

**Đã kiểm ở S0** (`docs/spikes/s0-isolation.md`): `CLAUDE_CONFIG_DIR` cô lập cấu hình, plugin và transcript nhưng không dùng chung đăng nhập; `--plugin-dir` nạp plugin cho riêng phiên nhưng vẫn tạo `~/.claude/plugins/data/<tên>-inline`. Câu hỏi 11 đã chốt theo kết quả này. Ghi chú gốc của v3:
Mức 2 (`CLAUDE_CONFIG_DIR`, `--plugin-dir`) phải được xác nhận với tài liệu hiện tại và thử thực tế ở spike S0, kể cả việc chúng cô lập được những gì: cấu hình, plugin, thư mục transcript, đăng nhập.
- `--plugin-dir` có được nhắc trong tài liệu plugin, nhưng vẫn phải thử xem nó cô lập tới đâu.
- Nếu `CLAUDE_CONFIG_DIR` đổi chỗ lưu transcript thì tailer phải lấy đường dẫn từ cấu hình, không được cố định `~/.claude`.

**Lưu ý cho mức 1** (kiểm tra ở S0):
- Hook trong cấu hình dự án chỉ chạy sau khi đã chấp nhận hộp thoại workspace trust của thư mục đó.
- Hook và plugin cài ở phạm vi người dùng vẫn chạy trong sandbox (máy bạn đang có plugin kèm hook), nên dữ liệu thu được sẽ lẫn sự kiện của chúng.
- **Vị trí sandbox: `~/agent-office-sandbox/`** (đã chốt ở câu hỏi 10). Đây là ngoại lệ duy nhất của ràng buộc "mọi dữ liệu dev trong repo", và chủ dự án đã đồng ý.
  - Lý do: nếu đặt trong repo, session sandbox có thể nạp `CLAUDE.md` của repo cha, và lệnh git trong kịch bản có thể chạm vào repo của dự án.
  - Sandbox là một git repo riêng, chỉ chứa file mẫu cho kịch bản. Xoá bằng `pnpm sandbox:clean`; `dev:clean` không đụng tới nó.
- Transcript của session sandbox vẫn do Claude Code ghi vào `~/.claude/projects/` và hiện trong danh sách `/resume`. Điều này chấp nhận được; script dev không tự xoá các transcript đó.

**Quy tắc cứng:** không đặt hook vào `~/.claude/settings.json` (cấu hình toàn cục) trong lúc phát triển. Hook toàn cục chạy ở mọi session của mọi dự án, nên chỉ một hook lỗi là ảnh hưởng tất cả. Cũng không dùng `disableAllHooks` để chữa cháy, vì nó tắt luôn hook của các plugin khác.

#### Giữ mọi thứ trong thư mục repo

| Thư mục (đều trong `.gitignore`) | Chứa gì | Xoá bằng |
|---|---|---|
| `.dev-data/` (`AGENT_OFFICE_HOME`) | DB, token, log, cấu hình khi chạy dev | `pnpm dev:clean` |
| `.dev-raw/` | Dữ liệu thô thu ở M0, chưa scrub | `pnpm dev:clean-raw` (tách riêng để không lỡ tay xoá dữ liệu đã thu) |
| `.cache/` | `COREPACK_HOME`, store của pnpm, trình duyệt Playwright (`PLAYWRIGHT_BROWSERS_PATH`) | `pnpm cache:clean` |

- **Không ghi** vào `~/Library` hay `~/.config` khi dev.
- **Cổng mạng:** cấu hình qua env, chỉ bind `127.0.0.1`, báo lỗi rõ ràng khi cổng đang bận.
- **Không dùng LaunchAgent ở bất kỳ giai đoạn nào.** Khi dev chạy bằng `pnpm dev:up`, tắt bằng Ctrl+C hoặc `pnpm dev:down` (dừng mọi tiến trình do dự án sinh ra).
- **pnpm và Node:**
  - gọi `corepack pnpm …`, không chạy `corepack enable` (lệnh này tạo shim cạnh binary Node);
  - `packageManager` trong `package.json` ghim phiên bản pnpm; `.nvmrc` và `engines.node` ghim Node 22 (máy đang dùng nvm);
  - từ Node 25 corepack không còn đi kèm, nên phải xem lại khi nâng Node.
- **Cache dùng chung:** máy đã có store của pnpm và trình duyệt Playwright trong thư mục người dùng, dùng chung với các dự án khác. Trỏ cả hai vào `.cache/` để không ghi thêm vào đó.

#### Những chỗ không tránh được, và cách giảm

| Việc | Vì sao không tránh được | Cách giảm |
|---|---|---|
| Tailer đọc `~/.claude/projects/` | Claude Code vốn ghi transcript ở đó | Chỉ **đọc**, mở file ở chế độ chỉ đọc; có test khẳng định tailer không ghi |
| Session sandbox nằm trong lịch sử Claude Code | Claude Code tự ghi transcript | Đặt tên sandbox rõ ràng; không tự xoá gì trong `~/.claude/` |
| `claude agents --json` có thể khởi động supervisor chạy nền | Cần để đối chiếu trạng thái | Đã kiểm ở S2: không khởi động supervisor, nên reconciler không cần tắt khi dev (`docs/spikes/s2-agents-json.md`) |
| Quyền thông báo của trình duyệt | Cần cho Notification API | Chỉ cấp cho origin `localhost:<cổng>` |
| Cài PWA | Tuỳ chọn | Để sau, khi đã ổn định |
| Cổng mạng | Server cần lắng nghe | Chọn cổng ít xung đột; xử lý lỗi cổng bận; cho đổi cổng bằng env |

#### Khi muốn theo dõi dự án thật

Muốn thấy agent ở dự án nào thì dự án đó phải có hook. Đi theo từng bước; mỗi bước **hoàn tác được bằng một lệnh** và có ghi trong tài liệu.

1. **Bước 1: bật cho từng dự án được chọn.** Có hai cách (chọn ở câu hỏi 14):
   - **(a)** Thêm hook vào `.claude/settings.local.json` của dự án. Lệnh bật sao lưu file cũ, gộp hook vào chứ không ghi đè, và kiểm tra file đã nằm trong `.gitignore`. Lệnh tắt khôi phục đúng bản sao lưu.
   - **(b)** Không ghi gì vào dự án. Mở Claude Code qua `scripts/claude-ao`; script này gọi `claude --settings <file hook của agent-office>`. **Đã kiểm ở S0:** hook nạp qua `--settings` gộp với hook của dự án và của các plugin khác.

   Danh sách "dự án đã bật hook" lưu trong `AGENT_OFFICE_HOME`.
2. **Bước 2:** dùng ổn vài tuần rồi mới cài plugin ở phạm vi người dùng, kèm công tắc tắt nhanh và checklist gỡ cài đặt sạch (M3.5).

#### Khởi động và tắt server (không dùng LaunchAgent)

**Quyết định (16/11/2026):** không dùng LaunchAgent ở bất kỳ giai đoạn nào (dev, v0.1, các bản sau), kể cả dạng tuỳ chọn; không dùng LaunchDaemon. Lý do: không đụng hệ thống Mac; chủ dự án hay sleep nên dịch vụ nền (chỉ được nạp lại khi đăng nhập phiên mới) gần như không có lợi; server chỉ cần sống khi có session Claude.

**Quy tắc:**
- **Bật:** hook `SessionStart` gọi `agent-office ensure-running`: nếu chưa có server thì bật ở chế độ nền (tách hẳn khỏi hook) rồi thoát ngay. Hook luôn `exit 0` và có timeout ngắn (khoảng 1 giây). Gọi qua shim ổn định (bên dưới).
- **Định nghĩa "session sống":** tiến trình `claude` còn đang mở, kể cả khi chỉ ngồi chờ người dùng nhập. Máy sleep thì session vẫn sống. Session để mở qua đêm không làm gì vẫn là session sống (câu hỏi 20).
- **Tự tắt server:** chỉ khi **cả hai** tín hiệu cho thấy hết session: (1) đã nhận `SessionEnd` cho mọi session đã biết, và (2) kiểm tra định kỳ xác nhận không còn tiến trình `claude` tương ứng (pid lấy từ `claude agents --json`, statusline hoặc MCP server; xác nhận ở S5, S9). S1 đã thấy `ppid` của tiến trình hook chính là pid đó, còn statusline không có pid. Cần cả hai vì session bị crash hoặc kill có thể không gửi `SessionEnd`. Sau đó chờ thời gian ân hạn (đề xuất 5 phút, cấu hình được; câu hỏi 18) rồi mới thoát. Có session mới trong lúc ân hạn thì huỷ việc tắt. Mọi bộ đếm tuân theo quy tắc sleep/wake ở mục 5.4. Vì không có LaunchAgent, server **tự thoát tự do**, không có tiến trình nào bật lại nó ngoài hook.
- **Tắt tay:** `agent-office stop` dừng server ngay và ghi **cờ "đã tắt có chủ đích"**; cờ bị xoá khi có session mới mở. `agent-office start` bật tay (khi cần mở dashboard sớm). Khi dev dùng `pnpm dev:up`/`pnpm dev:down`.
- **Bật lười (lưới an toàn khi server chết giữa chừng; cơ chế phục hồi duy nhất vì không có LaunchAgent; câu hỏi 19):** `SessionStart` chỉ chạy một lần lúc session bắt đầu, nên hook ở sự kiện kế tiếp, nếu không kết nối được server, sẽ gọi `ensure-running` rồi gửi lại đúng một lần. Điều kiện bắt buộc:
  - không phải bộ đếm giờ: chỉ hành động khi có hook bắn ra **và** không kết nối được;
  - **khoá nguyên tử** để nhiều hook cùng bắn (3 agent có thể làm 3-5 hook cùng lúc) không sinh nhiều server: file khoá tạo bằng cờ độc quyền, hoặc để việc bind cổng làm khoá (ai bind được thì thắng, các hook còn lại chỉ gửi lại sự kiện);
  - **giới hạn tần suất:** khoảng cách tối thiểu 30 giây giữa hai lần thử, giãn dần 30 giây → 1 phút → 5 phút (trần), dừng hẳn sau 5 lần thất bại liên tiếp và ghi vào trang Chẩn đoán; đặt lại khi kết nối thành công; mốc thời gian lưu trong một file nhỏ để các hook chia sẻ;
  - tôn trọng cờ "đã tắt có chủ đích": không bật lại khi cờ còn.

**Cái giá phải chấp nhận và cách bù:**

| Mất gì | Cách bù |
|---|---|
| Server không tự bật lại sau khi crash giữa session | Lớp bật lười ở trên |
| Server không sống sẵn khi chưa có session nào | Dashboard hiện "chưa có server, mở một session Claude để bắt đầu" kèm lệnh `agent-office start` |
| Không có thông báo macOS khi không có session nào chạy | Không cần: không có agent thì không có gì để thông báo |

**Shim ổn định (chỉ cho hook):** `${CLAUDE_PLUGIN_ROOT}` đổi đường dẫn mỗi khi plugin cập nhật, và đường dẫn Node có thể chứa số phiên bản (nvm), nên hook gọi qua một shim nằm ngoài thư mục plugin:

```
~/Library/Application Support/agent-office/bin/agent-office   # shim ổn định
~/Library/Logs/agent-office/                                  # log
```

- Trình cài đặt ghi đường dẫn Node tuyệt đối (`process.execPath`) vào config của shim. Trên máy hiện tại đường dẫn là `~/.nvm/versions/node/v22.21.1/bin/node`, nên shim phải kiểm tra đường dẫn còn tồn tại, ghi lỗi rõ ràng vào log, và có lệnh sửa lại. Phương án thay thế: đóng gói server thành file chạy độc lập để không phụ thuộc Node của máy. Chốt ở ADR-007.
- Shim chỉ được tạo ở bản phát hành, không tạo khi dev.

**Tham số cấu hình** (đều là đề xuất chưa đo; phải cấu hình được qua file config hoặc biến môi trường, hiệu chỉnh sau S9, soak test và kịch bản sleep/wake):

| Tham số | Mặc định đề xuất |
|---|---|
| Ân hạn trước khi tự tắt | 5 phút (câu hỏi 18) |
| Chu kỳ kiểm tra tiến trình `claude` | 30-60 giây |
| Ngưỡng phát hiện nhảy thời gian | hơn 3 lần chu kỳ kiểm tra |
| Khoảng cách thử bật lười | 30 giây, giãn dần 1 phút, 5 phút (trần) |
| Số lần thất bại tối đa của bật lười | 5 |
| Timeout hook | khoảng 1 giây |

**Nếu sau này đổi ý:** thêm lại LaunchAgent là một thay đổi có chủ đích, phải có ADR mới trước khi làm, và phải xử lý lại chế độ managed (server tự thoát xung đột với `KeepAlive`).

#### Hàng rào an toàn

| Hàng rào | Milestone |
|---|---|
| Test tự động "không ghi ngoài repo": chạy server và web ở chế độ dev với simulator, `HOME` trỏ tới một thư mục tạm rỗng, kèm lớp chặn ghi file ở chế độ dev/test. Khẳng định không có file nào được ghi ra ngoài repo và thư mục tạm | M1 |
| Test tailer chỉ đọc: tailer không mở file nào trong `~/.claude/` ở chế độ ghi | M1 |
| Hook luôn exit 0, có `timeout`, và vẫn chạy đúng khi server dev đang tắt | M1 |
| README dev có dòng cảnh báo "Không bao giờ đặt hook toàn cục khi phát triển" | M1 |
| `dev:clean` và `dev:down` có test; `dev:clean` không xoá gì ngoài `.dev-data/` và file tạm của dự án | M1 |
| Danh sách "dự án đã bật hook" và lệnh gỡ hook cho từng dự án | M1 |
| Công tắc tắt nhanh mọi hook (biến môi trường hoặc file cờ mà hook kiểm tra trước tiên), không cần sửa từng dự án. Hook kiểu `http` không tự kiểm tra cờ được, nên điểm này nghiêng ADR-003 về hook kiểu `command` | M1 |
| Hook không bao giờ làm chậm hoặc chặn agent khi server tắt hoặc đang bật lại (timeout ~1 giây, `exit 0`, không thử lại dồn dập) | M1 |
| Sau khi thoát session cuối và hết ân hạn, không còn tiến trình `agent-office` nào chạy (test tự động) | M1 |

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
7. **Khi có sự cố.** Mất kết nối server, hook lỗi, hoặc phát hiện Claude Code đổi định dạng dữ liệu sẽ hiện banner trên cùng (xem 10.9).

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
| Phiên bản Claude Code mới hơn bảng tương thích | Chỉ ghi ở thanh trạng thái và trang Chẩn đoán. Claude Code cập nhật vài ngày một lần, nên banner bật thường trực sẽ thành nhiễu |
| Parser gặp định dạng lạ (drift) | Banner vàng "Claude Code có thể đã đổi định dạng, một số trạng thái có thể sai", kèm nút xuất gói chẩn đoán (có từ M3.5). Bật khi tỉ lệ bản ghi không nhận dạng được trong 200 sự kiện gần nhất vượt ngưỡng (chốt ở M1). Tắt khi tỉ lệ xuống dưới ngưỡng, hoặc khi phiên bản đã được thêm vào `compat.json` |
| Trạng thái chưa chắc chắn | Viền đứt nét, nhãn "Có thể…" |

### 10.10 Văn phòng pixel

- **Bố cục:**
  - Mỗi session một bàn.
  - Có "phòng máy chủ" (Bash), "giá sách" (đọc, tìm kiếm, web) và "góc cà phê" (xong việc).
  - Subagent hiếm khi xuất hiện (bạn không chủ động dùng, nhưng Claude có thể tự gọi), nên chỉ hiện trong timeline. Hình "thực tập sinh" để trong backlog.
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

### 11.1 Quản lý dự án và Định nghĩa hoàn thành

- **Board:** GitHub Projects hoặc công cụ tương đương. Mỗi milestone là một nhóm issue; mỗi checkbox trong plan là một issue.
- **Review hằng tuần (15-30 phút):** tuần qua làm được gì, số giờ thực tế so với ước tính, điều chỉnh cho tuần sau. Ghi một dòng vào `docs/journal.md`.
- **Quy tắc cắt phạm vi:** khi một milestone vượt mức ước tính cao quá ngưỡng (đề xuất 30%, xem câu hỏi 7), dừng lại và cắt theo thứ tự định sẵn:
  - M2: extension VS Code (tuỳ chọn);
  - M3: nhân vật đi lại, bớt animation, ánh sáng ngày/đêm;
  - M4: phân bổ quota theo session;
  - M5: Cursor (giữ Codex).
- **Định nghĩa hoàn thành (DoD), áp dụng cho mọi task:**
  - test liên quan pass, không regress;
  - lint, typecheck, build sạch;
  - đã chạy thử thật, không chỉ compile;
  - không còn TODO/FIXME liên quan tới bảo mật hoặc dữ liệu;
  - tài liệu và ADR được cập nhật nếu hành vi hoặc quyết định thay đổi;
  - commit không chứa dữ liệu thô hay secret (quét secret pass).

### 11.2 Bảng ước tính

| Milestone | Thấp (giờ) | Cao (giờ) |
|---|---|---|
| M0: Khảo sát, spike, wireframe, vệ sinh dữ liệu, mức cô lập | 19 | 31 |
| M1: Lõi trạng thái + UI danh sách, môi trường dev cô lập, vòng đời server | 55 | 83 |
| M2: Duyệt quyền | 18 | 30 |
| M3: Văn phòng pixel | 42 | 74 |
| M3.5: Hardening và phát hành v0.1 | 24 | 39 |
| Sau v0.1: Ra mắt và hỗ trợ | 4 | 6 |
| M4: Quota và lịch sử | 15 | 25 |
| M5: Đa công cụ | 21 | 37 |
| **Tổng** | **198** | **325** |

- Đến v0.1 (M0 → M3.5): 158-257 giờ.
- Review hằng tuần chiếm 0,25-0,5 giờ, nên mỗi tuần còn khoảng 7,5-9,75 giờ làm việc.
  - v0.1: 158 ÷ 9,75 ≈ 16,2 tuần đến 257 ÷ 7,5 ≈ 34,3 tuần, tức **khoảng 3,7-7,9 tháng** (làm tròn 4-8 tháng).
  - Toàn bộ: 198 ÷ 9,75 ≈ 20,3 tuần đến 325 ÷ 7,5 ≈ 43,3 tuần, tức **khoảng 4,7-10 tháng**.
- So với v3 (195-320 giờ): v3.1 tăng 3-5 giờ, gồm S9 ở M0 (+1-2 giờ), vòng đời server ở M1 (+5-8 giờ: sleep/wake, bật lười có khoá, `start`/`stop`, kiểm thử) và gỡ LaunchAgent opt-in khỏi M3.5 (−3-5 giờ). Mọi con số là ước tính chưa hiệu chỉnh.
- So với v2: tổng thật của v2 là 131-215 giờ. v3 tăng thêm 64-105 giờ, gồm:
  - 50-83 giờ theo review, chủ yếu do M3.5 và phần vận hành, kiểm thử ở M0-M2;
  - 14-22 giờ theo quy tắc cô lập, ở M0, M1 và M3.5.
- Tổng khoảng 198-325 giờ. Nếu cần rút ngắn, M5 (đa công cụ) là ứng viên cắt đầu tiên, vì chủ yếu phục vụ portfolio.
- Câu hỏi 5 (quét tiến trình) chưa được tính trong bảng; nếu chọn có thì cộng thêm khoảng 3-5 giờ vào M1. Quét tiến trình cũng phục vụ tín hiệu "session sống" (mục 9.2).
- Nếu bỏ lớp bật lười (câu hỏi 19), trừ khoảng 1-2 giờ khỏi M1.

### M0: Khảo sát, spike rủi ro, wireframe, vệ sinh dữ liệu và mức cô lập (19-31 giờ)

**Điều kiện bắt đầu:** đã đủ. Câu hỏi 1, 2 và 10 đã chốt ngày 15/11/2026.

**Time-box cho từng spike** (ước tính 9-13,5 giờ, time-box tối đa tổng cộng 13,5 giờ, đã gồm S9 thêm ở v3.1). Hết time-box mà vẫn chưa có câu trả lời thì dừng, ghi kết quả dang dở vào ADR và làm theo cột "Nếu không đạt".

| Spike | Time-box | Cần trả lời | Nếu không đạt |
|---|---|---|---|
| S0. Mức cô lập (làm đầu tiên) | 1 giờ | Hook trong `.claude/settings.local.json` có chỉ chạy trong sandbox không; `CLAUDE_CONFIG_DIR` và `--plugin-dir` cô lập được gì; hook nạp qua `--settings` có gộp với hook khác không; statusline đặt ở cấp dự án được không; `CLAUDE.md` ở thư mục cha có bị nạp không. **[chưa kiểm chứng]** | Mức 1 cho mọi spike. Spike cần plugin (S3, S5, S8) chỉ dùng `--plugin-dir`; nếu vẫn không đủ thì chạy ở mức 3 hoặc hoãn |
| S1. Ghi sự kiện, chạy kịch bản | 3 giờ | Bảng ánh xạ ở mục 4 có đúng không | Đánh dấu "chưa xác nhận" các dòng chưa kiểm được; bổ sung kịch bản ở M1 |
| S2. `claude agents --json` | 1 giờ | Có liệt kê session tương tác không; mỗi lần gọi tốn bao nhiêu | Bỏ reconciler; dùng hooks + transcript (+ quét tiến trình nếu chọn câu hỏi 5); hạ tiêu chí độ chính xác |
| S3. Channel permission relay | 2,5 giờ | Relay có chạy không; "bên trả lời trước thắng" có đúng không; cờ dev phiền tới mức nào | Chuyển sang S4 theo ADR-002 |
| S4. Hook `PermissionRequest` kiểu `http` | 1 giờ | Hook đang chờ có chặn hộp thoại terminal không | Không dùng làm dự phòng. Nếu cả S3 và S4 đều không đạt: bỏ chức năng duyệt khỏi M2, chỉ giữ thông báo và nhảy tới terminal |
| S5. MCP server của plugin | 1 giờ | Có sống đúng bằng vòng đời session không; lấy pid và `session_id` bằng cách nào | Lấy pid cho liveness từ `claude agents --json` hoặc statusline |
| S6. Overhead của hook | 1 giờ | p50/p95 với hook đồng bộ, `async`, `http`; hook `http` làm gì khi server tắt | Chọn kiểu nhanh nhất mà vẫn đạt ngưỡng; ghi ngưỡng vào ADR-003 |
| S7. Statusline wrapper | 0,5 giờ | Có nhận được `rate_limits` và `process.pid` không | Ô quota hiện "không khả dụng"; thu hẹp M4 |
| S8. Đóng gói plugin, đường dẫn server | 1 giờ | Bundle được không; shim ổn định xử lý thế nào khi `${CLAUDE_PLUGIN_ROOT}` hoặc phiên bản Node (nvm) đổi | Ghi phương án tạm vào ADR-007, quyết định lại ở M1 |
| S9. Vòng đời session và sleep/wake | 1-1,5 giờ | `SessionStart` có chạy khi resume không; payload có pid không; session bị crash hoặc kill có `SessionEnd` không; đồng hồ đơn điệu và timer của Node có chạy lúc máy ngủ không; hook gọi khi server tắt có chặn agent không | Không có pid: dùng liveness từ `claude agents --json` (S2) hoặc statusline (S7). Không phát hiện được sleep bằng đồng hồ: dùng khoảng trễ bất thường của chu kỳ kiểm tra làm ngưỡng |

**Việc cần làm:**

- [x] **Vệ sinh dữ liệu, làm trước commit đầu tiên (2-4 giờ):** *(xong 15/11/2026; quét lịch sử trước lần push công khai đầu tiên bằng `./scripts/gitleaks git --redact --verbose .`)*
  - dữ liệu thô ghi vào `.dev-raw/` (nằm trong `.gitignore`, mục 9.2);
  - script scrub có test, redact: đường dẫn home, tên dự án, token/secret, `accountUuid`/`organizationUuid`, nội dung `tool_response`;
  - chỉ commit fixture đã scrub hoặc fixture tổng hợp;
  - quét secret ở pre-commit bằng công cụ cài qua pnpm (vd secretlint), không cài gì qua Homebrew; gitleaks chạy ở CI;
  - trước lần push công khai đầu tiên: quét secret trên toàn bộ lịch sử git, vì repo public thì mọi commit đều lộ ra.
- [x] **Repo và quản lý dự án (1-2 giờ):** `git init`, tạo board dự án (11.1), viết Định nghĩa hoàn thành. *(xong 15/11/2026: [board](https://github.com/users/thaianhnv99/projects/1), `docs/definition-of-done.md`, `docs/journal.md`)*
- [x] **S0.** Tạo dự án sandbox ở mức 1 tại `~/agent-office-sandbox/` (mục 9.2) và kiểm tra các câu ở dòng S0 trong bảng trên. Không đặt hook vào cấu hình toàn cục. *(xong 15/11/2026: `docs/spikes/s0-isolation.md`)*
- [x] **S1.** Trong dự án sandbox, viết một hook async chỉ ghi lại mọi sự kiện vào `.dev-raw/`. Chạy các kịch bản sau và so sánh ba nguồn hooks, `claude agents --json`, transcript: *(xong 16/11/2026: `docs/spikes/s1-events.md`, fixture trong `fixtures/s1/`)*
  - duyệt quyền; từ chối quyền;
  - nhấn Esc lúc agent đang nghĩ; nhấn Esc lúc Bash đang chạy;
  - Bash chạy lâu sau khi duyệt;
  - nhiều tool song song; một subagent (bạn không chủ động dùng, nhưng Claude có thể tự gọi, nên reducer không được hỏng khi gặp);
  - `AskUserQuestion`; plan mode;
  - `/compact`, `/clear`, `--resume`;
  - đóng tab terminal đột ngột;
  - 2 session trong cùng thư mục.
- [x] **S2.** Thử `claude agents --json` trong terminal VS Code: *(xong 16/11/2026: `docs/spikes/s2-agents-json.md`)*
  - session tương tác có xuất hiện không;
  - có những trường nào;
  - mỗi lần gọi tốn bao nhiêu thời gian/CPU;
  - lệnh có tự khởi động supervisor không. Nếu có, thì khi dev reconciler mặc định tắt và chỉ bật lúc test tích hợp.
- [x] **S3.** Spike channel: viết MCP server tối thiểu có permission relay. Kiểm tra thêm MCP server làm gì khi không kết nối được server của app. Chạy ở mức 2 hoặc 3, không cài vào cấu hình chính. *(xong 16/11/2026: `docs/spikes/s3-channel.md`)*
  - Xác nhận "bên nào trả lời trước thì thắng" khi dùng terminal VS Code.
  - Đánh giá mức phiền của cờ dev và hộp thoại xác nhận.
- [x] **S4.** Spike hook `PermissionRequest` kiểu `http`: khi hook đang chờ thì hộp thoại terminal có hiện không. *(xong 16/11/2026: `docs/spikes/s4-permission-hook.md`)*
- [ ] **S5.** MCP server của plugin:
  - có sống đúng bằng vòng đời session không;
  - lấy `pid` cha và `session_id` bằng cách nào.
- [x] **S6.** Đo overhead mỗi tool call với ba kiểu hook: command đồng bộ (Node), `async`, `http`. Kiểm tra hook `http` hoạt động thế nào khi server tắt. *(xong 16/11/2026: `docs/spikes/s6-hook-overhead.md`)*
- [ ] **S7.** Statusline wrapper: có nhận được `rate_limits` và `process.pid` không.
- [ ] **S8.** Đóng gói plugin và đường dẫn server:
  - plugin có cần phụ thuộc lúc chạy không, có bundle được thành file JS không;
  - `${CLAUDE_PLUGIN_ROOT}` đổi mỗi khi plugin cập nhật, nên hook phải gọi qua shim ổn định nằm ngoài thư mục plugin (mục 9.2). Kiểm tra cách xử lý khi đường dẫn Node có chứa số phiên bản (máy đang dùng nvm);
  - thử plugin bằng `--plugin-dir` trong một session riêng.
- [ ] **S9.** Vòng đời session và sleep/wake. Thử thật trên máy: mở session, sleep, wake; kill terminal; resume. Ghi kết quả vào `docs/spikes/s9-lifecycle.md`.
  - S1 đã trả lời một phần (`docs/spikes/s1-events.md`): `SessionStart` có chạy khi resume (`source: resume`); `ppid` của tiến trình hook là pid của `claude` (trùng `claude agents --json`); đóng terminal vẫn có `SessionEnd` (`reason: other`). S6 đã trả lời: hook khi server tắt không chặn agent (`http` báo lỗi trong 1-8 ms, command `async` không làm agent chờ); server treo thì `http` chặn tới hết timeout. Còn lại: kill hẳn tiến trình (`kill -9`), timer và đồng hồ đơn điệu lúc máy ngủ.
- [ ] Đọc 2-3 dự án tương tự: pixel-agents, pixel-agent-desk, agents-observe. Ghi lại cách họ hiển thị trạng thái và thông báo.
- [ ] Thiết kế D1: wireframe lo-fi cho màn hình chính, chế độ danh sách, panel duyệt và luồng duyệt (mục 10.11). (3-5 giờ)
- [ ] Viết ADR (2-3 giờ):
  - ADR-004: event sourcing + reducer thuần, chạy ở cả server lẫn trình duyệt;
  - ADR-005: lưu trữ (`node:sqlite` hay `better-sqlite3`, cấu trúc event log, `schema_version`);
  - ADR-007: đóng gói plugin, shim ổn định, cách bật server (`SessionStart` là cách bật duy nhất, không dùng LaunchAgent), đường dẫn Node (dựa trên S8).
- [ ] Buổi chốt go/no-go (1-2 giờ): ghi đạt hoặc không đạt cho từng spike, rồi chọn một trong ba hướng: **tiếp tục**, **đổi hướng** hoặc **cắt phạm vi**. Ghi kết quả vào ADR-008.

**Xong khi có:**
- dữ liệu thô nằm trong `.dev-raw/` và ngoài git, script scrub có test, quét secret chạy ở pre-commit;
- đã chốt mức cô lập (câu hỏi 11), và không có hook nào nằm trong cấu hình toàn cục;
- fixture đã scrub;
- bảng ánh xạ ở mục 4 được xác nhận bằng dữ liệu thật;
- ADR-001 (nguồn dữ liệu), ADR-002 (cơ chế duyệt), ADR-003 (kiểu hook), ADR-004, ADR-005, ADR-007;
- biên bản go/no-go (ADR-008).

### M1: Lõi trạng thái + UI dạng danh sách, dùng hằng ngày được (55-83 giờ)

Phần giữ nguyên từ v2: 30-43 giờ. Thêm theo review: 13-21 giờ. Thêm theo quy tắc cô lập: 7-11 giờ. Thêm theo vòng đời server (v3.1): 5-8 giờ. Số giờ ghi ở từng mục.

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
- [ ] Tự khởi động server bằng hook `SessionStart`: spawn tách hẳn khỏi hook để hook trả về ngay, gọi qua shim ổn định (mục 9.2). Khi dev thì không dùng cách này mà chạy `pnpm dev:up`.
- [ ] Bảo mật nền: token, kiểm tra `Origin`/`Host`, file quyền 0600, redact.
- [ ] Phục hồi khi khởi động lại, theo mục 5.3. (2-3 giờ)
- [ ] Vận hành server chạy nền (3-5 giờ):
  - log có phân mức và xoay vòng, không ghi dữ liệu nhạy cảm;
  - giới hạn dung lượng DB, chạy VACUUM định kỳ (liên quan mục 7 và M4);
  - cổng mặc định, file config, báo lỗi rõ ràng khi trùng cổng;
  - tự tắt khi hết session theo quy tắc ở mục 9.2 (`SessionEnd` **và** kiểm tra tiến trình, ân hạn cấu hình được, đề xuất 5 phút; câu hỏi 18); `agent-office start`, `agent-office stop` và cờ tắt có chủ đích;
  - bật lười theo mục 9.2 (cơ chế phục hồi duy nhất vì không có LaunchAgent): kiểm tra `/health` ở hook kế tiếp, khoá nguyên tử, giới hạn tần suất 30 giây giãn dần, tối đa 5 lần (câu hỏi 19);
  - endpoint `GET /health`.
- [ ] Sleep và wake theo mục 5.4 (3-5 giờ):
  - phát hiện nhảy thời gian (chênh lệch đồng hồ thật và đồng hồ đơn điệu), đặt lại bộ đếm ân hạn và offline sau wake;
  - dashboard tự kết nối lại SSE, hiện "đang kết nối lại"; đối chiếu lại trạng thái session và quét lại offset transcript sau wake;
  - mọi quyết định tắt server và "offline" tuân theo quy tắc cứng ở 5.4.
- [ ] Tương thích phiên bản (2-3 giờ):
  - `compat.json` ghi phiên bản Claude Code đã kiểm tra, ngày kiểm tra và kết quả từng kịch bản; README hiển thị bảng này;
  - script `compat-run` chạy bộ kịch bản trên máy với Claude Code thật, có các bước thao tác tay (duyệt, Esc);
  - job CI hằng tuần chạy golden test và so phiên bản mới nhất với `compat.json`, có phiên bản mới thì mở issue. Nguồn lấy phiên bản: ví dụ gói `@anthropic-ai/claude-code` trên npm, cần xác nhận kênh này khớp với bản native;
  - quy trình khi Claude Code cập nhật: chạy `compat-run` → thu fixture mới nếu có khác biệt → sửa parser → cập nhật `compat.json`.

  CI không chạy kịch bản thật được, vì cần đăng nhập, tốn quota và có bước thao tác tay (xem câu hỏi 6).
- [ ] Phát hiện drift: đếm bản ghi và payload không nhận dạng được; bật hoặc tắt banner theo mục 10.9. (1-2 giờ)
- [ ] E2E Playwright với simulator: danh sách agent, chuyển trạng thái, thông báo, banner mất kết nối; tích hợp axe. (3-5 giờ)
- [ ] Chuỗi cung ứng (2-3 giờ):
  - lockfile và pin phiên bản;
  - Renovate hoặc Dependabot;
  - `pnpm audit` và gitleaks trong CI;
  - kiểm tra license của các phụ thuộc;
  - bật 2FA GitHub, bảo vệ nhánh chính (gói Free có tính năng này cho repo public).
- [ ] Môi trường dev cô lập theo mục 9.2 (2-3 giờ):
  - script `dev:up`, `dev:down`, `dev:clean`, `dev:clean-raw`, `cache:clean`;
  - biến `AGENT_OFFICE_HOME=./.dev-data`;
  - cổng cấu hình qua env, báo lỗi khi cổng bận.
- [ ] pnpm và Node (1-2 giờ):
  - gọi `corepack pnpm`, không `corepack enable`;
  - khai báo `packageManager`, `.nvmrc`, `engines.node`;
  - trỏ `COREPACK_HOME`, store của pnpm và `PLAYWRIGHT_BROWSERS_PATH` vào `.cache/`;
  - README dev có phần "Cô lập khi phát triển" và cảnh báo "Không bao giờ đặt hook toàn cục khi phát triển".
- [ ] Hàng rào an toàn chạy trong CI (2-3 giờ):
  - test "không ghi ngoài repo";
  - test tailer chỉ đọc;
  - test hook luôn exit 0 và chạy đúng khi server dev đang tắt;
  - test `dev:clean` không xoá gì ngoài `.dev-data/` và file tạm của dự án.
- [ ] Bật hook cho dự án thật, bước 1 ở mục 9.2 (2-3 giờ):
  - lệnh bật/tắt theo cách chọn ở câu hỏi 14, sao lưu và khôi phục đúng file cũ;
  - danh sách "dự án đã bật hook" trong `AGENT_OFFICE_HOME`;
  - công tắc tắt nhanh mọi hook.

  File dev-isolation đặt công tắc này ở M2, nhưng v3 đưa lên M1 vì tuần dùng thử của M1 đã chạy hook trong dự án thật.

**Xong khi:**
- đã dùng thật 1 tuần, với hook bật theo bước 1 ở mục 9.2 cho dự án chọn ở câu hỏi 13;
- trạng thái khớp nhãn ghi tay ít nhất 99% thời gian trên bộ kịch bản (cách đo ở mục 13);
- overhead hook p95 dưới ngưỡng đã chốt ở M0;
- chế độ danh sách qua được 5-second test;
- E2E, axe, gitleaks và audit đều pass trong CI;
- `compat.json` có phiên bản Claude Code đang dùng, và `compat-run` chạy được;
- server bị kill thì được bật lại ở sự kiện hook kế tiếp, `/health` trả về OK;
- mô phỏng đồng hồ nhảy 8 giờ khi session còn sống: server không tự tắt và không agent nào bị đánh dấu offline sai;
- mở hai, ba session song song: server chỉ tắt khi **tất cả** đã đóng và hết ân hạn; mở lại session trong lúc ân hạn thì không tắt;
- session bị kill hoặc terminal crash (không có `SessionEnd`): server vẫn phát hiện qua kiểm tra tiến trình;
- nhiều hook cùng bắn khi server chết: chỉ có đúng một server được bật;
- `agent-office stop` rồi bắn hook: bật lười không bật lại; mở session mới thì cờ được xoá;
- server chết hẳn (không bật được): hook vẫn `exit 0` và không làm chậm agent; sau 5 lần thất bại thì dừng thử và ghi chẩn đoán;
- thoát session cuối và hết ân hạn: không còn tiến trình `agent-office` nào chạy;
- sleep/wake thật trên máy ít nhất một lần: dashboard tự kết nối lại và trạng thái được đối chiếu lại.
- test "không ghi ngoài repo" và test tailer chỉ đọc pass trong CI;
- tắt hook của một dự án bằng một lệnh thì file cấu hình trở về đúng bản sao lưu (diff rỗng).

### M2: Duyệt quyền từ dashboard (18-30 giờ)

- [ ] MCP server channel trong plugin, kết nối tới server bằng token.
- [ ] Khi thử plugin và channel, chỉ chạy ở mức 2 hoặc 3 (mục 9.2), không cài vào cấu hình chính.
- [ ] Dịch vụ approvals: nonce, TTL, dùng một lần, audit log, công tắc bật/tắt.
- [ ] Panel duyệt theo 10.5:
  - hiện toàn bộ lệnh;
  - nút Cho phép không được focus sẵn;
  - lệnh nguy hiểm phải xác nhận lần hai;
  - xếp hàng khi có nhiều yêu cầu;
  - xử lý các trường hợp "đã xử lý trong terminal" và "hết hạn".
- [ ] Đồng bộ khi terminal trả lời trước: đóng yêu cầu trên dashboard, suy ra từ hook hoặc từ `status: busy`.
- [ ] Dùng phương án dự phòng theo ADR-002 nếu channel không dùng được.
- [ ] Bộ test bảo mật tự động trong CI (3-5 giờ), gồm các trường hợp:
  - request sai `Host`, sai `Origin`;
  - thiếu hoặc sai CSRF token;
  - dùng lại nonce, nonce đã hết hạn;
  - token của plugin sai;
  - verdict cho `request_id` không tồn tại;
  - SSE không kèm cookie.
- [ ] (Tuỳ chọn) Extension VS Code nhỏ: bấm vào bàn thì focus đúng terminal, bằng cách ghép `pid` với `Terminal.processId`. Cần cho các câu hỏi mà dashboard không trả lời hộ được.

**Xong khi:**
- duyệt và từ chối được với 3 session song song;
- qua được các test race với terminal;
- bộ test bảo mật tự động pass trong CI;
- đã viết xong `docs/threat-model.md`, và mọi đường duyệt đều phải có token + nonce.

### M3: Văn phòng pixel art (42-74 giờ)

- [ ] Thiết kế D3 (10.11):
  - moodboard, bảng màu, kích thước tile, góc nhìn;
  - vẽ mẫu 1 nhân vật, 1 bàn và 3 trạng thái, duyệt xong mới vẽ phần còn lại;
  - chốt nguồn asset và license.
- [ ] PixiJS v8 + bản đồ Tiled; sprite sheet xuất từ Aseprite; UI React đặt đè lên canvas.
- [ ] Nhân vật và animation cho từng trạng thái. Subagent chỉ hiện trong timeline.
- [ ] Mỗi bàn hiển thị: dự án, `ai-title`, hành động hiện tại, 5 hành động gần nhất, thời gian, token.
- [ ] Bấm nhân vật để mở timeline; nhân vật giơ tay thì mở panel duyệt.
- [ ] Hỗ trợ `prefers-reduced-motion`; không chỉ dựa vào màu; có chế độ danh sách; dừng render khi tab ẩn.
- [ ] Demo tĩnh trên GitHub Pages, chạy simulator ngay trong trình duyệt, chỉ dùng fixture tổng hợp.
- [ ] ADR-006: renderer (PixiJS v8, tách DOM và canvas). (1 giờ)
- [ ] E2E và axe cho phần DOM của chế độ văn phòng; kiểm tra lại chế độ danh sách vẫn đạt. (1-3 giờ)

**Xong khi:**
- chế độ văn phòng qua được 5-second test (đúng ít nhất 9/10 lần);
- đạt 60 fps với tối đa 10 agent;
- demo tĩnh chạy được.

### M3.5: Hardening và phát hành v0.1 (24-39 giờ)

- [ ] Quy trình phát hành (2-3 giờ):
  - semver, changelog, tag git;
  - `version` trong `plugin.json` khớp với tag;
  - quy ước commit (Conventional Commits);
  - release checklist dùng lại cho mọi bản phát hành.
- [ ] Nâng cấp (3-5 giờ):
  - `schema_version` cho event log và DB;
  - migration SQLite, sao lưu DB trước khi migrate;
  - test nâng cấp từ bản build trước (snapshot cuối M3) lên v0.1.
- [ ] Rollback: cài lại phiên bản plugin trước và khôi phục bản sao lưu DB. Viết thành tài liệu và thử thật một lần. (1 giờ)
- [ ] Gỡ cài đặt sạch (2-3 giờ):
  - script hoặc checklist gỡ theo thứ tự ngược: plugin (bước 2), hook ở từng dự án (bước 1); khôi phục lệnh statusline cũ; xoá shim, token, dữ liệu và log;
  - lệnh gỡ plugin mặc định xoá `${CLAUDE_PLUGIN_DATA}`; DB nằm ngoài thư mục đó thì phải tự xoá;
  - kiểm tra sau khi gỡ: không còn hook nào gọi tới server, statusline vẫn chạy, không còn tiến trình `agent-office` nào đang chạy.
- [ ] Kiểm thử cài đặt và gỡ cài đặt từ đầu trên một tài khoản macOS mới (mức 3), đo thời gian cài. (1-2 giờ)
- [ ] Kiểm thử luồng nâng cấp bước 1 → 2 ở mục 9.2, mỗi bước hoàn tác được bằng một lệnh. (2-3 giờ)
- [ ] Soak test (2-4 giờ chuẩn bị, sau đó để chạy nền):
  - server + simulator chạy liên tục 3 ngày;
  - đo RAM, kích thước SQLite, số kết nối SSE, số file descriptor;
  - ngưỡng đề xuất: baseline là RSS trung vị sau 30 phút khởi động; trung vị mỗi giờ không vượt baseline quá 20% và không có xu hướng tăng đều; số kết nối SSE không tăng sau các lần reconnect; DB không vượt giới hạn đã đặt;
  - xen vào các chu kỳ sleep/wake (thật hoặc mô phỏng) trong 3 ngày chạy.
- [ ] Chạy `compat-run` đầy đủ trên phiên bản Claude Code mới nhất ngay trước khi phát hành. (1-2 giờ)
- [ ] Hồ sơ mã nguồn mở (2-3 giờ):
  - `SECURITY.md`: cách báo lỗ hổng riêng tư (quan trọng vì có chức năng duyệt quyền);
  - issue/PR template, `CODE_OF_CONDUCT.md`;
  - tuyên bố không liên kết với Anthropic; kiểm tra cách dùng tên "Claude" và logo;
  - chính sách telemetry: không thu thập gì, không gửi dữ liệu ra ngoài máy.
- [ ] Tài liệu người dùng (3-5 giờ): hướng dẫn cài đặt từng bước; troubleshooting và FAQ (hook không gửi sự kiện, channel không bật, quota không hiện…); trình duyệt được hỗ trợ (theo câu hỏi 4).
- [ ] Gói chẩn đoán đã redact: nút xuất ở trang Chẩn đoán, dùng để đính kèm vào issue. (2-3 giờ)
- [ ] README (3-5 giờ):
  - GIF, sơ đồ, link ADR, số liệu đo (overhead, độ chính xác), hạn chế, bảng tương thích;
  - marketplace plugin trên GitHub;
  - LICENSE (theo câu hỏi 16), CREDITS, CONTRIBUTING.

**Xong khi:**
- release checklist đã đi hết, không bỏ mục nào;
- test nâng cấp và test gỡ cài đặt đều pass;
- soak test đạt ngưỡng;
- trên một tài khoản macOS mới (mức 3), cài theo hướng dẫn mất không quá 15 phút (đề xuất); gỡ xong không còn file nào của dự án, trừ transcript do Claude Code tự ghi;
- mỗi bước 1 → 2 ở mục 9.2 đều hoàn tác được bằng một lệnh.

### Sau v0.1: Ra mắt và hỗ trợ (4-6 giờ)

- [ ] Ra mắt và bài viết case study (2-3 giờ):
  - nơi đăng: Reddit, X, cộng đồng Claude Code (theo v1);
  - nội dung bài: vấn đề cần giải quyết, kiến trúc, các quyết định trong ADR, số đo (overhead của hook, độ chính xác trạng thái), threat model của chức năng duyệt quyền;
  - kèm GIF và link demo tĩnh.

  Bài này dùng luôn cho hồ sơ xin việc.
- [ ] Quy trình triage issue (1-2 giờ):
  - bộ nhãn `bug`, `compat`, `security`, `ux`, `question`;
  - thời gian phản hồi mục tiêu: đề xuất 7 ngày, vì đây là dự án cá nhân.
- [ ] Chính sách hỗ trợ phiên bản (1 giờ): hỗ trợ các phiên bản Claude Code có trong `compat.json`; phiên bản mới được kiểm tra trong vòng 7 ngày (đề xuất).

**Xong khi:**
- bài ra mắt đã được đăng;
- có bộ nhãn và template triage;
- chính sách hỗ trợ đã ghi trong README.

### M4: Quota và lịch sử (15-25 giờ)

- [ ] Ảnh chụp quota theo thời gian, dự báo giờ chạm giới hạn, phân bổ ước tính theo session/dự án.
- [ ] Lịch sử nhiệm vụ theo `promptId`; biểu đồ theo ngày và dự án; chính sách giữ dữ liệu; xuất dữ liệu.

**Xong khi** trả lời được hai câu: "hôm nay dự án nào tốn quota nhất" và "bao giờ hết quota 5 giờ".

### M5: Đa công cụ (21-37 giờ)

- [ ] Interface `AgentAdapter` (kind, capabilities, start/stop) sinh ra `NormalizedEvent`. UI ẩn những tính năng mà adapter không hỗ trợ.
- [ ] Codex CLI: hooks (`~/.codex/hooks.json`) và rollout JSONL trong `~/.codex/sessions/`. Cần xác nhận tên sự kiện và cờ bật.
- [ ] Cursor: `~/.cursor/hooks.json` (`beforeShellExecution`, `afterFileEdit`, `stop`…).
  - Diễn đàn Cursor có báo hook không chạy hoặc không chặn được, nên cần thử kỹ.
  - Xem thêm trang "third-party hooks".
- [ ] Thêm Codex và Cursor vào `compat.json` và `compat-run`. (1-2 giờ)

**Xong khi** cùng một văn phòng hiển thị đúng 1 session Claude Code và 1 session Codex.

### Backlog

- Hình "thực tập sinh" cho subagent trong văn phòng.
- Gửi prompt từ dashboard qua channel.
- Tóm tắt nhiệm vụ: thử dùng `away_summary` có sẵn trước khi tính đến gọi LLM.
- Âm thanh, theme.
- Nhảy tới đúng terminal, nếu chưa làm ở M2.
- OpenTelemetry.

## 12. Rủi ro và cách giảm

| Rủi ro | Cách giảm |
|---|---|
| Định dạng hook, transcript, agent view, channel đổi theo phiên bản (trên máy đã thấy 2 phiên bản chỉ trong vài ngày) | Cô lập trong adapter; golden test với fixture; `compat.json` và `compat-run`; phát hiện drift khi đang chạy (10.9); gặp dạng lạ thì ghi log chứ không crash |
| Channel còn là research preview và cần cờ dev | Tách chức năng duyệt khỏi phần giám sát; có phương án dự phòng theo ADR-002; có công tắc tắt |
| Chức năng duyệt bị lạm dụng (CSRF, DNS rebinding, tiến trình lạ) | Các biện pháp ở mục 6, threat model, test bảo mật trong CI |
| Hook làm chậm hoặc làm hỏng agent | Dùng `async`/`http`, không in stdout, exit 0, đặt `timeout`; benchmark overhead |
| Poll `claude agents --json` tốn CPU | Poll thích ứng; đo ở M0; chuyển sang liveness của MCP server nếu ổn định |
| Số liệu token và quota sai | Dedupe theo `message.id`; ưu tiên số do Claude Code tự tính; ghi rõ là "ước tính" |
| Sa đà vào pixel art | M1 đã có UI danh sách dùng được ngay; vẽ theo vòng (placeholder → v1 → chỉnh sửa); giới hạn số animation |
| Asset vi phạm license | Chỉ dùng CC0 hoặc tự vẽ; có `assets/CREDITS.md`; không lấy asset của dự án khác |
| Trùng với agent view và các dự án có sẵn | Bám vào 5 điểm khác biệt ở mục 2; công bố số đo |
| Lộ dữ liệu nhạy cảm | Cắt payload, redact, file quyền 0600, chính sách giữ dữ liệu; fixture tổng hợp và kiểm tra trong CI |
| Lộ dữ liệu qua lịch sử git (không xoá được) | Dữ liệu thô trong `.dev-raw/` (ngoài git); scrub có test; quét secret ở pre-commit, gitleaks ở CI; làm xong trước commit đầu tiên |
| Phụ thuộc bị chèn mã độc (plugin chạy với quyền của bạn và gửi được verdict) | Lockfile, pin phiên bản, Renovate/Dependabot, audit; bundle plugin để không phải cài phụ thuộc lúc chạy |
| Cập nhật plugin hoặc đổi phiên bản Node (nvm) làm hỏng đường dẫn mà hook gọi tới | Shim ổn định nằm ngoài thư mục plugin (mục 9.2); shim kiểm tra đường dẫn Node và ghi lỗi rõ ràng; spike S8, ADR-007 |
| Gỡ plugin làm hỏng statusline của bạn | Script gỡ cài đặt khôi phục lệnh statusline cũ; test gỡ cài đặt ở M3.5 |
| CI không chạy được kịch bản thật (cần đăng nhập, tốn quota, có bước thao tác tay) | `compat-run` chạy trên máy; CI chỉ theo dõi phiên bản mới và chạy golden test; smoke test bằng API key là tuỳ chọn (câu hỏi 6) |
| Việc phát triển ảnh hưởng tới các dự án khác trên máy (hook lỗi, ghi file, tiến trình nền) | Các mức cô lập và quy tắc cứng ở mục 9.2; test "không ghi ngoài repo" và test tailer chỉ đọc; công tắc tắt nhanh mọi hook |
| Cache của công cụ (pnpm, Playwright, corepack) ghi vào thư mục dùng chung với dự án khác | Trỏ vào `.cache/` trong repo (mục 9.2) |
| Server tắt nhầm hoặc agent bị đánh dấu offline sai sau khi máy sleep (đồng hồ nhảy) | Quyết định tắt và offline dựa vào session sống thật, không dựa vào im lặng theo đồng hồ; phát hiện nhảy thời gian rồi đặt lại bộ đếm; bật lười làm lưới an toàn; test mô phỏng nhảy 8 giờ (mục 5.4, 9.2) |
| Nhiều hook cùng bật server khi server chết, sinh nhiều server hoặc dồn dập tiến trình | Khoá nguyên tử, giới hạn tần suất giãn dần, tối đa 5 lần rồi dừng và ghi chẩn đoán (mục 9.2) |
| Server chết giữa session và không có gì bật lại (vì không dùng LaunchAgent) | Lớp bật lười ở hook kế tiếp; trang Chẩn đoán báo trạng thái; nếu bỏ lớp bật lười (câu hỏi 19) thì chấp nhận dashboard mù đến session sau |
| Dữ liệu sandbox lẫn vào lịch sử Claude Code của bạn (transcript, danh sách `/resume`) | Đặt tên sandbox rõ ràng; chấp nhận điều này, không tự xoá gì trong `~/.claude/` |
| Dự án kéo dài rồi bị bỏ dở | Board, review hằng tuần, quy tắc cắt phạm vi có thứ tự sẵn (11.1) |

## 13. Đo thành công

- Overhead hook trên mỗi tool call, p50/p95. Đặt mục tiêu sau khi đo ở M0.
- Độ chính xác trạng thái: so với **nhãn ghi tay**, đạt ít nhất 99% thời gian trên bộ kịch bản. Nhãn ghi tay nghĩa là trong lúc chạy kịch bản, bạn bấm phím để đánh dấu lúc trạng thái thật thay đổi.
  - Không dùng `claude agents --json` làm chuẩn, vì nó cũng là đầu vào của reducer.
  - Báo cáo thêm độ chính xác khi chỉ dùng hooks + transcript, để thấy mỗi nguồn đóng góp bao nhiêu.
- Từ lúc agent cần duyệt đến khi có thông báo: dưới 1 giây.
- Thời gian trung bình từ khi có thông báo đến khi đã duyệt. Đây là chỉ số dùng hằng ngày.
- 5-second test: nhìn 2 giây là chỉ đúng agent đang cần mình, ít nhất 9/10 lần (10.11).
- RAM/CPU của server lúc rảnh; FPS của văn phòng.
- Số kịch bản golden; độ phủ test của reducer.
- Tỉ lệ kịch bản đạt trên phiên bản Claude Code mới nhất: 100% trước mỗi bản phát hành.
- Thời gian từ lúc Claude Code ra phiên bản mới tới khi chạy xong `compat-run`: đề xuất không quá 7 ngày.
- Soak test 3 ngày: RAM, dung lượng DB và số kết nối SSE nằm trong ngưỡng đặt ở M3.5.
- Cài đặt trên máy sạch không quá 15 phút. Sau khi gỡ cài đặt, không còn hook nào gọi tới server.
- Số file bị ghi ra ngoài repo khi chạy dev với simulator: 0 (test tự động).
- Tắt hook của một dự án bằng một lệnh: file cấu hình trở về đúng bản sao lưu.
- Số lần server tắt nhầm trong kịch bản mô phỏng đồng hồ nhảy và sleep/wake: 0 (test tự động).
- Số server chạy đồng thời khi nhiều hook bật cùng lúc: đúng 1.
- Sau khi thoát session cuối và hết ân hạn: 0 tiến trình `agent-office` còn chạy (test tự động).
- Thứ yếu: số sao GitHub, issue/PR từ người khác.
- Xin việc: bài viết case study và demo đã sẵn sàng để gửi kèm hồ sơ.

**Điểm để kể khi phỏng vấn:**
- hợp nhất nhiều nguồn sự kiện không tin cậy (event sourcing + đối chiếu);
- overhead có số đo cụ thể;
- threat model cho chức năng duyệt quyền chạy cục bộ;
- render pixel art hiệu năng cao;
- kiến trúc adapter.

## 14. Câu hỏi còn mở

| # | Câu hỏi | Hạn chốt | Ảnh hưởng |
|---|---|---|---|
| 1 | Có mở mã nguồn công khai không? | **Đã chốt (15/11): có** | Giữ hồ sơ mã nguồn mở ở M3.5 và phần ra mắt; dữ liệu phải được scrub trước mọi lần push |
| 2 | Bạn có hay dùng subagent hoặc background session (`/bg`, `claude agents`) không? | **Đã chốt (15/11): không dùng** | S1 chỉ giữ một kịch bản subagent để kiểm tra độ bền; hình "thực tập sinh" chuyển vào backlog |
| 3 | Ngôn ngữ giao diện: tiếng Việt, tiếng Anh hay cả hai? | Trước M1 | Ảnh hưởng mọi component; i18n khó thêm về sau |
| 4 | Dùng tab trình duyệt hay PWA? Trình duyệt chính là gì (đề xuất Chrome, cần xác nhận)? | Trước M1 | Manifest, thông báo và Badging API ở M1; tài liệu về trình duyệt được hỗ trợ |
| 5 | Có thêm phát hiện session bằng quét tiến trình vào M1 không? | Trước M1 | App thấy được session cả khi chưa cài plugin; M1 thêm khoảng 3-5 giờ (chưa tính trong 11.2) |
| 6 | Có chạy smoke test thật trong CI bằng API key không (tốn phí theo token)? | Trước M1 | Nếu không, kiểm tra tương thích chỉ chạy tay trên máy bằng `compat-run` |
| 7 | Vượt ước tính bao nhiêu thì kích hoạt quy tắc cắt phạm vi (đề xuất 30%)? | Trước M1 | Quy tắc ở 11.1 |
| 8 | Nhân vật đi lại được, hay chỉ có animation tại chỗ? | Trước D3 (đầu M3) | Chênh khoảng 10-20 giờ |
| 9 | Phong cách pixel: tile 16×16 hay 32×32; nhìn từ trên xuống hay góc 3/4; tự vẽ hay dùng gói CC0? | Trước D3 (đầu M3) | Art direction |
| 10 | Đặt dự án sandbox ở đâu? | **Đã chốt (15/11): `~/agent-office-sandbox/`** | Ngoại lệ đã được đồng ý của ràng buộc "mọi dữ liệu dev trong repo" (mục 9.2) |
| 11 | Dùng mức cô lập nào cho các spike M0: mức 1 hay mức 2? | **Đã chốt (15/11): mức 1 kèm `--setting-sources project,local`; spike cần plugin dùng `--plugin-dir`; mức 2 khi thật cần** | Phụ thuộc kết quả kiểm chứng `CLAUDE_CONFIG_DIR` và `--plugin-dir`. File dev-isolation đề xuất hạn "trước M0", nhưng câu này cần kết quả của S0 |
| 12 | Có cần tài khoản macOS riêng hoặc máy ảo cho kiểm thử cài đặt (mức 3) không? | Trước M3.5 | Thời gian chuẩn bị; tiêu chí "cài không quá 15 phút" ở M3.5 |
| 13 | Dự án thật nào được bật hook đầu tiên? | Trước tuần dùng thử của M1 | Nên chọn dự án ít quan trọng. File dev-isolation đề xuất "sau khi qua M1", nhưng "Xong khi" của M1 đã cần dùng thật 1 tuần |
| 14 | Bước 1 bật hook bằng cách nào: ghi `.claude/settings.local.json` của dự án, hay mở Claude Code qua `scripts/claude-ao` (không ghi gì vào dự án)? | Trước tuần dùng thử của M1 | Cách thứ hai không đụng file của dự án; S0 đã xác nhận hook nạp qua `--settings` gộp với hook của dự án và plugin, nên dùng được |
| 15 | Có đưa LaunchAgent opt-in vào v0.1 không, hay để bản sau? | **Đã chốt (16/11): không dùng LaunchAgent ở tất cả giai đoạn** | M3.5 bớt 3-5 giờ (đã tính ở 11.2); bỏ bước 3 của lộ trình bật hook; shim chỉ cho hook |
| 16 | License: MIT (đề xuất) hay license khác? | **Đã chốt (15/11): MIT** | Ghi vào `LICENSE` và README. Asset có license riêng, ghi trong `CREDITS.md` |
| 17 | Công khai repo từ khi nào: ngay từ đầu (M0/M1), hay khi phát hành v0.1? | **Đã chốt (15/11): công khai từ M0** | Công khai sớm thì có lịch sử commit để giới thiệu, nhưng mọi commit lộ ra ngay, nên vệ sinh dữ liệu phải chạy từ commit đầu tiên. Công khai ở v0.1 thì có thời gian dọn dẹp, nhưng phải quét secret toàn bộ lịch sử git trước khi mở |
| 18 | Thời gian ân hạn trước khi tự tắt server: 5 phút (đề xuất) hay 30 phút, hay số khác? | Trước M1 (hiệu chỉnh sau S9) | Thay giá trị "30 phút" ở các mục 9.2, M1 và 16. v3.1 đang dùng giá trị đề xuất 5 phút |
| 19 | Giữ lớp bật lười kèm khoá nguyên tử và giới hạn tần suất không? | Trước M1 | Đề xuất giữ vì là cơ chế phục hồi duy nhất khi không có LaunchAgent; nếu bỏ thì bỏ các bullet tương ứng ở M1 và mục 9.2 (−1-2 giờ). v3.1 đang giữ theo đề xuất |
| 20 | Session để mở qua đêm mà không làm gì có làm server tự tắt không? | Trước M1 | Đề xuất không (quy tắc đơn giản); nếu có, phải xử lý đồng hồ nhảy chặt hơn. v3.1 đang theo đề xuất |

## 15. Bước tiếp theo

1. Đã xong: câu hỏi 1, 2 và 10 đã chốt ngày 15/11/2026.
2. Tạo repo: chạy `git init`; thêm `.gitignore` cho `.dev-data/`, `.dev-raw/`, `.cache/`; cài công cụ quét secret qua pnpm ở pre-commit; rồi mới commit lần đầu.
3. Làm S0 (mức cô lập, sandbox tại `~/agent-office-sandbox/`) trước. Sau đó chạy các spike còn lại theo time-box, ưu tiên S2 (`claude agents --json`), S3 (channel) và S6 (overhead của hook).
4. Tổ chức buổi chốt go/no-go và ghi vào ADR-008.

## 16. Những chỗ chưa chắc chắn

Các điểm dưới đây chưa được đối chiếu đầy đủ với tài liệu hiện tại, hoặc chưa được thử thực tế.

| Điểm | Xác nhận ở |
|---|---|
| `CLAUDE_CONFIG_DIR` cô lập được gì (cấu hình, plugin, transcript, đăng nhập) | Đã kiểm ở S0 (`docs/spikes/s0-isolation.md`) |
| Phạm vi cô lập thật của `--plugin-dir` | Đã kiểm ở S0 (`docs/spikes/s0-isolation.md`) |
| Hook nạp qua `--settings` có được gộp với hook khác không | Đã kiểm ở S0 (`docs/spikes/s0-isolation.md`) |
| Statusline đặt ở cấp dự án được không; session sandbox có nạp `CLAUDE.md` ở thư mục cha không | Đã kiểm ở S0 (`docs/spikes/s0-isolation.md`) |
| `claude agents --json` có khởi động supervisor không | Đã kiểm ở S2: không (`docs/spikes/s2-agents-json.md`) |
| MCP server của channel làm gì khi server của app tắt | Đã kiểm ở S3: channel im lặng không gây hại, terminal vẫn duyệt được (`docs/spikes/s3-channel.md`) |
| Cách ghép yêu cầu từ `PermissionRequest` với yêu cầu từ channel | Đã kiểm ở S1 và S3: ghép theo `session_id` (MCP server có `CLAUDE_CODE_SESSION_ID`), `tool_name`, `input_preview` parse ra đúng `tool_input`, thời gian cách nhau khoảng 100 ms. Còn input dài bị cắt: M2 |
| Shim và đường dẫn Node có chứa số phiên bản | S8 |
| Gói npm `@anthropic-ai/claude-code` có phát hành cùng nhịp với bản native không | M1 |
| Corepack không còn đi kèm từ Node 25 | Khi nâng Node |
| Các ngưỡng do AI đề xuất: 30% để cắt phạm vi; ân hạn 5 phút trước khi tự tắt server (câu hỏi 18); chu kỳ kiểm tra tiến trình 30-60 giây; ngưỡng phát hiện nhảy thời gian (hơn 3 lần chu kỳ); bật lười: cách nhau 30 giây, giãn dần tới 5 phút, tối đa 5 lần; 15 phút cài đặt; soak test: RSS trung vị không vượt baseline quá 20%; phát hiện phiên bản mới trong 24 giờ và cập nhật `compat.json` trong 7 ngày | Chủ dự án duyệt; hiệu chỉnh sau S9 và soak test |
| `SessionStart` có chạy khi resume; payload có pid; session crash/kill có `SessionEnd` không | S9 (S1 đã trả lời một phần: có khi resume; `ppid` của hook là pid; đóng terminal có `SessionEnd`; còn `kill -9`) |
| Đồng hồ đơn điệu (`process.hrtime`/`performance.now`) và timer của Node có dừng khi máy ngủ trên macOS không | S9 |
| Hook gọi khi server tắt hoặc đang bật lại có chặn agent không | Đã kiểm ở S6 (khi server tắt): không chặn; server treo thì hook `http` chặn tới hết timeout (`docs/spikes/s6-hook-overhead.md`). Phần "đang bật lại": S9 |

## Tài liệu tham khảo

- Claude Code: [Hooks](https://code.claude.com/docs/en/hooks) · [Agent view](https://code.claude.com/docs/en/agent-view) · [Channels](https://code.claude.com/docs/en/channels) · [Channels reference](https://code.claude.com/docs/en/channels-reference) · [Remote Control](https://code.claude.com/docs/en/remote-control) · [Plugins reference](https://code.claude.com/docs/en/plugins-reference) · [Statusline](https://code.claude.com/docs/en/statusline) · [Monitoring (OTel)](https://code.claude.com/docs/en/monitoring-usage)
- Codex: [Hooks](https://developers.openai.com/codex/hooks) · [Rollout files (bên thứ ba)](https://codex.danielvaughan.com/2026/04/29/codex-cli-rollout-files-session-recording-replay-audit-trails/)
- Cursor: [Hooks](https://cursor.com/docs/agent/hooks) · [Third-party hooks](https://cursor.com/docs/agent/third-party-hooks) · [Báo lỗi trên diễn đàn](https://forum.cursor.com/t/hook-ask-output-not-stopping-agent/149002)
- Dự án tương tự: [pixel-agents](https://awesome.ecosyste.ms/projects/github.com%2Fpablodelucca%2Fpixel-agents) · [pixel-agent-desk](https://github.com/Mgpixelart/pixel-agent-desk) · [PixelOffice](https://github.com/KalebKE/PixelOffice) · [claude-office](https://cdn.jsdelivr.net/gh/paulrobello/claude-office@main/README.md) · [agents-observe](https://awesome.ecosyste.ms/projects/github.com%2Fsimple10%2Fagents-observe) · [ccmon](https://github.com/appaquet/ccmon)

## Ghi chú cập nhật v3.1 (16/11/2026)

**Đã làm theo `agent-office-v3-patch-lifecycle.md`:**
- P1: thêm hai hàng ("Vòng đời server", "LaunchAgent") vào bảng 0.1 và sửa các hàng "Vận hành server nền", "Khởi động server", "Bật hook cho dự án thật".
- P2: hàng "Khởi động" ở mục 8.
- P3: câu mở đầu 5.3, ghi chú sleep không khởi động lại tiến trình, thêm mục 5.4 "Sleep và wake".
- P4: phạm vi "không dùng LaunchAgent" ở mục 3 và 9.2; bỏ bước 3 của lộ trình bật hook; thay mục con "Khởi động server và LaunchAgent" bằng "Khởi động và tắt server (không dùng LaunchAgent)".
- P5: hai hàng rào an toàn mới.
- P6: spike S9 (bảng và checklist); sửa bullet S8, ADR-007 và dòng `SessionStart` ở M1.
- P7, P8: vận hành server, bật lười, sleep/wake và tiêu chí "Xong khi" của M1.
- P9, P10: gỡ LaunchAgent opt-in khỏi M3.5, gỡ cài đặt, kiểm thử nâng cấp 1 → 2, soak test có sleep/wake.
- P11, P13: một hàng rủi ro sửa, ba hàng rủi ro mới, ba chỉ số đo mới.
- P12: tính lại 11.2 (198-325 giờ; tới v0.1 158-257 giờ), tiêu đề M0, M1, M3.5 và thời gian dự kiến; đã kiểm tra số học.
- P14: đóng câu hỏi 15; thêm câu hỏi 18-20. P15: hàng ngưỡng và ba hàng chưa kiểm chứng.

**Thêm ngoài patch:**
- Bảng tham số cấu hình (mục 8 của `agent-office-server-lifecycle.md`) đặt trong mục con mới ở 9.2.
- Hai tiêu chí "Xong khi" của M1 lấy từ mục 9 của file vòng đời mà patch chưa liệt kê: session bị kill không có `SessionEnd`, và server chết hẳn.
- Time-box tổng của spike M0 tính lại thành 13,5 giờ (thêm S9).
- Cập nhật các nhãn đã cũ theo kết quả S0, S1, S2: mức 2 và `--settings` (mục 9.2), supervisor của `claude agents --json`, câu hỏi 14, nguồn pid (`ppid` của hook) và một phần câu hỏi của S9.

**Chỗ chưa chắc:**
- Ba ô quyết định A, B, C của patch còn trống, nên câu hỏi 18-20 đang mở; v3.1 dùng giá trị đề xuất (ân hạn 5 phút, giữ bật lười, không tự tắt khi để qua đêm).
- Mọi con số của vòng đời server là đề xuất chưa đo, hiệu chỉnh sau S9 và soak test.
- Việc "đo RAM server khi rảnh và RAM tab dashboard" (mục 10 của file vòng đời) chưa đưa vào M0 vì chưa có server; đo ở M1 hoặc soak test.
- Bảng 0.1 vẫn mang tiêu đề "Thay đổi so với v2"; hai hàng của v3.1 được thêm vào đó theo patch.
