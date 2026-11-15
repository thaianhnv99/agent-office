# S0: Mức cô lập

Spike S0 của M0 (issue #3, time-box 1 giờ). Thử ngày 15/11/2026 với Claude Code 2.1.325 trên macOS,
sandbox tại `~/agent-office-sandbox/` (git repo riêng, có `CLAUDE.md` riêng, hook và statusline đặt
trong `.claude/settings.local.json` của chính nó). Cấu hình toàn cục `~/.claude/settings.json` không
có hook nào và không bị sửa (hash giữ nguyên trước và sau spike).

## Cách thử

- Hook là `scripts/spikes/log-event.ts`, ghi payload thô vào `.dev-raw/s0/` (ngoài git), mỗi nguồn một
  tag: `s0/project` (sandbox), `s0/flag` (`--settings`), `s0/plugin` (`--plugin-dir`).
- Các phiên chạy bằng `claude -p --model haiku --output-format stream-json --verbose --include-hook-events`
  trong một môi trường sạch (`env -i`, chỉ giữ `HOME`, `PATH`, `USER`, `SHELL`, `TERM`, `TMPDIR`), nên
  không thừa hưởng biến môi trường của phiên Claude Code đang chạy. 8 phiên, mỗi phiên một prompt ngắn.
- `--include-hook-events` cho biết mọi hook đã chạy, kể cả hook của plugin cấp người dùng.
- Sự kiện `InstructionsLoaded` cho biết chính xác những file `CLAUDE.md` nào được nạp.

## Kết quả

| # | Thử | Kết quả |
|---|---|---|
| E1 | `-p` trong sandbox | Cả 5 hook của sandbox chạy (`SessionStart`, `InstructionsLoaded`, `UserPromptSubmit`, `Stop`, `SessionEnd` với `reason: other`). Hook `SessionStart` của plugin Postman (cấp người dùng) cũng chạy. Transcript ở `~/.claude/projects/-Users-<user>-agent-office-sandbox/` |
| E1b | `-p` trong `sandbox/sub` | Hook của sandbox vẫn chạy và `CLAUDE.md` của sandbox vẫn được nạp (tìm ngược lên). Nhưng `CLAUDE_PROJECT_DIR` và thư mục transcript lấy theo cwd: `...-agent-office-sandbox-sub` |
| E1c | `-p` ở thư mục khác | Không hook nào của sandbox chạy; chỉ còn hook của Postman |
| E2 | `-p --settings <file hook>` trong sandbox | Hook từ `--settings`, hook của sandbox và hook của plugin **cùng chạy**: hook gộp lại, không thay thế nhau |
| E2b | `-p --settings <file hook>` ở thư mục khác | Hook từ `--settings` chạy mà không cần ghi gì vào dự án |
| E3 | `-p --setting-sources project,local` | Plugin cấp người dùng (postman, agent-skills, easel) không được nạp, hook Postman không chạy; hook sandbox vẫn chạy; vẫn dùng đăng nhập hiện có. Vẫn còn các plugin `cc-plugin-*` |
| E4 | `-p --plugin-dir <plugin tối thiểu>` | Hook của plugin chạy, `CLAUDE_PLUGIN_ROOT` trỏ vào thư mục dev. Nhưng `CLAUDE_PLUGIN_DATA` là `~/.claude/plugins/data/agent-office-s0-inline`, và Claude Code **tự tạo thư mục đó** (rỗng). Không thấy thay đổi ở danh sách plugin đã cài |
| E5 | `CLAUDE_CONFIG_DIR=<thư mục rỗng trong .dev-data/>` | `Not logged in · Please run /login`: đăng nhập không dùng chung (theo tài liệu, entry Keychain gắn với từng thư mục cấu hình). `.claude.json`, `plugins/`, `projects/` (transcript), `session-env/` đều nằm trong thư mục đó. Hook của sandbox vẫn chạy dù chưa đăng nhập |

## Trả lời các câu của S0

| Câu hỏi | Trả lời |
|---|---|
| Hook trong `.claude/settings.local.json` có chỉ chạy trong sandbox không | **Có** (E1, E1c). Chạy cả khi mở Claude Code ở thư mục con (E1b) |
| `CLAUDE_CONFIG_DIR` cô lập được gì | Cấu hình, `.claude.json`, plugin, transcript, `session-env` (E5). **Đăng nhập không dùng chung**: mỗi thư mục cấu hình cần `/login` riêng, tạo thêm một entry Keychain |
| `--plugin-dir` cô lập được gì | Nạp plugin cho riêng phiên đó, không cài vào danh sách plugin. Nhưng vẫn tạo `~/.claude/plugins/data/<tên>-inline` (E4) |
| Hook nạp qua `--settings` có gộp với hook khác không | **Có**: gộp với hook của dự án và của plugin (E2); chạy được ở dự án không có cấu hình (E2b) |
| Statusline đặt ở cấp dự án được không | **Có**: lệnh statusline trong `.claude/settings.local.json` của sandbox được gọi ở cả 3 phiên tương tác |
| `CLAUDE.md` ở thư mục cha có bị nạp không | **Có**, Claude Code tìm ngược lên (E1b). Phía trên `~/agent-office-sandbox` không có `CLAUDE.md` nào, nên sandbox sạch. Riêng `~/.claude/CLAUDE.md` luôn được nạp: là file cấp người dùng, và khi tắt nguồn `user` (E3) nó vẫn được nạp dưới nhãn Project vì `~` là thư mục tổ tiên của sandbox |

## Phát hiện khác

- **`-p` không hỏi workspace trust và chạy hook của dự án ngay** (đúng theo tài liệu). Phiên tương tác
  thì giữ lại mọi hook, kể cả hook toàn cục, cho tới khi chấp nhận hộp thoại trust.
- Thư mục transcript lấy theo cwd chứ không theo gốc dự án (E1b). Tailer phải lấy đường dẫn từ
  `transcript_path` của hook, không tự suy ra (khớp với mục 9.2).
- Hook của plugin cấp người dùng chạy ở mọi dự án, nên dữ liệu S1 sẽ lẫn sự kiện của chúng, trừ khi
  dùng `--setting-sources project,local` (E3).
- Mỗi phiên tạo `~/.claude/session-env/<session-id>/` (giá trị của `CLAUDE_ENV_FILE`).

## Câu hỏi 11: đã chốt (15/11/2026)

Chủ dự án chọn theo đề xuất:

- **S1, S2, S6, S7: mức 1** (sandbox) chạy kèm `--setting-sources project,local` để dữ liệu không lẫn
  hook của plugin cấp người dùng. Không cần đăng nhập lại, không đụng Keychain.
- **S3, S5, S8 (cần plugin): `--plugin-dir`** trong sandbox. Chấp nhận thư mục rỗng
  `~/.claude/plugins/data/<tên>-inline` do Claude Code tự tạo; ghi vào danh sách dọn dẹp.
- **Mức 2 (`CLAUDE_CONFIG_DIR`) chỉ dùng khi thật cần**, ví dụ thử cài đặt từ đầu, vì phải `/login`
  riêng và tạo thêm entry Keychain.

Dữ liệu cho câu hỏi 14: cách (b) `scripts/claude-ao` (gọi `claude --settings <file hook>`) dùng được,
hook gộp với hook của dự án và plugin, và không ghi gì vào dự án (E2, E2b).

## Kiểm tra tương tác

Statusline và hộp thoại trust chỉ có ở phiên tương tác. Chủ dự án mở `claude --model haiku` trong
terminal:

- [x] **Sau khi trust sandbox, hook chạy trong phiên tương tác.** 3 phiên, mỗi phiên có `SessionStart`,
  `InstructionsLoaded` (User và Project) và `SessionEnd` với `reason: prompt_input_exit`.
- [x] **Statusline cấp dự án được gọi** ở cả 3 phiên.
- [x] **Từ chối trust thì không gì chạy.** Thử ở một thư mục chưa từng được trust (thư mục tạm, không
  có thư mục cha nào đã trust), có hook và statusline riêng: không hook nào chạy, lệnh statusline cũng
  không chạy, Claude Code không ghi entry trust nào. Log trống, nên ý này dựa trên việc hộp thoại đã
  hiện và đã bị từ chối.

Xem trước cho S7, từ JSON lệnh statusline nhận được:

- `rate_limits.five_hour` và `rate_limits.seven_day` có `used_percentage` và `resets_at`, nhưng chỉ có
  trong 1 trên 4 lần gọi.
- **Không có `process.pid`** trong bản 2.1.325 (mục 4 của plan dự đoán là có). Trong mỗi phiên, hook và
  lệnh statusline có cùng `ppid`, nhiều khả năng là pid của tiến trình Claude Code; S5 và S7 xác nhận.

## Dọn dẹp

- Sandbox: `rm -rf ~/agent-office-sandbox` (script `pnpm sandbox:clean` sẽ có ở M1).
- Dữ liệu spike trong repo: `.dev-raw/s0/`, `.dev-data/s0/` (ngoài git).
- Do Claude Code tự tạo, script của dự án không xoá: transcript trong
  `~/.claude/projects/-Users-<user>-agent-office-sandbox*`, `~/.claude/plugins/data/agent-office-s0-inline`.
