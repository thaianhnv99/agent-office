# S3: Channel permission relay

Spike S3 của M0 (issue #6, time-box 2,5 giờ, dùng khoảng 1,5 giờ làm việc). Thử ngày 16/11/2026 với Claude
Code 2.1.325 trên macOS, trong terminal của VS Code.

## Cách thử

- Channel tự viết: `scripts/spikes/channel/server.mjs`. Đây là một MCP server chạy qua stdio, không dùng SDK
  để thấy được mọi message. Nó khai báo `claude/channel` và `claude/channel/permission`, ghi mọi message và
  sự kiện vòng đời vào `.dev-raw/s3/channel.jsonl`. Cách trả lời lấy từ một file chế độ, đổi được giữa các
  phiên: `allow:<giây>`, `deny:<giây>`, `never` (im lặng, giả lập app không kết nối được) và `manual` (chờ
  verdict gửi tới cổng HTTP trên `127.0.0.1`, giống dashboard). Có 6 test trong `server.test.ts`.
- Sandbox `~/agent-office-sandbox/`:
  - `.mcp.json` khai báo server `ao-channel`, và `settings.local.json` có `enabledMcpjsonServers`;
  - hook logger của S1 ghi vào `s3/hooks`, để đặt cạnh log của channel.
- Mỗi phiên là một phiên tương tác, mở bằng
  `claude --model haiku --setting-sources project,local --permission-mode default --dangerously-load-development-channels server:ao-channel`.
- Chủ dự án làm từng tình huống bằng tay. Thời gian lấy từ log của channel và của hook.
- Phần nói về tài liệu chính thức đã đối chiếu ngày 16/11/2026 với [Channels](https://code.claude.com/docs/en/channels)
  và [Channels reference](https://code.claude.com/docs/en/channels-reference).

## Kết quả

| # | Tình huống | Kết quả |
|---|---|---|
| s3-01 | Channel gửi `allow` sau 6 s, không bấm gì | Hộp thoại tự đóng, lệnh chạy. Từ lúc gửi verdict tới `PostToolUse` mất 1,1 s, đã gồm thời gian chạy lệnh |
| s3-02 | Bấm **No** ở giây 13,5; channel gửi `allow` ở giây 15 | Câu trả lời ở terminal thắng. `allow` đến muộn bị bỏ qua, lệnh không chạy. Lần dán lại thứ hai không bấm gì: channel `allow` sau 15 s và lệnh chạy, tức hộp thoại chờ ít nhất 15 s mà không tự hết hạn |
| s3-03 | Channel gửi `deny` sau 6 s | Lệnh không chạy. Claude nhận `tool_result` lỗi "...To tell you how to proceed, the user said: Denied via channel ao-channel", rồi trả lời tiếp và có `Stop` |
| s3-04 | Channel không bao giờ trả lời; bấm **Yes** ở khoảng giây 11 | Hộp thoại chờ bình thường, lệnh chạy sau khi bấm Yes. Không treo |
| s3-05 | `AskUserQuestion` (câu hỏi có lựa chọn) | Hook `PermissionRequest` bắn, nhưng **channel không nhận được gì**. Trả lời trong terminal bình thường |
| s3-06 | Duyệt kế hoạch (`ExitPlanMode`) ở plan mode | Như s3-05: hook `PermissionRequest` và `Notification` `permission_prompt` bắn, **channel không nhận được gì**. Bấm Esc trong terminal thì kế hoạch không chạy |

## Trả lời các câu của S3

- **Relay có chạy không:** có, cả `allow` lẫn `deny`, với các tool như `Bash`. Tài liệu ghi relay chỉ áp
  cho tool như `Bash`, `Write`, `Edit`. Hộp thoại tin cậy dự án và hộp thoại đồng ý cho MCP server thì không
  được relay. Thử thực tế cho thấy câu hỏi có lựa chọn (`AskUserQuestion`, s3-05) và duyệt kế hoạch
  (`ExitPlanMode`, s3-06) cũng không được relay, dù cả hai đều làm hook `PermissionRequest` bắn.
- **"Bên trả lời trước thắng" có đúng không:** đúng, trong terminal của VS Code. Verdict đến muộn bị bỏ
  âm thầm, khớp với tài liệu ("that answer is applied instead and the pending remote request is dropped").
  Có hai hệ quả:
  - Claude Code **không báo cho channel** khi terminal trả lời trước;
  - channel không biết verdict của mình đã bị bỏ.

  Vì vậy dashboard phải lấy tín hiệu "đã xử lý" từ hook hoặc transcript.
- **Cờ dev phiền tới mức nào:**
  - Mỗi phiên phải gõ thêm một cờ dài (dùng alias shell được).
  - Mỗi lần mở phải chọn "I am using this for local development" một lần.
  - Không có cách bật lâu dài. Khai báo trong `.mcp.json` chưa đủ, server còn phải được nêu trong cờ.

  Theo tài liệu:
  - Plugin đăng ở marketplace riêng **vẫn cần cờ dev**, vì không nằm trong allowlist.
  - Chỉ có hai đường không cần cờ:
    - được đưa vào allowlist chính thức, thông qua liên hệ đối tác của Anthropic;
    - admin của Team/Enterprise thêm plugin vào `allowedChannelPlugins` trong managed settings.
  - Với người dùng Pro/Max cá nhân, cờ dev là cách duy nhất.
  - Ở Team/Enterprise, channel bị chặn cho tới khi admin bật `channelsEnabled`. Khi chưa bật thì cờ dev
    cũng không dùng được.
  - Ở `-p` và Agent SDK, cờ bị bỏ qua và channel không được đăng ký.
- **Channel làm gì khi không kết nối được server của app** (mục 5.3, ý 5): thử bằng chế độ `never`. Claude
  Code không đặt thời hạn chờ channel, và terminal vẫn duyệt được như khi không có channel. Bỏ yêu cầu
  không gây hại gì.

## Phát hiện khác

- **Ghép yêu cầu từ hook với yêu cầu từ channel** (mục 5.1, câu còn mở):
  - Channel nhận yêu cầu sớm hơn hook `PermissionRequest` khoảng 90-100 ms, chủ yếu vì hook phải khởi động Node.
  - Với các lệnh ngắn đã thử, `input_preview` là JSON và parse ra đúng `tool_input` của hook.
  - MCP server biết `CLAUDE_CODE_SESSION_ID`, giá trị này bằng `session_id` của hook.

  Vậy có thể ghép theo phiên, `tool_name`, nội dung input và thời gian. Hook không có `request_id`. Chưa thử
  input dài (khi `input_preview` bị cắt).
- **Hook theo từng cách trả lời:**

  | Cách trả lời | `PostToolUse` | `PostToolBatch` | `Stop` |
  |---|---|---|---|
  | Channel `allow` | có | có | có |
  | Channel `deny` | không | có | có |
  | Bấm No trong terminal | không | không | không (như S1) |

  Từ chối qua channel không ngắt lượt làm việc, còn bấm No thì ngắt.
- **`Notification` loại `permission_prompt` bắn khoảng 6 s sau khi hộp thoại mở**, còn `PermissionRequest`
  bắn ngay. Ở s3-01, channel trả lời ở giây 6,0 nên không có `Notification` nào. Dashboard nên dùng
  `PermissionRequest` để biết sớm.
- **Bắt tay:**
  - Claude Code gửi `server/discover` (protocol `2026-07-28`) trước.
  - Server trả `-32601` thì Claude Code chuyển sang `initialize` với `2025-11-25`, và channel vẫn được đăng ký.
  - Tài liệu ghi: trên runtime MCP v2, server nào đàm phán revision `2026-07-28` sẽ không được đăng ký làm
    channel. Khi viết bằng SDK cần kiểm lại điểm này, hoặc đặt `MCP_PROTOCOL_NEGOTIATION=legacy`.
- Changelog 2.1.83 tắt `AskUserQuestion` và plan mode khi bật channel, và 2.1.126 sửa lại cho phiên tương
  tác. Ở 2.1.325, `AskUserQuestion` vẫn dùng được khi có cờ dev (s3-05).

## Dữ liệu cho S5

- MCP server là con trực tiếp của tiến trình `claude`: `ppid` của nó bằng pid của `claude`, cũng bằng `ppid`
  của hook.
- Mỗi phiên có một tiến trình server riêng, sống suốt phiên.
- Biến môi trường nhận được:
  - `CLAUDE_CODE_SESSION_ID`, bằng `session_id` của hook;
  - `CLAUDE_PROJECT_DIR`;
  - `CLAUDE_CODE_ENTRYPOINT`: `cli` cho phiên tương tác, `sdk-cli` cho `-p`;
  - `CLAUDE_CODE_MESSAGING_SOCKET`;
  - `CLAUDE_CODE_MESSAGING_TOKEN` (không ghi giá trị);
  - `CLAUDECODE`;
  - `CLAUDE_CODE_SSE_PORT`, chỉ có trong terminal VS Code.
- Khi `/exit`, server nhận `SIGINT` khoảng 120 ms trước hook `SessionEnd`, và không thấy stdin đóng trước
  đó. Tài liệu ghi: `SIGINT`, sau 100 ms là `SIGTERM`, rồi 400 ms sau nữa là `SIGKILL`.
- Chưa thử trường hợp `claude` bị `kill -9`. Plan (mục 4) giả định "stdin đóng nghĩa là session đã kết
  thúc, kể cả khi crash", nên cần kiểm ở S5.

## Đề xuất cho ADR-002 (chốt cùng S4, go/no-go #15)

- **Về kỹ thuật thì dùng được** để duyệt các tool như `Bash`, `Write`, `Edit`:
  - relay chạy được;
  - terminal luôn là đường dự phòng;
  - verdict đến muộn không gây hại.
- **Về phân phối thì vướng:**
  - Người dùng Pro/Max phải thêm cờ dev và bấm xác nhận ở mọi phiên. Đây là research preview, giao thức
    có thể đổi.
  - Team/Enterprise bị chặn nếu admin chưa bật.
  - Không có ở `-p`.
  - Không trả lời được câu hỏi có lựa chọn và duyệt kế hoạch. Dashboard chỉ báo được là đang chờ.
  - Thêm phát hiện ở S1: các phiên của chủ dự án chạy ở chế độ `auto`, nên ít khi hiện hộp thoại xin quyền.
- **Đề xuất:**
  - Giám sát không phụ thuộc channel. Duyệt qua channel là tính năng bật thêm (opt-in) của M2.
  - Dashboard phát hiện channel đã kết nối hay chưa. Nếu chưa thì ẩn nút duyệt và hiện "Duyệt trong
    terminal" (mục 10.9).
  - S4 vẫn nên chạy để so sánh.
- **Khi server của app tắt**, MCP server giữ các yêu cầu đang chờ trong bộ nhớ (không ghi đĩa) và gửi lại
  khi kết nối lại. Dashboard xoá một yêu cầu khi hook cho biết nó đã được xử lý. Cách này an toàn, vì verdict
  cho yêu cầu đã trả lời sẽ bị bỏ.

## Giới hạn

- Một máy, một phiên bản, chỉ thử trong terminal của VS Code; chưa thử Terminal.app hay iTerm.
- Mỗi tình huống chạy một lần.
- Ở s3-02, verdict muộn chỉ đến sau câu trả lời trong terminal 1,5 s.
- Chưa thử:
  - input dài;
  - nhiều yêu cầu cùng lúc;
  - yêu cầu từ subagent;
  - verdict gửi qua HTTP từ một dashboard thật (đường này chỉ có unit test).
