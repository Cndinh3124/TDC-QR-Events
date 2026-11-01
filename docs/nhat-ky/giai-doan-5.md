# Nhật ký giai đoạn 5 — Tổng quan, nhắc việc, màn quản trị hệ thống, kiểm thử tải, rà soát bảo mật

Ngày: 01/11/2026. Căn cứ: `dac-ta-he-thong.md` mục 3.6, 7, 8, 10, 11, 12; `chot-backend-hieu-nang.md` mục 5, 7, 9; `quy-uoc-code.md`.

## Đã làm

**Backend** — module mới `apps/api/src/dashboard/` (không có migration, chỉ đọc dữ liệu có sẵn):

| Endpoint | Việc |
|---|---|
| `GET /api/admin/dashboard/overview?from&to&facultyUnitId&eventId` | KPI (lượt điểm danh, tỷ lệ đúng giờ, số sinh viên, ĐRL đã cộng) kèm giá trị **kỳ trước cùng độ dài**; lượt chờ duyệt và khiếu nại đang mở (số hiện tại); biểu đồ theo ngày (đủ mọi ngày, ngày trống = 0); theo khoa (đủ mọi khoa đang hoạt động); sự kiện đang điểm danh (số đếm đọc từ `event_counters`); 10 sự kiện gần đây. Mặc định 30 ngày gần nhất, tối đa 366 ngày, theo giờ Việt Nam. |
| `GET /api/admin/dashboard/reminders` | Nhắc việc (đặc tả 3.6): sự kiện đã kết thúc mà còn lượt `PENDING`; khiếu nại còn ≤ 2 ngày hoặc đã quá hạn (khiếu nại quá hạn vẫn xử lý được nên vẫn nhắc). Chỉ tính sự kiện đơn vị mình **tổ chức** (quyền duyệt), không tính sự kiện chỉ-xem. |

Toàn bộ là `COUNT` / `GROUP BY` trong SQL (chốt-backend mục 7). Test: `test/dashboard.e2e-spec.ts` (12).

**Giao diện** (`apps/web`): Tổng quan `/tong-quan` (trang mặc định sau đăng nhập; số liệu làm mới mỗi 10 giây khi có sự kiện đang điểm danh, 60 giây nếu không, tạm dừng khi tab bị ẩn; biểu đồ SVG tự vẽ, không thêm thư viện), huy hiệu số việc cần xử lý cạnh mục Tổng quan. Bốn màn **chỉ Đoàn trường**: Tài khoản quản trị `/tai-khoan` (thêm / sửa / khóa / mở khóa / đặt lại mật khẩu / xóa), Đơn vị `/don-vi`, Cấu hình `/cau-hinh`, Nhật ký `/nhat-ky` (lọc theo hành động / đối tượng / ngày, xem trước-sau). Các màn này dùng API đã có từ giai đoạn 1. Trang quản trị nay được **tách gói theo route** (`React.lazy`): gói đầu của trang điểm danh còn 283 KB thô / **90 KB nén gzip** (React + router), phần còn lại tải riêng.

**Kiểm thử tải**: `loadtest/checkin.js` (k6) + `loadtest/README.md` — 2.000 sinh viên ảo rải trong 3 phút, rồi đợt đỉnh 100 lượt/giây trong 1 phút; mỗi lượt là một "máy" mới (cookie riêng, MSSV riêng); ngưỡng p95 < 500 ms và 0 lượt bị từ chối; ghi kết quả ra `loadtest/results/` (đã bỏ khỏi git).

**Rà soát bảo mật**: test mới `test/route-sweep.e2e-spec.ts` quét **mọi route đã đăng ký** (73): chỉ `/healthz`, đăng nhập / refresh / đăng xuất và `/api/public/*` được công khai; mọi route còn lại trả 401 khi chưa đăng nhập; mọi route chỉ-Đoàn-trường trả 403 cho quản lý khoa; ba nhóm `users`, `settings`, `audit-logs` bắt buộc khai báo `@Roles('SCHOOL_ADMIN')`. Giai đoạn sau thêm endpoint mà quên guard thì test này đỏ.

## Quyết định và lý do

- **Phạm vi khoa của Tổng quan = khoa của sinh viên trên lượt điểm danh** (`attendances.faculty_unit_id`), giống bộ lọc `facultyUnitId` của báo cáo ĐRL; đặc tả ghi `unitId`, đã đổi tên cho nhất quán. Quản lý khoa chỉ thấy lượt của sinh viên khoa mình ở sự kiện nhìn thấy được; khoa hoặc sự kiện ngoài phạm vi trả 404.
- **KPI tính theo `checkin_at`** (không phải ngày sự kiện như báo cáo ĐRL), vì tổng quan trả lời "hôm nào có bao nhiêu lượt"; ĐRL đã cộng cũng gắn theo ngày điểm danh của lượt đó. Lượt đã hủy không tính; MSSV đã gộp tính là một sinh viên.
- **"Đang diễn ra" dùng `checkinState()`** chứ không đọc `status`, theo ghi chú của CLAUDE.md.
- **Worker gắn cờ xử lý tối đa 10 lô mỗi nhịp** (`ROUNDS_PER_TICK`, `public/flag.worker.ts`). Đo lần đầu thấy mỗi nhịp chỉ 1 lô × 50 việc = tối đa 50 việc/giây, thấp hơn đỉnh 100 lượt/giây nên tồn ~2.500 việc, sau đợt đỉnh còn mất ~50 giây mới gắn cờ xong. Sau khi sửa: cuối đợt đo không còn việc tồn.
- **Cấu hình `data_retention_months` chỉ lưu giá trị**, chưa có tác vụ tự ẩn danh (vẫn chờ chốt thời hạn); màn Cấu hình ghi rõ điều này.

## Kiểm thử

394 test qua (thêm 12 + 5), lint và typecheck sạch. Đã **cố ý làm hỏng** để chắc test bắt được: bỏ lọc khoa trong số liệu, bỏ lọc đơn vị của nhắc việc, bỏ kiểm tra 404 theo khoa (mỗi lần đúng test liên quan đỏ); bỏ `@Roles` của `SettingsController` — lần đầu test quét route **vẫn xanh** (nó chỉ kiểm tra route đã tự khai báo chỉ-Đoàn-trường), nên đã thêm kiểm tra danh sách nhóm bắt buộc rồi thử lại: đỏ đúng chỗ.

**Số đo tải (chạy trên máy dev, đúng kịch bản đầy đủ)**: API Node thường + MySQL 8.4 trong Docker, k6 chạy trong Docker trên cùng máy Mac, worker bật. 16.008 request: `/checkin` p95 ≈ 16 ms, p99 ≈ 21 ms; `by-token` p95 ≈ 9 ms; 0 lượt bị từ chối; DB có đủ 8.001 lượt, 8.001 MSSV khác nhau, bảng đếm khớp, toàn bộ việc gắn cờ `DONE`.

## Chưa kiểm chứng được / lưu ý

- **Số đo tải chỉ mang tính tham khảo.** Máy phát tải, API và DB chung một máy; k6 báo ~100 lỗi `dial: i/o timeout` ở lớp mạng Docker Desktop cho Mac khi mở 2.000 kết nối (phía client, không phải phản hồi của API, nên không vào ngưỡng "bị từ chối"). Chưa đo với 2 bản backend sau nginx, RDS thật, mạng thật. **Phải chạy lại trên môi trường thử nghiệm ở giai đoạn 6** (máy phát tải riêng, đặt `PUBLIC_IP_RATE_LIMIT_PER_MIN` đủ lớn).
- **CI chưa lưu kết quả tải** như `chot-backend-hieu-nang.md` mục 9 mong muốn: chưa thêm workflow k6 vì không có cách kiểm chứng ở máy này (và cần ghim SHA action). Việc còn lại.
- **Giao diện mới chưa xem trên trình duyệt** (tổng quan, tài khoản, đơn vị, cấu hình, nhật ký): chỉ qua typecheck và build; chưa có test cho `apps/web`.
- Rà soát bảo mật dựa trên đọc mã + test quét route; **chưa làm** (vẫn còn từ trước): giới hạn "10 lần/giờ/tài khoản" (đã có khóa 15 phút sau 5 lần sai), TOTP, user DB quyền tối thiểu và kết nối DB qua TLS, CSP / `Permissions-Policy` cho **giao diện web** (thuộc cấu hình nginx, giai đoạn 6; API đã có CSP chặt). `npm audit --audit-level=high` qua; còn 39 cảnh báo mức thấp / vừa (chủ yếu `minimatch` trong công cụ lint và `uuid` trong `exceljs`).
- Màn Tổng quan chưa có bộ chọn "theo học kỳ" (chưa có lịch học kỳ), chưa có bản đồ chọn tọa độ ở form sự kiện (đặc tả mục 10, Leaflet) — chưa làm.
- Docker Desktop tự tắt giữa phiên làm việc nên DB test (`--rm`) bị mất; đã tạo lại bằng lệnh trong CLAUDE.md. Nếu test báo `Access denied`, kiểm tra container `tdc-test-db` và dùng `TEST_DB_PORT=3307`.

## Việc còn lại cho giai đoạn 6

Chạy lại kiểm thử tải trên hạ tầng thử nghiệm và đưa vào CI; nginx với CSP / HSTS / `Permissions-Policy` cho web; user DB quyền tối thiểu + TLS; sao lưu; tác vụ ẩn danh IP / GPS sau thời hạn lưu (khi chốt thời hạn); chốt tên miền trước khi in QR.
