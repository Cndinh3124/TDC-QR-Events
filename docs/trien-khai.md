# Hướng dẫn triển khai

Dành cho người quản trị máy chủ của nhà trường. Mô hình đề xuất: **một máy chủ Linux** chạy nginx (HTTPS) + backend (Docker) + MySQL 8.4. Có thể thay MySQL bằng dịch vụ CSDL do trường thuê (RDS…), khi đó chỉ đổi `DB_HOST` và bật `DB_SSL=true`.

```
Sinh viên / Quản trị ──https──▶ nginx ──/api──▶ backend (127.0.0.1:3000) ──▶ MySQL
                                  └── tệp tĩnh giao diện (apps/web/dist)
```

> Phần "Đã kiểm chứng" ở cuối nói rõ cái gì đã chạy thử thật và cái gì **chưa**. Hãy đọc trước khi đưa vào dùng.

## 1. Chuẩn bị

- Tên miền riêng (ví dụ `diemdanh.tdc.edu.vn`) và chứng chỉ HTTPS (Let's Encrypt hoặc của trường). **Bắt buộc HTTPS**: điện thoại chỉ cho phép lấy vị trí GPS trên trang HTTPS, và backend từ chối `PUBLIC_BASE_URL` không phải `https` ở chế độ production.
- Máy chủ có Docker, nginx, Node 22 (chỉ cần để dựng giao diện; có thể dựng ở máy khác rồi chép `dist` lên).

## 2. Biến môi trường

Sao `.env.example` thành `.env` (không commit). Các giá trị production:

| Biến | Giá trị |
|---|---|
| `NODE_ENV` | `production` |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | thông tin CSDL (xem mục 4) |
| `DB_SSL` | `true` nếu CSDL ở máy khác / dịch vụ thuê |
| `JWT_ACCESS_SECRET`, `DEVICE_SECRET` | mỗi khóa ≥ 32 ký tự ngẫu nhiên, **hai khóa khác nhau**: `openssl rand -base64 48` |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | `true` (đã đặt sẵn trong `docker-compose.yml`) để lấy đúng IP sau nginx |
| `PUBLIC_BASE_URL` | `https://diemdanh.tdc.edu.vn` (được in vào mã QR; sai sẽ làm QR không dùng được) |

Đổi `JWT_ACCESS_SECRET` sẽ đăng xuất mọi người; đổi `DEVICE_SECRET` làm sinh viên bị coi là thiết bị mới. Đừng đổi giữa đợt điểm danh.

## 3. Dựng và chạy

```bash
npm ci
npm run build                                  # API + giao diện
sudo mkdir -p /var/www/tdc-qr && sudo cp -r apps/web/dist/* /var/www/tdc-qr/

docker compose up -d --build                   # db + migrate + api (api chỉ nghe 127.0.0.1:3000)
docker compose run --rm api node dist/cli/create-admin.js --email ten@tdc.edu.vn --name "Họ tên"
```

Cập nhật phiên bản mới: `git pull`, `npm ci && npm run build`, chép lại `dist`, `docker compose up -d --build` (tác vụ `migrate` tự chạy trước khi `api` khởi động).

## 4. Cơ sở dữ liệu

- **Không mở cổng 3306 ra ngoài** (compose chỉ `expose` trong mạng nội bộ). Nếu dùng CSDL thuê, chỉ cho phép địa chỉ máy chủ ứng dụng.
- **Nên dùng hai tài khoản** (hiện `docker-compose.yml` dùng chung một tài khoản cho cả `migrate` và `api` — việc tách là khuyến nghị, **chưa làm sẵn**):
  ```sql
  -- tài khoản chạy migration (chỉ dùng lúc nâng cấp)
  CREATE USER 'tdc_migrate'@'%' IDENTIFIED BY '...';
  GRANT ALL ON tdc_qr.* TO 'tdc_migrate'@'%';
  -- tài khoản của ứng dụng: không được sửa cấu trúc bảng
  CREATE USER 'tdc_app'@'%' IDENTIFIED BY '...';
  GRANT SELECT, INSERT, UPDATE, DELETE ON tdc_qr.* TO 'tdc_app'@'%';
  ```
- Bộ ký tự `utf8mb4`. Tìm kiếm tiếng Việt không phân biệt dấu dựa vào collation `*_ci` của MySQL 8.4; chữ "đ" được xử lý riêng trong mã (xem `activities.service.ts`).

## 5. nginx

Tệp mẫu: `deploy/nginx/tdc-qr.conf`. Sao vào `/etc/nginx/conf.d/`, thay tên miền và đường dẫn chứng chỉ, rồi `nginx -t && systemctl reload nginx`. Tệp đã gồm:

- chuyển `http` → `https`, TLS 1.2/1.3;
- `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (chỉ cho `geolocation=(self)`), `Content-Security-Policy` chặt (`default-src 'self'`; `img-src` chỉ thêm nền bản đồ OpenStreetMap; `font-src` có `data:` vì Vite nhúng font nhỏ);
- `/api/` chuyển về backend, **giữ nguyên `Host` kể cả cổng** (backend so `Origin` với `Host`; dùng `$host` sẽ làm mất phiên khi chạy cổng lạ) và **ghi đè** `X-Forwarded-For` bằng IP thật (không tin header do client gửi);
- giới hạn tần suất thô theo IP rất rộng (50 yêu cầu/giây, đợt 200) vì nhiều sinh viên dùng chung IP wifi trường; giới hạn thật nằm trong API (theo thiết bị / MSSV);
- `/assets/` cache 1 năm, `index.html` không cache, mọi đường dẫn khác trả `index.html` (React Router), chặn tệp ẩn.

## 6. Sao lưu và khôi phục

```bash
# /etc/tdc-qr/backup.cnf  (chmod 600)
[client]
user=tdc_backup
password=...
host=127.0.0.1

# crontab: 2 giờ sáng hằng ngày, giữ 14 ngày
0 2 * * * BACKUP_DIR=/var/backups/tdc-qr DB_NAME=tdc_qr DEFAULTS_FILE=/etc/tdc-qr/backup.cnf /opt/tdc-qr/deploy/backup/backup.sh >> /var/log/tdc-qr-backup.log 2>&1
```

`backup.sh` tạo bản dump nhất quán (`--single-transaction`, không khóa bảng), nén, kiểm tra tệp hợp lệ và có bảng, đặt quyền `600`, rồi xóa bản cũ hơn `KEEP_DAYS`. Mật khẩu không đưa lên dòng lệnh.

Khôi phục: `restore.sh <tệp.sql.gz> <tên_csdl_đích>`; **từ chối ghi đè** nếu CSDL đích đã có bảng (đặt `FORCE=1` khi chắc chắn). Cách an toàn: khôi phục sang một CSDL mới, kiểm tra, rồi mới đổi `DB_NAME`.

**Bản sao lưu chứa họ tên và MSSV sinh viên** — lưu nơi hạn chế quyền truy cập, và **chép ra một máy / nơi khác** (sao lưu cùng ổ đĩa không cứu được khi hỏng ổ). **Nên định kỳ thử khôi phục** (ví dụ mỗi quý) vì bản sao lưu chưa từng khôi phục thì chưa chắc dùng được.

## 7. Dữ liệu cá nhân

- `data_retention_months` (Cấu hình, mặc định 6): sau số tháng này, backend **tự xóa** tọa độ, khoảng cách, địa chỉ IP và thông tin trình duyệt của từng lượt điểm danh (chạy mỗi ngày, lần đầu sau khi khởi động 5 phút). MSSV, họ tên, giờ điểm danh và kết quả duyệt được **giữ** vì còn dùng cho điểm rèn luyện và tra cứu. Cờ gắn trên lượt (ví dụ "ngoài vùng GPS") vẫn còn, nhưng không còn tọa độ gốc để kiểm lại.
- Mọi thao tác nhạy cảm đều có nhật ký (Đoàn trường xem ở mục Nhật ký). Nhật ký không chứa mật khẩu hay khóa.
- Nên thông báo cho sinh viên mục đích thu thập vị trí (chỉ để xác nhận có mặt tại buổi) trên trang điểm danh hoặc quy chế của trường.

## 8. Kiểm thử tải

Xem `loadtest/README.md` (k6: 2.000 sinh viên trong 3 phút rồi đợt đỉnh 100 lượt/giây). **Chỉ chạy vào máy chủ thử**. Nên chạy một lần trên máy chủ thật trước ngày dùng đầu tiên.

## 9. Danh sách kiểm tra trước ngày đầu tiên

- [ ] `https://…/` mở được, ổ khóa hợp lệ; `https://…/api/healthz` trả 200.
- [ ] Đăng nhập Đoàn trường, **đổi mật khẩu**, tạo tài khoản quản lý từng khoa.
- [ ] Tạo năm học (mục "Năm học và lĩnh vực") trước khi tạo hoạt động.
- [ ] Tạo sự kiện thử, quét QR bằng điện thoại thật (cả iPhone và Android), xác nhận lấy được GPS.
- [ ] Chạy `backup.sh` một lần và **khôi phục thử** sang CSDL tạm.
- [ ] Đặt lịch sao lưu và kiểm tra có chép ra nơi khác.
- [ ] Đã đặt `PUBLIC_BASE_URL` đúng tên miền thật (in thử một mã QR và đọc lại).

## Đã kiểm chứng

| Hạng mục | Cách kiểm | Kết quả |
|---|---|---|
| Cấu hình nginx | `nginx -t` + chạy thật (bản 1.24) với chứng chỉ tự ký, chuyển `/api` sang backend thật, `curl` các header | Cú pháp đạt; header đủ; `/diem-danh/abc` trả 200 (SPA); `/api/...` tới backend; `/.env` trả 403; `http` chuyển 301 |
| CSP thực tế | Duyệt giao diện quản trị bằng Chromium qua nginx, bắt lỗi CSP | Không còn vi phạm sau khi thêm `font-src data:`. Tìm ra và sửa: `Host $host` làm mất phiên khi tải lại trang ở cổng lạ |
| Sao lưu / khôi phục | Sao lưu DB dev, khôi phục sang DB tạm, so số dòng 7 bảng; thử từ chối ghi đè, xóa bản cũ, tên DB lạ | Khớp; quyền tệp `600`. Tìm ra và sửa: kiểm tra `grep -q` + `pipefail` luôn báo lỗi nhầm |
| Ẩn danh hóa vị trí | Test e2e (5 ca) | Đạt |

## Chưa kiểm chứng

- **Docker**: môi trường phát triển không có Docker, nên `docker compose up` và image production **chưa chạy thử ở đây** (CI có dựng image và quét Trivy). Hãy chạy thử trước khi dùng thật.
- **MySQL 8.4**: kiểm thử cục bộ chạy trên MariaDB 10.11; MySQL 8.4 chỉ được kiểm qua CI. Việc này từng lộ lỗi thật (`last_value` là từ khóa của MySQL 8). Bản sao lưu / khôi phục mới thử trên MariaDB.
- **Chứng chỉ HTTPS thật, Let's Encrypt, HTTP/2 qua Internet**: chỉ thử với chứng chỉ tự ký.
- **Nền bản đồ OpenStreetMap**: môi trường thử không ra Internet nên chưa thấy ảnh nền thật; CSP đã cho phép `tile.openstreetmap.org`.
- **iOS Safari / Android Chrome thật**: mới thử bằng Chromium giả lập điện thoại.
- **Tải thật** (k6) chưa chạy trên máy chủ thật; số đo ở `docs/nhat-ky/giai-doan-5.md` là trên máy dev.
