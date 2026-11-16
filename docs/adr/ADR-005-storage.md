# ADR-005: Lưu trữ

- **Trạng thái:** Chấp nhận (16/11/2026)
- **Người quyết định:** chủ dự án
- **Liên quan:** plan v3.1 mục 5.3, 7, 8, M3.5; ADR-004 (event log), ADR-007 (đóng gói, thư mục dữ liệu)

## Bối cảnh

ADR-004 cần một event log chỉ thêm, có snapshot, cộng thêm các thứ sau:
- offset đọc transcript;
- lịch sử nhiệm vụ và quota (mục 7);
- nhật ký kiểm toán duyệt quyền (mục 6).

Plan để ngỏ lựa chọn `node:sqlite` hay `better-sqlite3`. ADR-007 đặt ràng buộc: plugin ship sẵn mọi thứ, không
`node_modules`, không bước cài, server bundle bằng esbuild, và chạy bằng `node` của máy người dùng (có thể đổi theo
nvm).

**Đo `node:sqlite` trên máy chủ dự án** (`scripts/spikes/storage/sqlite-bench.ts`, Node 22.21.1, 50.000 sự kiện
khoảng 470 byte, WAL, `synchronous = NORMAL`, mỗi sự kiện một `INSERT` tự commit):

| Chỉ số | Kết quả |
|---|---|
| Nạp module | Không cần cờ; in `ExperimentalWarning` |
| Ghi | **21 µs mỗi sự kiện** (khoảng 47.000 sự kiện mỗi giây) |
| `INSERT OR IGNORE` trùng khoá `(source, source_key)` | Bị bỏ, đúng như cần cho dedupe |
| Đọc lại toàn bộ theo `seq` | 45 ms cho 50.000 sự kiện |
| Truy vấn theo phiên (có index) | 0,5 ms |
| Dung lượng | Khoảng 560 byte mỗi sự kiện |

**Khối lượng thực tế:** transcript 7 ngày gần nhất có tối đa khoảng 800 lần gọi tool và 1.465 message mỗi ngày,
tức khoảng 5.000-6.000 sự kiện. Như vậy là khoảng 3 MB mỗi ngày, hay **90-100 MB cho 30 ngày**.

## Quyết định

1. **Dùng `node:sqlite`** (có sẵn trong Node, `DatabaseSync`), không dùng `better-sqlite3`.
   - `better-sqlite3` là native addon: file `.node` gắn với từng nền tảng và từng ABI của Node.
     - esbuild không bundle được, nên phải ship `node_modules` và chạy script cài. pnpm 11 chặn script cài mặc
       định.
     - Addon **hỏng khi người dùng đổi phiên bản Node** qua nvm. Đó đúng là vấn đề S8 vừa tránh được.
   - `node:sqlite` không có những vấn đề trên, và đủ nhanh với khối lượng ở trên.
   - Shim gọi `node --disable-warning=ExperimentalWarning` để không in cảnh báo.
   - Mọi truy cập đi qua một module `storage` nhỏ có interface riêng, để đổi thư viện được nếu cần.
2. **Một file DB:** `$AGENT_OFFICE_HOME/agent-office.db`, quyền 0600, chỉ server ghi.
   - `AGENT_OFFICE_HOME` là `${CLAUDE_PLUGIN_DATA}` ở bản phát hành (ADR-007) và `.dev-data/` khi dev.
   - Thiết lập: WAL, `synchronous = NORMAL`, `busy_timeout`, và `auto_vacuum = INCREMENTAL` (phải đặt lúc tạo DB).
3. **Các bảng:**

   | Bảng | Nội dung | Giữ |
   |---|---|---|
   | `events` | `seq` (khoá chính, cũng là `Last-Event-ID`), `source`, `source_key`, `session_id`, `type`, `ts`, `schema_version`, `body` (JSON của `NormalizedEvent`); `UNIQUE (source, source_key)`; index `(session_id, seq)` | **30 ngày** |
   | `raw` | Payload gốc đã cắt và redact (`rawRef` trỏ tới) | **7 ngày** |
   | `snapshots` | `seq`, phiên bản reducer, trạng thái JSON | Bản mới nhất và một bản trước |
   | `tailer_offsets` | `transcript_path`, offset, kích thước, inode | Theo phiên còn theo dõi |
   | `tasks` | Lịch sử theo `promptId`: thời gian, tool, token | **365 ngày** |
   | `quota_snapshots` | Quota mỗi khi đổi | **365 ngày** |
   | `approvals_audit` | Mọi quyết định duyệt, chỉ thêm | **365 ngày** |
   | `meta` | Phiên bản app, thời điểm migrate | |

   `tasks` được dựng từ event log trước khi sự kiện hết hạn, nên lịch sử còn lại sau khi event log bị cắt.
4. **Phiên bản và migrate:**
   - `PRAGMA user_version` là phiên bản của DB.
   - Migrate chạy lúc server khởi động, **sao lưu file DB trước** (plan M3.5), trong một transaction.
   - Mỗi sự kiện mang `schema_version` riêng, để upcaster dùng (ADR-004).
5. **Dọn dẹp:** mỗi ngày một lần lúc server rảnh: xoá phần quá hạn, rồi `PRAGMA incremental_vacuum`. Các mốc thời hạn
   cấu hình được.

## Hệ quả

- Không thêm phụ thuộc lúc chạy nào, và không có gì phải build lại khi đổi Node.
- **Rủi ro:** `node:sqlite` vẫn là "experimental" ở Node 22, API có thể đổi giữa các bản.
  - Giảm rủi ro bằng: module `storage` riêng; golden test đọc/ghi; ghim `engines.node`; chạy lại bài đo khi nâng
    Node.
  - Nếu phải đổi sang `better-sqlite3` thì phải xem lại ADR-007 (ship binary theo nền tảng).
- **Gỡ plugin xoá cả DB và lịch sử,** vì DB nằm trong `${CLAUDE_PLUGIN_DATA}`, trừ khi dùng
  `claude plugin uninstall --keep-data`. `agent-office uninstall` phải hỏi người dùng có muốn xuất lịch sử không.
- Khoảng 100 MB cho 30 ngày event log là chấp nhận được. Soak test (M3.5) đo lại dung lượng thật.

## Phương án đã cân nhắc

- **`better-sqlite3`.** Đây là thư viện SQLite phổ biến nhất cho Node, API đồng bộ, ổn định. Bị loại vì là native addon,
  xung đột với ADR-007 và với nvm.
- **File JSONL thay cho SQLite.** Không có thư viện, nhưng phải tự làm dedupe, index theo phiên, cắt theo thời hạn
  và ghi an toàn khi crash.
- **DB ở `~/Library/Application Support/agent-office/`.** Lịch sử còn lại sau khi gỡ plugin, nhưng thêm một chỗ ghi
  ngoài thư mục của Claude Code, trái với lý do chọn `${CLAUDE_PLUGIN_DATA}` ở ADR-007.
