# S7: Statusline wrapper

Spike S7 của M0 (issue #10, time-box 0,5 giờ, dùng khoảng 25 phút làm việc). Thử với Claude Code 2.1.325
trên macOS. Spike này không cần phiên mới: dữ liệu lấy từ statusline đã ghi trong các phiên tương tác của
S0, S1, S3 và S4 (15-16/11/2026).

## Cách thử

- Từ S0, sandbox đặt statusline ở cấp dự án là logger của S1 (`scripts/spikes/log-event.ts <tag> --print`).
  Logger đọc JSON từ stdin, ghi cùng `pid`, `ppid`, biến môi trường `CLAUDE_*`, rồi in một dòng chữ. Nó
  đóng đúng vai wrapper: nhận dữ liệu và in ra statusline.
- Phân tích bằng `jq` trên `.dev-raw/{s0,s1,s3,s4}/statusline.jsonl`: 122 bản ghi, 29 phiên.
- Đối chiếu `ppid` của statusline với `ppid` của hook trong cùng phiên.
- Phần nói về tài liệu chính thức đã đối chiếu ngày 16/11/2026 với
  [Status line](https://code.claude.com/docs/en/statusline).

## Trả lời các câu của S7

- **Có nhận được `rate_limits` không: có.**
  - JSON có `rate_limits.five_hour` và `rate_limits.seven_day`. Mỗi cửa sổ gồm `used_percentage` (số nguyên,
    ví dụ 5, 9) và `resets_at` (epoch giây).
  - 92/122 bản ghi có `rate_limits`.
  - Bản ghi **đầu tiên** của 27/29 phiên **không có** `rate_limits`, vì statusline chạy lúc mở phiên, trước
    response đầu tiên. Hai phiên còn lại là phiên resume hoặc đã có response từ trước.
  - Ba phiên chỉ có đúng một bản ghi (đóng trước khi gửi prompt) nên không bao giờ có `rate_limits`.
  - Quota là của **cả tài khoản**: phần trăm tăng theo mọi phiên đang dùng, kể cả phiên ngoài sandbox.
  - Theo tài liệu:
    - `rate_limits` chỉ có với gói claude.ai Pro, Max, Ultra (hoặc khi đi qua gateway có `spend_limit`),
      và chỉ sau response đầu tiên. Người dùng API key sẽ không có.
    - Mỗi cửa sổ có thể vắng riêng, và bị bỏ khi đã quá `resets_at`.
    - Không có cửa sổ theo từng model.
- **Có lấy được pid không: có.**
  - `ppid` của lệnh statusline chính là pid của tiến trình `claude`, và bằng `ppid` của hook trong cùng phiên.
    Đã đối chiếu ở các phiên của S3, S4.
  - Mỗi phiên chỉ có một `ppid`, trừ phiên được resume ở tiến trình khác.
  - JSON có sẵn `session_id`, nên wrapper ghép được cặp (`session_id`, pid) mà không cần nguồn nào khác.

## Phát hiện khác

- **Statusline chạy theo sự kiện, không chạy định kỳ.**
  - Thực tế: trong lượt làm việc, khoảng cách giữa hai lần chạy có trung vị khoảng 2 s. Khi phiên rảnh thì
    không chạy, có lần cách nhau 1.956 s.
  - Theo tài liệu, statusline chạy khi:
    - mở phiên, kể cả khi resume;
    - có message mới của assistant;
    - `/compact` xong;
    - đổi chế độ quyền;
    - một cửa sổ quota tới `resets_at`.
  - Các lần chạy được gộp trong 300 ms. Một lần chạy mới **huỷ lần đang chạy dở**.
  - Có tuỳ chọn `refreshInterval` (giây, tối thiểu 1) để chạy định kỳ, mặc định tắt.
  - Vì vậy quota chỉ được cập nhật khi có phiên đang làm việc, và dashboard phải hiện thời điểm cập nhật cuối.
- **Lệnh chạy qua shell** (theo tài liệu). `ppid` vẫn là `claude` vì shell `exec` thẳng lệnh đơn. Nếu lệnh
  là chuỗi lệnh (`a && b`), `ppid` có thể thành pid của shell.
- Statusline ở cấp dự án (`.claude/settings.local.json`) **ghi đè** statusline của người dùng (settings
  precedence). Thư mục chưa được tin cậy thì statusline bị tắt. Tài liệu không có cách nối tiếp hai lệnh
  statusline, nên wrapper là cách duy nhất.
- Biến môi trường `CLAUDE_*` mà lệnh nhận được: `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_PROJECT_DIR`. Tài liệu chỉ
  nêu `COLUMNS`, `LINES`.
- JSON còn có: `session_id`, `session_name`, `transcript_path`, `cwd`, `workspace`, `model` (`id`,
  `display_name`), `version`, `cost` (`total_cost_usd`, `total_duration_ms`, `total_api_duration_ms`, dòng
  thêm/xoá), `context_window` (token vào/ra, `context_window_size`, `used_percentage`), `exceeds_200k_tokens`,
  `effort`, `thinking`, `fast_mode`, `output_style`, `prompt_cache`, `prompt_id`.
  - `context_window.used_percentage` dùng được cho "mức đầy context" ở M1, không cần đếm token từ transcript.
- Máy của chủ dự án **không có statusline toàn cục** (`~/.claude/settings.json` không có `statusLine`, chỉ đọc).
  Trường hợp phải bọc một lệnh statusline cũ chưa gặp trên máy này, nhưng người dùng khác sẽ gặp.

## Đề xuất cho M4 (và ADR-007)

- Giữ cách làm ở mục 7: `agent-office statusline -- <lệnh cũ>`.
  - Wrapper gửi dữ liệu ngay khi đọc xong stdin, với timeout ngắn (khoảng 300 ms), và không chờ server trả
    lời. Lý do: một lần chạy mới huỷ lần đang chạy dở, và script chậm làm statusline chậm cập nhật.
  - Wrapper luôn in kết quả của lệnh cũ, kể cả khi server tắt.
- Lấy pid bằng `process.ppid`. Lệnh trong cấu hình phải là lệnh đơn, và nếu là shim thì shim phải dùng
  `exec`, để `ppid` vẫn là `claude` (chờ S8). Kiểm tra thêm tiến trình cha đúng là `claude`.
- Gửi kèm `session_id`, để server có thêm nguồn pid cho việc kiểm tra tiến trình (mục 9.2, "Khởi động và
  tắt server") ngoài `claude agents --json`.
- Cân nhắc `refreshInterval` khoảng 60 s nếu cần quota mới hơn. Cái giá là mỗi phiên khởi động Node thêm
  một lần mỗi phút.
- Ô quota:
  - hiện "chưa có dữ liệu" khi chưa có response nào;
  - hiện thời điểm cập nhật cuối;
  - coi dữ liệu là cũ khi quá `resets_at`.

## Giới hạn

- Chỉ có phiên tương tác trong terminal của VS Code, một tài khoản (gói thuê bao), một phiên bản.
- Chưa thử:
  - với API key;
  - bọc một lệnh statusline cũ;
  - `refreshInterval`;
  - lệnh dạng chuỗi (`a && b`).
- Đây là dữ liệu lấy lại từ các spike trước, không có phiên nào chạy riêng cho S7.
