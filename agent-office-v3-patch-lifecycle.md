# Patch cho `agent-office-plan-v3.md` → v3.1: vòng đời server, không dùng LaunchAgent

> File này liệt kê **chính xác các đoạn cần sửa, thêm hoặc gỡ** trong v3 để (1) đưa nội dung của `agent-office-server-lifecycle.md` vào plan và (2) **gỡ hoàn toàn LaunchAgent ở mọi giai đoạn** (quyết định của chủ dự án, 16/11/2026). Chủ dự án review file này, điền các ô ở mục 1, rồi đưa cho AI cùng `agent-office-plan-v3.md` và `agent-office-server-lifecycle.md`.

## 0. Hướng dẫn cho AI

- Xuất ra `agent-office-plan-v3.1.md`. Giữ nguyên mọi phần không nằm trong patch này.
- **Số dòng chỉ là gợi ý** (tính trên v3 gốc, sẽ lệch sau khi sửa). Hãy định vị bằng đoạn trích "Tìm" trong từng patch.
- **Quy tắc xuyên suốt:** sau khi áp dụng, tìm toàn bộ file các cụm `LaunchAgent`, `launchctl`, `plist`, `KeepAlive`, `managed`, `câu hỏi 15`, `bước 3`, `1 → 2 → 3`. Mỗi chỗ còn lại phải thuộc một trong hai loại: (a) câu nói rõ **không** dùng LaunchAgent, hoặc (b) nhắc tới như một lý do/ADR. Mọi mô tả cách cài, cấu hình hay kiểm thử LaunchAgent phải bị gỡ.
- Các ô quyết định ở mục 1 do chủ dự án điền. Nếu còn trống, dùng giá trị đề xuất và ghi rõ trong "Câu hỏi còn mở".
- Mục đánh dấu **[chưa kiểm chứng]** giữ nguyên nhãn và đưa vào spike S9 (P6).
- Sau khi sửa, **tính lại bảng 11.2 và các dòng thời gian dự kiến**, kiểm tra số học (P12).
- Thêm hàng mô tả thay đổi vào bảng 0.1 (P1).
- Cuối cùng liệt kê ngắn các thay đổi đã làm và các chỗ chưa chắc.

## Lưu ý về một nhận xét trước đó

Nhận xét trước của người review rằng "v3 không có từ nào về wake" **chưa chính xác**: mục 5.3 (dòng 239) có câu "Khi server khởi động (sau crash, sau khi cập nhật, hoặc khi máy thức dậy)". Tuy nhiên câu đó coi wake là một lần khởi động lại server, trong khi **sleep không khởi động lại tiến trình** (chỉ tạm dừng rồi chạy tiếp). Phần xử lý đồng hồ nhảy và kết nối đứt vẫn thiếu; P3 sửa điểm này.

## 1. Quyết định

**Đã chốt (16/11/2026):** **không dùng LaunchAgent ở tất cả giai đoạn** (dev, v0.1, các bản sau), kể cả dạng tuỳ chọn opt-in. Không dùng LaunchDaemon. Câu hỏi 15 của v3 được đóng theo hướng này.

**Hệ quả chính:**
- Server chỉ được khởi động bởi hook `SessionStart` (và lớp bật lười nếu giữ). Lớp bật lười trở thành cơ chế phục hồi **duy nhất** khi server chết giữa session.
- Không còn chế độ "managed", xung đột `KeepAlive`, bảng lệnh `launchctl`, file `.plist`, hay kiểm thử LaunchAgent trên tài khoản macOS mới.
- Bước 3 của lộ trình bật hook (LaunchAgent) bị bỏ: còn 2 bước.
- Shim ổn định vẫn cần, nhưng chỉ để hook `SessionStart` gọi (vì `${CLAUDE_PLUGIN_ROOT}` đổi mỗi khi plugin cập nhật và Node có thể nằm trong thư mục nvm có số phiên bản).
- M3.5 bớt khoảng 3-5 giờ (P12).

**Cần chủ dự án điền:**

| # | Quyết định | Lựa chọn | Đề xuất |
|---|---|---|---|
| A | Ân hạn trước khi tự tắt server khi hết session | ☐ 5 phút  ☐ 30 phút (v3 hiện tại)  ☐ khác: ____ | 5 phút. Con số 30 phút của v3 không giải quyết lỗi đồng hồ nhảy sau sleep; việc bảo vệ nằm ở cơ chế phát hiện sleep (P3) |
| B | Giữ lớp bật lười kèm khoá nguyên tử và giới hạn tần suất | ☐ Giữ  ☐ Bỏ ở v0.1 | **Giữ.** Không còn LaunchAgent, nên nếu bỏ thì server chết giữa session sẽ không có cách phục hồi nào cho đến session sau |
| C | Session để mở qua đêm mà không làm gì có làm server tự tắt không | ☐ Không (giữ quy tắc đơn giản)  ☐ Có, sau ___ giờ | Không |

## 2. Danh sách patch

### P1. Bảng 0.1 "Thay đổi so với v2"

**1a. Thêm hai hàng ở cuối bảng** (sau hàng "Vị trí sandbox", khoảng dòng 35):

```
| Vòng đời server | Tự tắt sau một khoảng thời gian không còn session (đề xuất 30 phút); bật lại khi crash ở hook kế tiếp; chưa xử lý sleep/wake | Quy tắc "session sống" (SessionEnd + kiểm tra tiến trình), ân hạn cấu hình được, phát hiện sleep/wake bằng chênh lệch đồng hồ, bật lười có khoá nguyên tử và giới hạn tần suất, cờ tắt có chủ đích, kịch bản kiểm thử sleep/wake | `agent-office-server-lifecycle.md`; chủ dự án hay sleep máy |
| LaunchAgent | Tuỳ chọn opt-in ở M3.5, gọi qua shim | **Không dùng ở tất cả giai đoạn**; bỏ bước 3 của lộ trình bật hook; shim ổn định chỉ cho hook `SessionStart` | Chốt 16/11/2026: không đụng hệ thống, hay sleep nên dịch vụ nền gần như không có lợi, giảm việc ở M3.5 |
```

**1b. Sửa hàng "Vận hành server nền"** (khoảng dòng 18). **Tìm:** `| Vận hành server nền | LaunchAgent hoặc `SessionStart` | Log xoay vòng, giới hạn DB, cổng và file config, `/health`; hook bật lại server khi crash | Review 3.1; dev-isolation §7 |`

**Thay bằng:**

```
| Vận hành server nền | LaunchAgent hoặc `SessionStart` | Chỉ `SessionStart`; log xoay vòng, giới hạn DB, cổng và file config, `/health`; hook bật lại server khi crash (khoá nguyên tử, giới hạn tần suất); phát hiện sleep/wake (mục 5.4) | Review 3.1; vòng đời server; không dùng LaunchAgent |
```

**1c. Sửa hàng "Khởi động server"** (khoảng dòng 28). **Tìm:** hàng bắt đầu bằng `| Khởi động server | LaunchAgent với `KeepAlive` ở M1 |`.

**Thay bằng:**

```
| Khởi động server | LaunchAgent với `KeepAlive` ở M1 | Khi dev: `pnpm dev:up`. Bản phát hành: chỉ hook `SessionStart` tự bật server (cộng bật lười); `agent-office start`/`stop` bằng tay; **không có LaunchAgent** | Chốt 16/11/2026 |
```

**1d. Sửa hàng "Bật hook cho dự án thật"** (khoảng dòng 31). **Tìm:** `3 bước, mỗi bước hoàn tác bằng một lệnh: từng dự án → plugin phạm vi người dùng → LaunchAgent`.

**Thay bằng:** `2 bước, mỗi bước hoàn tác bằng một lệnh: từng dự án → plugin phạm vi người dùng`.

### P2. Mục 8, bảng tech stack, hàng "Khởi động" (khoảng dòng 301)

**Tìm:** hàng bắt đầu bằng `| Khởi động | Khi dev: `pnpm dev:up`...`.

**Thay bằng:**

```
| Khởi động | Khi dev: `pnpm dev:up`, tắt bằng Ctrl+C hoặc `pnpm dev:down`. Bản phát hành: hook `SessionStart` tự bật server qua shim ổn định (mục 9.2, ADR-007); tắt tay bằng `agent-office stop` (ghi cờ tắt có chủ đích). **Không dùng LaunchAgent.** Server tự tắt khi hết session theo quy tắc ở mục 9.2 | Không đụng hệ thống; không có dịch vụ nào chạy lúc đăng nhập |
```

### P3. Mục 5.3 và thêm mục 5.4 "Sleep và wake"

**3a. Sửa câu mở đầu mục 5.3** (khoảng dòng 239).

**Tìm:** `Khi server khởi động (sau crash, sau khi cập nhật, hoặc khi máy thức dậy):`

**Thay bằng:** `Khi server khởi động (sau crash, sau khi cập nhật, hoặc khi máy khởi động lại):`

**Thêm ngay sau danh sách 6 bước của 5.3:**

```
> Máy sleep rồi wake **không** khởi động lại tiến trình server: tiến trình chỉ bị tạm dừng rồi chạy tiếp. Trường hợp đó xử lý theo mục 5.4, không theo 5.3.
```

**3b. Thêm mục 5.4 mới, ngay trước `## 6. Duyệt quyền từ dashboard`:**

```markdown
### 5.4 Sleep và wake

Người dùng hay sleep máy. Khi sleep, tiến trình `claude` và server chỉ bị tạm dừng, không bị tắt. Khi wake, cả hai chạy tiếp, nhưng đồng hồ thật đã nhảy về phía trước (có thể nhiều giờ) và kết nối đã đứt.

| Vấn đề | Xử lý |
|---|---|
| Đồng hồ nhảy làm mọi bộ đếm "im lặng quá N phút" kích hoạt sai, thậm chí tắt server nhầm hoặc đánh dấu mọi agent là offline | Phát hiện nhảy thời gian: so chênh lệch đồng hồ thật (`Date.now`) với đồng hồ đơn điệu (`process.hrtime`/`performance.now`) giữa hai lần kiểm tra định kỳ; nếu đồng hồ thật nhảy vượt hẳn đồng hồ đơn điệu thì coi là vừa wake. **[chưa kiểm chứng]** đồng hồ đơn điệu có dừng khi ngủ trên macOS không (spike S9) |
| Sau khi phát hiện wake | Đặt lại bộ đếm ân hạn và bộ đếm offline; **không** kết luận gì trong khoảng thời gian bị nhảy; đối chiếu lại sau một thời gian ngắn |
| SSE đứt khi máy ngủ | Dashboard tự kết nối lại kèm `Last-Event-ID`, hiện "đang kết nối lại" (mục 10.9), không hiển thị dữ liệu cũ như còn mới |
| Trạng thái session có thể đã đổi trong lúc ngủ | Đối chiếu lại bằng `claude agents --json` (nếu có) và đọc tiếp transcript từ offset đã lưu; session chưa xác nhận lại hiện "chưa chắc chắn" (viền đứt nét, mục 10.6) |
| Tailer có thể bỏ lỡ sự kiện file lúc ngủ | Sau wake, quét lại offset của các file transcript đang theo dõi |
| Server sống nhiều ngày qua nhiều lần sleep | Soak test có chu kỳ sleep/wake (M3.5) |

**Quy tắc cứng:** quyết định tắt server và quyết định "agent offline" **không bao giờ** chỉ dựa vào việc im lặng theo đồng hồ thật. Phải dựa vào session còn sống thật (mục 9.2).
```

### P4. Mục 9.2: gỡ bước 3 và thay toàn bộ phần "Khởi động server và LaunchAgent"

**4a. Mục "Khi muốn theo dõi dự án thật"** (khoảng dòng 397-407). **Tìm** dòng `3. **Bước 3 (tuỳ chọn):** LaunchAgent, chỉ khi thật sự cần server sống liên tục.` và **xoá**. Nếu phần mở đầu của mục nói "3 bước", đổi thành "2 bước".

**4b. Dòng "Không LaunchAgent khi dev"** (khoảng dòng 379). **Tìm:** `- **Không LaunchAgent khi dev.** Chạy bằng `pnpm dev:up`, tắt bằng Ctrl+C hoặc `pnpm dev:down` (dừng mọi tiến trình do dự án sinh ra).`

**Thay bằng:** `- **Không dùng LaunchAgent ở bất kỳ giai đoạn nào.** Khi dev chạy bằng `pnpm dev:up`, tắt bằng Ctrl+C hoặc `pnpm dev:down` (dừng mọi tiến trình do dự án sinh ra).`

**4b-2. Hai chỗ khác chỉ nói "trong lúc dev"** (khoảng dòng 115 và 335). **Tìm:** `không cài LaunchAgent` ở mục nguyên tắc (dòng 115) và `- không cài thứ chạy nền hệ thống (LaunchAgent) trong lúc dev;` (dòng 335). **Đổi** cho rõ phạm vi: `không dùng LaunchAgent ở mọi giai đoạn` và `- không cài thứ chạy nền hệ thống (LaunchAgent) ở bất kỳ giai đoạn nào;`.

**4c. Thay toàn bộ mục con `#### Khởi động server và LaunchAgent`** (khoảng dòng 409-441, từ tiêu đề đó đến ngay trước `#### Hàng rào an toàn`) bằng nội dung sau:

````markdown
#### Khởi động và tắt server (không dùng LaunchAgent)

**Quyết định (16/11/2026):** không dùng LaunchAgent ở bất kỳ giai đoạn nào (dev, v0.1, các bản sau), kể cả dạng tuỳ chọn; không dùng LaunchDaemon. Lý do: không đụng hệ thống Mac; chủ dự án hay sleep nên dịch vụ nền (chỉ được nạp lại khi đăng nhập phiên mới) gần như không có lợi; server chỉ cần sống khi có session Claude.

**Quy tắc:**
- **Bật:** hook `SessionStart` gọi `agent-office ensure-running`: nếu chưa có server thì bật ở chế độ nền (tách hẳn khỏi hook) rồi thoát ngay. Hook luôn `exit 0` và có timeout ngắn (khoảng 1 giây). Gọi qua shim ổn định (bên dưới).
- **Định nghĩa "session sống":** tiến trình `claude` còn đang mở, kể cả khi chỉ ngồi chờ người dùng nhập. Máy sleep thì session vẫn sống. Session để mở qua đêm không làm gì vẫn là session sống (câu hỏi 20).
- **Tự tắt server:** chỉ khi **cả hai** tín hiệu cho thấy hết session: (1) đã nhận `SessionEnd` cho mọi session đã biết, và (2) kiểm tra định kỳ xác nhận không còn tiến trình `claude` tương ứng (pid lấy từ `claude agents --json`, statusline hoặc MCP server; xác nhận ở S5, S9). Cần cả hai vì session bị crash hoặc kill có thể không gửi `SessionEnd`. Sau đó chờ thời gian ân hạn (đề xuất 5 phút, cấu hình được; câu hỏi 18) rồi mới thoát. Có session mới trong lúc ân hạn thì huỷ việc tắt. Mọi bộ đếm tuân theo quy tắc sleep/wake ở mục 5.4. Vì không có LaunchAgent, server **tự thoát tự do**, không có tiến trình nào bật lại nó ngoài hook.
- **Tắt tay:** `agent-office stop` dừng server ngay và ghi **cờ "đã tắt có chủ đích"**; cờ bị xoá khi có session mới mở. `agent-office start` bật tay (khi cần mở dashboard sớm). Khi dev dùng `pnpm dev:up`/`pnpm dev:down`.
- **Bật lười (lưới an toàn khi server chết giữa chừng; cơ chế phục hồi duy nhất vì không có LaunchAgent):** `SessionStart` chỉ chạy một lần lúc session bắt đầu, nên hook ở sự kiện kế tiếp, nếu không kết nối được server, sẽ gọi `ensure-running` rồi gửi lại đúng một lần. Điều kiện bắt buộc:
  - không phải bộ đếm giờ: chỉ hành động khi có hook bắn ra **và** không kết nối được;
  - **khoá nguyên tử** để nhiều hook cùng bắn (3 agent có thể làm 3-5 hook cùng lúc) không sinh nhiều server: file khoá tạo bằng cờ độc quyền, hoặc để việc bind cổng làm khoá (ai bind được thì thắng, các hook còn lại chỉ gửi lại sự kiện);
  - **giới hạn tần suất:** khoảng cách tối thiểu 30 giây giữa hai lần thử, giãn dần 30 giây → 1 phút → 5 phút (trần), dừng hẳn sau 5 lần thất bại liên tiếp và ghi vào trang Chẩn đoán; đặt lại khi kết nối thành công; mốc thời gian lưu trong một file nhỏ để các hook chia sẻ;
  - tôn trọng cờ "đã tắt có chủ đích": không bật lại khi cờ còn.

**Cái giá phải chấp nhận và cách bù:**

| Mất gì | Cách bù |
|---|---|
| Server không tự bật lại sau khi crash giữa session | Lớp bật lười ở trên |
| Server không sống sẵn khi chưa có session nào | Dashboard hiện "chưa có server, mở một session Claude để bắt đầu" kèm lệnh `agent-office start` |
| Không có thông báo macOS khi không có session nào chạy | Không cần: không có agent thì không có gì để thông báo |

**Shim ổn định (chỉ cho hook):** `${CLAUDE_PLUGIN_ROOT}` đổi đường dẫn mỗi khi plugin cập nhật, và đường dẫn Node có thể chứa số phiên bản (nvm), nên hook gọi qua một shim nằm ngoài thư mục plugin:

```
~/Library/Application Support/agent-office/bin/agent-office   # shim ổn định
~/Library/Logs/agent-office/                                  # log
```

- Trình cài đặt ghi đường dẫn Node tuyệt đối (`process.execPath`) vào config của shim. Trên máy hiện tại đường dẫn là `~/.nvm/versions/node/v22.21.1/bin/node`, nên shim phải kiểm tra đường dẫn còn tồn tại, ghi lỗi rõ ràng vào log, và có lệnh sửa lại. Phương án thay thế: đóng gói server thành file chạy độc lập để không phụ thuộc Node của máy. Chốt ở ADR-007.
- Shim chỉ được tạo ở bản phát hành, không tạo khi dev.

**Nếu sau này đổi ý:** thêm lại LaunchAgent là một thay đổi có chủ đích, phải có ADR mới trước khi làm, và phải xử lý lại chế độ managed (server tự thoát xung đột với `KeepAlive`).
````

### P5. Hàng rào an toàn (mục 9.2): thêm hàng

**Vị trí:** bảng "Hàng rào an toàn" (khoảng dòng 443).

```
| Hook không bao giờ làm chậm hoặc chặn agent khi server tắt hoặc đang bật lại (timeout ~1 giây, `exit 0`, không thử lại dồn dập) | M1 |
| Sau khi thoát session cuối và hết ân hạn, không còn tiến trình `agent-office` nào chạy (test tự động) | M1 |
```

### P6. Thêm spike S9; sửa S8, ADR-007 và các dòng nhắc LaunchAgent trong M0

**6a. Bảng spike M0**, sau hàng S8 (khoảng dòng 710-712), **thêm hàng:**

```
| S9. Vòng đời session và sleep/wake | 1-1,5 giờ | `SessionStart` có chạy khi resume không; payload có pid không; session bị crash hoặc kill có `SessionEnd` không; đồng hồ đơn điệu và timer của Node có chạy lúc máy ngủ không; hook gọi khi server tắt có chặn agent không | Không có pid: dùng liveness từ `claude agents --json` (S2) hoặc statusline (S7). Không phát hiện được sleep bằng đồng hồ: dùng khoảng trễ bất thường của chu kỳ kiểm tra làm ngưỡng |
```

**Thêm checklist M0**, cạnh S7/S8 (khoảng dòng 745-748):

```
- [ ] **S9.** Vòng đời session và sleep/wake. Thử thật trên máy: mở session, sleep, wake; kill terminal; resume. Ghi kết quả vào `docs/spikes/s9-lifecycle.md`.
```

**6b. Bullet S8** (khoảng dòng 748). **Tìm:** `- `${CLAUDE_PLUGIN_ROOT}` đổi mỗi khi plugin cập nhật, nên hook và LaunchAgent phải gọi qua shim ổn định nằm ngoài thư mục plugin (mục 9.2).`

**Thay `hook và LaunchAgent` bằng `hook`.** Phần còn lại của bullet giữ nguyên.

**6c. ADR-007** (khoảng dòng 755). **Tìm:** `(`SessionStart` mặc định, LaunchAgent opt-in)`.

**Thay bằng:** `(`SessionStart` là cách bật duy nhất, không dùng LaunchAgent)`.

**6d. Dòng "Tự khởi động server bằng hook `SessionStart`"** (khoảng dòng 781). **Tìm:** `gọi qua shim dùng chung với LaunchAgent sau này.`

**Thay bằng:** `gọi qua shim ổn định (mục 9.2).`

### P7. M1: thay các dòng về vận hành server

**Tìm:** bullet bắt đầu bằng `- server crash thì hook async ở sự kiện kế tiếp kiểm tra `/health` và bật lại; server tự tắt khi không còn session nào sống sau một khoảng thời gian (đề xuất 30 phút). LaunchAgent chuyển sang M3.5 dưới dạng tuỳ chọn;` (khoảng dòng 788).

**Thay bằng:**

```
  - tự tắt khi hết session theo quy tắc ở mục 9.2 (`SessionEnd` **và** kiểm tra tiến trình, ân hạn cấu hình được, đề xuất 5 phút; câu hỏi 18); `agent-office start`, `agent-office stop` và cờ tắt có chủ đích;
  - bật lười theo mục 9.2 (cơ chế phục hồi duy nhất vì không có LaunchAgent): kiểm tra `/health` ở hook kế tiếp, khoá nguyên tử, giới hạn tần suất 30 giây giãn dần, tối đa 5 lần (câu hỏi 19);
```

**Thêm bullet mới trong M1** (sau bullet "Vận hành server chạy nền"):

```markdown
- [ ] Sleep và wake theo mục 5.4 (3-5 giờ):
  - phát hiện nhảy thời gian (chênh lệch đồng hồ thật và đồng hồ đơn điệu), đặt lại bộ đếm ân hạn và offline sau wake;
  - dashboard tự kết nối lại SSE, hiện "đang kết nối lại"; đối chiếu lại trạng thái session và quét lại offset transcript sau wake;
  - mọi quyết định tắt server và "offline" tuân theo quy tắc cứng ở 5.4.
```

### P8. M1 "Xong khi": thêm tiêu chí

**Tìm:** `- server bị kill thì được bật lại ở sự kiện hook kế tiếp, `/health` trả về OK;` (khoảng dòng 833).

**Thêm ngay sau:**

```
- mô phỏng đồng hồ nhảy 8 giờ khi session còn sống: server không tự tắt và không agent nào bị đánh dấu offline sai;
- mở hai, ba session song song: server chỉ tắt khi **tất cả** đã đóng và hết ân hạn; mở lại session trong lúc ân hạn thì không tắt;
- nhiều hook cùng bắn khi server chết: chỉ có đúng một server được bật;
- `agent-office stop` rồi bắn hook: bật lười không bật lại; mở session mới thì cờ được xoá;
- thoát session cuối và hết ân hạn: không còn tiến trình `agent-office` nào chạy;
- sleep/wake thật trên máy ít nhất một lần: dashboard tự kết nối lại và trạng thái được đối chiếu lại.
```

### P9. M3.5 và các chỗ liên quan: gỡ LaunchAgent

**9a. Gỡ bullet LaunchAgent opt-in.** **Tìm** bullet `- [ ] LaunchAgent opt-in theo thiết kế ở mục 9.2 (3-5 giờ; nếu câu hỏi 15 chọn để sang bản sau thì bỏ):` cùng các bullet con (khoảng dòng 901-904) và **xoá toàn bộ**.

**9b. Bảng 11.2** (khoảng dòng 679). **Tìm:** `| M3.5: Hardening và phát hành v0.1, LaunchAgent opt-in | 27 | 44 |`. **Thay bằng:** `| M3.5: Hardening và phát hành v0.1 | 24 | 39 |` (giá trị tính ở P12).

**9c. Gỡ cài đặt sạch** (khoảng dòng 898). **Tìm:** `script hoặc checklist gỡ theo thứ tự ngược: LaunchAgent nếu đã bật (bước 3), plugin (bước 2), hook ở từng dự án (bước 1); ...`

**Thay bằng:** `script hoặc checklist gỡ theo thứ tự ngược: plugin (bước 2), hook ở từng dự án (bước 1); khôi phục lệnh statusline cũ; xoá shim, token, dữ liệu và log;`. Ở bullet "kiểm tra sau khi gỡ" **thêm:** `không còn tiến trình `agent-office` nào đang chạy`.

**9d. Kiểm thử nâng cấp** (khoảng dòng 906). **Tìm:** `Kiểm thử luồng nâng cấp bước 1 → 2 → 3 ở mục 9.2`. **Thay bằng:** `Kiểm thử luồng nâng cấp bước 1 → 2 ở mục 9.2`. Giữ ước tính giờ (làm tròn thận trọng).

**9e. Kiểm thử cài đặt và gỡ trên tài khoản macOS mới (mức 3)** giữ nguyên (vẫn cần để đo "cài không quá 15 phút" và kiểm tra gỡ sạch). Cập nhật câu hỏi 12 nếu nhắc LaunchAgent.

### P10. M3.5: soak test

**Tìm:** bullet `ngưỡng đề xuất: sau 24 giờ đầu RAM không tăng thêm quá 20%, DB không vượt giới hạn đã đặt, không rò kết nối.` (khoảng dòng 910).

**Thay bằng:**

```
  - ngưỡng đề xuất: baseline là RSS trung vị sau 30 phút khởi động; trung vị mỗi giờ không vượt baseline quá 20% và không có xu hướng tăng đều; số kết nối SSE không tăng sau các lần reconnect; DB không vượt giới hạn đã đặt;
  - xen vào các chu kỳ sleep/wake (thật hoặc mô phỏng) trong 3 ngày chạy.
```

### P11. Mục 12 (Rủi ro)

**11a. Sửa hàng** (khoảng dòng 992). **Tìm:** `| Cập nhật plugin hoặc đổi phiên bản Node (nvm) làm hỏng đường dẫn mà hook hoặc LaunchAgent gọi tới |`. **Thay `hook hoặc LaunchAgent` bằng `hook`.** Cột giải pháp giữ nguyên (shim ổn định, S8, ADR-007).

**11b. Thêm hàng** (sau hàng "Cache của công cụ...", khoảng dòng 996):

```
| Server tắt nhầm hoặc agent bị đánh dấu offline sai sau khi máy sleep (đồng hồ nhảy) | Quyết định tắt và offline dựa vào session sống thật, không dựa vào im lặng theo đồng hồ; phát hiện nhảy thời gian rồi đặt lại bộ đếm; bật lười làm lưới an toàn; test mô phỏng nhảy 8 giờ (mục 5.4, 9.2) |
| Nhiều hook cùng bật server khi server chết, sinh nhiều server hoặc dồn dập tiến trình | Khoá nguyên tử, giới hạn tần suất giãn dần, tối đa 5 lần rồi dừng và ghi chẩn đoán (mục 9.2) |
| Server chết giữa session và không có gì bật lại (vì không dùng LaunchAgent) | Lớp bật lười ở hook kế tiếp; trang Chẩn đoán báo trạng thái; nếu bỏ lớp bật lười (câu hỏi 19) thì chấp nhận dashboard mù đến session sau |
```

### P12. Mục 11.2: bảng ước tính (tính lại)

Thay đổi so với v3: S9 (M0) +1-2 giờ; sleep/wake, bật lười có khoá, `start`/`stop` và kiểm thử (M1) +5-8 giờ; **gỡ LaunchAgent opt-in khỏi M3.5 −3-5 giờ.** Mọi con số là ước tính chưa hiệu chỉnh.

| Milestone | v3 (thấp-cao) | v3.1 (thấp-cao) |
|---|---|---|
| M0 | 18-29 | 19-31 |
| M1 | 50-75 | 55-83 |
| M2 | 18-30 | 18-30 |
| M3 | 42-74 | 42-74 |
| M3.5 | 27-44 | 24-39 |
| Sau v0.1 | 4-6 | 4-6 |
| M4 | 15-25 | 15-25 |
| M5 | 21-37 | 21-37 |
| **Tổng** | **195-320** | **198-325** |

- Đến v0.1 (M0 → M3.5): 158-257 giờ (v3: 155-252).
- Thời gian dự kiến tính lại theo cách của v3 (mỗi tuần còn 7,5-9,75 giờ làm việc): v0.1 khoảng 4-8 tháng; toàn bộ khoảng 5-10 tháng. **AI phải tính lại và kiểm tra số học trước khi ghi.**
- Cập nhật các tiêu đề `### M0 (...)`, `### M1 (...)`, `### M3.5 (...)` theo số mới.
- Giữ ghi chú: câu hỏi 5 (quét tiến trình) chưa tính, nếu chọn thì cộng 3-5 giờ vào M1. Quét tiến trình cũng phục vụ tín hiệu "session sống" (mục 9.2).
- Nếu chủ dự án chọn **bỏ** lớp bật lười (ô B), trừ khoảng 1-2 giờ khỏi M1.

### P13. Mục 13 (Đo thành công): thêm chỉ số

```
- Số lần server tắt nhầm trong kịch bản mô phỏng đồng hồ nhảy và sleep/wake: 0 (test tự động).
- Số server chạy đồng thời khi nhiều hook bật cùng lúc: đúng 1.
- Sau khi thoát session cuối và hết ân hạn: 0 tiến trình `agent-office` còn chạy (test tự động).
```

### P14. Mục 14 (Câu hỏi còn mở)

**14a. Sửa hàng 15.** **Tìm:** hàng bắt đầu bằng `| 15 | Có đưa LaunchAgent opt-in vào v0.1 không, hay để bản sau? |`.

**Thay bằng:**

```
| 15 | Có đưa LaunchAgent opt-in vào v0.1 không, hay để bản sau? | **Đã chốt (16/11): không dùng LaunchAgent ở tất cả giai đoạn** | M3.5 bớt 3-5 giờ (đã tính ở 11.2); bỏ bước 3 của lộ trình bật hook; shim chỉ cho hook |
```

**14b. Thêm sau hàng 17:**

```
| 18 | Thời gian ân hạn trước khi tự tắt server: 5 phút (đề xuất) hay 30 phút, hay số khác? | Trước M1 (hiệu chỉnh sau S9) | Thay giá trị "30 phút" ở các mục 9.2, M1 và 16 |
| 19 | Giữ lớp bật lười kèm khoá nguyên tử và giới hạn tần suất không? | Trước M1 | Đề xuất giữ vì là cơ chế phục hồi duy nhất khi không có LaunchAgent; nếu bỏ thì bỏ các bullet tương ứng ở M1 và mục 9.2 (−1-2 giờ) |
| 20 | Session để mở qua đêm mà không làm gì có làm server tự tắt không? | Trước M1 | Đề xuất không (quy tắc đơn giản); nếu có, phải xử lý đồng hồ nhảy chặt hơn |
```

### P15. Mục 16 (Những chỗ chưa chắc chắn)

**Tìm:** hàng `Các ngưỡng do AI đề xuất: 30% để cắt phạm vi, 30 phút tự tắt server, 15 phút cài đặt, RAM tăng không quá 20% khi soak test, 7 ngày để kiểm tra phiên bản mới` (khoảng dòng 1072).

**Thay bằng:**

```
| Các ngưỡng do AI đề xuất: 30% để cắt phạm vi; ân hạn 5 phút trước khi tự tắt server (câu hỏi 18); chu kỳ kiểm tra tiến trình 30-60 giây; ngưỡng phát hiện nhảy thời gian (hơn 3 lần chu kỳ); bật lười: cách nhau 30 giây, giãn dần tới 5 phút, tối đa 5 lần; 15 phút cài đặt; soak test: RSS trung vị không vượt baseline quá 20%; phát hiện phiên bản mới trong 24 giờ và cập nhật `compat.json` trong 7 ngày | Chủ dự án duyệt; hiệu chỉnh sau S9 và soak test |
```

**Thêm các hàng:**

```
| `SessionStart` có chạy khi resume; payload có pid; session crash/kill có `SessionEnd` không | S9 |
| Đồng hồ đơn điệu (`process.hrtime`/`performance.now`) và timer của Node có dừng khi máy ngủ trên macOS không | S9 |
| Hook gọi khi server tắt hoặc đang bật lại có chặn agent không | S9 |
```

## 3. Tham số cấu hình (đề xuất chưa đo; phải cấu hình được)

| Tham số | Mặc định đề xuất |
|---|---|
| Ân hạn trước khi tự tắt | 5 phút |
| Chu kỳ kiểm tra tiến trình `claude` | 30-60 giây |
| Ngưỡng phát hiện nhảy thời gian | hơn 3 lần chu kỳ kiểm tra |
| Khoảng cách thử bật lười | 30 giây, giãn dần 1 phút, 5 phút (trần) |
| Số lần thất bại tối đa của bật lười | 5 |
| Timeout hook | khoảng 1 giây |

## 4. Checklist cho AI khi áp dụng patch

- [ ] P1: thêm hai hàng vào bảng 0.1 ("Vòng đời server", "LaunchAgent") và sửa ba hàng hiện có (18, 28, 31).
- [ ] P2: sửa hàng "Khởi động" ở mục 8.
- [ ] P3: sửa câu mở đầu 5.3, thêm đoạn ghi chú, thêm mục 5.4.
- [ ] P4: gỡ bước 3, sửa dòng "Không LaunchAgent khi dev" và hai chỗ nhắc ở dòng 115, 335, thay toàn bộ mục con "Khởi động server và LaunchAgent".
- [ ] P5: thêm hai hàng hàng rào an toàn.
- [ ] P6: thêm spike S9 và checklist S9; sửa bullet S8, ADR-007 và dòng `SessionStart` ở M1.
- [ ] P7, P8: sửa M1 (task và "Xong khi").
- [ ] P9: gỡ bullet LaunchAgent ở M3.5, sửa bảng 11.2, gỡ cài đặt, kiểm thử nâng cấp.
- [ ] P10: sửa soak test.
- [ ] P11: sửa một hàng và thêm ba hàng rủi ro.
- [ ] P12: tính lại 11.2, tiêu đề các milestone, thời gian dự kiến; kiểm tra số học.
- [ ] P13: thêm chỉ số đo.
- [ ] P14: đóng câu hỏi 15, thêm câu hỏi 18-20 (đánh dấu "Đã chốt" nếu chủ dự án đã điền mục 1).
- [ ] P15: sửa hàng ngưỡng, thêm các hàng chưa kiểm chứng.
- [ ] **Rà toàn file** các cụm `LaunchAgent`, `launchctl`, `plist`, `KeepAlive`, `managed`, `câu hỏi 15`, `bước 3`, `1 → 2 → 3` (quy tắc ở mục 0); và mọi chỗ còn nhắc "30 phút" tự tắt server để đồng bộ với ô A.
- [ ] Cuối file, liệt kê ngắn các thay đổi đã làm và các chỗ chưa chắc.
