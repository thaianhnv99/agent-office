# S4: Hook `PermissionRequest` kiểu `http`

Spike S4 của M0 (issue #7, time-box 1 giờ, dùng khoảng 35 phút làm việc). Thử ngày 16/11/2026 với Claude
Code 2.1.325 trên macOS, trong terminal của VS Code, ngay sau S3.

## Cách thử

- Server thử: `scripts/spikes/permission-hook/server.mjs`, chỉ nghe trên `127.0.0.1:47392`.
  - Ghi mọi request vào `.dev-raw/s4/permission-hook.jsonl`.
  - Ghi thêm khi Claude Code **đóng kết nối trước khi server trả lời** (`client-closed`).
  - Trả lời theo file chế độ:
    - `allow:<giây>` và `deny:<giây>`;
    - `pass:<giây>`: 200 với body rỗng, tức không quyết định;
    - `answer:<giây>`: `allow` kèm `updatedInput`. Với `AskUserQuestion` là đáp án đầu tiên của mỗi câu; với
      tool khác thì gửi lại nguyên input;
    - `hang`: nhận kết nối mà không bao giờ trả lời.
  - Có 7 test trong `server.test.ts`.
- Sandbox: hook `PermissionRequest` kiểu `http`, `timeout: 30`, cùng logger S1 (command `async`, tag
  `s4/hooks`) cho mọi sự kiện. Channel của S3 bị tắt (`disabledMcpjsonServers`). Cấu hình lưu ở
  `.dev-data/s4/sandbox-settings.s4.json`.
- Có hai cách chạy:
  - tôi tự chạy `claude -p` cho các trường hợp không cần hộp thoại;
  - chủ dự án chạy phiên tương tác (`--permission-mode default`, không có cờ channel) cho các trường hợp
    còn lại.
- Phần nói về tài liệu chính thức đã đối chiếu ngày 16/11/2026 với [Hooks](https://code.claude.com/docs/en/hooks)
  (`PermissionRequest`, HTTP response handling, AskUserQuestion) và
  [Hooks guide](https://code.claude.com/docs/en/hooks-guide).

## Kết quả

| # | Tình huống | Kết quả |
|---|---|---|
| s4-00 | `-p`, server `allow` sau 1 s | Lệnh chạy. `PermissionRequest` có bắn ở `-p` |
| s4-03p | `-p`, server `deny` sau 3 s | Lệnh không chạy. Claude báo "denied by the S4 hook server" (chuỗi `message` của hook) |
| s4-04p | `-p`, server trả 200 rỗng (không quyết định) sau 3 s | Lệnh bị từ chối, vì `-p` không có ai để hỏi |
| s4-01 | Phiên tương tác, server `allow` sau 10 s, không bấm gì | Lệnh chạy ở giây 10,5. `Notification` `permission_prompt` bắn ở giây 6 trong lúc hook còn chờ, tức hộp thoại đang mở song song |
| s4-02 | Server treo, bấm **Yes** trong terminal ngay khi hộp thoại hiện | **Hộp thoại hiện ngay.** Bấm Yes ở giây 1,4 và lệnh chạy ngay. Nhưng kết nối tới server **không bị huỷ**: nó mở tới hết `timeout` (30 s) rồi mới đóng. Agent vẫn chạy tiếp, không bị chặn |
| s4-03 | Bấm **No** ngay; server định `allow` ở giây 15 | Lệnh không chạy. Bấm No làm Claude Code **đóng kết nối ngay** (giây 1,7), nên câu trả lời muộn không bao giờ được gửi |
| s4-05 | `AskUserQuestion`; server trả `answer` sau 5 s, không bấm gì | **Hook trả lời thay được.** Câu hỏi tự đóng ở giây 5; `tool_response` có `answers: {"Tea or coffee?": "Tea"}` |
| s4-06 | Duyệt kế hoạch (`ExitPlanMode`); server trả `answer` sau 5 s | **Kế hoạch tự được duyệt** ở giây 5. Phiên chuyển sang `acceptEdits`, rồi lệnh ghi file chạy mà không hỏi thêm |

## Trả lời câu của S4

**Khi hook đang chờ thì hộp thoại terminal có hiện không: có, hiện ngay.** Hook và hộp thoại chạy song song,
và bên nào trả lời trước thì thắng:
- Hook trả lời trước: hộp thoại đóng và quyết định của hook được áp dụng (s4-01, s4-05, s4-06).
- Bấm Yes trước: lệnh chạy ngay, còn hook bị bỏ mặc tới hết `timeout` (s4-02).
- Bấm No trước: kết nối tới hook bị đóng ngay (s4-03).

Không trường hợp nào để câu trả lời muộn chạy được lệnh đã bị từ chối. Tài liệu không nói rõ điểm này,
nên đây là kết quả thử thực tế. Vậy S4 **đạt**: dùng làm cơ chế duyệt được.

## So sánh với channel (S3)

| | Channel (S3) | Hook `PermissionRequest` (S4) |
|---|---|---|
| Cách bật | Cờ dev ở mọi phiên, kèm một lần bấm xác nhận; Team/Enterprise cần admin bật | Hook bình thường trong plugin, không cần cờ |
| Trạng thái | Research preview, giao thức có thể đổi | Tính năng hook chính thức |
| Duyệt `Bash`, `Write`, `Edit` | Được | Được |
| Câu hỏi có lựa chọn, duyệt kế hoạch | **Không** | **Được** (`updatedInput`) |
| Ở `-p` / Agent SDK | Không đăng ký | Có bắn |
| Terminal trả lời trước | Verdict muộn bị bỏ âm thầm | Bấm No: kết nối bị đóng ngay. Bấm Yes: hook chờ tới hết `timeout` |
| App tắt | Channel im lặng, terminal duyệt bình thường | `ECONNREFUSED` sau 1-8 ms (S6), hộp thoại bình thường |
| App treo | Terminal duyệt bình thường | Phiên tương tác: terminal duyệt bình thường. Ở `-p`: chặn tới hết `timeout` rồi từ chối |
| Dashboard biết yêu cầu đã xong | Không được báo; phải dựa vào hook | Kết nối đóng khi bấm No; khi bấm Yes phải dựa vào `PostToolUse` |

## Phát hiện khác

- **Không có quyết định** (200 rỗng, lỗi kết nối, hết `timeout`) thì Claude Code xử lý như không có hook: phiên
  tương tác hiện hộp thoại, còn `-p` thì từ chối. Theo tài liệu, `onFailure: "block"` biến lỗi thành từ chối.
  Không nên dùng tuỳ chọn này.
- **Timeout mặc định của hook là 600 s.** Với hook này, `timeout` chính là khoảng thời gian dashboard còn
  duyệt được. Ở phiên tương tác, đặt dài không làm agent chờ, vì hộp thoại vẫn dùng được. Ở `-p`, đặt dài
  thì một app treo làm agent đứng tới hết `timeout`. Server nên trả "không quyết định" ngay cho các phiên
  không tương tác. Cần tìm cách nhận biết các phiên đó, ví dụ hook `SessionStart` dạng command gửi kèm
  `CLAUDE_CODE_ENTRYPOINT`.
- **Duyệt kế hoạch bằng hook đổi chế độ phiên sang `acceptEdits`**, giống lựa chọn "Yes, and auto-accept edits".
  Muốn giữ chế độ `default` thì có thể thêm `updatedPermissions` với `setMode`, nhưng cách này chưa thử.
- `deny` kèm `message`: Claude nhận câu đó làm lý do và trả lời tiếp, giống từ chối qua channel. Tài liệu
  có `interrupt: true` để dừng hẳn lượt làm việc.
- Theo changelog, từ 2.1.300 `updatedInput` được kiểm như input của chính Claude: key lạ bị bỏ, input sai thì
  bị từ chối. Với `AskUserQuestion` phải gửi lại nguyên `questions` kèm `answers`, với key là chữ của câu
  hỏi và giá trị là `label` của đáp án.
- Payload của hook có `session_id`, `tool_name`, `tool_input` đầy đủ (không bị cắt như `input_preview` của
  channel), `permission_mode`, `permission_suggestions`. Dashboard hiện được toàn bộ lệnh hoặc diff mà không
  cần channel.

## Đề xuất cho ADR-002 (chốt ở go/no-go #15)

- **Đổi thứ tự ưu tiên của mục 6:**
  - **hook `PermissionRequest` làm cơ chế chính** cho M2;
  - **channel bỏ khỏi M2**, đưa vào backlog cùng việc gửi prompt từ dashboard.

  Hook không cần cờ dev, dùng được với mọi gói, trả lời được câu hỏi và duyệt kế hoạch, và không làm mất
  hộp thoại terminal.
- **Kiểu hook:**
  - `http` đơn giản và nhanh (S6), nhưng không tự kiểm tra được công tắc tắt nhanh.
  - Hook command đồng bộ thì kiểm tra được trước khi gọi server, nhưng tốn 55-144 ms khởi động Node mỗi lần
    hỏi quyền (S6). Mức này chấp nhận được, vì nó chỉ chạy khi có hộp thoại, không phải ở mọi tool call.
  - Chốt cùng ADR-003.
- **`timeout`** khoảng vài phút cho phiên tương tác. Server trả "không quyết định" ngay khi công tắc tắt
  hoặc khi phiên không tương tác.
- **Dashboard đánh dấu yêu cầu đã xong** khi kết nối hook đóng, hoặc khi thấy `PostToolUse`, `Stop`,
  `UserPromptSubmit` của cùng phiên.
- Mô hình đe doạ của mục 6 giữ nguyên: ai gửi được quyết định tới server là chạy được lệnh.

## Giới hạn

- Một máy, một phiên bản, chỉ thử trong terminal của VS Code.
- Mỗi tình huống chạy một lần.
- Ở s4-01, việc hộp thoại hiện trong lúc hook chờ được suy ra từ s4-02 và `Notification` ở giây 6.
  Chủ dự án chưa xác nhận bằng mắt.
- Chưa thử:
  - nhiều yêu cầu cùng lúc;
  - yêu cầu từ subagent;
  - chế độ `auto`;
  - `updatedPermissions`;
  - câu hỏi chọn nhiều đáp án.
