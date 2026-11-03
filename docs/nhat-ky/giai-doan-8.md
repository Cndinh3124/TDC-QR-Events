# Nhật ký giai đoạn 8: sửa lỗi review, chi tiết lượt điểm danh (A07), lịch hoạt động (A13), nút xóa sự kiện

Ngày: 02/11/2026. Sửa trực tiếp trên bản làm việc, **chưa commit**.

## Đã làm

### Sửa 4 lỗi tìm ra khi review

1. **nginx chặn sinh viên khi đông người cùng IP.** Sinh viên điểm danh bằng 4G/5G, nhưng nhà mạng dùng CGNAT nên nhiều máy vẫn có thể chung một IPv4. `/api/public/` có vùng giới hạn riêng (`300r/s`, `burst=1000`); vượt ngưỡng trả **429** thay vì 503 (`limit_req_status 429`). Sửa chú thích ở API (trước đó ghi "cả hội trường chung IP wifi").
2. **Tên / khoa do quản trị sửa bị lần điểm danh sau ghi đè.** Thêm cột `students.profile_locked` (migration `1793900000000-student-profile-lock`). `PATCH /admin/students/:mssv` đặt cờ; worker gắn cờ và thêm / sửa thủ công không ghi đè tên, khoa khi cờ bật. Hồ sơ chưa được sửa vẫn cập nhật theo lần điểm danh mới nhất như cũ.
3. **Lịch sử công khai (`/public/me/history`) để lộ quá trình tham gia của người khác.** Lượt do **thiết bị khác** điểm danh dưới MSSV gắn với máy này chỉ hiện khi sự kiện **còn hạn khiếu nại** (`end_at + appeal_days`). Người bị điểm danh hộ vẫn thấy kịp để khiếu nại; người gõ MSSV của người khác không xem được các sự kiện cũ. Lượt do chính máy này điểm danh vẫn hiện đủ.
4. **Khôi phục lượt đã hủy có thể tạo hai lượt cùng MSSV.** `restore` gọi `assertMssvFree` → 409 `DUPLICATE_MSSV`.

### A07: ngăn kéo chi tiết lượt điểm danh

- API `GET /api/admin/attendances/:id`: lượt điểm danh (DTO cũ), **lịch sử sửa** (mới nhất trước; tên quản trị; sinh viên tự sửa thì không lộ mã thiết bị; khoa hiện tên thay cho id), **các lượt khác của cùng MSSV** (gồm MSSV đã gộp; chỉ sự kiện người xem nhìn thấy; tối đa 30).
- Phạm vi: ngoài phạm vi → 404; khoa chỉ-xem sự kiện cấp trường chỉ mở được lượt của sinh viên khoa mình, không thấy mã xác nhận.
- Web: `components/AttendanceDrawer.tsx` thay hộp thoại chi tiết ở màn Duyệt. Ngăn kéo hiện ngay thông tin có sẵn, tải thêm lịch sử. Đóng bằng Esc, nút Đóng hoặc bấm ra ngoài.

### A13: lịch hoạt động

- API `GET /api/admin/activity-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD[&unitId=]`: hồ sơ hoạt động và buổi điểm danh **giao** với khoảng ngày (tính cả hoạt động kéo dài qua đầu tháng), theo giờ Việt Nam, tối đa 62 ngày, 500 mục mỗi loại (`truncated`). Phạm vi giống danh sách: đơn vị mình và cấp dưới; đơn vị phối hợp (đánh dấu `coUnit`); sự kiện cấp trường chỉ khi được chia sẻ. Bỏ sự kiện đã lưu trữ.
- Web `/hoat-dong/lich` (menu "Lịch hoạt động"): lưới tháng bắt đầu từ thứ Hai, hôm nay được tô; màu chip theo trạng thái hồ sơ; buổi điểm danh màu xanh đậm kèm giờ; tối đa 3 mục mỗi ô, nhiều hơn thì chuyển sang dạng **Danh sách**. Lọc "Hoạt động và điểm danh / chỉ hồ sơ / chỉ buổi điểm danh", lọc đơn vị (Đoàn trường). Tháng và bộ lọc lưu trên URL.

### Nút xóa sự kiện

- Danh sách sự kiện có nút **Xóa** ở mỗi dòng (sự kiện mình quản lý, chưa chốt). Hộp thoại bắt gõ lại tên sự kiện và nhập lý do. API cũ vẫn chặn sự kiện đã có lượt điểm danh (409 `EVENT_IN_USE`); lỗi hiện trong hộp thoại, kèm gợi ý dùng Hủy / Lưu trữ. Nút "Xóa hẳn" trong trang chi tiết vẫn giữ nguyên.

## Kiểm thử

- API: thêm `attendance-detail.e2e-spec.ts` (4), `activity-calendar.e2e-spec.ts` (3), và các ca trong `public-edit` (lịch sử theo hạn khiếu nại), `review` (khôi phục trùng MSSV), `students-reports` (khóa hồ sơ). Các ca bị từ chối: khoa khác 404, id lạ 404, id sai dạng 400, chưa đăng nhập 401, khoảng ngày sai / quá dài 400. `route-sweep` tự quét hai route mới.
- Web: thêm `drawer.test.tsx`, `calendar.test.tsx` (hàm tính lưới tháng, giờ Việt Nam, gọi API), `events.test.tsx` (nút Xóa, lỗi 409).
- `nginx -t` với cấu hình mới: đạt.
- Chạy trên MariaDB 10.11 (không phải MySQL 8.4).

## Lỗi tìm ra trong lúc làm

- Ở Vitest 5, `vi.fn().mockRejectedValue(...)` làm test thất bại với chính lỗi được ném ra, dù component đã bắt lỗi. Test web dùng hàm giả thường thay cho `vi.fn` khi cần promise bị từ chối.
- Dấu backtick trong SQL nằm trong template string của JS phải viết `\``.

## Chưa kiểm chứng

- MySQL 8.4 (CI sẽ chạy): migration mới và SQL `IF(\`profile_locked\`, ...)`.
- Giao diện ngăn kéo và lịch chưa xem trên điện thoại thật.
- Giới hạn nginx mới chưa đo tải thật. Nên chạy câu SQL đếm số thiết bị trên mỗi IP sau một sự kiện đông (xem `docs/trien-khai.md`) để chỉnh `rate` / `burst`.
- Lịch sử công khai vẫn cho người gõ MSSV của người khác thấy các sự kiện **còn hạn khiếu nại** của người đó. Đây là đánh đổi để giữ tính năng phát hiện điểm danh hộ (đặc tả 5.4).
