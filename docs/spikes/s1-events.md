# S1: Ghi sự kiện, chạy kịch bản

Spike S1 của M0 (issue #4, time-box 3 giờ, dùng khoảng 1 giờ). Thử ngày 15-16/11/2026 với Claude Code
2.1.325, theo mức cô lập đã chốt ở câu hỏi 11: sandbox `~/agent-office-sandbox/`, chạy
`claude --model haiku --setting-sources project,local --permission-mode default`.

## Cách thu

- **Hooks:** 26 sự kiện đăng ký trong `.claude/settings.local.json` của sandbox, đều `async: true`, ghi
  bằng `scripts/spikes/log-event.ts`. `SessionEnd` có thêm một bản đồng bộ để so. Không đăng ký
  `WorktreeCreate`/`WorktreeRemove` (hook thay cách tạo worktree), `MessageDisplay` (output thay text
  hiển thị), `FileChanged` (cần danh sách file), `Setup` (chỉ chạy với `--init`), `Elicitation*` (MCP).
- **`claude agents --json`:** `scripts/spikes/poll-agents.sh` poll mỗi giây suốt buổi.
- **Transcript:** sao chép (chỉ đọc) theo `transcript_path` của hook sau khi chạy xong.
- **Statusline:** lệnh statusline của sandbox ghi JSON nhận được.

22 phiên tương tác do chủ dự án thao tác tay, cộng 1 phiên headless (`s1-00`). Thứ tự sự kiện lấy theo
`startedAt` (thời điểm tiến trình hook bắt đầu), vì hook `async` ghi xong không theo thứ tự.

## Kịch bản

| Kịch bản | Diễn ra | Ghi chú |
|---|---|---|
| 01 duyệt quyền | Bash hỏi quyền, chọn Yes, để yên 60 giây | Lần đầu chạy ở chế độ `auto` nên không hỏi quyền (giữ lại làm fixture `-auto-mode`) |
| 02 từ chối quyền | Chọn No | Có thêm một lần ở chế độ `auto` |
| 03 Esc khi đang nghĩ | Lần 1 Claude gọi Write nên Esc rơi vào hộp hỏi quyền; lần 2 Esc khi đang trả lời | Có cả hai trường hợp |
| 04 Esc khi Bash chạy | `sleep 30 && …` bị chặn sẵn; Claude chuyển sang chạy nền. Làm lại bằng `ping -c 30` ở tiền cảnh, Esc sau 5 giây | 4 phiên: a (chạy nền, Esc), b (chạy nền, có `<task-notification>`), c (bị chặn), d (Esc khi đang chạy) |
| 05 Bash chạy lâu | `ping -c 20` sau khi duyệt | |
| 06 nhiều tool song song | 3 Read trong một lượt | |
| 07 subagent | Agent tool chạy subagent `Explore` ở chế độ nền | |
| 08 AskUserQuestion | Chọn một đáp án | |
| 09 plan mode | Duyệt plan, phiên chuyển sang `auto` và đổi model (Sonnet lập plan, Haiku thực hiện) | |
| 10 `/compact` | | |
| 11-12 `/clear`, `--continue` | `--continue` được mở hai lần | |
| 13 tool lỗi | `ls` thư mục không tồn tại | |
| 14 đóng tab đột ngột | Đóng terminal lúc đang hỏi quyền (chưa duyệt) | |
| 15 2 session cùng thư mục | | |

## Đối chiếu bảng ánh xạ ở mục 4

| Hook / nguồn → `type` | Kết quả | Ghi chú |
|---|---|---|
| `SessionStart` → `session_start` | ✓ | Thấy `startup`, `resume`, `clear`, `compact`. `fork` chưa thấy |
| `UserPromptSubmit` → `prompt` | **Sửa** | Cũng chạy cho thông báo xong việc của tác vụ nền và subagent: `prompt` bắt đầu bằng `<task-notification>`. Đó không phải prompt của người dùng |
| `PreToolUse` → `tool_start` | ✓, có ngoại lệ | Có `tool_use_id`. Lệnh bị chặn ngay ở bước kiểm tra (vd `sleep 30 && echo`) **không có `PreToolUse`**; chỉ có `PostToolBatch` với `tool_response` là `<tool_use_error>Blocked…` |
| `PostToolUse` / `PostToolUseFailure` → `tool_end` | ✓, có ngoại lệ | Lỗi lệnh có `PostToolUseFailure` với `error` và `is_interrupt: false`. **Bị từ chối hoặc Esc khi tool đang chạy thì không có cả hai**; chỉ biết qua transcript hoặc `agents --json` |
| `PostToolBatch` → `tools_batch_end` | ✓ | Có `tool_calls[]` với `tool_use_id` và `tool_response`, kể cả tool bị chặn, nên dùng để đóng tool được |
| `PermissionRequest` → `permission_request` | **Sửa** | Chạy cùng lúc với `PreToolUse`, không có `tool_use_id`, có `tool_name` và `tool_input`. **Cũng chạy cho `AskUserQuestion`** (`agents --json`: `input needed`) và **`ExitPlanMode`** (`permission prompt`) |
| `Notification` `permission_prompt` → `permission_request` | **Sửa** | Chỉ đến khi hộp hỏi quyền chưa được trả lời sau khoảng 6 giây (3 trên 9 lần `PermissionRequest`, kể cả lần duyệt plan), nên không dùng làm tín hiệu chính |
| `permission_resolved` (suy ra) | ✓ | Duyệt: `agents --json` sang `busy` trong ~1 giây, rồi `PostToolUse`. Từ chối: không có hook nào, `idle` + dấu trong transcript |
| `Notification` `idle_prompt` → `waiting_input` | **Sửa** | Đến 60 giây sau `Stop` khi không ai gõ gì. Agent đã xong lượt, không hỏi gì; nên là `done`/`idle`, không phải `needs_input` |
| `Notification` `elicitation_dialog` | chưa xác nhận | Cần MCP server có elicitation |
| `Stop` → `stop` | ✓, có ngoại lệ | Có `background_tasks` (shell hoặc subagent đang chạy) và `last_assistant_message`. **Không có `Stop` khi từ chối, khi Esc, khi đóng terminal.** Ở `-p`, hook `async` của `Stop` bị huỷ vì tiến trình thoát ngay |
| `StopFailure` → `stop_failure` | chưa xác nhận | Không tái hiện được lỗi rate limit hay quá tải |
| `PreCompact` / `PostCompact` → `compact_*` | ✓ | `trigger: manual`; sau đó `SessionStart` `source: compact`, cùng `session_id`. Auto-compact chưa thấy |
| `SubagentStart` / `SubagentStop` → `subagent_*` | ✓, có ngoại lệ | Subagent thật có `agent_id`, `agent_type`; tool của subagent mang `agent_id`. **Có `SubagentStop` "nội bộ"** (4 lần, sau `Stop` hoặc compact): không có `SubagentStart`, `agent_type` rỗng. Bỏ qua |
| `SessionEnd` → `session_end` | ✓ | `prompt_input_exit`, `clear`, `other` (đóng terminal, và `-p`). Bản `async` và bản đồng bộ đều đến đủ 24/24 lần |
| Transcript: dấu ngắt → `interrupted` | ✓ | Esc khi đang nghĩ: `[Request interrupted by user]`. Từ chối **và** Esc khi tool đang chạy: cùng `tool_result` "The user doesn't want to proceed…" + `[Request interrupted by user for tool use]`, không phân biệt được bằng text |
| Transcript: `usage` → `usage` | ✓ | 57 bản ghi assistant có `usage` nhưng chỉ 42 `message.id`: phải dedupe |
| Transcript: `ai-title` → `title` | ✓ | Có ở 21/22 transcript |
| `claude agents --json` → `official_status` | ✓ | `busy`, `idle`, `waiting` + `waitingFor` (`permission prompt`, `input needed`). Có `pid`, `sessionId`. Trễ 0,2-0,9 giây so với `PermissionRequest` (poll mỗi giây). Phiên biến khỏi danh sách khi kết thúc |
| Statusline → `quota` | ✓ một phần | `rate_limits.five_hour`/`seven_day` có ở 55/77 lần gọi. **Không có `process.pid`** |
| Channel → `liveness` | chưa xác nhận | S3, S5 |

Sự kiện ngoài bảng đã thấy: `InstructionsLoaded` (2 lần mỗi phiên), `PostModelSwitch` (khi duyệt plan).
Đã đăng ký nhưng không thấy: `PermissionDenied`, `TaskCreated`, `TaskCompleted`, `CwdChanged`,
`ConfigChange`, `UserPromptExpansion`, `PreModelSwitch`, `DirectoryAdded`, `TeammateIdle`.

## Phát hiện khác

- **Chế độ quyền mặc định là `auto`.** Cấu hình người dùng đặt `permissions.defaultMode: "auto"`, và
  86/86 bản ghi chế độ quyền trong các phiên thật (ngoài sandbox) từ tối 15/11 là `auto`. Ở chế độ này không có
  `PermissionRequest` cho Bash/Write; quyết định ghi ở transcript (`permissionDecision`:
  `{decision: accept, source: config, reasonType: mode}`). Hộp hỏi quyền vì vậy hiếm trong dùng
  hằng ngày, điều cần cân nhắc cho M2 ở buổi go/no-go (#15).
- **pid:** `ppid` của tiến trình hook đúng bằng `pid` mà `agents --json` báo. Tiến trình giữ nguyên
  qua `/clear` (đổi `session_id`); `--continue` giữ `session_id` nhưng là tiến trình mới. Gắn bàn với pid
  như mục 5.2 dự định là được.
- **Lệnh dài có thể chạy nền:** Claude tự dùng `run_in_background`; tool trả về ngay, khi xong có
  `UserPromptSubmit` `<task-notification>`. `Stop.background_tasks` liệt kê việc nền còn chạy.
- Claude Code chặn sẵn `sleep N && …` ở tiền cảnh.
- `Notification` đến chậm (~6 giây) và không phải lần nào cũng có; `PermissionRequest` đến ngay.
- Hook `async` (Node) mất khoảng 39 ms (p50), 54 ms (p95) từ lúc khởi động tới lúc ghi xong (cho S6).

## Trả lời các câu của S1

- **Bảng ánh xạ ở mục 4 có đúng không:** đúng phần lớn, cần sửa 5 dòng (đánh dấu **Sửa** ở trên):
  `UserPromptSubmit` có `<task-notification>`, `PermissionRequest` cho cả `AskUserQuestion` và
  `ExitPlanMode`, `Notification` `permission_prompt` chỉ là tín hiệu phụ, `idle_prompt` không phải
  `needs_input`, và các trường hợp không có `Stop`/`PostToolUse` (từ chối, Esc, đóng terminal). Ba dòng
  chưa xác nhận: `fork`, `StopFailure`, `elicitation_dialog`; bổ sung kịch bản ở M1. ADR-001 sẽ chốt
  bảng đã sửa.
- **Ghép `PermissionRequest` với yêu cầu từ channel (cùng S3):** phía hook đã rõ. `PermissionRequest`
  không có `tool_use_id`, nhưng chạy cùng lúc với `PreToolUse` có cùng `tool_name` và `tool_input`, nên
  ghép được theo (`session_id`, `tool_name`, `tool_input`) để lấy `tool_use_id`. Phía channel chờ S3.

## Fixture

`fixtures/s1/<kịch bản>/`: `hooks.jsonl`, `hooks-sync.jsonl`, `agents.jsonl`, `statusline.jsonl`,
`transcript-N.jsonl` (và `subagent-explore.jsonl` ở 07), tổng khoảng 4 MB.

- Tách theo phiên của từng kịch bản. `agents.jsonl` chỉ giữ phiên của sandbox, trong khoảng thời gian
  của kịch bản (bỏ hết phiên của dự án khác).
- Scrub bằng `./scripts/pnpm scrub`. Kiểm tra lại độc lập: không còn đường dẫn home, tên người dùng,
  tên dự án khác, email, ID tài khoản/tổ chức; secretlint và gitleaks sạch.
- Còn lại đường dẫn lệnh hook của chính repo này (`/Users/user/Documents/PROJECTS/agent-office/...`,
  trong `hookInfos.command` của transcript), không nhạy cảm vì repo đã công khai.

## Dọn dẹp

- Dữ liệu thô trong repo: `.dev-raw/s1/` (ngoài git).
- Sandbox giữ lại cho các spike sau. `.claude/settings.local.json` của sandbox đang là cấu hình S1.
- Do Claude Code tự ghi, không xoá: transcript của sandbox trong `~/.claude/projects/`.
