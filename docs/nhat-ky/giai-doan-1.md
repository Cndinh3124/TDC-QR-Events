# Nhật ký giai đoạn 1 — Nền tảng

Ngày: 01/11/2026. Căn cứ: `dac-ta-he-thong.md` mục 2, 3.7, 6, 7, 8, 9, 12; `quy-uoc-code.md`.

## Đã làm

**Khung dự án.** Monorepo npm (`apps/api`), NestJS 11, TypeORM 0.3, MySQL. Cấu hình đọc từ biến môi trường và **không khởi động** nếu thiếu hoặc bí mật yếu (`config/env.ts`).

**Cơ sở dữ liệu.** Một migration (`1793495899423-init-schema.ts`) sinh từ entity, bổ sung nạp sẵn: Đoàn trường, 9 khoa (gắn vào Đoàn trường qua `parent_id`) và 5 cấu hình mặc định. Có khóa ngoại: xóa đơn vị đang có tài khoản/đơn vị con bị chặn, xóa tài khoản thì xóa luôn refresh token.

**Xác thực** (`auth/`). argon2id; access token 15 phút; refresh token ngẫu nhiên 256-bit, chỉ lưu hash, xoay vòng mỗi lần dùng; dùng lại token đã thu hồi thì thu hồi toàn bộ phiên của tài khoản. Sai 5 lần khóa 15 phút. Mọi thất bại đăng nhập (sai mật khẩu, không có tài khoản, đang bị khóa) trả **cùng một thông báo**. Tài khoản mới hoặc vừa đặt lại mật khẩu bị buộc đổi mật khẩu trước khi dùng API khác.

**Phân quyền.** Guard toàn cục: API mặc định phải đăng nhập, endpoint công khai đánh dấu `@Public()`. Guard đọc lại tài khoản từ DB mỗi request nên khóa/đổi quyền có hiệu lực ngay, không đợi token hết hạn. Phạm vi đơn vị kiểm tra ở service (`UnitScopeService`); truy cập đơn vị ngoài phạm vi trả 404 để không lộ sự tồn tại.

**Quản trị** (`/api/admin/...`): `units` (thêm/sửa/ngừng hoạt động/kích hoạt/xóa), `users` (thêm/sửa/khóa/mở khóa/đặt lại mật khẩu/xóa), `settings`, `audit-logs`. Thao tác ảnh hưởng nhiều dữ liệu bắt buộc có lý do. Mọi thao tác ghi nhật ký trước/sau, không chứa mật khẩu hay token.

**Vận hành.** `/api/healthz`, header bảo mật (CSP `default-src 'none'`), giới hạn body 100 KB, giới hạn đăng nhập 5 lần/phút/IP, lệnh `create-admin`, Dockerfile (user `node`, pin phiên bản), `docker-compose.yml`, CI (lint, typecheck, test trên MySQL 8.4, build, `npm audit`, gitleaks, Trivy), Dependabot.

## Quyết định và lý do

- **Cây đơn vị ngay từ đầu.** Bảng `units` có `parent_id`, quản lý khoa thấy đơn vị mình và cấp dưới. Khớp với module Quản lý hoạt động (đang đề xuất) mà không phải đổi bảng sau.
- **Không có `deleted_at` ở `units` và `admin_users`.** Đặc tả 3.7 quy định "xóa cứng khi chưa có dữ liệu, ngược lại khóa / ngừng hoạt động", nên `is_active` đã đủ.
- **Xóa tài khoản chỉ khi chưa có dòng nhật ký nào của chính tài khoản đó** (kể cả đăng nhập). Đã đăng nhập một lần là chỉ khóa được.
- **`must_change_password`** là cột thêm so với đặc tả: người được cấp mật khẩu ban đầu phải đổi ở lần đầu.
- **Chưa làm giới hạn "10 lần/giờ/tài khoản"** của mục 8.4: khóa tài khoản sau 5 lần sai đã chặn dò mật khẩu theo từng tài khoản.
- **Ép `multer` lên 2.5.0** bằng `overrides` ở `package.json` gốc, vì `@nestjs/platform-express` 11.2.8 kéo bản 2.4.0 có lỗ hổng mức cao (ứng dụng không dùng upload file). Gỡ khi NestJS cập nhật.

## Kiểm thử

48 test e2e trên DB thật, tập trung trường hợp **bị từ chối**: token giả / `alg none` / tài khoản bị khóa, tái sử dụng refresh token, CSRF theo Origin, khóa sau 5 lần sai, quản lý khoa truy cập khoa khác, mật khẩu yếu, ReDoS trong biểu thức MSSV, tranh chấp khóa nhau giữa hai quản trị, body quá lớn, JSON hỏng, rò rỉ `password_hash` vào response/nhật ký. Đã thử cố ý làm hỏng kiểm tra phạm vi đơn vị để xác nhận test bắt được.

## Chưa kiểm chứng được

- Test chạy trên **MariaDB 10.11**, chưa chạy trên MySQL 8.4 (môi trường dựng không có). Job `test` trong CI dùng MySQL 8.4 sẽ là lần chạy đầu tiên; câu lệnh trong migration là SQL chuẩn nên khả năng khác biệt thấp.
- **Dockerfile, compose và workflow CI chưa chạy** (không có Docker daemon, chưa có repo GitHub). Đã mô phỏng đường chạy của image: `npm ci --omit=dev` rồi `node dist/main.js`, gọi `/healthz` và đăng nhập thành công.
- Action `checkout`, `setup-node` đã ghim SHA; gitleaks và Trivy chạy bằng image ghim số phiên bản, **chưa ghim digest**.

## Việc còn lại cho phần này

1. **User DB quyền tối thiểu.** Hiện migration và ứng dụng dùng chung một user. Production nên tách: user migration có DDL, user ứng dụng chỉ `SELECT/INSERT/UPDATE/DELETE` (giai đoạn 6).
2. Xác thực 2 lớp TOTP cho Đoàn trường (đặc tả đang ghi "khuyến nghị").
3. `GET /api/public/units` (danh sách khoa cho form điểm danh) làm ở giai đoạn 3.
4. Khi thêm bảng có khóa ngoại tới `units` (sự kiện, sinh viên) thì logic xóa đơn vị đã tự chặn bằng lỗi khóa ngoại; cần thêm test cho từng bảng.
5. Bắt buộc `TRUST_PROXY=true` khi chạy sau nginx/ALB, nếu không giới hạn đăng nhập theo IP sẽ gom mọi người vào một IP.
