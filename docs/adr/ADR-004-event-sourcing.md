# ADR-004: Event sourcing và reducer thuần dùng chung cho server và trình duyệt

- **Trạng thái:** Chấp nhận (16/11/2026)
- **Người quyết định:** chủ dự án (theo plan v3.1 mục 3, 5, 8)
- **Liên quan:** plan v3.1 mục 5.1-5.4; ADR-001 (sự kiện), ADR-005 (lưu trữ); spike S1 (fixture), S9 (đồng hồ khi ngủ)

## Bối cảnh

Trạng thái của mỗi agent được ghép từ nhiều nguồn (ADR-001). Các nguồn đến lệch thứ tự, có nguồn đến trễ, có
nguồn thiếu sự kiện: không có `Stop` khi Esc, không có `SessionEnd` khi `kill -9`. Server phải khôi phục được
trạng thái sau khi khởi động lại (5.3), và dashboard phải hiện đúng như server. Plan đã chọn event sourcing với
reducer dùng chung. ADR này ghi lại quyết định và các quy tắc đi kèm.

## Quyết định

1. **Event log là nguồn sự thật.** Mọi dữ liệu vào đi theo một đường:
   - adapter của từng nguồn chuyển dữ liệu thành `NormalizedEvent` (ADR-001);
   - sự kiện được ghi **chỉ thêm, không sửa** vào event log (ADR-005);
   - server gán `seq` tăng dần theo thứ tự nhận.

   Không có trạng thái nào được ghi trực tiếp mà không đi qua sự kiện.
2. **Reducer thuần** nằm ở `packages/shared`: `reduce(state, event) → state`.
   - Không I/O.
   - Không đọc `Date.now()` hay đồng hồ nào. Thời gian lấy từ `event.ts` hoặc `seq`.
   - Không sinh số ngẫu nhiên.
   - Cùng một chuỗi sự kiện luôn cho cùng một trạng thái.
3. **Trạng thái hiển thị được suy ra, không lưu:** `deriveStatus(session, now)` là hàm thuần, dùng thứ tự ưu tiên
   ở mục 5.2. `now` được truyền vào, không tự đọc.
4. **Hiệu ứng nằm ngoài reducer.** Các việc sau chạy ở server:
   - timer;
   - kiểm tra pid (`kill -0`);
   - poll `claude agents --json`;
   - phát hiện máy vừa thức (S9);
   - tự tắt server.

   Kết quả của chúng đi vào reducer **dưới dạng sự kiện** (`liveness`, `official_status`).
   - Timer quyết định (ân hạn, offline) phải kiểm tra tick trễ trước khi phát sự kiện (S9, mục 5.4).
   - Reducer không bao giờ tự kết luận "offline vì im lặng lâu".
5. **Dùng chung ở trình duyệt.**
   - Khi kết nối, server gửi snapshot kèm `seq` của nó.
   - Sau đó server gửi từng sự kiện qua SSE, với `id` = `seq`. Trình duyệt áp dụng bằng **cùng** reducer.
   - Kết nối lại dùng `Last-Event-ID`. Nếu khoảng thiếu vượt quá phần server còn giữ thì server gửi snapshot mới.
   - Trình duyệt không có máy trạng thái thứ hai.
6. **Chịu được lệch thứ tự và trùng lặp:**
   - `id` của sự kiện dedupe trong từng nguồn;
   - `correlationKey` ghép một sự việc giữa các nguồn: `tool_use_id`, `message.id`, `requestId`;
   - mỗi sự việc chỉ áp dụng một lần, nguồn đến sau chỉ bổ sung thông tin;
   - bỏ qua `tool_start` đến sau `tool_end` của cùng id (mục 5.1, 5.2).
7. **Snapshot và phục hồi** (mục 5.3):
   - server lưu snapshot trạng thái kèm `seq` định kỳ, khoảng mỗi 500 sự kiện hoặc 60 s, và khi tắt;
   - khởi động thì nạp snapshot mới nhất rồi áp dụng các sự kiện có `seq` lớn hơn.

   Snapshot chỉ là cache: xoá đi thì dựng lại được từ event log.
8. **Phiên bản:**
   - Mỗi sự kiện mang `schema_version`. Khi đọc lại sự kiện cũ, chạy *upcaster* chuyển lên phiên bản hiện tại
     trước khi đưa vào reducer.
   - Snapshot mang phiên bản của reducer. Snapshot khác phiên bản thì bỏ, và dựng lại từ event log.
9. **Test:**
   - test dạng bảng cho reducer và `deriveStatus`;
   - golden replay: fixture M0 (`fixtures/s1/`) qua adapter rồi reducer phải cho ra đúng trạng thái đã duyệt;
   - property test: xáo trộn thứ tự hoặc lặp lại sự kiện thì reducer không crash và hội tụ về cùng trạng thái
     cuối, với các sự kiện có `correlationKey`;
   - test thời gian dùng `now` giả, không dùng timer thật.

## Hệ quả

- **Được:**
  - debug bằng cách phát lại event log;
  - simulator (M1) dùng chính đường này;
  - dashboard và server không lệch nhau;
  - thêm nguồn mới (Codex, Cursor ở M5) chỉ cần thêm adapter.
- **Phải chịu:**
  - event log tăng theo thời gian, khoảng 5.000-6.000 sự kiện mỗi ngày dùng nhiều, nên cần chính sách giữ dữ
    liệu (ADR-005);
  - đổi cấu trúc sự kiện phải viết upcaster;
  - reducer phải đủ nhanh để phát lại cả ngày khi khởi động: bài đo của ADR-005 đọc 50.000 sự kiện từ SQLite mất 45 ms, phần
    reducer đo ở M1.
- Mọi giá trị "mới nhất" (quota, trạng thái chính thức) cũng là sự kiện. Nguồn ghi dày như statusline chỉ ghi khi
  giá trị đổi.

## Phương án đã cân nhắc

- **Server giữ trạng thái và chỉ đẩy snapshot ra trình duyệt.** Đơn giản hơn, nhưng mất khả năng phát lại, khó viết
  golden test, và mỗi thay đổi phải gửi cả snapshot.
- **Hai máy trạng thái riêng cho server và trình duyệt.** Bị loại vì dễ lệch nhau (plan mục 8).
- **Ghi trạng thái trực tiếp, không có event log.** Bị loại vì không phục hồi và không debug được khi nguồn đến lệch
  thứ tự.
