# Nhật ký giai đoạn 6 — Quản lý hoạt động

Ngày: 01/11/2026. Căn cứ: `dac-ta-quan-ly-hoat-dong.md` mục 2, 3, 4, 10; `dac-ta-he-thong.md`; `quy-uoc-code.md`.

Các quyết định tự chốt (người dùng giao "đề xuất phương án tốt nhất và hoàn thành"):

- **Quy trình**: Nháp → Chờ duyệt kế hoạch → Đang triển khai → Chờ đánh giá → Đã đánh giá → Đã chốt. "Trả lại bổ sung" đưa hồ sơ về Nháp (kế hoạch) hoặc Đang triển khai (kết quả), kèm nội dung bắt buộc; nộp lại thì xóa ghi chú. Khen thưởng chỉ khi đã đánh giá "Hoàn thành"; khen thưởng xong thì chốt. Đoàn trường có thể **mở lại** hồ sơ đã chốt (bắt buộc lý do).
- **Mã hoạt động** `YYYY-NNN`, năm theo **ngày bắt đầu** (giờ VN), đánh số chung toàn trường bằng một câu `INSERT … ON DUPLICATE KEY UPDATE` nguyên tử.
- **Link sản phẩm**: chỉ `https`, ≤ 2048 ký tự, không khoảng trắng / thông tin đăng nhập, tối đa **5 link mỗi nhóm** (truyền thông / bài đăng / kết quả); tên miền ngoài danh sách tin cậy bị đánh dấu "cần kiểm tra" chứ không bị chặn.
- **Đơn vị phối hợp** xem được hồ sơ nhưng chỉ đọc (403 `READ_ONLY_ACTIVITY`); đơn vị ngoài phạm vi bị 404 như mọi nơi khác.
- **Số người tham gia thực tế** tự lấy từ điểm danh (đếm MSSV khác nhau, không tính lượt đã hủy) khi có buổi gắn kèm; không thì dùng số nhập tay.
- **Checklist đánh giá chỉ là gợi ý**: bốn tiêu chí tự đo được, hai tiêu chí còn lại người đánh giá tự xác nhận.
- **Khóa sổ năm học** chặn thêm / sửa / nộp mọi hồ sơ của năm đó; mở lại cần lý do; có nhật ký.

## Đã làm

**Backend** (`apps/api/src/activities/`). Migration `1793800000000` (13 bảng, nạp sẵn 8 lĩnh vực). Năm học, lĩnh vực, hồ sơ hoạt động (danh sách lọc theo năm học / đơn vị / trạng thái / lĩnh vực / thiếu truyền thông, tìm theo mã hoặc tên không phân biệt dấu kể cả chữ "đ"), tạo / sửa / xóa nháp, lịch sử phiên bản có so sánh từng trường, dòng thời gian, bình luận, thông báo trong hệ thống, gắn / gỡ buổi điểm danh, duyệt và đánh giá hàng loạt (lỗi của một hồ sơ không làm hỏng các hồ sơ còn lại, trả về danh sách thất bại kèm lý do). **Thống kê** (`/admin/activity-stats`): tổng, tỉ lệ hoàn thành (chỉ tính hồ sơ đã đánh giá), lượt tham gia, khen thưởng, truyền thông, kinh phí, theo đơn vị / lĩnh vực / tháng / trạng thái. **Xuất Excel** (hai sheet; chặn chèn công thức như báo cáo ĐRL; ghi nhật ký).

**Quyền riêng tư**: dịch vụ `retention` tự xóa tọa độ, khoảng cách, IP, trình duyệt của lượt điểm danh quá `data_retention_months` (mặc định 6) — cấu hình này có từ giai đoạn 1 nhưng trước đây chưa có gì áp dụng.

**Giao diện** (`apps/web`). Danh sách hồ sơ (bộ lọc trên URL, duyệt hàng loạt), form tạo / sửa (trình soạn link, đơn vị phối hợp), chi tiết (thanh tiến trình, nút theo trạng thái và quyền, đối chiếu tiêu chí, gắn buổi điểm danh, lịch sử, bình luận), thông báo (chuông + trang), thống kê + nút xuất Excel, cấu hình năm học / lĩnh vực (chỉ Đoàn trường). Menu tách "Hoạt động" và "Điểm danh".

## Kiểm thử

- API: **434 test** (thêm 38: 33 hoạt động gồm quy trình đầy đủ, phân quyền theo vai trò và phạm vi đơn vị, nhiều ca bị từ chối — link http / quá 5 / trùng, sai trạng thái, thiếu lý do, ngoài phạm vi, khóa sổ, tạo song song 8 hồ sơ cùng lúc không trùng mã, công thức Excel; 5 ca ẩn danh hóa). `route-sweep` xác nhận mọi route mới đều yêu cầu đăng nhập, route Đoàn trường có `@Roles`.
- Web: 20 test (thêm 5: nhãn, định dạng tiền, huy hiệu trạng thái).
- **Chạy thật trên trình duyệt** (Chromium, API + MariaDB thật): tạo năm học, thử link `http` (bị từ chối đúng), tạo hoạt động, nộp → duyệt → thêm báo cáo → nộp kết quả → đánh giá → khen thưởng → chốt, danh sách, thống kê, tải tệp Excel. Nhờ đó thấy và sửa: lịch sử bị lặp (mỗi bước quy trình sinh thêm dòng "Sửa hồ sơ" với nhãn kỹ thuật); mã `2026-001` bị ngắt dòng trong bảng.

## Lỗi tìm ra khi làm

- **Deadlock** khi nhiều người tạo hoạt động cùng lúc: `INSERT IGNORE` rồi `UPDATE` tách đôi để cấp số thứ tự → gộp thành một câu nguyên tử.
- **`last_value` là từ khóa của MySQL 8** (hàm cửa sổ) nên câu SQL thô lỗi cú pháp trên CI (MySQL 8.4) nhưng chạy tốt trên MariaDB cục bộ → đặt trong dấu backtick. Bài học: SQL thô phải đặt tên cột trong backtick; chỉ CI mới bắt được loại lỗi này.
- Test `event-share` đếm cứng số migration cần lùi nên hỏng khi thêm migration → lùi đến khi gặp migration đích.
- Bộ lọc tìm kiếm: collation `*_ci` coi "đ" khác "d" → quy "đ" về "d" ở cả hai vế.

## Chưa làm (có trong đặc tả)

- Lịch hoạt động dạng tháng (A13), **nhập hàng loạt từ Excel** (A14, tối đa 500 dòng), **xuất PDF theo mẫu văn bản Đoàn**, **báo cáo đơn vị** (khoa soạn báo cáo → nộp → trả lại / đánh giá / khen thưởng). Các phần này cần mẫu biểu của nhà trường để làm đúng; hiện chưa có mẫu.
- Ngăn kéo chi tiết một lượt điểm danh (A07) và bộ chọn theo học kỳ ở giao diện sự kiện (còn từ 5b).
- Thông báo chỉ hiện trong hệ thống (chuông); chưa gửi email.
- Chưa có test giao diện riêng cho từng trang hoạt động (đã đi qua bằng trình duyệt thật, chưa tự động hóa).
