# TDC-QR-Events

Điểm danh sự kiện bằng QR, quản lý hoạt động và điểm rèn luyện — Đoàn Thanh niên & Hội Sinh viên trường Cao đẳng Công nghệ Thủ Đức.

Đặc tả đầy đủ nằm trong project **QRCode-GPS** (`dac-ta-he-thong.md`, `quy-uoc-code.md`, `chot-backend-hieu-nang.md`, `chot-giao-dien.md`).

## Tiến độ

| Giai đoạn | Trạng thái |
|---|---|
| 1. Nền tảng (auth, đơn vị, tài khoản, cấu hình, nhật ký, Docker, CI) | **Xong** — xem `docs/nhat-ky/giai-doan-1.md` |
| 2. Sự kiện & QR (thêm / sửa / nhân bản / hủy / lưu trữ / xóa, mở / đóng điểm danh, QR vào / ra, xuất PNG / PDF, mã 4 số mức Chặt) | **Xong** — xem `docs/nhat-ky/giai-doan-2.md` |
| 3. Điểm danh công khai (mã thiết bị, `/api/public`: xem sự kiện theo QR, điểm danh vào / ra, sửa thông tin, lịch sử; luật chặn ngay, gắn cờ chạy nền, idempotency, giới hạn tần suất) — **chỉ backend** | **Xong** — xem `docs/nhat-ky/giai-doan-3.md` (chưa đo hiệu năng) |
| 4. Duyệt & ĐRL (danh sách / duyệt / hàng loạt, thêm - sửa - hủy lượt, chốt và cộng ĐRL, mở khóa, khiếu nại 7 ngày, hồ sơ và gộp sinh viên, báo cáo ĐRL + Excel) | **Xong** — xem `docs/nhat-ky/giai-doan-4.md` (cần chạy migration mới) |
| 5. Dashboard & hoàn thiện (tổng quan + nhắc việc, màn tài khoản / đơn vị / cấu hình / nhật ký, kiểm thử tải k6, test quét phân quyền mọi route) | **Xong** — xem `docs/nhat-ky/giai-doan-5.md` (số đo tải mới chạy trên máy dev) |
| 6. Triển khai | Chưa làm |

Giao diện React (`apps/web`, Vite) mới có bản đầu: đăng nhập, đổi mật khẩu, danh sách / tạo sự kiện, chi tiết sự kiện (công bố, mở / đóng điểm danh, số đếm trực tiếp, mã QR). Trang điểm danh cho sinh viên ở `/diem-danh/:token` (form, xác nhận, GPS, vé, sửa thông tin, điểm danh ra). Màn quản trị: duyệt điểm danh, khiếu nại, hồ sơ sinh viên, báo cáo ĐRL. Có tổng quan (nhắc việc), và các màn chỉ Đoàn trường: tài khoản, đơn vị, cấu hình, nhật ký. Thử bằng điện thoại cần https (GPS): chạy tunnel tới cổng 5173 rồi đặt `PUBLIC_BASE_URL` là địa chỉ tunnel. Chạy: bật API rồi `npm run -w apps/web dev` → http://localhost:5173 (Vite chuyển `/api` sang `127.0.0.1:3000`). Bản thiết kế tham chiếu nằm trong canvas "Giao diện TDC-QR-Events".

## Chạy ở máy dev

Cần Node 22 và MySQL 8.4 (hoặc MariaDB 10.11 để thử).

```bash
npm install
cp .env.example apps/api/.env      # điền DB_PASSWORD, JWT_ACCESS_SECRET và DEVICE_SECRET (mỗi khóa: openssl rand -base64 48, hai khóa phải khác nhau)
                                   # PUBLIC_BASE_URL = gốc URL trang điểm danh, được in vào mã QR (production bắt buộc, https)
npm run build
npm run -w apps/api migration:run  # tạo bảng + nạp Đoàn trường, 9 khoa, cấu hình mặc định
npm run -w apps/api create-admin -- --email ten@tdc.edu.vn --name "Họ tên"
npm run -w apps/api start:dev      # http://localhost:3000/api/healthz
```

Hoặc dùng Docker: `cp .env.example .env`, điền giá trị, rồi `docker compose up --build`.

## Kiểm tra

```bash
npm run lint
npm run -w apps/api typecheck
npm test        # cần MySQL (nếu dùng container 3307: TEST_DB_PORT=3307 npm test), dùng DB riêng tdc_qr_test (biến TEST_DB_*, xem apps/api/test/setup-env.ts)
```
Test e2e chạy thật trên DB: mỗi test xóa sạch và chạy lại migration, nên **không trỏ vào DB có dữ liệu thật**.

## Cấu trúc

```
apps/api/src
  auth/      đăng nhập, refresh xoay vòng, đổi mật khẩu
  users/     tài khoản quản trị
  units/     Đoàn trường + khoa
  events/    sự kiện, vòng đời, token QR, xuất PNG / PDF, mã 4 số
  attendances/ duyệt lượt, chốt sự kiện, cộng ĐRL
  appeals/   xử lý khiếu nại   students/ hồ sơ + gộp MSSV   reports/ báo cáo ĐRL + Excel
  public/    điểm danh công khai: mã thiết bị, điểm danh vào / ra, sửa, lịch sử, worker gắn cờ
  dashboard/ tổng quan + nhắc việc
  settings/  cấu hình hệ thống (mssv_regex, appeal_days, …)
  audit/     nhật ký (chỉ đọc)
  common/    guard toàn cục, kiểm tra phạm vi đơn vị, lỗi, phân trang
  database/  data source + migration
  cli/       create-admin
```

Kiểm thử tải điểm danh (k6): xem `loadtest/README.md`.
