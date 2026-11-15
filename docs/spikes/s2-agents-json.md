# S2: `claude agents --json`

Spike S2 của M0 (issue #5, time-box 1 giờ, dùng dưới 15 phút). Thử ngày 16/11/2026 với Claude Code
2.1.325. Dữ liệu dùng lại từ S1 (1.823 lần poll trong 34 phút, 22 phiên) và thêm 50 lần gọi đo
chi phí, một phiên headless trong sandbox để theo dõi file trạng thái.

## Trả lời các câu của S2

| Câu hỏi | Trả lời |
|---|---|
| Session tương tác có xuất hiện không | **Có.** Cả phiên tương tác lẫn `claude -p` (`kind: interactive`). Phiên có mặt từ lúc khởi động tới lúc tiến trình thoát (S1: biến mất ngay ở `SessionEnd`) |
| Có những trường nào | `cwd`, `kind`, `name`, `pid`, `sessionId`, `startedAt`, `status`, và `waitingFor` khi `status` là `waiting`. Phiên nền còn có `id`, `state` (theo tài liệu, chưa thử). Giá trị đã thấy: `busy`, `idle`, `waiting` với `permission prompt` (duyệt quyền, duyệt plan) hoặc `input needed` (`AskUserQuestion`). Một lần thấy mục không có `pid`/`status`: phiên vừa thoát (tài liệu: hai trường này chỉ có khi tiến trình còn sống) |
| Mỗi lần gọi tốn bao nhiêu | 50 lần: thời gian thực p50 0,09 s, p95 0,11 s, tối đa 0,16 s. CPU (user + sys) khoảng 0,12 s mỗi lần. Bộ nhớ đỉnh 141 MB trong lúc chạy. **Poll mỗi giây tốn khoảng 12% một nhân CPU**; mỗi 5 giây khoảng 2,4% |
| Có tự khởi động supervisor không | **Không.** Sau 50 lần gọi và 1.823 lần poll ở S1: không có tiến trình mới, không có `~/.claude/daemon.log`, không có `~/.claude/jobs/` (hai thứ supervisor tạo ra theo tài liệu). Theo tài liệu, supervisor chỉ chạy khi mở agent view (`claude agents` không có `--json`) hoặc đưa phiên ra nền |

Tiêu chí "Nếu không đạt" không bị kích hoạt: giữ reconciler.

## Phát hiện: file trạng thái theo từng phiên

`claude agents --json` lấy dữ liệu từ `~/.claude/sessions/<pid>.json`, mỗi phiên một file, có `status`,
`statusUpdatedAt`, `pid`, `sessionId`, `cwd`. Theo dõi thư mục đó (chỉ đọc) trong một phiên headless:

| Thời điểm | Sự kiện trong `~/.claude/sessions/` | Hook cùng lúc |
|---|---|---|
| +0,30 s | `<pid>.json` được tạo, `status: busy` | `SessionStart` (+0,27 s) |
| +4,18 s | cập nhật, `status: idle` | lượt trả lời kết thúc |
| +5,21 s | file bị xoá | `SessionEnd` (+4,32 s) |

- Tên file là pid, đúng bằng `ppid` của tiến trình hook (khớp với S1).
- Mỗi lần cập nhật là ghi file tạm rồi đổi tên, nên `fs.watch` nhận được ngay.
- Đây là định dạng nội bộ, có thể đổi. Tài liệu chỉ cam kết `claude agents --json`, và nói rõ file trong
  `~/.claude/jobs/` không phải giao diện ổn định. Thư mục cũng đổi theo `CLAUDE_CONFIG_DIR`.

## Đề xuất cho reconciler (M1)

- **Kích hoạt theo sự kiện:** `fs.watch` trên thư mục `sessions/` chỉ dùng làm tín hiệu "có gì đó đổi".
  Khi có tín hiệu, gom trong 100-200 ms rồi gọi `claude agents --json`. Không đọc nội dung file nội bộ.
  Lúc không có gì xảy ra, chi phí gần bằng 0, độ trễ dưới 0,5 giây.
- **Nhịp an toàn:** vẫn poll `claude agents --json` thưa (đề xuất 30-60 giây) để bù sự kiện bị lỡ, và
  chuyển hẳn sang poll thích ứng (2 giây khi có phiên đang chờ, 15-30 giây khi rảnh) nếu thư mục không
  tồn tại hoặc watch lỗi.
- **Liveness:** dùng `process.kill(pid, 0)` trên `ppid` của hook, gần như không tốn gì, không cần poll.
- **Khi dev:** không cần tắt reconciler mặc định như mục 9.2 dự phòng, vì `--json` không khởi động
  supervisor.

## Dữ liệu

- `.dev-raw/s2/`: 50 output của lệnh và số đo, log theo dõi thư mục `sessions/` (ngoài git). Output
  liệt kê cả phiên của dự án khác, nên không đưa vào fixture.
- Fixture có `claude agents --json` (đã lọc chỉ phiên sandbox) nằm trong `fixtures/s1/*/agents.jsonl`.
