# Dự án tương tự

Việc #12 của M0. Đọc ngày 16/11/2026, chỉ đọc mã nguồn và issue qua `gh api`, không clone, không cài và không chạy
code của họ. Mỗi repo do một agent đọc riêng. Mọi nhận định có trích file trong báo cáo gốc của agent, và phần
license đã được kiểm lại trực tiếp.

## License

| Dự án | Code | Hình ảnh |
|---|---|---|
| [pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) | MIT | Nhân vật lấy từ gói JIK-A-4 "Metro City" (CC0 theo issue #355); khoảng 40 ảnh nội thất, sàn, thú cưng **chưa có file license** (issue #355 đang mở) |
| [pixel-agent-desk](https://github.com/zep-ia/pixel-agent-desk) | MIT | `LICENSE-ASSETS` riêng cho `public/characters/`, `public/office/`: **cấm sửa, cấm phân phối, cấm đưa vào sản phẩm, cấm dùng để huấn luyện AI** |
| [agents-observe](https://github.com/simple10/agents-observe) | MIT | Không có hình ảnh riêng |

Agent Office chỉ học ý tưởng. Không chép code, không dùng hay mô phỏng hình ảnh, nhân vật hay bố cục văn phòng của
họ (plan mục 10.10: hình ảnh tự làm hoặc từ gói có license rõ ràng).

## So sánh nhanh

| | pixel-agents | pixel-agent-desk | agents-observe | Agent Office (theo ADR) |
|---|---|---|---|---|
| Dạng | Extension VS Code, hoặc CLI `npx pixel-agents` chạy server Fastify trên `127.0.0.1` với canvas web | App Electron: avatar nổi trên màn hình + dashboard web `localhost:3000` | Server Hono (chạy trong Docker) + web React | Server Node cục bộ + dashboard web |
| Nguồn dữ liệu | Hook (12 sự kiện) + tail transcript (poll 0,5-1 s, luôn bật); statusline tuỳ chọn cho quota và context | Chỉ hook (17 sự kiện); transcript chỉ để tính token, quét lại 60 s | Chỉ hook (khoảng 30 sự kiện); transcript đọc khi cần để tính token | Hook + transcript + `claude agents --json` + statusline + pid (ADR-001) |
| Cài hook ở đâu | Ghi vào `~/.claude/settings.json` **toàn cục**, nhưng có bước xin phép, gộp nguyên tử, sao lưu một lần, gỡ chỉ phần của mình | **Ghi thẳng vào `~/.claude/settings.json` toàn cục**, kiểu `http`; ghi đè cả file nếu đọc lỗi; không có gỡ cài đặt | Plugin (`hooks.json` dùng `${CLAUDE_PLUGIN_ROOT}`), không ghi vào settings | Plugin; khi dev chỉ trong sandbox (ADR-007) |
| Kiểu hook | Command Node **đồng bộ** (`timeout: 5`), gửi tới mọi server còn sống, tối đa 2 s mỗi server | `http`, đồng bộ, server luôn trả 200 ngay | Command `sh` chạy Node nền rồi thoát 0; mất sự kiện khi server tắt | `sh` + `curl` `async` (ADR-003) |
| Trạng thái | Active / Inactive (xong, chờ input, chờ duyệt); không có error hay offline; mẹo theo thời gian (tool mở 7 s → chờ duyệt, im 5 s → xong) chỉ dùng khi chưa có hook | Working, Thinking, Waiting, Done, Help, Error, Offline (Offline không bao giờ được đặt) | Gần như không có: phiên `active`/`ended`, tool `running`/`completed`/`failed`, cờ "cần chú ý" | 10 trạng thái suy ra, có thứ tự ưu tiên (mục 5.2) |
| Liveness | Chỉ `SessionEnd`, đóng terminal hoặc transcript bị xoá; **không kiểm pid** của phiên Claude | `kill -0` mỗi 2 s; pid tìm bằng `lsof`/`pgrep`, **lỗi nhiều trên macOS** | **Không có**: phiên bị kill vẫn "active" mãi | pid từ `$PPID` của hook, `kill -0`, đối chiếu `claude agents --json` (S9) |
| Thông báo | Chuông Web Audio trong trang, khác nhau cho "xong" và "chờ duyệt"; bấm nhân vật để focus terminal VS Code | **Không có** (chỉ hiệu ứng nhảy trên avatar) | Chuông trong sidebar và quầng sáng, **không** âm thanh hay thông báo hệ thống | Notification API + badge tab (mục 10.7) |
| Duyệt quyền | **Không** | **Không** (chỉ hiện "Help") | **Không** (chỉ hiện sự kiện) | Có, qua hook `PermissionRequest` (ADR-002) |
| Lưu trữ | Báo cáo không nêu | `~/.pixel-agent-desk/state.json`, ghi mỗi sự kiện | SQLite (`better-sqlite3`, WAL), lưu payload gốc, không tự dọn | SQLite `node:sqlite`, event log + thời hạn giữ (ADR-005) |
| Vòng đời server | Chạy cùng extension hoặc CLI; không có dịch vụ nền | App chạy khi mở cửa sổ; hook vẫn trỏ tới cổng chết khi tắt app | MCP server của plugin bật container và gửi nhịp; server tự tắt sau 30 s không còn ai dùng | Hook `SessionStart` bật, tự tắt có ân hạn (mục 9.2) |

## pixel-agents

Dự án lớn nhất (khoảng 10.200 sao, 105 issue mở, phiên bản 1.6.0, cập nhật tới 11/2026). Là extension VS Code, hoặc chạy
riêng bằng `npx pixel-agents` với server cục bộ và canvas web.

- **Hai tầng trạng thái:**
  - có hook thì hook quyết định ngay: `PreToolUse` → đang làm; `Stop` → xong; `Notification` `idle_prompt` → chờ
    input; `PermissionRequest` hoặc `permission_prompt` → chờ duyệt;
  - phiên chưa có hook thì đoán từ transcript ("heuristic mode"): tool mở quá 7 s coi là chờ duyệt, im 5 s sau một lượt
    chỉ có chữ coi là xong, và bản ghi `system/turn_duration` là dấu kết thúc lượt đáng tin.
- **Hiển thị:**
  - văn phòng pixel: nhân vật ngồi gõ khi làm việc, đi lại hoặc nghỉ khi rảnh; subagent là nhân vật nhỏ cạnh nhân vật
    cha;
  - chờ duyệt hiện bong bóng "…" tới khi xong, nhãn "Needs approval";
  - xong hiện dấu tích mờ dần sau 2 s;
  - nhãn hoạt động kiểu "Reading foo.ts";
  - mỗi agent có thanh context xanh, vàng, đỏ ở các mốc 33% và 66%.
- **Cài đặt cẩn thận:** hỏi trước khi ghi vào settings toàn cục, gộp nguyên tử và sao lưu, gỡ chỉ phần của mình, khôi
  phục lệnh statusline nguyên từng byte. Dù vậy issue #377 vẫn báo ghi đè file settings, và ghi chú nội bộ của họ liệt kê
  nhiều lỗi khi gộp cấu hình: ổ đĩa không phân biệt hoa thường, mục rác, so khớp chuỗi con xoá nhầm hook của người khác.
- **Lỗi đáng chú ý:**
  - Tool được gán id tạm `hook-<ts>` không bao giờ đóng khi thiếu `PostToolUse`: 123 agent "treo" sau 10 ngày (#413).
  - Phiên bị kill, phiên `-p`, phiên SDK không có `SessionEnd` nên không bao giờ bị xoá (#413).
  - Sau `/clear`, bấm nhân vật thì focus sai terminal (#251).
  - Hook đồng bộ làm Claude chờ tới 2 s cho mỗi server đã chết.
- **Riêng tư:** họ cố ý không đăng ký `UserPromptSubmit` để không chuyển nội dung prompt đi.


## pixel-agent-desk

App Electron với avatar pixel nổi trên màn hình và một dashboard web. Repo gần như ngừng từ 03/2026, còn 5 PR mở.

- **Trạng thái suy ra từ hook:**
  - `UserPromptSubmit` → Thinking;
  - `PreToolUse` → Working (kèm tên tool), nhưng `PreToolUse` đầu tiên của mỗi lượt bị cố ý bỏ qua;
  - `PostToolUseFailure` → Error;
  - `PermissionRequest`, `Notification` `permission_prompt` → Help;
  - `Stop` → Done, và Done giữ mãi tới prompt kế tiếp.
  - Có debounce Working → Thinking 500 ms để đỡ nhấp nháy. Agent cha lấy trạng thái nặng nhất của các agent con.
- **Hiển thị:** mỗi phiên là một thẻ sprite có bong bóng thoại, viền màu theo trạng thái và đồng hồ đếm. Subagent là
  avatar nhỏ "vệ tinh" quanh thẻ cha. Dashboard có văn phòng nơi nhân vật đi tới bàn hoặc khu nghỉ, heatmap và trang
  token/chi phí.
- **Bấm để focus terminal**, theo từng hệ điều hành; trên macOS dùng AppleScript, đi ngược cây pid. PR #7 báo bản macOS
  không chạy.
- **Lỗi đáng chú ý:**
  - `pgrep` của BSD không có `-c`, nên trên macOS mỗi 30 s mọi avatar bị xoá hết (PR #6).
  - Mẫu `node.*claude` không bắt được binary native của Claude Code.
  - Dashboard nghe trên mọi interface và trả CORS `*`.
  - Xoá agent cuối cùng làm cửa sổ biến mất (PR #2).
- **Nhu cầu người dùng:** issue #5 xin bản chạy trong trình duyệt; PR #3 xin chế độ PiP và chế độ chỉ dashboard.

## agents-observe

Công cụ quan sát phiên Claude Code (và Codex, Hermes), có dòng thời gian theo từng agent. Hoạt động tới 09/2026,
phiên bản 0.9.12.

- **Hook:** command `sh` chạy Node ở nền rồi thoát 0 ngay. Không kết nối được server thì ghi log và **bỏ sự kiện**.
  Chỉ `SessionStart` tự bật server, chờ tối đa 30 s, rồi trả `systemMessage` báo cho người dùng.
- **Lưu trữ:**
  - lưu payload gốc vào SQLite;
  - dedupe bằng hash nội dung cộng khung thời gian 5 s, vì có cài đặt bắn trùng hook;
  - client tự dựng lại mọi thứ từ sự kiện;
  - không có migrate theo phiên bản, không tự dọn.
- **Cây agent:** suy từ `PostToolUse` của tool Agent có `tool_response.agentId`.
- **Subagent "ma":** `SubagentStop` bắn khoảng mỗi 31 s khi có việc nền, với `agent_id` mới và `agent_type` rỗng.
  Họ gom tất cả vào một làn "background". Trong các cài đặt chạy lâu, loại này chiếm khoảng 95% số agent.
- **Hiển thị:** bản đồ bong bóng các phiên trong 24 giờ, dòng thời gian theo làn cho từng agent (Live và Rewind),
  bộ lọc lưu trong DB, tìm kiếm, thống kê token và chi phí.
- **Lỗi đáng chú ý:**
  - Một hook `WorktreeCreate` không trả output làm hỏng việc tạo worktree của mọi người dùng (#8).
  - Dashboard từng bind `0.0.0.0` mà không xác thực (#22).
  - Nhiều lỗi do Docker: SELinux, ổ đĩa Windows, đường dẫn (#20, #21, #29).
  - DB bị bỏ lại khi plugin cập nhật, đã sửa bằng một thư mục dữ liệu ổn định (#17).

## Bài học cho Agent Office

**Khẳng định các quyết định đã chốt:**
- **ADR-007 (thư mục dữ liệu ổn định):** agents-observe mất DB khi plugin cập nhật (#17), và sửa đúng bằng cách này.
- **Không ghi vào settings toàn cục, gỡ cài đặt sạch (mục 9.2):** pixel-agent-desk ghi đè `~/.claude/settings.json`
  khi đọc lỗi và không có cách gỡ. Hook của họ còn trỏ tới cổng chết sau khi tắt app.
- **ADR-001 (pid từ `$PPID`):** liveness bằng `pgrep` là nguồn lỗi chính của pixel-agent-desk trên macOS. PR #7 của
  chính họ cũng đề xuất dùng pid từ hook.
- **Liveness và trạng thái offline là bắt buộc:** agents-observe và pixel-agents đều không kiểm pid, nên phiên bị kill
  hiện "đang chạy" mãi (pixel-agents #413).
- **Chỉ bind `127.0.0.1` và có token (mục 6):** pixel-agent-desk và agents-observe từng mở dashboard ra mạng.
- **Hook không được chặn hay thay hành vi mặc định:** bài học từ #8 của agents-observe. Hook `PermissionRequest` của ta
  phải luôn trả "không quyết định" khi lỗi (ADR-002, ADR-003).
- **Không dùng Docker:** đó là nguồn rắc rối lớn nhất của agents-observe. Ta dùng Node có sẵn cộng `node:sqlite`.

- **Hook đồng bộ làm chậm agent:** pixel-agents chờ tới 2 s mỗi server chết. Điều này khẳng định ADR-003 (`async`).
- **Gắn bàn theo pid, không theo `session_id`:** pixel-agents focus sai terminal sau `/clear` (#251). Ta đã xác nhận ở
  S1, S5.
- **Chỉ dùng id thật:** pixel-agents tự đặt id cho tool và để treo khi thiếu `PostToolUse` (#413). Ta ghép theo
  `tool_use_id`, và `PostToolBatch` cùng transcript đóng các tool còn mở (ADR-001).

**Nên mượn (ý tưởng):**
- **Chuông khác nhau cho "xong" và "chờ duyệt"** (pixel-agents), cùng nhãn hoạt động ngắn như "Reading foo.ts".
- **Thanh mức đầy context** theo ngưỡng màu, lấy từ `context_window.used_percentage` của statusline (S7).
- **Chế độ chỉ có transcript** cho phiên ở dự án chưa bật hook (pixel-agents): độ chính xác thấp hơn nhưng vẫn thấy
  được, nhãn rõ là "ước đoán". Cân nhắc ở M1 hoặc backlog.
- **Debounce chuyển trạng thái** khoảng 500 ms ở `deriveStatus`, không phải trong reducer, để đỡ nhấp nháy giữa các
  tool.
- **Agent cha hiện trạng thái nặng nhất của các agent con**, ví dụ subagent chờ duyệt thì bàn cha cũng báo.
- **Tự tạo phiên khi gặp sự kiện đầu tiên** của một `session_id` lạ, phòng khi server bật sau `SessionStart`.
- **Gom `SubagentStop` "ma"** (không có `SubagentStart`, `agent_type` rỗng) thành tín hiệu "đang có việc nền", thay vì
  chỉ bỏ qua (ADR-001). Kiểm lại với fixture ở M1.
- **Cây subagent** suy từ `PostToolUse` của tool Agent (`tool_response.agentId`).
- **Dedupe hook bắn trùng** (khi vừa có plugin vừa có hook trong dự án) bằng hash nội dung cộng khung thời gian ngắn,
  bổ sung cho khoá `source_key` (ADR-005).
- **Cắt ảnh base64 lớn** khỏi payload trước khi lưu bảng `raw`.
- **`systemMessage` của `SessionStart`** để báo cho người dùng khi server không bật được, ví dụ không tìm thấy Node
  (câu còn mở ở ADR-007).

**Nên cân nhắc:**
- **Nội dung prompt:** hook `sh` + `curl` gửi nguyên payload, nên DB (giữ 30 ngày) sẽ chứa nội dung prompt. pixel-agents
  không chuyển prompt đi. M1 nên quyết định chỉ lưu `prompt_id` và độ dài, hoặc cắt nội dung trước khi lưu.
- **Gộp cấu hình là phần rủi ro nhất** (pixel-agents #377, pixel-agent-desk). Plugin tránh được việc ghi hook, nhưng
  statusline wrapper vẫn phải sửa settings người dùng. Phải nhận diện theo đúng lệnh của mình, gộp nguyên tử, sao lưu,
  và khôi phục nguyên từng byte.

**Nên tránh:**
- **Coi `PostToolUseFailure` là trạng thái lỗi của cả phiên.** Lệnh thất bại là chuyện thường: chỉ đánh dấu ở tool, còn
  `error` của phiên dành cho `StopFailure` (lỗi API, hết quota).
- **Bỏ qua sự kiện theo mẹo** (như bỏ `PreToolUse` đầu tiên). Sẽ có lượt chỉ có một tool trông như đang rảnh.
- **Để "Done" tồn tại mãi.** Done phải chuyển sang idle khi người dùng đã xem (mục 5.2).
- **Ẩn hay đóng giao diện khi không còn agent nào.**

**Chỗ trống mà cả ba đều chưa làm:**
- thông báo hệ thống và badge (pixel-agents chỉ có chuông trong trang);
- duyệt quyền từ giao diện;
- quota từ statusline;
- trạng thái chính thức từ `claude agents --json`;
- phát hiện máy ngủ và thức.

Đây là phần làm Agent Office khác biệt.

**Nhu cầu đã thấy:** có người xin bản chạy trong trình duyệt và chế độ chỉ dashboard (pixel-agent-desk #5, PR #3). Điều
này ủng hộ việc chọn dashboard web.
