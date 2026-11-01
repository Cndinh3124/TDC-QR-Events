# Nhật ký giai đoạn 7 — Triển khai

Ngày: 01/11/2026. Hướng dẫn đầy đủ: **`docs/trien-khai.md`** (có bảng "Đã kiểm chứng" và "Chưa kiểm chứng").

## Đã làm

- `deploy/nginx/tdc-qr.conf`: HTTPS, HSTS, CSP chặt, Permissions-Policy (`geolocation=(self)`), chuyển `/api`, SPA fallback, cache tệp tĩnh, chặn tệp ẩn.
- `deploy/backup/backup.sh`, `restore.sh`: sao lưu nhất quán, kiểm tra tệp, xóa bản cũ, khôi phục có chốt chặn ghi đè.
- Tác vụ tự **ẩn danh hóa dữ liệu vị trí** quá hạn lưu trữ (xem giai đoạn 6).
- Hướng dẫn: biến môi trường production, tách tài khoản CSDL (khuyến nghị), lịch sao lưu, danh sách kiểm tra trước ngày đầu.

## Kiểm chứng

- nginx 1.24: `nginx -t`, chạy thật với backend thật, kiểm header / SPA / proxy / chặn tệp ẩn / chuyển http→https; duyệt giao diện quản trị bằng Chromium qua nginx để bắt lỗi CSP. Lộ ra và đã sửa hai lỗi: font nhúng `data:` bị CSP chặn; `Host $host` làm rơi số cổng khiến backend từ chối làm mới phiên.
- Sao lưu → khôi phục sang DB tạm → số dòng 7 bảng khớp; thử từ chối ghi đè, xóa bản cũ, tên DB lạ. Lộ ra và đã sửa: `grep -q` dưới `pipefail` làm kiểm tra tệp luôn báo lỗi nhầm.

## Chưa kiểm chứng / chưa làm

Docker và image production chưa chạy thử ở môi trường này; MySQL 8.4 chỉ qua CI; chứng chỉ HTTPS thật, Internet thật, thiết bị iOS / Android thật, tải thật trên máy chủ thật; **chưa có Terraform** (chưa biết nhà cung cấp hạ tầng). Chưa làm: CI chạy k6 tự động (kịch bản đã có ở `loadtest/`, cần máy chủ thử).
