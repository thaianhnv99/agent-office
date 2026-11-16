# S8: Đóng gói plugin và đường dẫn tới server

Spike S8 của M0 (issue #11, time-box 1 giờ, xong trong time-box). Thử ngày 16/11/2026 với Claude Code
2.1.325, Node 22.21.1 (nvm) trên macOS.

## Cách thử

- Plugin mẫu nằm trong `scripts/spikes/plugin/`:
  - `src/hook.ts`: hook entry. Nó validate payload bằng zod, một phụ thuộc thật lúc chạy, rồi ghi lại nó được
    chạy thế nào: node nào, tiến trình cha nào, biến môi trường nào, mất bao lâu để khởi động.
  - `build.ts`: dùng esbuild để bundle hook và zod thành `dist/hook.mjs`, rồi ghi `plugin.json` và
    `hooks.json` vào `.dev-data/s8/plugin/`. Có 3 test, chạy bundle từ thư mục tạm **ngoài repo** nên không
    có `node_modules`.
  - `shim.sh`: shim ổn định mẫu, có 4 test.
  - `measure.mjs`: đo chi phí khởi động.
- Nạp plugin bằng `claude -p --plugin-dir .dev-data/s8/plugin` trong sandbox, hai lần: một lần với PATH bình
  thường, một lần với PATH không có `node`.
- Phần nói về tài liệu chính thức đã đối chiếu ngày 16/11/2026 với các trang Plugins reference, Plugin
  loading, Plugin components, Plugins CLI reference và Hooks (exec form, shell form) trên
  [code.claude.com](https://code.claude.com/docs/en/plugins).

## Kết quả

### Phụ thuộc lúc chạy và bundle

- **Bundle được.** esbuild gộp hook và zod thành một file: 742 KB, hoặc 444 KB khi minify. File này chạy
  được mà không cần `node_modules`.
- Theo tài liệu:
  - Claude Code tự cài phụ thuộc npm/Bun khi copy plugin vào cache, nếu có `package.json` cùng lockfile npm hoặc
    bun. Bước cài này **không hỗ trợ pnpm**, không chạy lifecycle script, và có timeout 60 s.
  - Plugin nạp tại chỗ (local marketplace, `--plugin-dir`) thì không được cài.

  Bundle sẵn là cách chắc chắn nhất, vì không phụ thuộc bước cài.
- pnpm 11 chặn script cài của esbuild và báo lỗi. Script này không cần thiết, vì binary đã tới qua optional
  dependency. Đã ghi `allowBuilds: { esbuild: false }` vào `pnpm-workspace.yaml`.

### Đường dẫn plugin

- Plugin cài từ marketplace nằm ở `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, tức **đường
  dẫn có số phiên bản**. Trên máy đang có hai bản `postman` 2.0.1 và 2.3.0 nằm cạnh nhau. Theo tài liệu, bản
  cũ được đánh dấu `.orphaned_at` và **bị xoá sau 14 ngày**.
- `${CLAUDE_PLUGIN_ROOT}` luôn trỏ tới bản đang chạy, và `hooks.json` nằm ngay trong plugin. Vì vậy **hook
  không cần shim**: dùng `${CLAUDE_PLUGIN_ROOT}` trong lệnh hook vẫn đúng sau mỗi lần cập nhật. Hook cũng nhận
  `CLAUDE_PLUGIN_ROOT` và `CLAUDE_PLUGIN_DATA` dưới dạng biến môi trường. Điều này ngược với ghi chú "shim
  chỉ cho hook" ở mục 9.2.
- Hai chỗ thật sự cần đường dẫn ổn định:
  - **Server đang chạy**, được bật từ bản cũ, sẽ tiếp tục chạy code cũ. Thư mục của nó còn tồn tại 14 ngày.
    `ensure-running` phải so phiên bản server với phiên bản plugin, và bật lại server khi khác nhau.
  - **Statusline:** lệnh này nằm trong settings của người dùng. Theo tài liệu, plugin không đặt được
    statusline, và lệnh statusline không dùng được `${CLAUDE_PLUGIN_ROOT}`. Vì vậy statusline cần shim.
- `${CLAUDE_PLUGIN_DATA}` (`~/.claude/plugins/data/<id>/`) **giữ nguyên qua các lần cập nhật** và bị xoá khi
  gỡ plugin. Với `--plugin-dir`, đường dẫn là `~/.claude/plugins/data/agent-office-s8-inline`. Thư mục này do
  Claude Code tự tạo, giống S0.

### Node và nvm

- Hook gọi `node` theo PATH của tiến trình `claude`. Với PATH bình thường, đó là
  `~/.nvm/versions/node/v22.21.1/bin/node`.
- **Khi PATH không có `node`**, mọi hook viết bằng Node đều lỗi:
  - dạng shell báo `node: command not found` (exit 127);
  - dạng exec báo exit 1 mà không có thông báo.

  Lỗi không chặn agent, nhưng **dashboard mất hết sự kiện** mà không ai biết. Tài liệu chỉ khuyên "đảm bảo
  `node` có trong PATH của terminal mở `claude`". Hook chạy trong shell không tương tác, nên không nạp nvm.
- Shim mẫu (`shim.sh`):
  - đọc `node=` và `entry=` từ `shim.conf` như dữ liệu, không `source`;
  - nếu node đã ghi không còn (ví dụ gỡ một phiên bản nvm) thì dùng `node` trên PATH và ghi cảnh báo vào log;
  - nếu không có node nào thì ghi lỗi và thoát 0;
  - cuối cùng `exec`, để node là con trực tiếp của bên gọi và `ppid` vẫn là `claude` (cần cho S7).

### Chi phí khởi động một lần chạy hook (30 lần, wall time)

| Cách đóng gói | p50 | p95 |
|---|---|---|
| Node chạy script rỗng (mốc so sánh) | 22 ms | 27 ms |
| Bundle esbuild (742 KB, có zod) | 36 ms | 40 ms |
| Bundle esbuild, minify (444 KB) | 34 ms | 36 ms |
| Chạy thẳng `.ts` (type stripping, zod từ `node_modules`) | 64 ms | 65 ms |
| Shim `sh` rồi `exec` node (bundle minify) | 36 ms | 38 ms |
| **`sh` + `curl` gửi tới server local (không cần Node)** | **8 ms** | **9 ms** |

- Bundle nhanh gần gấp đôi so với chạy thẳng `.ts`. Zod thêm khoảng 12-15 ms so với Node rỗng.
- Shim gần như không tốn thêm gì.
- Hook dùng `sh` + `curl` nhanh hơn Node 4 lần, **và không phụ thuộc Node hay nvm**.

### Thử plugin bằng `--plugin-dir`

- Plugin nạp được. `SessionStart`, `UserPromptSubmit`, `PreToolUse` và `PostToolUse` (dạng exec) đều bắn.
  `Stop` dạng `async` bị huỷ ở `-p`, giống S1 và S6.
- `ppid` giống nhau ở dạng shell và dạng exec, vì `sh -c` sẽ `exec` thẳng một lệnh đơn.
- Theo tài liệu:
  - plugin nạp bằng `--plugin-dir` có id `<name>@inline`;
  - nó **thay thế** plugin cùng tên đã cài.

  Khi dev nên đặt tên plugin khác bản phát hành.

## Đề xuất cho ADR-007 (và ADR-003)

- **Hook chuyển sự kiện** (`async`):
  - là script `sh` trong plugin (`${CLAUDE_PLUGIN_ROOT}/hooks/...`), gọi `curl -m 1` tới server;
  - kiểm tra công tắc tắt nhanh bằng một phép thử file;
  - nếu `curl` báo không kết nối được (exit 7) thì gọi `agent-office ensure-running` qua shim (bật lười, mục 9.2).

  Cách này không cần Node, và mất 8 ms (wall time) thay vì khoảng 35 ms. Nó vẫn là hook command `async` như đề xuất
  ADR-003 của S6, chỉ đổi Node thành `sh` + `curl`.
- **Hook `PermissionRequest`** (S4): dùng kiểu `http`, không cần Node.
- **Server, `ensure-running` và statusline wrapper:**
  - viết bằng Node, bundle bằng esbuild (minify), không ship `node_modules`;
  - gọi qua shim ổn định có `exec` và có cơ chế tìm lại node;
  - statusline wrapper cũng có thể viết bằng `sh` (đọc stdin, `curl` chạy nền, rồi `exec` lệnh cũ) để khỏi
    cần Node.
- **Vị trí shim (chủ dự án chọn):**
  - `${CLAUDE_PLUGIN_DATA}/bin/agent-office`: tự xoá khi gỡ plugin, không ghi gì ngoài `~/.claude`;
  - hoặc `~/Library/Application Support/agent-office/bin/` như plan: tồn tại độc lập với plugin.
- **`ensure-running`** so phiên bản server đang chạy với phiên bản plugin, và bật lại server nếu khác.
- **File chạy độc lập** (Node SEA) chưa thử. Nếu hook không cần Node thì chỉ server cần Node, và shim đã xử lý
  được trường hợp đường dẫn Node đổi.

## Giới hạn

- Chỉ thử `-p` với `--plugin-dir`.
- Chưa cài thật từ marketplace và chưa cập nhật plugin thật, vì như vậy phải ghi vào cấu hình người dùng.
- Chưa thử phiên tương tác, VS Code extension hay app desktop. Ở các nơi này PATH có thể khác.
- Chưa thử Node SEA.
- Số đo từ một máy. Wall time đã gồm thời gian spawn.
