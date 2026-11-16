# ADR-001: Nguồn dữ liệu và bảng ánh xạ sự kiện

- **Trạng thái:** Chấp nhận (16/11/2026)
- **Người quyết định:** chủ dự án (theo plan v3.1 mục 4 và kết quả M0)
- **Liên quan:** plan v3.1 mục 4, 5.1; spike S1 (`docs/spikes/s1-events.md`), S2, S5, S7, S9; ADR-002, ADR-003, ADR-004

## Bối cảnh

Plan v3.1 mục 4 liệt kê các nguồn dữ liệu và một bảng ánh xạ sang sự kiện chuẩn hoá, viết trước khi có dữ
liệu thật. Ở M0:
- S1 đối chiếu bảng với 20 kịch bản thật: đúng phần lớn, **5 dòng cần sửa**, 3 dòng chưa xác nhận.
- S2, S5, S7, S9 làm rõ thêm nguồn pid, liveness và các trường hợp không có hook.
- ADR-002 bỏ channel khỏi M1-M2.

## Quyết định

### Nguồn dữ liệu

| Nguồn | Vai trò | Ghi chú từ M0 |
|---|---|---|
| **Hook** (`sh` + `curl`, ADR-003) | Nguồn chính, tức thời | Script gửi kèm `$PPID` (pid của `claude`, S1/S8) và `CLAUDE_CODE_ENTRYPOINT` (`cli` hoặc `sdk-*`) trong header. Phiên con (S9) chỉ có nguồn này |
| **Transcript JSONL** (đọc theo `transcript_path`, chỉ đọc) | Chi tiết tool, dấu ngắt, `usage`, `ai-title` | Nguồn duy nhất cho từ chối và Esc. `usage` phải dedupe theo `message.id`. Phiên con không có transcript |
| **`claude agents --json`** (poll thích ứng) | Trạng thái chính thức, đối chiếu | Khoảng 0,1 s CPU mỗi lần (S2). Chỉ có phiên không phải phiên con. Bỏ phiên chết ngay, và tự xoá file phiên sót lại (S9) |
| **Kiểm tra tiến trình** (`kill -0 <pid>`) | Liveness | Bắt buộc, vì `kill -9` không có `SessionEnd` (S9) |
| **Statusline wrapper** | Quota, pid qua `ppid` (S7) | `rate_limits` chỉ có sau response đầu tiên và chỉ với gói Pro/Max/Ultra; chạy theo sự kiện |
| MCP server / channel | Không dùng ở M1-M2 (ADR-002) | |
| OpenTelemetry | Để sau | |

### Bảng ánh xạ (đã sửa theo S1)

| Hook / nguồn | → `type` | Ghi chú |
|---|---|---|
| `SessionStart` (`source`: startup, resume, clear, compact, fork) | `session_start` | `fork` chưa thấy. `clear` giữ nguyên pid: bàn gắn theo pid (S1, S5) |
| `UserPromptSubmit`, `prompt` **không** bắt đầu bằng `<task-notification>` | `prompt` | |
| `UserPromptSubmit`, `prompt` bắt đầu bằng `<task-notification>` | **`task_notification`** (mới) | Thông báo việc nền hoặc subagent đã xong, không phải người dùng gõ. Không coi là "đã xem" |
| `PreToolUse` | `tool_start` | Riêng `AskUserQuestion`, `ExitPlanMode`: `waiting_input` làm dự phòng khi không có `PermissionRequest`. Lệnh bị chặn ngay ở bước kiểm tra thì không có `PreToolUse` |
| `PostToolUse` / `PostToolUseFailure` (`error`, `is_interrupt`) | `tool_end` | Không có khi bị từ chối hoặc Esc lúc tool đang chạy |
| `PostToolBatch` (`tool_calls[]`) | `tools_batch_end` | Đóng mọi tool trong batch, kể cả tool bị chặn |
| `PermissionRequest` | `permission_request` với **`permission.kind`**: `tool`, `question` (`AskUserQuestion`), `plan` (`ExitPlanMode`) | Không có `tool_use_id`. Ghép với `PreToolUse` theo (`session_id`, `tool_name`, `tool_input`). Server cấp `requestId` (ADR-002) |
| `Notification` `permission_prompt` | `permission_request`, **chỉ khi chưa có yêu cầu đang chờ** | Đến sau khoảng 6 s và không phải lần nào cũng có. Chỉ là tín hiệu phụ |
| Quyết định của dashboard; kết nối hook bị đóng; `PostToolUse`, `Stop`, `UserPromptSubmit` sau yêu cầu; `status: busy` | `permission_resolved` | ADR-002 |
| `Notification` `idle_prompt` | **không ánh xạ** (chỉ ghi log) | Đến 60 s sau `Stop`, hoặc trễ hơn khi máy ngủ (S9). Agent không hỏi gì |
| `Notification` `elicitation_dialog` | `waiting_input` (`kind: elicitation`) | Chưa xác nhận |
| `Stop` (`background_tasks`, `last_assistant_message`) | `stop` | Không có khi bị từ chối, khi Esc, hay khi đóng terminal. Ở `-p`, hook `async` của `Stop` bị huỷ |
| `StopFailure` (`error`) | `stop_failure` | Chưa xác nhận |
| `PreCompact` / `PostCompact` | `compact_start` / `compact_end` | |
| `SubagentStart` / `SubagentStop` | `subagent_start` / `subagent_stop` | Bỏ qua `SubagentStop` "nội bộ": không có `SubagentStart`, `agent_type` rỗng |
| `SessionEnd` (`reason`) | `session_end` | `reason: clear` kết thúc `session_id`, **không** kết thúc tiến trình (S5) |
| Transcript: `[Request interrupted by user]`, hoặc `tool_result` "The user doesn't want to proceed…" + `[Request interrupted by user for tool use]` | `interrupted` | Không phân biệt được từ chối với Esc khi tool đang chạy, nên `outcome` là `interrupted` |
| Transcript: `usage` | `usage` | Dedupe theo `message.id` |
| Transcript: `ai-title` | `title` | |
| `claude agents --json` | `official_status` | `busy`, `idle`, `waiting` + `waitingFor` |
| Statusline | `quota` | Chỉ ghi khi giá trị đổi |
| Kiểm tra tiến trình | `liveness` | Phát ra khi pid chết, hoặc khi đối chiếu lại sau lúc máy thức (S9) |

**Chưa xác nhận, bổ sung kịch bản ở M1:** `SessionStart` `source: fork`, `StopFailure`,
`Notification` `elicitation_dialog`, auto-compact.

## Hệ quả

- `EventType` ở plan mục 5.1 thêm `task_notification`. `permission` đổi thành
  `{ requestId, kind, toolName, input }`, vì hook có `tool_input` đầy đủ thay cho `inputPreview`. Mục 5.1 đã sửa.
- Reducer (ADR-004) không được dựa vào `Stop` hay `PostToolUse` để đóng trạng thái. Nó phải nhận thêm `interrupted`
  từ transcript, `official_status` và `liveness`.
- Bảng này là nguồn chuẩn. Mục 4 của plan chỉ tóm tắt và trỏ về đây. Khi Claude Code đổi định dạng, sửa ADR này
  cùng adapter và fixture, và ghi vào `compat.json`.

## Phương án đã cân nhắc

- **Giữ `idle_prompt` là `waiting_input`** (plan v3). Bị loại, vì sẽ báo "cần bạn" trong khi agent đã xong lượt,
  và nó bắn sai giờ khi máy ngủ.
- **Coi mọi `UserPromptSubmit` là `prompt`.** Bị loại, vì `<task-notification>` sẽ xoá trạng thái "xong, chưa xem"
  mà người dùng chưa hề nhìn.
