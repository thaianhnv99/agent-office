# ADR-007: Đóng gói plugin, shim ổn định, cách bật server và đường dẫn Node

- **Trạng thái:** Chấp nhận (16/11/2026)
- **Người quyết định:** chủ dự án
- **Liên quan:** plan v3.1 mục 8, 9.2; spike S7 (`docs/spikes/s7-statusline.md`), S8 (`docs/spikes/s8-packaging.md`),
  S9 (`docs/spikes/s9-lifecycle.md`); ADR-002, ADR-003

## Bối cảnh

S8 cho thấy những điểm sau.
- **Đường dẫn plugin:**
  - Plugin cài từ marketplace nằm ở `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, tức đường dẫn
    đổi theo mỗi phiên bản.
  - Bản cũ bị xoá 14 ngày sau khi cập nhật.
  - `${CLAUDE_PLUGIN_ROOT}` luôn trỏ tới bản đang chạy.
  - `${CLAUDE_PLUGIN_DATA}` (`~/.claude/plugins/data/<id>/`) giữ nguyên qua các lần cập nhật và bị xoá khi
    gỡ plugin.
  - Hai biến này có trong môi trường của hook.
- **Đường dẫn ổn định:**
  - Hook trong `hooks.json` không cần đường dẫn ổn định.
  - Statusline (nằm trong settings của người dùng) và server đang chạy thì cần.
- **Phụ thuộc:** bước tự cài phụ thuộc của Claude Code không hỗ trợ pnpm. Bundle esbuild chạy được mà không
  cần `node_modules`.
- **Node:**
  - Hook Node lỗi âm thầm khi PATH không có `node`.
  - Hook `sh` + `curl` không cần Node (ADR-003).
- **Đường dẫn Node trên máy chủ dự án** có số phiên bản (nvm: `~/.nvm/versions/node/v22.21.1/bin/node`).

## Quyết định

1. **Plugin ship sẵn mọi thứ, không có bước cài:**
   - `.claude-plugin/plugin.json`;
   - `hooks/hooks.json` cùng các script `hooks/*.sh` (ADR-003);
   - `dist/` chứa server và CLI `agent-office`, bundle bằng esbuild và minify.

   Không ship `node_modules` hay `package.json` có phụ thuộc lúc chạy. Không có MCP server (ADR-002).
2. **Hook gọi thẳng `${CLAUDE_PLUGIN_ROOT}/hooks/<tên>.sh`,** không qua shim.
3. **Shim ổn định đặt tại `${CLAUDE_PLUGIN_DATA}/bin/agent-office`.** Shim gồm script `sh` và file
   `shim.conf`, đọc như dữ liệu và không `source` (bản mẫu: `scripts/spikes/plugin/shim.sh`).
   - **Ai tạo:** hook `SessionStart` tạo hoặc ghi lại shim mỗi khi shim chưa có hoặc phiên bản plugin đã đổi.
     `shim.conf` ghi hai thứ:
     - `entry` là CLI của bản đang chạy (`${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs`);
     - `node` là đường dẫn từ `command -v node` lúc đó, giữ giá trị cũ nếu không tìm thấy.

     Không cần trình cài đặt riêng.
   - **Ai dùng:**
     - hook gọi `agent-office ensure-running` (bật lười);
     - statusline trong settings người dùng: `agent-office statusline -- <lệnh cũ>`;
     - người dùng gọi `agent-office start`, `stop`, `doctor`.
   - **Cách chạy:**
     - `statusline` chạy hoàn toàn bằng `sh`: gửi JSON bằng `curl` chạy nền rồi `exec` lệnh cũ (S7, S8).
     - Các lệnh còn lại `exec` Node.
     - Nếu `node` đã ghi không còn thì dùng `node` trên PATH và ghi cảnh báo.
     - Không có `node` nào thì ghi lỗi vào `${CLAUDE_PLUGIN_DATA}/logs/shim.log` và thoát 0.
     - Luôn dùng `exec`, để `ppid` vẫn là `claude` (S7).
4. **Cách bật server: chỉ qua hook, không dùng LaunchAgent** (giữ quyết định của plan v3.1).
   - `SessionStart` kiểm tra server. Không kết nối được thì gọi `ensure-running`, và lệnh này bật server tách
     hẳn khỏi hook.
   - Các hook khác bật lười theo đúng điều kiện ở mục 9.2: khoá nguyên tử, giới hạn tần suất, tôn trọng cờ "đã
     tắt có chủ đích".
   - **Server báo phiên bản ở `/health`.** Nếu khác phiên bản plugin của hook gọi tới, `ensure-running` tắt
     server cũ rồi bật bản mới. Lý do: server đang chạy code của thư mục cũ, mà thư mục đó bị xoá sau 14 ngày.
   - Server chỉ bind cổng khi đã sẵn sàng trả lời (S9).
5. **Dữ liệu của shim** (config, log của shim, token cho hook) nằm trong `${CLAUDE_PLUGIN_DATA}`, nên tự sạch khi
   gỡ plugin. Chỗ đặt DB và lịch sử chốt ở ADR-005.
6. **Khi dev:**
   - Không tạo shim, không ghi vào `${CLAUDE_PLUGIN_DATA}`.
   - Script lấy thư mục dữ liệu từ `AGENT_OFFICE_HOME` (`.dev-data/`) nếu biến này có (mục 9.2).
   - Plugin dev mang tên khác bản phát hành, vì `--plugin-dir` sẽ thay thế plugin cùng tên đã cài (S8).
7. **Không đóng gói thành file chạy độc lập** (Node SEA) ở v0.1. Chỉ server và CLI cần Node, và shim đã xử lý
   được trường hợp đường dẫn Node đổi.

## Hệ quả

- Cập nhật plugin không làm hỏng gì:
  - hook luôn trỏ đúng bản đang chạy;
  - `SessionStart` đầu tiên sau khi cập nhật ghi lại shim và bật lại server.
- **Gỡ plugin xoá luôn shim.**
  - Lệnh statusline trong settings người dùng phải được khôi phục **trước** khi gỡ plugin. `agent-office
    uninstall` làm việc này. Checklist gỡ cài đặt (M3.5) ghi rõ thứ tự.
  - Lệnh statusline nên có nhánh dự phòng chạy thẳng lệnh cũ khi shim không còn. Chi tiết làm ở M4.
- Người dùng không có `node` vẫn có hook chạy, nhưng server không bật được.
  - Cần một cách báo cho người dùng, ví dụ `systemMessage` của hook `SessionStart` hoặc lệnh `agent-office
    doctor`. Chốt ở M1.
- Mọi đường dẫn `~/Library/Application Support/agent-office/bin/` và `~/Library/Logs/agent-office/` trong plan
  v3.1 được thay bằng `${CLAUDE_PLUGIN_DATA}`.

## Phương án đã cân nhắc

- **Shim ở `~/Library/Application Support/agent-office/bin/`** (plan v3.1). Ưu điểm là tồn tại độc lập với plugin,
  nên statusline không hỏng khi gỡ plugin. Bị loại vì phải có trình cài đặt riêng và bước dọn dẹp riêng, và đây
  là thêm một chỗ ghi ngoài thư mục của Claude Code.
- **Hook gọi qua shim** (ghi chú cũ ở mục 9.2). Không cần thiết, vì `${CLAUDE_PLUGIN_ROOT}` đã luôn đúng.
- **Dựa vào bước tự cài phụ thuộc của Claude Code.** Bị loại vì không hỗ trợ pnpm, có timeout 60 s, và không chạy
  với plugin nạp tại chỗ.
- **Node SEA.** Chưa cần, như đã nói ở quyết định 7.
