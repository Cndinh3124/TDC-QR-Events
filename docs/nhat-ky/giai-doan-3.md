# Nhật ký giai đoạn 3 — Điểm danh công khai

Ngày: 01/11/2026. Căn cứ: `dac-ta-he-thong.md` mục 3.3, 3.4, 4, 5, 6, 7, 8.4, 8.5; `chot-backend-hieu-nang.md`; `quy-uoc-code.md`. Phạm vi: **chỉ backend** (giao diện React làm sau).

## Đã làm

**API công khai** (`apps/api/src/public/`, tiền tố `/api/public`, không cần tài khoản):

| Endpoint | Việc |
|---|---|
| `GET /units` | Các khoa đang hoạt động (không có Đoàn trường). Cache 60 giây. |
| `GET /events/by-token/:token` | Thông tin sự kiện cho trang điểm danh, trạng thái (`checkinState`), lượt hiện có của thiết bị, thông tin điền sẵn, biểu thức MSSV. Cấp cookie thiết bị nếu chưa có. `no-store`. |
| `POST /checkin` | Điểm danh vào. 201 khi tạo mới, 200 khi gửi lại cùng `idempotencyKey`. |
| `POST /checkout` | Điểm danh ra (QR ra). Mức Chặt bắt buộc `verifyCode`. |
| `PATCH /attendances/:id` | Sửa thông tin: đúng thiết bị, còn mở, tối đa 3 lần. |
| `GET /me/history` | Lịch sử của các MSSV đang gắn với thiết bị này. |

Thêm một endpoint quản trị nhỏ: `GET /api/admin/events/:id/counters` (số đếm trực tiếp, kiểm quyền bằng `EventsService.access()`; người chỉ-xem đọc được vì chỉ là số tổng).

**Mã thiết bị** (`device.service.ts`). Server cấp 256-bit ngẫu nhiên, cookie `tdc_dev` = `mã.chữ_ký_HMAC` (`httpOnly`, `SameSite=Lax`, 1 năm, `path=/api/public`). DB chỉ lưu `sha256(mã)`. Chữ ký sai / thiếu / sửa thì coi như chưa có cookie. Client giữ bản sao ở localStorage (`deviceToken` trong response `by-token`) và gửi lại qua header `X-Device-Token` khi cookie bị xóa; server vẫn kiểm HMAC rồi đặt lại cookie.

**Luật chặn ngay** (`checkin.service.ts`, `public-lookup.service.ts`, `public.guard.ts`): token sai / đã đổi / sai mục đích (QR ra dùng để vào) → một 404 `QR_INVALID` chung; trạng thái điểm danh tính bằng `checkinState()` (chưa mở, đã đóng, nháp / hủy / lưu trữ → 409 kèm mã riêng); MSSV theo `mssv_regex` trong cấu hình (chuẩn hóa bỏ khoảng trắng + viết hoa); khoa phải là khoa thật đang hoạt động; thiết bị đã có lượt → 409 `DEVICE_ALREADY_CHECKED_IN` kèm lượt cũ; quá tần suất → 429 + `Retry-After`; sai `Origin` → 403.

**Đường ghi** (một giao dịch ngắn): `devices` → `attendances` → `student_devices` → `attendance_jobs` → `event_counters`. `UNIQUE (event_id, device_id)` là chốt cuối chống ghi trùng; bắt lỗi trùng khóa rồi đọc lại lượt cũ nên đường thường không có SELECT trước. Gặp deadlock (1213) hoặc hết thời gian chờ khóa (1205) thì thử lại tối đa 3 lần.

**Idempotency.** `idempotencyKey` (UUID v4 sinh ở máy) lưu kèm lượt (`UNIQUE (event_id, idempotency_key)`); gửi lại cùng khóa trả lại kết quả cũ, không ghi thêm, bộ đếm không tăng. Điểm danh ra và sửa thông tin cũng có khóa riêng.

**Mã 4 số** (`code-guard.service.ts`) dùng `QrService.hashVerifyCode()` và so bằng `timingSafeEqual`. Chặn dò mã bằng hai lớp, đều lưu ở DB:
1. Mỗi lượt điểm danh tối đa **5 lần thử**, rồi khóa 15 phút. Mỗi lần thử "lấy phiếu" bằng một câu `UPDATE` nguyên tử **trước khi** so sánh nên gửi song song cũng không vượt 5 (có test 40 request đồng thời → đúng 5 lần được so sánh).
2. **Trần chung của sự kiện**: 500 lần sai trong 10 phút thì tạm dừng nhận mã. Lớp này cần vì cookie thiết bị tạo miễn phí, kẻ dò đổi thiết bị liên tục.

Chỉ thiết bị **đã có lượt vào** mới được thử mã, nên mỗi lần "đổi thiết bị" để dò thêm tốn một lượt vào hiện ra trong danh sách duyệt.

**Luật gắn cờ chạy nền** (`flag.worker.ts`). Hàng đợi `attendance_jobs` trong DB, thêm cùng giao dịch với lượt điểm danh nên không mất việc. Worker trong tiến trình, mỗi giây lấy tối đa 50 việc bằng `SELECT … FOR UPDATE SKIP LOCKED` (nhiều bản backend không xử lý trùng); "nhận" việc bằng cách đẩy `run_at` ra sau 60 giây, nên worker sập giữa chừng thì việc tự hiện lại; lỗi thì thử lại tối đa 5 lần rồi `FAILED`. Các cờ làm ở giai đoạn này: `GPS_OUTSIDE`, `GPS_LOW_ACCURACY`, `GPS_MISSING`, `NEW_DEVICE`, `DUPLICATE_MSSV`, `MSSV_MULTI_DEVICE`, `DEVICE_MULTI_MSSV`, `NAME_MISMATCH`, `FACULTY_MISMATCH`, `BURST_SAME_FINGERPRINT`. Worker cũng tạo / cập nhật hồ sơ `students`.

**Giới hạn tần suất** (`public.guard.ts`, `public-context.service.ts`, `rate-limit.service.ts`): theo thiết bị 10 lần/phút (điểm danh vào / ra), 5 lần/giờ (sửa thông tin); request không có cookie hợp lệ bị giới hạn theo IP riêng (120/phút); trần IP chống DDoS 20.000/phút. Đọc trang không bị giới hạn theo thiết bị.

**Bảng đếm** `event_counters`: chia 8 dòng con (slot ngẫu nhiên) mỗi sự kiện để nhiều lượt ghi cùng lúc không tranh một khóa dòng; đọc bằng `SUM`.

## Cơ sở dữ liệu và cấu hình

Migration `1793600000000-add-attendance.ts` (viết tay, tên khóa ngoại và chỉ mục khớp tên TypeORM nên `migration:generate` không sinh diff thừa — đã kiểm bằng `createSchemaBuilder().log()`, kết quả rỗng; đã thử `down` rồi `up`): `devices`, `students`, `student_devices`, `attendances` (đủ cột theo mục 6, gồm cột duyệt / hủy cho giai đoạn 4), `attendance_flags`, `attendance_edits`, `attendance_jobs`, `event_counters`, `event_code_failures`; 5 ràng buộc CHECK viết tay; khóa ngoại `attendances.event_id` / `faculty_unit_id` / `device_id` là **RESTRICT** (xóa sự kiện đã có lượt trả 409 `EVENT_IN_USE`, xóa khoa đã có sinh viên trả 409 `UNIT_IN_USE`, đã có test). Thêm cấu hình `device_mssv_window_days` (180).

Biến môi trường mới: **`DEVICE_SECRET`** (bắt buộc, ≥ 32 ký tự, khác `JWT_ACCESS_SECRET`); tùy chọn `PUBLIC_DEVICE_RATE_LIMIT_PER_MIN`, `PUBLIC_EDIT_RATE_LIMIT_PER_HOUR`, `PUBLIC_IP_RATE_LIMIT_PER_MIN`, `PUBLIC_NO_COOKIE_RATE_LIMIT_PER_MIN`, `FLAG_WORKER_ENABLED`. **Ứng dụng không khởi động nếu thiếu `DEVICE_SECRET`**: mọi môi trường (`.env`, compose, CI) phải thêm biến này. File `.env` ở máy dev đã được thêm một giá trị sinh ngẫu nhiên.

## Quyết định và lý do

- **Giới hạn chung 3.000 lượt/phút/IP không áp cho `/api/public`** (`@SkipThrottle()`). Cả hội trường dùng chung một IP wifi; đỉnh 100 lượt/giây sẽ vượt 3.000/phút và chặn chính sinh viên. Thay bằng trần IP riêng (mặc định 20.000/phút) và giới hạn theo thiết bị; chống DDoS thật nằm ở nginx/ALB. Trần IP và kiểm tra `Origin` nằm ở **guard** (chạy trước pipe validate) để request body sai cũng bị tính — test phát hiện ra lỗi này khi viết.
- **Không trả tọa độ / bán kính sự kiện ra API công khai**, chỉ `requiresGps`. Khoảng cách tính ở server. Nếu trả ra, người nhận ảnh QR từ xa giả GPS khớp được. Giao diện mục 10 ("bản đồ nhỏ") chỉ nên hiện vị trí của chính sinh viên.
- **Mã 4 số bắt buộc ở điểm danh ra, không ở điểm danh vào** (đặc tả 5.2 chỉ ghi "đọc tại chỗ", không nói bước nào). Đổi sang điểm danh vào là sửa một chỗ trong `checkin()`.
- **Cờ chỉ thêm, không tự xóa.** Sửa thông tin có thể thêm cờ mới nhưng không gỡ cờ cũ; người duyệt (giai đoạn 4) quyết định bỏ qua. Cách này tránh việc "sửa MSSV xong là mất dấu vết", và `NEW_DEVICE` chỉ biết lúc ghi nên không thể tính lại.
- **`NEW_DEVICE` = POST không kèm cookie / mã thiết bị hợp lệ.** Tab ẩn danh vẫn nhận cookie ở bước `GET by-token`, nên không bị bắt ở cờ này mà rơi vào `MSSV_MULTI_DEVICE` / `DEVICE_MULTI_MSSV`.
- **`DEVICE_MULTI_MSSV`** tính trong 180 ngày (cấu hình `device_mssv_window_days`) thay cho "học kỳ" vì chưa có lịch học kỳ; MSSV lệch ≤ 2 ký tự so với MSSV đã gắn coi là gõ nhầm, không gắn cờ. Mốc "trước đó" của `MSSV_MULTI_DEVICE` lấy theo thời điểm gắn cặp MSSV/thiết bị nên kết quả không phụ thuộc thứ tự worker chạy.
- **`NAME_MISMATCH` / `FACULTY_MISMATCH`** so với lượt gần nhất trước đó của cùng MSSV (đọc từ `attendances`, không từ `students`), nên tính lại cho kết quả như cũ.
- **Lịch sử `/me/history`** trả lượt của các MSSV hiện đang gắn với thiết bị, kể cả lượt do thiết bị khác điểm danh (để người bị điểm danh hộ tự phát hiện, mục 5.4), nhưng chỉ gồm tên sự kiện + giờ; **mã xác nhận chỉ của lượt từ chính thiết bị này**. Đánh đổi: ai cũng gắn được một MSSV vào thiết bị bằng một lần điểm danh, nên biết MSSV là xem được lịch sử *tham gia* của MSSV đó (không có họ tên, IP, mã xác nhận).
- **Khiếu nại (`POST /appeals`) để giai đoạn 4**, cùng màn xử lý khiếu nại.
- **Không có kịch bản tải** theo yêu cầu của bạn; chỉ có test đồng thời (xem dưới). Mục tiêu 2.000 lượt / 5 phút, p95 < 500 ms **chưa được đo**.

## Kiểm thử

**140 test mới, tổng 323 test e2e đạt trên MySQL 8.4** (lint, typecheck, build đạt). Test mới nằm ở `public-checkin`, `public-checkout`, `public-edit`, `public-flags`, `public-ratelimit` và 1 ca về `DEVICE_SECRET` trong `auth.e2e-spec.ts`. Ba chỗ test cũ phải sửa: các test dựng biến môi trường riêng cần thêm `DEVICE_SECRET`, và test migration `event-faculty-view-mode` phải lùi qua migration điểm danh trước. Tập trung ca bị từ chối:

- **Luật chặn:** QR sai / đã đổi / QR ra dùng để vào; 6 trạng thái sự kiện; 11 kiểu MSSV sai (kể cả chèn SQL, xuống dòng); 19 kiểu dữ liệu xấu (ký tự điều khiển / vô hình, trường lạ, GPS lệch cặp…); khoa không hợp lệ; body hỏng / quá lớn.
- **Tranh chấp:** 25 request cùng lúc từ một thiết bị → đúng 1 lượt; cùng khóa → mọi request nhận cùng kết quả; 60 thiết bị cùng lúc → 60 lượt, bộ đếm đúng; 20 lần ra đồng thời → 1; 6 lần sửa đồng thời → đúng 3; 40 lần thử mã song song → đúng 5 lần được so sánh.
- **Mã thiết bị:** 6 kiểu cookie giả (sửa chữ ký, bỏ chữ ký, mã khác…) đều thành thiết bị mới, không "lấy" được thiết bị của người khác; header khôi phục; CSRF qua `Origin`.
- **Mã 4 số:** khóa sau 5 lần sai (kể cả khi lần 6 đúng), hết khóa đếm lại từ đầu, đổi thiết bị không dò thêm được, trần sự kiện, HMAC gắn id sự kiện, mã không nằm rõ trong DB.
- **Sửa / lịch sử:** thiết bị khác / không cookie / id lạ cùng nhận một 404; sửa sau khi đóng; không đổi gì thì không tốn lượt; lịch sử không lộ mã xác nhận hay họ tên người khác.
- **Worker:** từng cờ (có và không có), thử lại khi lỗi, `FAILED` sau 5 lần, log lỗi không chứa MSSV, 3 worker chạy cùng lúc mỗi việc đúng một lần, worker tự chạy nền.
- **Giới hạn tần suất:** theo thiết bị, không cookie, sửa thông tin, trần IP (kể cả body sai), giới hạn chung không áp cho `/api/public` nhưng vẫn áp cho API quản trị.
- **Quyền của `counters`:** 401, khoa khác 404, sự kiện cấp trường chưa chia sẻ 404, đã chia sẻ 200.

**Đã cố ý làm hỏng 18 chỗ để chắc test bắt được**, mỗi lần đúng test liên quan thất bại rồi khôi phục: bỏ kiểm tra trạng thái điểm danh, bỏ phiếu thử mã 4 số, cho sửa lượt của thiết bị khác, bỏ giới hạn 3 lần sửa, bỏ kiểm tra `Origin`, bỏ kiểm tra chữ ký cookie, lộ tọa độ ra API công khai, bỏ kiểm tra khoa hợp lệ, bỏ trần IP, lịch sử lộ mã xác nhận của người khác, `DUPLICATE_MSSV` chỉ gắn lượt mới, mã 4 số sai vẫn qua, giữ giới hạn chung 3.000/phút cho API công khai, bỏ trần chung của sự kiện, sửa thông tin đổi giờ vào, idempotency tính 201 mỗi lần gửi lại, bộ đếm ra không tăng, `NEW_DEVICE` không bao giờ gắn. Riêng chặn "sửa lượt của thiết bị khác" có kiểm tra ở hai lớp (trước và trong giao dịch) nên phải phá cả hai mới thấy test thất bại.

## Cách chạy và kiểm tra

```bash
docker run -d --rm --name tdc-test-db -e MYSQL_RANDOM_ROOT_PASSWORD=yes -e MYSQL_DATABASE=tdc_qr_test \
  -e MYSQL_USER=tdc_app -e MYSQL_PASSWORD=dev_only_pw_123 -p 3307:3306 mysql:8.4
TEST_DB_PORT=3307 npm test
npm run build && npm run -w apps/api migration:run     # áp dụng migration mới
```

Thêm `DEVICE_SECRET` vào `.env` (xem `.env.example`) trước khi chạy.

Chạy local không qua docker: `npm run -w apps/api start:dev` (cần `apps/api/.env` và một MySQL truy cập được từ máy). Script `start:dev` đã đổi từ `tsx watch` sang `apps/api/scripts/dev.mjs` (`tsc --watch` + `node --watch`) vì `tsx` (esbuild) không sinh metadata decorator nên NestJS không khởi động được (`JwtAuthGuard` không tiêm được `Reflector`).

## Chưa kiểm chứng được

- **Hiệu năng** (2.000 lượt / 5 phút, p95 < 500 ms, đỉnh 100 lượt/giây): chưa đo; chỉ có test đồng thời cho tính đúng. Mối lo chính khi đo là điểm nghẽn ở `devices`/`event_counters` (đã chia 8 dòng con) và pool 20 kết nối.
- Chưa in QR và quét bằng điện thoại thật; chưa có giao diện nên **chưa thử luồng thật trên trình duyệt** (cookie `SameSite=Lax` + `Secure` qua HTTPS, localStorage, mạng yếu).
- Chưa chạy `docker compose` và workflow CI. CI không cần thêm `DEVICE_SECRET` vì `test/setup-env.ts` tự đặt cho test; compose và production thì cần (compose đọc từ `.env`).
- Chưa kiểm tra với **hai bản backend thật** sau nginx: giới hạn tần suất theo thiết bị nằm trong bộ nhớ từng bản (thực tế tối đa gấp đôi); giới hạn nhập sai mã 4 số nằm ở DB nên chính xác.

## Việc còn lại / cho giai đoạn sau

1. **Giai đoạn 4:** duyệt, `NO_CHECKOUT` (tính khi đóng sự kiện), `MANUAL_ENTRY`, khiếu nại (`POST /appeals`), thêm / sửa / hủy lượt thủ công, gộp sinh viên, xem sinh viên khoa mình trong sự kiện cấp trường (dùng lại `EventsService.access()`; nhớ test "khoa A không thấy sinh viên khoa B").
2. **Dọn dữ liệu cũ:** `attendance_jobs` đã `DONE` chỉ tăng, chưa có việc dọn; IP / user-agent / GPS / fingerprint chưa có việc ẩn danh sau thời hạn lưu (mục 8.7, chờ chốt thời hạn).
3. **Trần chung nhập sai mã 4 số** chỉ chặn tạm 10 phút; kẻ có nhiều lượt vào (mỗi lượt = một thiết bị) vẫn dò được rất chậm. Phần bù là mỗi lượt vào hiện ra trong danh sách duyệt. Nếu cần chặt hơn: trần tổng theo cả sự kiện (không theo cửa sổ) hoặc cờ cảnh báo cho người duyệt khi trần bị chạm.
4. **Cảnh báo cho ban tổ chức** khi `CODE_ENTRY_PAUSED` (hiện chỉ sinh viên thấy thông báo).
5. Giao diện React trang điểm danh (< 200 KB JS, tự gửi lại với cùng `idempotencyKey` khi mất mạng, khóa nút khi đang gửi).
