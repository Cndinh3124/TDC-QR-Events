# Nhật ký giai đoạn 2 — Sự kiện & QR

Ngày: 01/11/2026. Căn cứ: `dac-ta-he-thong.md` mục 3.1, 3.2, 3.7, 5.2, 6, 7, 8.3, 12; `quy-uoc-code.md`.

## Đã làm

**Sự kiện** (`apps/api/src/events/`, API `/api/admin/events`). Thêm, sửa một phần, nhân bản, công bố, mở / đóng điểm danh, trả về chế độ tự động, hủy, lưu trữ / khôi phục, xóa cứng. Cả hai vai trò dùng được, phạm vi theo cây đơn vị (`UnitScopeService`); ngoài phạm vi trả **404**. Danh sách có bộ lọc Đang hoạt động / Đã hủy / Lưu trữ, đơn vị, trạng thái, khoảng ngày, tìm theo tên.

**Chia sẻ sự kiện cấp trường cho các khoa xem** (bổ sung ngày 01/11/2026 theo yêu cầu: quản lý khoa xem được sự kiện cấp trường *khi được cho phép*, vì có sự kiện không cho tất cả khoa tham gia). Mỗi sự kiện cấp trường có chế độ `faculty_view_mode`, chỉ Đoàn trường đặt được bằng `POST /events/:id/faculty-view` (`mode`, `unitIds`, `reason`):

| `mode` | Ai thấy (chỉ đọc) |
|---|---|
| `NONE` (mặc định) | Chỉ đơn vị tổ chức (Đoàn trường) |
| `ALL` | Quản lý của **mọi** khoa |
| `SELECTED` | Quản lý của **các khoa trong `unitIds`** (bảng `event_faculty_views`, mỗi dòng một khoa, tối đa 50). Khoa cấp dưới (lớp) được chọn thì quản lý khoa cha cũng thấy |

Người được xem thấy sự kiện trong danh sách và chi tiết ở chế độ **chỉ đọc** (`canManage = false` trong response để giao diện ẩn nút sửa). Bản nhân bản **không** kế thừa chế độ hay danh sách khoa.

**Mã QR.** Mỗi sự kiện có token QR vào; thêm token QR ra khi bật điểm danh ra. Token 128-bit ngẫu nhiên (22 ký tự base64url), nội dung QR chỉ là `PUBLIC_BASE_URL/diem-danh/<token>`. "Tạo mã mới" tắt mã cũ ngay, giữ lại dòng cũ để truy vết. Xuất **PNG** (`qr.png`) và **PDF A4** (`qr.pdf`) có tiêu đề, giờ, địa điểm, hướng dẫn 3 bước, logo (nếu có). Chế độ trình chiếu toàn màn hình là việc của giao diện React; API cho nó dữ liệu ở `GET /:id/qr`.

**Mức kiểm soát Chặt.** Bắt buộc điểm danh ra + mã 4 số. DRL ≥ 5 mặc định Chặt (người tạo chọn lại được). Mã 4 số chỉ trả **một lần** (lúc tạo / đổi), DB lưu HMAC theo từng sự kiện.

**Cơ sở dữ liệu.** Migration `1793500640024-add-events.ts` (+ `1793501916085-add-event-faculty-view.ts` thêm cờ bật / tắt, sau đó `1793502499621-event-faculty-view-mode.ts` đổi thành chế độ `faculty_view_mode` và thêm bảng `event_faculty_views`): bảng `events`, `event_qr_tokens`, khóa ngoại tới `units` (RESTRICT) và `events` (CASCADE), 3 ràng buộc CHECK viết tay (TypeORM không sinh CHECK cho MySQL): DRL 1–10 hoặc không cộng, thứ tự giờ, tọa độ + bán kính đi đủ bộ.

**Cấu hình mới.** `PUBLIC_BASE_URL` (production bắt buộc và phải `https`, không thì không khởi động), `BRAND_DIR` (tùy chọn, thư mục chứa `logo-doan.png`, `logo-hoi.png`, `logo-tdc.png`).

## Các endpoint

| Nhóm | Endpoint |
|---|---|
| Đọc | `GET /events`, `GET /events/:id` |
| Sửa | `POST /events`, `PATCH /events/:id`, `POST /events/:id/duplicate` |
| Vòng đời | `POST /events/:id/publish · open · close · auto` (không cần lý do); `cancel · archive · restore` và `DELETE /events/:id` (**bắt buộc `reason`**) |
| Chia sẻ cho khoa xem | `POST /events/:id/faculty-view` — body `{ mode: NONE\|ALL\|SELECTED, unitIds?, reason }` (chỉ Đoàn trường, **bắt buộc `reason`**) |
| QR | `GET /events/:id/qr`, `POST /events/:id/qr/rotate`, `POST /events/:id/verify-code/rotate`, `GET /events/:id/qr.png`, `GET /events/:id/qr.pdf` (`?purpose=CHECKIN\|CHECKOUT`) |

## Quyết định và lý do

- **Trạng thái điểm danh tính theo thời điểm, không có tiến trình nền.** Trạng thái lưu: `DRAFT → PUBLISHED → CHECKIN_OPEN / CHECKIN_CLOSED`. `PUBLISHED` nghĩa là *tự động theo khung giờ*; bấm tay mở / đóng đặt `CHECKIN_OPEN` / `CHECKIN_CLOSED` và luôn thắng giờ tự động (đặc tả 3.1). Hàm `checkinState(event, now)` ở `event-rules.ts` trả `NOT_AVAILABLE | NOT_YET | OPEN | CLOSED`; **giai đoạn 3 phải dùng đúng hàm này** để chặn / cho điểm danh, và response sự kiện có sẵn trường `checkinState`. Cách này không lệch trạng thái khi máy chủ khởi động lại, không cần cron.
- **Không có cột `manual_override` và `deleted_at`** (khác đặc tả mục 6): `manual_override` trùng với `status` ở trên; ẩn sự kiện đã có `archived_at`, xóa cứng chặn bằng khóa ngoại, giống cách đã làm với `units` / `admin_users`.
- **Thêm `POST /events/:id/auto`** (không có trong đặc tả): bỏ bấm tay, quay về chạy theo giờ. Không có nó thì một lần bấm "Đóng" sẽ khóa sự kiện ở trạng thái đóng mãi.
- **Khóa dòng khi đổi trạng thái** (`SELECT … FOR UPDATE`): hai lần "Mở" cùng lúc chỉ một lần thành công; "Hủy" và "Đóng" chạy chồng không để lại QR còn hiệu lực trên sự kiện đã hủy. Có test.
- **Sửa sau khi đã mở điểm danh (đặc tả 3.7):** "đã mở" = đã bấm mở / đóng, hoặc đã công bố và đến giờ mở. Từ lúc đó sửa giờ, tọa độ, bán kính, DRL **và** ân hạn, mức kiểm soát, điểm danh ra phải có `reason`; tên, mô tả, địa điểm thì không. Chỉ tính khi giá trị thật sự đổi.
- **DB chỉ lưu HMAC của mã 4 số** (khóa = `JWT_ACCESS_SECRET`, gắn id sự kiện). Mã 4 số chỉ có 10.000 khả năng nên hash không chống được dò ngoại tuyến; HMAC chỉ để lộ DB riêng lẻ không đủ lộ mã. Chống dò thật là **giới hạn tần suất khi xác nhận mã ở giai đoạn 3**.
- **Token QR lưu rõ trong DB** (cần vẽ lại QR); không bao giờ đi vào nhật ký, log, tên tệp. Các response chứa token / mã 4 số có `Cache-Control: no-store`.
- **Tên tệp PDF cố định** (`qr-checkin.pdf`): tiêu đề sự kiện là chuỗi người dùng nhập, không đưa vào header.
- **Giờ phải là ISO 8601 có múi giờ** (`2026-12-05T08:00:00+07:00`); chuỗi không múi giờ hoặc chỉ có ngày bị từ chối để khỏi lệch giờ giữa người dùng và máy chủ.
- **PDF dùng font DejaVu Sans** (gói npm `dejavu-fonts-ttf`, đóng trong image) vì cần đủ dấu tiếng Việt; chưa phải Open Sans như `chot-giao-dien.md`. QR vẽ vector trong PDF.
- **Quyền xem chia sẻ là chỉ-đọc tuyệt đối.** Người chỉ được xem đọc được danh sách và chi tiết; mọi thao tác sửa, vòng đời và **mã QR / PNG / PDF / mã 4 số** đều trả **403** (`READ_ONLY_EVENT`). Dùng 403 thay vì 404 vì họ đã thấy sự kiện đó nên giấu sự tồn tại không còn ý nghĩa; khoa **không** được xem thì vẫn nhận 404 ở mọi thao tác. Response chi tiết không chứa token hay mã 4 số. Lý do không cho khoa xem QR: QR là bí mật của đơn vị tổ chức, ai cầm được là điểm danh được.
- **Cấp quyền xem là việc riêng của Đoàn trường**: endpoint `faculty-view` chặn bằng vai trò, nên quản lý khoa nhận 403 với **mọi** id (kể cả id không tồn tại), không lộ gì.
- **Danh sách khoa được chọn chỉ gửi cho đơn vị tổ chức** (`facultyViewUnitIds`); người chỉ-xem nhận `null`, không biết khoa nào khác cũng được xem.
- **Chế độ chỉ có nghĩa khi đơn vị tổ chức là Đoàn trường.** Bật `ALL` / `SELECTED` cho sự kiện của khoa bị từ chối (400 `NOT_SCHOOL_EVENT`), và lớp truy cập còn kiểm tra lại loại đơn vị, nên nếu dữ liệu bị ghi nhầm thẳng vào DB cho sự kiện của một khoa thì khoa khác vẫn không thấy (có test).
- **Dòng chia sẻ luôn khớp chế độ:** đổi sang `NONE` / `ALL` xóa hết dòng trong `event_faculty_views`; đổi danh sách thay cả tập trong một giao dịch có khóa dòng. Chỉ chọn được khoa thật (loại `FACULTY`, không phải Đoàn trường). Khoa đang được chọn thì **không xóa cứng được** (khóa ngoại RESTRICT, trả 409 `UNIT_IN_USE`), chỉ ngừng hoạt động.
- **Migration `event-faculty-view-mode` viết tay** (bản TypeORM sinh tự xóa rồi thêm lại cột nên mất dữ liệu): cờ cũ `faculty_view_enabled = 1` được chuyển thành `ALL`. Hạ cấp (`down`) chuyển `ALL` về bật; `SELECTED` về **tắt** (không tự mở rộng quyền xem khi mất danh sách khoa). Có test kiểm tra cả hai chiều.
- **Khoa chỉ thấy theo phạm vi của chính mình:** quản lý khoa cha thấy sự kiện được chia sẻ cho khoa cấp dưới của mình, nhưng quản lý khoa cấp dưới **không** thấy sự kiện chỉ chia sẻ cho khoa cha (phạm vi chỉ đi xuống, như mọi chỗ khác). Hiện v1 chỉ có 2 cấp nên chưa ảnh hưởng.
- **Dời `escapeLike` và `ReasonDto` sang `common/`** để hai module dùng chung (không đổi hành vi).

## Kiểm thử

**135 test mới, tổng 183 test e2e đạt trên MySQL 8.4** (giai đoạn 1 chưa chạy được trên MySQL 8.4, nay đã chạy). Tập trung các ca bị từ chối:

- phạm vi: quản lý khoa khác bị 404 trên **16 endpoint**, dữ liệu không đổi; danh sách và bộ lọc `unitId` không lộ gì;
- validate: 33 ca tạo sai, 13 ca sửa sai (DRL, giờ, múi giờ, tọa độ, trường lạ, `null`…); tài khoản bị buộc đổi mật khẩu bị chặn;
- vòng đời: sai trạng thái trả 409, thiếu lý do trả 400, thao tác đồng thời;
- QR: token đổi thì mã cũ hết hiệu lực, 5 lần đổi cùng lúc vẫn chỉ còn một mã hoạt động, token / mã 4 số không có trong nhật ký, PNG **giải mã bằng thư viện độc lập (`jsqr`)** ra đúng URL;
- chia sẻ cho khoa xem (22 test): mặc định không thấy; `ALL` và `SELECTED` thấy ở chế độ chỉ đọc; **16 thao tác sửa / QR / cấp quyền đều bị 403** với người chỉ-xem và **404** với khoa không được chọn, dữ liệu không đổi; người chỉ-xem không thấy token, mã 4 số hay khoa khác được chọn; đổi danh sách / chế độ không để sót dòng cũ; 17 ca dữ liệu xấu (khoa không tồn tại, Đoàn trường, trùng, quá 50, trường cũ `enabled`…); khoa không tự cấp quyền; dữ liệu ghi nhầm thẳng DB không lộ; 5 lần đổi cùng lúc vẫn nhất quán; xóa khoa đang được chọn (409); migration chuyển dữ liệu hai chiều;
- DB: 13 ca chèn thẳng bỏ qua service đều bị CHECK chặn, khóa ngoại chặn xóa đơn vị đang có sự kiện.

**Đã cố ý làm hỏng 10 chỗ để chắc test bắt được** (bỏ kiểm tra phạm vi, bỏ yêu cầu lý do, không tắt mã QR cũ, bỏ kiểm tra DRL ở service, cho người chỉ-xem được sửa, bỏ ràng buộc "phải là sự kiện cấp trường", chế độ chọn khoa mà ai cũng xem được, danh sách lộ sự kiện của khoa không được chọn, đổi chế độ không xóa danh sách cũ, bỏ kiểm tra khoa hợp lệ); cả 4 đều làm đúng test liên quan thất bại, rồi đã khôi phục.

## Cách chạy và kiểm tra

```bash
docker run -d --rm --name tdc-test-db -e MYSQL_RANDOM_ROOT_PASSWORD=yes -e MYSQL_DATABASE=tdc_qr_test \
  -e MYSQL_USER=tdc_app -e MYSQL_PASSWORD=dev_only_pw_123 -p 3307:3306 mysql:8.4
TEST_DB_PORT=3307 npm test
npm run build && npm run -w apps/api migration:run     # áp dụng migration mới
```

Dev: thêm `PUBLIC_BASE_URL` vào `apps/api/.env` (xem `.env.example`). Test chạy PNG chậm (~3 giây / ảnh) vì sandbox của jest; ngoài jest chỉ khoảng 70 ms.

## Chưa kiểm chứng được

- **Chưa quét thử bằng điện thoại thật / in ra giấy.** Chỉ đã giải mã ảnh PNG và ảnh render từ PDF bằng `jsqr`, cả hai ra đúng URL. Nên in thử một tờ A4 và quét bằng vài máy trước buổi dùng thật.
- **Chưa có logo thật**: máy này không có file logo nên PDF mới thử khi **không** có logo. Đường chèn logo (`BRAND_DIR`) chưa được chạy với file thật.
- **Image Docker** đã build và chạy thử render PDF ở chế độ `--read-only`, user `node`; **chưa chạy cả `docker compose` và workflow CI** (không đụng vào stack dev đang chạy của máy).
- `npm audit --omit=dev --audit-level=high` đạt; còn 3 cảnh báo mức *moderate* (`minimatch` trong `typeorm`), có từ trước và không chặn CI.

## Việc còn lại / cho giai đoạn 3

1. **Điểm danh công khai phải dùng:** `checkinState()` (chặn / cho điểm danh), `QrService.hashVerifyCode()` (kiểm tra mã 4 số), tra token qua chỉ mục duy nhất của `event_qr_tokens.token` và chỉ chấp nhận dòng `is_active = true`.
2. **Giới hạn tần suất nhập mã 4 số** theo thiết bị + sự kiện (xem trên), nếu không 10.000 khả năng dò được trong vài phút.
3. **Khóa ngoại `attendances.event_id` → `events` phải là RESTRICT.** Khi đó `DELETE /events/:id` tự trả 409 `EVENT_IN_USE` (code đã bắt lỗi khóa ngoại, nhưng **chưa có test** vì chưa có bảng điểm danh); thêm test lúc làm giai đoạn 3.
4. **Xem sinh viên khoa mình trong sự kiện cấp trường (giai đoạn 4, chưa làm được vì chưa có bảng điểm danh).** Quy tắc đã chốt: quản lý khoa chỉ đọc được lượt điểm danh của sự kiện cấp trường **khi họ đang được xem sự kiện đó** (`access() = 'view'`: chế độ `ALL`, hoặc `SELECTED` có khoa của họ), và **chỉ những lượt có `faculty_unit_id` nằm trong phạm vi đơn vị của họ** (`UnitScopeService.visibleUnitIds`); không xem được sinh viên khoa khác, không duyệt, không sửa. Dùng lại hàm `access()` ở `events.service.ts` (trả `manage | view | none`) cho việc kiểm tra quyền xem sự kiện, và nhớ thêm test "khoa A không thấy sinh viên khoa B" cùng "chế độ NONE, hoặc SELECTED không có khoa của họ, thì không thấy gì".
5. **`finalize` và `unlock` (đặc tả mục 7) để giai đoạn 4.** Hiện chỉ chặn sẵn: sự kiện `FINALIZED` không sửa / xóa được (test giả lập bằng cách ghi thẳng DB).
6. **Đổi `startAt` / `endAt` không tự dời khung giờ mở / đóng điểm danh.** Client gửi lại cả bốn mốc; hệ thống chỉ kiểm tra tính hợp lệ. Nếu muốn tự dời, cần quyết định.
7. **Trình chiếu QR, chọn tọa độ trên bản đồ, nhập ĐRL** thuộc giao diện React (chưa dựng).

## Câu hỏi cần bạn quyết định

1. ~~Quản lý khoa có được xem sự kiện cấp trường không?~~ **Đã quyết và làm xong phần sự kiện (01/11/2026):** xem được khi Đoàn trường cho phép, theo hai cách (tất cả khoa hoặc chọn khoa). Phần xem sinh viên khoa mình làm ở giai đoạn 4 (mục 4 ở trên).
2. **Đường dẫn trang điểm danh**: tôi đặt `/diem-danh/<token>`. Mã QR in ra giấy không sửa được, nên cần chốt trước khi in thật. Tên miền (`PUBLIC_BASE_URL`) cũng chưa chốt.
3. **Tệp logo thật** để đặt vào thư mục `BRAND_DIR`, và có muốn đổi font PDF sang Open Sans không (cần tệp TTF đầy đủ tiếng Việt).
