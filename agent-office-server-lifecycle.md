# Vòng đời server "Agent Office": bật, tắt, sleep/wake (không dùng LaunchAgent)

> File này tổng hợp các quyết định đã trao đổi để chủ dự án review. Sau khi review xong, có thể đưa cho AI cùng `agent-office-plan-v3.md` (và `agent-office-v3-patch-lifecycle.md`) để cập nhật lên v3.1.
>
> **Cập nhật 16/11/2026:** chủ dự án chốt **không dùng LaunchAgent ở tất cả giai đoạn** (kể cả dạng tuỳ chọn). Mọi nội dung về LaunchAgent trong bản trước đã được gỡ hoặc đổi thành hệ quả của quyết định này.

## 0. Hướng dẫn cho AI (dùng sau khi chủ dự án đã review)

- Đưa nội dung này vào plan v3 thành mục **"Vòng đời server"** và gắn việc vào đúng milestone (mục 10).
- Giữ nguyên giọng văn, ngôn ngữ (tiếng Việt) và các quyết định đã có của v2.
- Mục nào ghi **[đã chốt]** thì áp dụng. Mục **[còn mở]** thì đưa vào "Câu hỏi còn mở" kèm hạn chốt, không tự chọn thay.
- Mục **[chưa kiểm chứng]** là kiến thức chưa đối chiếu với tài liệu hiện tại. Giữ nhãn và đưa vào bước xác nhận ở M0.
- Các con số (ân hạn, chu kỳ, khoảng cách thử lại) là **giá trị đề xuất chưa đo**, phải để dạng cấu hình.
- Cập nhật tổng giờ và kiểm tra lại số học.

## 1. Ràng buộc và bối cảnh

- Không đụng chạm hệ thống Mac khi phát triển (xem `agent-office-dev-isolation.md`).
- Server phải chạy trên máy của người dùng vì dữ liệu đến từ các agent đang chạy trên máy đó. Không deploy.
- Người dùng có thói quen **sleep máy** thay vì tắt hoặc đăng xuất. Điều này ảnh hưởng lớn tới thiết kế (mục 6).
- **Không dùng LaunchAgent ở bất kỳ giai đoạn nào** (dev, v0.1 và các bản sau), kể cả dạng tuỳ chọn (chốt 16/11/2026). Server không bao giờ là dịch vụ nền chạy từ lúc đăng nhập.
- Mục tiêu: không tốn RAM khi không dùng Claude, không phải nhớ bật server, không để lại gì trong hệ thống.

## 2. Quyết định tổng hợp

| # | Quyết định | Trạng thái |
|---|---|---|
| 1 | **Không dùng LaunchAgent ở tất cả giai đoạn**, kể cả dạng tuỳ chọn | Đã chốt (16/11) |
| 2 | **Bật server** bằng hook `SessionStart` gọi `ensure-running` | Đã chốt |
| 3 | **Tắt server** khi không còn session nào sống (qua `SessionEnd` **và** kiểm tra tiến trình), hoặc khi người dùng tắt bằng tay | Đã chốt (có bổ sung mục 4.2) |
| 4 | Server chỉ được khởi động bởi hook `SessionStart` (và lớp bật lười nếu giữ); không có dịch vụ nền nào chạy lúc đăng nhập | Đã chốt |
| 5 | **"Bật lười"** (lưới an toàn khi server chết giữa chừng) | **Còn mở**, đề xuất giữ. Vì không còn LaunchAgent, đây là cơ chế phục hồi **duy nhất** khi server chết giữa session (mục 5) |

## 3. Định nghĩa "session sống"

Session sống nghĩa là tiến trình `claude` còn đang mở, dù đang làm việc hay chỉ chờ người dùng nhập.

| Tình huống | Sống? |
|---|---|
| Đang mở `claude`, agent đang chạy | Có |
| Agent xong việc, chờ người dùng nhập | **Có** (chỉ là trạng thái `idle`/`done`) |
| Người dùng gõ `/exit`, Ctrl+C hai lần, đóng terminal | Không |
| Terminal crash hoặc tiến trình bị kill | Không (có thể không có `SessionEnd`) |
| **Máy đang sleep** | **Có**: tiến trình chỉ bị tạm dừng, wake thì chạy tiếp |

- "Sống" khác "đang hoạt động". Session để mở qua đêm mà không làm gì vẫn là session sống, nên server vẫn chạy (khoảng 100 MB, ước tính chưa đo). **[còn mở]** Có muốn tắt cả trong trường hợp này không? Đề xuất: không, giữ quy tắc đơn giản.
- Quy tắc "im lặng quá X giờ thì tắt" **không được dùng** vì dễ tắt nhầm sau sleep (mục 6).

## 4. Bật và tắt server

### 4.1 Bật
1. Hook `SessionStart` chạy `agent-office ensure-running`.
2. Lệnh kiểm tra cổng. Nếu chưa có server thì bật ở **chế độ nền** rồi thoát ngay, để không làm chậm việc mở session.
3. Hook luôn thoát `exit 0` và có timeout ngắn (khoảng 1 giây).

### 4.2 Tắt
Server chỉ tắt khi **cả hai** tín hiệu cho thấy không còn session sống:
- Đã nhận `SessionEnd` cho mọi session đã biết; và
- Kiểm tra định kỳ xác nhận không còn tiến trình `claude` tương ứng.

Lý do cần cả hai: session bị crash hoặc kill có thể không gửi `SessionEnd`.

Sau khi không còn session nào, server đợi **thời gian ân hạn** (đề xuất **5 phút**, cấu hình được) phòng khi người dùng mở lại ngay, rồi mới thoát. Nếu có session mới trong lúc ân hạn thì huỷ việc tắt.

### 4.3 Tắt bằng tay
- Lệnh `agent-office stop` dừng server ngay.
- Ghi một **cờ "đã tắt có chủ đích"** để lớp bật lười (mục 5) không bật lại trái ý người dùng. Cờ bị xoá khi có session mới mở.

### 4.4 Hệ quả của việc không dùng LaunchAgent
- Không có tiến trình nào tự bật lại server ngoài hook. Vì vậy server **tự thoát tự do** theo mục 4.2, không có chế độ "managed" và không có xung đột với `KeepAlive`.
- Khi server chết giữa session, chỉ có hai cách phục hồi: lớp bật lười ở mục 5 (nếu giữ), hoặc session tiếp theo mở ra. Đây là lý do đề xuất giữ lớp bật lười.
- Sau khi thoát session cuối và hết ân hạn, **không có tiến trình nào còn chạy** (kiểm thử ở mục 9).

## 5. Lớp "bật lười" (lưới an toàn) **[còn mở]**

`SessionStart` chỉ chạy **một lần** lúc session bắt đầu. Nếu server chết sau đó, các hook sau gửi vào hư không và dashboard mù. "Bật lười" là: khi hook không kết nối được server thì gọi `ensure-running` rồi gửi lại.

| Tình huống | Chỉ có SessionStart | Có thêm bật lười |
|---|---|---|
| Server crash giữa chừng | Chết luôn | Hook kế tiếp bật lại |
| Server tắt nhầm (lỗi logic sau sleep) | Như trên | Tự phục hồi |
| Lúc `SessionStart` bật thất bại (cổng bận, timeout) | Session đó không có server | Thử lại ở hook kế tiếp |
| Người dùng tự tắt server trong lúc session còn mở | Dashboard mù | Tự bật lại, trừ khi có cờ tắt có chủ đích |
| Session đã mở từ trước khi cài hook | Không ai bật server | Hook đầu tiên bật |

**Hai lựa chọn:**
- **Tối giản:** bỏ ở v0.1; server chết thì dashboard mù đến session sau.
- **Giữ như lưới an toàn có giới hạn tần suất.** Đề xuất của AI hỗ trợ: giữ, vì người dùng hay sleep và sleep/wake là nơi dễ phát sinh lỗi tắt nhầm.

> **Chủ dự án chọn:** ☐ Tối giản  ☐ Giữ bật lười

### Quy tắc đề xuất nếu giữ (giá trị cấu hình, chưa đo)

| Quy tắc | Giá trị |
|---|---|
| Không phải bộ đếm giờ: chỉ hành động khi có hook bắn ra **và** không kết nối được server | – |
| Khoảng cách tối thiểu giữa hai lần thử bật | 30 giây |
| Giãn dần khi thất bại liên tiếp | 30 giây, 1 phút, 5 phút (trần) |
| Dừng hẳn sau | 5 lần thất bại liên tiếp, ghi vào trang Chẩn đoán |
| Đặt lại bộ đếm | Khi kết nối thành công |
| Timeout mỗi lần gửi/bật | khoảng 1 giây; hook luôn `exit 0` |

**Ba chi tiết bắt buộc:**
1. **Nhiều hook cùng bắn một lúc** (3 agent có thể làm 3-5 hook thấy server chết trong cùng giây). Cần khoá nguyên tử: tạo file khoá bằng cờ độc quyền, hoặc để chính việc bind cổng làm khoá (ai bind được thì thắng, các hook còn lại chỉ gửi lại). Mốc "30 giây" lưu trong file nhỏ để các hook chia sẻ.
2. **Sự kiện trong lúc server chưa lên:** hook thử gửi lại một lần; nếu vẫn không được thì bỏ qua. Trạng thái được dựng lại sau từ transcript.
3. **Tắt tay có chủ đích:** tôn trọng cờ ở mục 4.3.

## 6. Sleep và wake

Thói quen sleep tạo ra các lỗi sau mà thiết kế phải xử lý (và cũng là một lý do nữa để không dùng LaunchAgent: dịch vụ nền chỉ được nạp lại khi đăng nhập phiên mới, có thể nhiều ngày một lần):

| Vấn đề | Xử lý |
|---|---|
| **Sleep không phải là đăng nhập lại.** Tiến trình chỉ bị tạm dừng, không bị tắt | Không cần xử lý riêng, nhưng phải hiểu: wake không khởi động lại server, nên không có "lần bật" nào xảy ra sau wake |
| **Đồng hồ nhảy về phía trước.** Logic "im lặng quá N phút thì coi là hết session/agent offline" dùng đồng hồ thường sẽ coi mọi agent là offline sau một đêm ngủ, thậm chí tắt server nhầm | Phát hiện nhảy thời gian (chu kỳ kiểm tra bị trễ bất thường, ví dụ hơn 3 lần chu kỳ), rồi đặt lại bộ đếm ân hạn và bộ đếm offline, và kiểm tra lại sau vài phút thay vì kết luận ngay |
| **SSE/WebSocket bị đứt khi máy ngủ** | Dashboard tự kết nối lại và hiện "đang kết nối lại", không hiển thị dữ liệu cũ như thể còn mới |
| **Trạng thái session có thể đã đổi khi wake** | Đối chiếu lại (đọc tiếp transcript, hỏi lại danh sách agent), không tin trạng thái cũ |
| **Tailer có thể bỏ lỡ sự kiện lúc ngủ** | Quét lại offset các file transcript sau wake |
| **Server sống nhiều ngày qua các lần sleep** | Soak test (ngưỡng ở file review) |
| **Server tắt nhầm sau wake** | Lưới an toàn bật lười (mục 5) + dựng lại trạng thái từ event log khi khởi động |

**Quy tắc cứng:** quyết định tắt server và quyết định "agent offline" **không bao giờ** chỉ dựa vào việc im lặng theo đồng hồ thật.

## 7. Không dùng LaunchAgent

### 7.1 Quyết định
Không dùng LaunchAgent (cơ chế macOS tự chạy chương trình nền khi đăng nhập, cấu hình bằng file `.plist` trong `~/Library/LaunchAgents/`) ở **bất kỳ giai đoạn nào**: không trong lúc dev, không ở v0.1, không như tuỳ chọn opt-in. Không dùng LaunchDaemon.

**Lý do:**
- Phù hợp ràng buộc không đụng hệ thống Mac và không để lại gì khi gỡ.
- Chủ dự án hay sleep nên lợi ích của dịch vụ nền (tự chạy lúc đăng nhập) gần như không có: nó chỉ được nạp lại khi đăng nhập phiên mới.
- Server chỉ cần sống khi có session Claude, đúng với mô hình `SessionStart` + tự tắt.
- Bớt việc: không cần plist, `launchctl`, chế độ managed, kiểm thử trên tài khoản macOS mới cho phần này.

### 7.2 Cái giá phải chấp nhận và cách bù

| Mất gì | Cách bù |
|---|---|
| Server không tự bật lại sau khi crash giữa session | Lớp bật lười (mục 5), kèm khoá nguyên tử và giới hạn tần suất |
| Server không sống sẵn khi chưa có session nào (dashboard mở sớm sẽ không có dữ liệu) | Dashboard hiện "chưa có server, mở một session Claude để bắt đầu" kèm nút/lệnh `agent-office start` |
| Thông báo macOS không có khi không có session nào chạy | Không cần: không có agent thì không có gì để thông báo |

### 7.3 Shim ổn định vẫn cần, nhưng chỉ cho hook
`${CLAUDE_PLUGIN_ROOT}` đổi đường dẫn mỗi khi plugin cập nhật, và đường dẫn Node có thể chứa số phiên bản (nvm), nên hook `SessionStart` vẫn gọi qua một **shim ổn định nằm ngoài thư mục plugin**. Shim ghi đường dẫn Node tuyệt đối, kiểm tra đường dẫn còn tồn tại, ghi lỗi rõ ràng vào log và có lệnh sửa lại (xem S8 và ADR-007 trong v3). Phần plist và `launchctl` không còn.

### 7.4 Lệnh người dùng
- `agent-office start`: bật server tay (khi cần mở dashboard sớm).
- `agent-office stop`: dừng server ngay và ghi cờ "đã tắt có chủ đích" (mục 4.3). Khi dev vẫn dùng `pnpm dev:up` / `pnpm dev:down`.

### 7.5 Checklist gỡ cài đặt sạch
Gỡ theo thứ tự ngược: plugin (bước 2), hook ở từng dự án (bước 1); khôi phục lệnh statusline cũ; xoá token, dữ liệu và log; xoá shim. Kiểm tra sau khi gỡ: không còn hook nào gọi tới server và **không còn tiến trình `agent-office` nào đang chạy**.

### 7.6 Nếu sau này đổi ý
Thêm lại LaunchAgent là một thay đổi có chủ đích, phải ghi ADR mới trước khi làm, và quay lại xử lý chế độ managed (server tự thoát xung đột với `KeepAlive`).

## 8. Tham số cấu hình (đều là đề xuất chưa đo)

| Tham số | Mặc định đề xuất |
|---|---|
| Thời gian ân hạn trước khi tắt | 5 phút |
| Chu kỳ kiểm tra tiến trình `claude` | 30-60 giây |
| Ngưỡng phát hiện nhảy thời gian | hơn 3 lần chu kỳ kiểm tra |
| Khoảng cách thử bật lại (bật lười) | 30 giây, giãn dần tới 5 phút |
| Số lần thất bại tối đa | 5 |
| Timeout hook | khoảng 1 giây |

Tất cả phải cấu hình được (file config hoặc biến môi trường) và hiệu chỉnh sau khi đo ở M0, soak test và kịch bản sleep/wake.

## 9. Kịch bản kiểm thử cần có

- [ ] Mở một session, chờ, thoát: server tắt sau thời gian ân hạn.
- [ ] Thoát session nhưng mở lại trong lúc ân hạn: server không tắt.
- [ ] Hai và ba session song song: server chỉ tắt khi **tất cả** đã đóng.
- [ ] Session bị kill hoặc terminal crash (không có `SessionEnd`): server vẫn phát hiện qua kiểm tra tiến trình.
- [ ] **Mô phỏng đồng hồ nhảy 8 giờ trong khi session còn sống:** server không tắt, agent không bị đánh dấu offline sai.
- [ ] Sleep/wake thật trên máy: dashboard tự kết nối lại, trạng thái được đối chiếu lại, không bỏ sót sự kiện.
- [ ] Server bị kill giữa chừng: (nếu giữ bật lười) hook kế tiếp bật lại; không có nhiều server cùng chạy khi nhiều hook bắn đồng thời.
- [ ] Tắt tay bằng `agent-office stop`: bật lười không bật lại; cờ được xoá khi có session mới.
- [ ] Server chết hẳn (không bật được): hook vẫn `exit 0` và không làm chậm agent; sau 5 lần thất bại thì dừng thử và ghi chẩn đoán.
- [ ] Thoát session cuối và để hết ân hạn: không còn tiến trình `agent-office` nào chạy (kể cả sau khi sleep/wake).
- [ ] Gỡ cài đặt sạch: sau khi gỡ, không còn hook nào gọi tới server và không còn tiến trình hay file nào của dự án ngoài thư mục dữ liệu đã chọn giữ lại.

## 10. Việc cần xác nhận ở M0 và gắn vào milestone

**M0 (spike, đều là [chưa kiểm chứng]):**
- [ ] Tên và cách cấu hình hook `SessionStart`/`SessionEnd` thật, và hook có chạy khi *resume* session không.
- [ ] Payload hook có cho biết PID của session không, hoặc có cách đáng tin để kiểm tra session còn sống.
- [ ] Hành vi khi session crash/kill: có `SessionEnd` không.
- [ ] Trên macOS, timer của Node (`setTimeout`) có tiếp tục chạy lúc máy ngủ không (nghi ngờ là không); chọn đồng hồ dùng cho logic im lặng.
- [ ] Đo RAM server khi rảnh, và RAM tab dashboard.

**M1:**
- [ ] `ensure-running`, tắt khi hết session (cả hai tín hiệu), thời gian ân hạn, `agent-office stop` và cờ tắt có chủ đích.
- [ ] Phát hiện nhảy thời gian, đối chiếu lại trạng thái sau wake, dashboard tự kết nối lại.
- [ ] Bật lười có khoá nguyên tử và giới hạn tần suất (nếu chủ dự án chọn giữ).
- [ ] Các kịch bản kiểm thử ở mục 9.

**Hardening & Release:**
- [ ] Không có LaunchAgent: shim ổn định chỉ cho hook, lệnh `agent-office start/stop`, checklist gỡ sạch và kiểm thử "không còn tiến trình nào sau khi hết session" (mục 7.5, 9).

## 11. Câu hỏi còn mở

| Câu hỏi | Hạn chốt | Đề xuất |
|---|---|---|
| Giữ hay bỏ lớp bật lười ở v0.1 | Trước M1 | Giữ, có giới hạn tần suất |
| Thời gian ân hạn trước khi tắt | Sau khi đo ở M0 | 5 phút |
| Session để mở qua đêm có tự tắt server không | Trước M1 | Không (giữ quy tắc đơn giản) |
| Có dùng LaunchAgent không | **Đã chốt (16/11): không dùng ở mọi giai đoạn** | Không còn câu hỏi về chế độ managed hay LaunchAgent opt-in |

## 12. Checklist cho AI khi cập nhật plan

- [ ] Thêm mục "Vòng đời server" (mục 2 đến 8 của file này).
- [ ] Cập nhật dòng "Khởi động": `SessionStart` là cách bật duy nhất (cộng bật lười nếu giữ), **không có LaunchAgent**; shim ổn định chỉ cho hook.
- [ ] Thêm kịch bản kiểm thử (mục 9) vào M1 và Hardening & Release.
- [ ] Thêm các việc M0 ở mục 10 vào danh sách spike, giữ nhãn [chưa kiểm chứng].
- [ ] Thêm các câu hỏi ở mục 11 vào "Câu hỏi còn mở" kèm hạn chốt.
- [ ] Cập nhật rủi ro (tắt nhầm sau sleep, nhiều server cùng chạy) và chỉ số đo nếu phù hợp.
- [ ] Cập nhật tổng giờ và kiểm tra số học.
- [ ] Cuối file, liệt kê ngắn các thay đổi đã làm và các chỗ chưa chắc.
