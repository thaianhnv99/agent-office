# S9: Vòng đời session và sleep/wake

Spike S9 của M0 (issue #16, time-box 1-1,5 giờ, xong trong time-box). Thử ngày 16/11/2026 với Claude Code
2.1.325, Node 22.21.1 (libuv 1.51.0), macOS 26.5.2 trên máy Apple Silicon (arm64).

## Cách thử

- **Kill:** `scripts/spikes/lifecycle/kill-session.sh <SIGNAL> [idle|busy]` mở một phiên `claude` trong
  sandbox, gửi tín hiệu cho nó, rồi ghi lại trước và sau:
  - hook (có `SessionEnd` không);
  - MCP server `ao-channel` (stdin đóng hay nhận tín hiệu);
  - file `~/.claude/sessions/<pid>.json` (chỉ đọc);
  - `claude agents --json`.

  Có hai chế độ:
  - `idle`: phiên tương tác chạy trong pty do `script(1)` tạo, đang chờ ở ô nhập;
  - `busy`: `claude -p` đang chạy một lệnh Bash dài (`ping`).
- **Sleep/wake:**
  - `scripts/spikes/lifecycle/clock-probe.ts` chạy nền suốt lúc máy ngủ. Cứ 5 s nó so `Date.now` với
    `performance.now` và `process.hrtime` bằng `compareTicks` (`clock.ts`, có 7 test), và có một
    `setTimeout` 60 s tự đặt lại sau mỗi lần chạy.
  - Chủ dự án mở một phiên tương tác, gửi `[s9-01]`, gập máy khoảng 20 phút, mở lại rồi gửi `[s9-02]`.
  - Đối chiếu với `pmset -g log` (chỉ đọc).
- Sandbox dùng cấu hình S9: logger S1 với tag `s9/hooks`, `SessionEnd` đồng bộ, statusline, và
  `ao-channel` ghi log vào `.dev-raw/s9`.

## Kết quả

### Kết thúc phiên bằng tín hiệu

| Tín hiệu | `SessionEnd` | MCP server | `~/.claude/sessions/<pid>.json` | `claude agents --json` |
|---|---|---|---|---|
| `KILL`, phiên đang chờ | **không** | stdin đóng sau 8 ms | **còn sót lại** | bỏ phiên ra ngay |
| `KILL`, phiên đang chạy `ping` | **không** | stdin đóng sau 9 ms | **còn sót lại** | bỏ phiên ra ngay |
| `TERM`, phiên đang chờ | có, `reason: other` (cả hook `async` lẫn đồng bộ) | nhận `SIGINT` sau 264 ms | được xoá | bỏ phiên ra |
| `HUP` (giống đóng terminal), phiên đang chờ | có, `reason: other` | nhận `SIGINT` sau 259 ms | được xoá | bỏ phiên ra |

- Khi `kill -9` lúc đang chạy lệnh, **lệnh con vẫn chạy tiếp** (shell và `ping` thành tiến trình mồ côi).
- File phiên sót lại bị xoá ngay sau lần chạy `claude agents --json` kế tiếp. Lệnh này tự dọn file của các
  tiến trình đã chết (Claude Code ghi vào `~/.claude`, không phải mình ghi).
- `/exit` (S3) cho `reason: prompt_input_exit`; `TERM` và `HUP` cho `reason: other`.

### Sleep và wake (gập máy khoảng 20 phút)

`pmset` cho thấy máy ngủ lúc 22:18:11 và thức hẳn lúc 22:37:26. Ở giữa có vài lần **DarkWake** (máy thức
nền vài giây để bảo trì): 22:18:13, 22:18:49, 22:36:07 và 22:36:15.

| Đầu dò thấy gì | Giá trị |
|---|---|
| Kiểu tick sau giấc ngủ dài | `late-tick`, **không phải** `wall-jump` |
| Chênh lệch `Date.now` với `performance.now` / `process.hrtime` | khoảng 0 s |
| Tick trễ hơn một chu kỳ | 1.027 s (khớp với lần ngủ 1.030 s trong `pmset`), cùng hai lần nhỏ 24 s và 48 s |
| `os.uptime()` | cũng tăng 1.033 s |
| `setTimeout` 60 s đặt trước khi ngủ | chạy sau 1.037 s, đúng lúc DarkWake 22:36:07; chỉ chạy một lần |
| `setInterval` 5 s | chỉ một tick khi thức, không dồn hàng trăm tick |

- **Trên máy này, đồng hồ đơn điệu của Node (`performance.now`, `process.hrtime`) vẫn chạy trong lúc máy
  ngủ.** Vì vậy cách phát hiện ở mục 5.4 (đồng hồ thật nhảy vượt đồng hồ đơn điệu) **không dùng được**.
  Cách còn lại vẫn dùng được: tick đến trễ bất thường so với chu kỳ (`late-tick`). `compareTicks` bắt được cả
  hai kiểu.
- **Timer không chạy lúc ngủ. Timer quá hạn chạy ngay khi máy thức, kể cả lúc DarkWake.** Một bộ đếm ân hạn 5
  phút đặt trước khi ngủ sẽ chạy ngay ở lần DarkWake đầu tiên. Đây đúng là rủi ro "tắt server nhầm" của mục
  5.4, nên mọi timer quyết định phải kiểm tra tick trễ trước khi hành động.
- **Tiến trình chạy được trong DarkWake.** Hook `Notification` `idle_prompt`, vốn bắn 60 s sau `Stop` (S1),
  thực tế bắn lúc 22:36:07, tức 18 phút sau, đúng lần DarkWake. Vậy hook và server có thể chạy vài giây khi
  máy đang "ngủ".
- **Phiên sống qua giấc ngủ:**
  - cùng pid, không có `SessionStart` mới;
  - MCP server không nhận tín hiệu nào;
  - `[s9-02]` sau khi thức chạy bình thường;
  - `claude agents --json` vẫn báo `interactive`, `idle`;
  - statusline không chạy lúc ngủ, và chạy lại ở message đầu tiên sau khi thức.

### Phiên con

Phiên `claude` mở từ bên trong một phiên Claude Code khác thừa hưởng các biến môi trường đánh dấu, như
`CLAUDE_CODE_CHILD_SESSION`, `CLAUDECODE` và `CLAUDE_CODE_SESSION_ID`. Hệ quả:
- màn hình báo "Transcript saving is off — inherited CLAUDE_CODE_CHILD_SESSION marker";
- **không có file trong `~/.claude/sessions/`** và **không hiện trong `claude agents --json`**;
- hook vẫn bắn.

Agent do agent khác mở (ví dụ một phiên chạy `claude -p` qua Bash) sẽ chỉ thấy được qua hook, không có
transcript. Kịch bản kill phải xoá các biến này để phiên giống phiên người dùng mở.

## Trả lời các câu của S9

- **`SessionStart` có chạy khi resume không:** có, với `source: resume` (S1). Sau sleep/wake thì không có
  `SessionStart` mới, vì phiên không khởi động lại.
- **Payload có pid không:** không có trường pid. `ppid` của tiến trình hook là pid của `claude` (S1). Đây
  cũng là `ppid` của statusline (S7) và của MCP server (S3). `claude agents --json` có `pid`.
- **Session bị crash hoặc kill có `SessionEnd` không:** `kill -9` thì **không**. `TERM` và `HUP` (đóng terminal)
  thì có, với `reason: other`. Nên liveness phải dựa vào pid còn sống (`kill -0`) hoặc `claude agents --json`.
  Không dựa vào `~/.claude/sessions/<pid>.json`, vì file này còn sót lại sau `kill -9`.
- **Đồng hồ đơn điệu và timer của Node có chạy lúc máy ngủ không:**
  - đồng hồ đơn điệu **có** chạy (máy này);
  - timer **không** chạy, và chạy bù một lần khi máy thức, kể cả DarkWake.

  Phát hiện sleep bằng tick trễ: dùng được. Phát hiện bằng chênh lệch giữa hai đồng hồ: không dùng được.
- **Hook gọi khi server tắt có chặn agent không:** không (S6: `ECONNREFUSED` trong 1-8 ms; hook `async` không
  chặn). Trường hợp "đang bật lại": server chỉ nên bind cổng khi đã sẵn sàng trả lời. Trước lúc đó hook
  nhận `ECONNREFUSED` ngay. Hook `async` với `curl -m 1` (S8) không bao giờ chặn agent.

## Đề xuất cho plan

- **Mục 5.4:** đổi cách phát hiện wake sang tick trễ:
  - kiểm tra định kỳ mỗi 30-60 s;
  - nếu tick đến trễ hơn 3 chu kỳ thì coi là vừa thức;
  - giữ cả hai nhánh của `compareTicks`, vì máy hoặc phiên bản Node khác có thể khác.
- **Quy tắc cho timer:** mọi timer dẫn tới quyết định (tắt server, đánh dấu offline) phải chạy kiểm tra tick
  trễ trước. Nếu vừa thức thì đặt lại bộ đếm và đối chiếu lại sau một khoảng ngắn, đúng quy tắc cứng của
  mục 5.4.
- **Liveness:**
  - pid lấy từ `ppid` của hook `SessionStart`;
  - kiểm tra bằng `kill -0` (rẻ), và đối chiếu bằng `claude agents --json` (S2);
  - nếu có MCP server thì stdin đóng là tín hiệu chết nhanh nhất (8-9 ms) với `kill -9`.
- **Phiên con:** ghi vào giới hạn của sản phẩm. Agent do agent khác mở chỉ có dữ liệu hook, không có transcript,
  và không nằm trong `claude agents --json`.

## Giới hạn

- Một máy Apple Silicon, một phiên bản macOS và Node. Máy Intel có thể khác ở phần đồng hồ.
- Ngủ một lần, khoảng 20 phút, chạy bằng pin.
- Chưa thử ngủ nhiều giờ hay chạy bằng điện, nơi DarkWake có thể nhiều hơn.
- Phiên tương tác ở phần kill chạy trong pty giả lập (`script`), không phải trong terminal VS Code thật.
  Còn phần sleep/wake thì chạy trong terminal VS Code thật.
- Mỗi tín hiệu thử một lần.
