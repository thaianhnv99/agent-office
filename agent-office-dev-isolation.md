# Quy tắc cô lập khi phát triển "Agent Office"

> File này dùng làm đầu vào cho AI. Cách dùng: đưa kèm `agent-office-plan-v2.md` (và `agent-office-plan-review.md` nếu có), yêu cầu AI đưa nội dung dưới đây vào plan v3.

## 0. Hướng dẫn cho AI

**Nhiệm vụ:** thêm vào plan v3 một mục **"Quy tắc cô lập khi phát triển"** và cập nhật các milestone liên quan theo nội dung file này.

**Quy tắc:**
- Giữ nguyên cấu trúc, giọng văn, ngôn ngữ (tiếng Việt) và các quyết định đã có của v2.
- Thêm các việc mới vào đúng milestone dưới dạng checkbox, kèm tiêu chí "Xong khi" nếu cần.
- Điều chỉnh ước tính giờ nếu việc mới làm thay đổi đáng kể, và cộng lại để kiểm tra số học.
- Các mục đánh dấu **[chưa kiểm chứng]** là kiến thức chưa được đối chiếu với tài liệu hiện tại của Claude Code. Giữ nguyên nhãn đó và đưa vào bước xác nhận ở M0, không tự khẳng định chắc chắn.
- Những chỗ cần người dùng quyết định thì đưa vào "Câu hỏi còn mở" kèm hạn chốt.

## 1. Ràng buộc từ chủ dự án

- Khi phát triển app, **không đụng chạm tới hệ thống của máy Mac**, vì máy còn dùng cho nhiều dự án khác.
- Hậu quả thiết kế:
  - Không ghi cấu hình hay hook vào phạm vi toàn cục khi đang phát triển.
  - Không cài thứ chạy nền hệ thống (LaunchAgent) trong lúc dev.
  - Mọi dữ liệu dev nằm trong thư mục repo và xoá sạch được bằng một lệnh.
  - Khi chạm tới dự án thật, đi từng bước nhỏ và có thể quay lại.

## 2. Nguyên tắc chung

1. **Phần lớn việc phát triển không cần Claude Code thật.** Plan v2 đã có `simulator` (phát lại fixture, sinh kịch bản). Reducer, server, UI danh sách, văn phòng pixel, panel duyệt đều phát triển và test được bằng simulator.
2. **Chỉ tiếp xúc Claude Code thật ở phạm vi nhỏ nhất:** M0 (thu dữ liệu thật), test tích hợp, và giai đoạn dùng thử hằng ngày.
3. **Mặc định cô lập, mở rộng dần.** Chỉ nới phạm vi khi mức trước đã ổn định.
4. **Chỉ đọc với dữ liệu của Claude Code.** Không bao giờ ghi, sửa hay xoá bất cứ thứ gì trong `~/.claude/`.

## 3. Các mức cô lập khi cần Claude Code thật

| Mức | Cách làm | Ảnh hưởng tới dự án khác | Dùng khi |
|---|---|---|---|
| 0 | Chỉ dùng simulator | Không | Mặc định cho phát triển |
| 1 | **Dự án sandbox**: một thư mục test riêng, hook đặt trong `.claude/settings.local.json` của chính thư mục đó | Không, vì hook chỉ có hiệu lực khi chạy Claude Code trong thư mục đó | M0 và test tích hợp |
| 2 | Thư mục cấu hình Claude riêng (biến môi trường `CLAUDE_CONFIG_DIR`) và nạp plugin từ thư mục dev (`--plugin-dir`) | Không | Thử plugin, channel |
| 3 | Tài khoản macOS riêng hoặc máy ảo | Không | Kiểm thử cài đặt từ đầu, đo thời gian cài |

**[chưa kiểm chứng]** Các tính năng ở mức 2 (`CLAUDE_CONFIG_DIR`, `--plugin-dir`) cần được xác nhận với tài liệu hiện tại và thử thực tế ở M0, kể cả việc chúng cô lập được những gì (cấu hình, plugin, thư mục transcript).

**Quy tắc cứng:** không đặt hook vào `~/.claude/settings.json` (cấu hình toàn cục) trong lúc phát triển. Hook toàn cục chạy ở mọi session của mọi dự án, nên một hook lỗi sẽ ảnh hưởng tất cả.

## 4. Giữ mọi thứ nằm trong thư mục repo

- **Dữ liệu dev:** biến môi trường `AGENT_OFFICE_HOME=./.dev-data` (đã `.gitignore`). Không ghi vào `~/Library` hay `~/.config` khi dev.
- **Cổng mạng:** cổng riêng cấu hình qua env, chỉ bind `127.0.0.1`, báo lỗi rõ ràng khi cổng đang bận.
- **Không LaunchAgent trong dev.** Chạy server bằng `pnpm dev`, tắt bằng Ctrl+C.
- **Script vòng đời:**
  - `dev:up`: khởi động server và web ở chế độ dev;
  - `dev:down`: dừng mọi tiến trình do dự án sinh ra;
  - `dev:clean`: xoá `.dev-data` và các file tạm.
- **Node và pnpm:** plan v2 ghi `corepack enable` (lệnh này tạo shim cạnh binary Node). Để tránh sửa môi trường, thay bằng một trong hai cách: dùng `corepack pnpm ...`, hoặc khai báo `packageManager` trong `package.json` kèm `.nvmrc` để ghim phiên bản Node. AI cần chọn một cách và cập nhật mục 8 của plan.
- **Log và cache** của công cụ build nằm trong repo (hoặc thư mục tạm), không nằm ngoài.

## 5. Những chỗ không thể tránh, và cách giảm

| Việc | Vì sao không tránh được | Cách giảm |
|---|---|---|
| Tailer đọc `~/.claude/projects/` | Claude Code vốn ghi transcript ở đó | Chỉ **đọc**, mở file ở chế độ chỉ đọc; có test khẳng định tailer không ghi |
| Quyền thông báo của trình duyệt | Notification API | Chỉ áp dụng cho origin `localhost:<cổng>` |
| Cài PWA | Tuỳ chọn | Để sau, khi đã ổn định |
| Cổng mạng | Server cần lắng nghe | Chọn cổng ít xung đột; xử lý lỗi cổng bận; cho đổi cổng bằng env |

## 6. Khi muốn theo dõi dự án thật

Đánh đổi: muốn thấy agent ở các dự án khác thì phải có hook ở đó. Đi theo từng bước, mỗi bước quay lại được:

1. **Bước 1:** thêm hook vào `.claude/settings.local.json` của **từng dự án được chọn** (file `.local` thường không bị commit). Ghi rõ các dự án đã bật hook.
2. **Bước 2:** chỉ sau khi đã dùng ổn vài tuần mới cài plugin ở phạm vi người dùng, kèm công tắc tắt nhanh và checklist gỡ cài đặt sạch (xem file review).
3. **Bước 3 (tuỳ chọn):** LaunchAgent. Chỉ khi thật sự cần server sống liên tục (xem mục 7).

Mỗi bước phải có **cách hoàn tác bằng một lệnh** và được ghi trong tài liệu.

## 7. LaunchAgent: chốt thiết kế nhưng đưa về cuối

LaunchAgent là cơ chế của macOS để tự chạy chương trình nền khi đăng nhập và tự khởi động lại khi crash, cấu hình bằng file `.plist` trong `~/Library/LaunchAgents/`. Vì ràng buộc ở mục 1, **không dùng trong giai đoạn dev**.

| Cách khởi động | Ưu điểm | Nhược điểm |
|---|---|---|
| LaunchAgent | Server luôn sống, tự bật lại khi crash | Đụng vào cấu hình hệ thống, cần bước gỡ sạch |
| Hook `SessionStart` tự bật server | Không đụng hệ thống | Server chỉ sống khi có session; crash giữa chừng không tự bật lại |

**Quyết định:**
- Mặc định v0.1: `SessionStart` tự bật server. LaunchAgent là **tuỳ chọn opt-in**, do người dùng tự bật bằng lệnh rõ ràng.
- Khi làm LaunchAgent, dùng một **shim ổn định nằm ngoài thư mục plugin** để tránh vỡ đường dẫn khi plugin hoặc Node đổi phiên bản:

```
~/Library/Application Support/agent-office/bin/agent-office   # shim ổn định
~/Library/LaunchAgents/com.agentoffice.server.plist           # trỏ tới shim
~/Library/Logs/agent-office/                                  # log
```

- Trình cài đặt ghi đường dẫn Node tuyệt đối (`process.execPath`) vào config của shim, vì LaunchAgent có `PATH` rất hạn chế và không có môi trường shell như nvm.
- Nạp bằng `launchctl bootstrap gui/$(id -u) <plist>`, gỡ bằng `launchctl bootout gui/$(id -u)/com.agentoffice.server`, xem trạng thái bằng `launchctl print`.
- Hook `SessionStart` và LaunchAgent gọi **cùng một shim**.
- Chỉ dùng LaunchAgent (chạy với quyền người dùng). Không dùng LaunchDaemon (quyền hệ thống), vì không cần và rủi ro hơn.
- Checklist gỡ cài đặt phải có: `bootout`, xoá `.plist`, xoá shim, xoá thư mục dữ liệu và log.

## 8. Hàng rào an toàn cần thêm vào plan

- [ ] **Test tự động "không ghi ngoài repo"**: chạy server và web ở chế độ dev với simulator, so sánh cây thư mục (hoặc theo dõi ghi file) trước và sau, khẳng định không có file nào ngoài repo và thư mục tạm.
- [ ] **Test tailer chỉ đọc**: khẳng định tailer không mở file trong `~/.claude/` ở chế độ ghi.
- [ ] Hook script **luôn exit 0**, có `timeout` (đã có ở v2) và hoạt động đúng khi server dev đang tắt, để không ảnh hưởng dự án khác.
- [ ] Dòng cảnh báo trong README dev: "Không bao giờ đặt hook toàn cục khi phát triển."
- [ ] Script `dev:clean` và `dev:down` được kiểm thử; `dev:clean` không xoá gì ngoài `.dev-data` và file tạm của dự án.
- [ ] Danh sách "dự án đã bật hook" và lệnh gỡ hook cho từng dự án.
- [ ] Công tắc tắt nhanh toàn bộ hook (biến môi trường hoặc file cờ) mà không cần sửa từng dự án.

## 9. Việc cần đưa vào các milestone

**M0:**
- [ ] Tạo dự án sandbox (mức 1) cho mọi spike; không đặt hook toàn cục.
- [ ] Xác nhận `CLAUDE_CONFIG_DIR` và `--plugin-dir` có hoạt động như mong đợi và cô lập những gì **[chưa kiểm chứng]**.
- [ ] Xác nhận hook trong `.claude/settings.local.json` chỉ chạy trong thư mục sandbox.
- [ ] Dữ liệu thô thu được nằm ngoài repo hoặc trong thư mục `.gitignore` (liên kết mục 2.2 của file review).

**M1:**
- [ ] Script `dev:up`, `dev:down`, `dev:clean`, biến `AGENT_OFFICE_HOME`, cấu hình cổng.
- [ ] Test "không ghi ngoài repo" và test tailer chỉ đọc chạy trong CI.
- [ ] Chốt cách dùng pnpm (không `corepack enable`) và ghim phiên bản Node.
- [ ] README dev có phần "Cô lập khi phát triển" và cảnh báo hook toàn cục.

**M2 và sau:**
- [ ] Khi thử plugin/channel, dùng mức 2 hoặc mức 3, không cài vào cấu hình chính của người dùng.
- [ ] Công tắc tắt nhanh toàn bộ hook.

**Hardening & Release:**
- [ ] LaunchAgent opt-in: shim, plist, lệnh bật/tắt, checklist gỡ sạch, kiểm thử cài và gỡ trên tài khoản macOS mới (mức 3).
- [ ] Kiểm thử luồng nâng cấp bước 1 → 2 → 3 ở mục 6, mỗi bước hoàn tác được.

## 10. Câu hỏi còn mở (đề xuất hạn chốt)

| Câu hỏi | Hạn chốt | Ghi chú |
|---|---|---|
| Dùng mức cô lập nào cho M0: mức 1 hay mức 2 | Trước M0 | Phụ thuộc kết quả kiểm chứng `CLAUDE_CONFIG_DIR` và `--plugin-dir` |
| Có cần tài khoản macOS riêng hoặc máy ảo cho kiểm thử cài đặt không | Trước Hardening & Release | Ảnh hưởng thời gian chuẩn bị |
| Dự án thật nào được bật hook đầu tiên | Sau khi qua M1 | Nên chọn dự án ít quan trọng |
| Có muốn LaunchAgent trong bản phát hành đầu hay chỉ `SessionStart` | Trước Hardening & Release | Mặc định đề xuất: chỉ `SessionStart` |

## 11. Checklist cho AI khi cập nhật plan

- [ ] Thêm mục "Quy tắc cô lập khi phát triển" (gồm mục 2, 3, 4, 5, 6 của file này).
- [ ] Cập nhật phần khởi động (mục 8 của v2, dòng "Khởi động"): `SessionStart` mặc định, LaunchAgent opt-in, shim ổn định, lý do.
- [ ] Sửa dòng `corepack enable` ở mục 8 của v2 theo mục 4.
- [ ] Thêm các checkbox ở mục 9 vào M0, M1, M2 và Hardening & Release.
- [ ] Thêm hàng rào an toàn ở mục 8 vào mục "Rủi ro" và "Đo thành công" nếu phù hợp.
- [ ] Thêm các câu hỏi ở mục 10 vào "Câu hỏi còn mở" kèm hạn chốt.
- [ ] Giữ nhãn **[chưa kiểm chứng]** và đưa vào danh sách việc xác nhận của M0.
- [ ] Cập nhật tổng giờ và bảng ước tính; kiểm tra số học.
- [ ] Cuối file, liệt kê ngắn các thay đổi đã làm và các chỗ chưa chắc.
