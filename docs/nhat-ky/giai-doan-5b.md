# Nhật ký giai đoạn 5b — Hoàn thiện giao diện sự kiện

Ngày: 01/11/2026. Căn cứ: `dac-ta-chuc-nang-giao-dien.md` mục B3, A04–A06, P01, P06, P08, C4 và D13; `dac-ta-he-thong.md` mục 2.4, 3.1, 3.2, 3.7, 5.2; `quy-uoc-code.md`.

## Đã làm

**Sửa nền trước khi làm tiếp.** `main` đang hỏng cả 19 bộ test do Dependabot nâng `@nestjs/typeorm` và `@nestjs/platform-express` lên 12 (gói ESM-only, Jest CommonJS không đọc được; `platform-express` 12 cũng không đi cùng `core` 11). Đưa về `^11`, gom các gói `@nestjs/*` vào một PR Dependabot và bỏ qua nâng bản lớn (PR #11). Lần chạy CI thật đầu tiên còn lộ hai lỗi ở job `security` và `image`: gitleaks báo 10 chỗ (toàn khóa giả trong `apps/api/test/`, đã khai báo ngoại lệ hẹp ở `.gitleaks.toml`) và Trivy báo 10 lỗi HIGH nằm trong **chính `npm` của image Node** (không phải thư viện của dự án), nên đã gỡ `npm`/`npx`/`corepack` khỏi image chạy (PR #13). Từ nay CI in lỗi ra annotation (`.github/scripts/annotate.sh`, `trivy-summary.mjs`).

**Danh sách sự kiện (A04).** Tìm theo tên, lọc theo đơn vị (Đoàn trường), trạng thái, khoảng ngày (giờ Việt Nam), phân trang 20 mục; bộ lọc lưu trên URL (F5, gửi liên kết vẫn giữ). Nhãn "Chỉ xem" cho sự kiện khoa được chia sẻ. Nhãn trạng thái xét `checkinState` trước (sự kiện đã công bố trong khung giờ hiện "Đang điểm danh").

**Form sự kiện (A05).** Dùng chung cho thêm và sửa (`/su-kien/:id/sua`, chỉ gửi trường thật sự đổi, bắt buộc lý do khi đã mở điểm danh). **Bản đồ Leaflet + OpenStreetMap** để bấm hoặc kéo ghim chọn vị trí, vòng tròn bán kính; tải riêng (44 KB nén) nên không ảnh hưởng trang sinh viên. Phần nâng cao: khung giờ mở/đóng điểm danh và ân hạn. Mức "Chặt" tự bật và khóa ô "Yêu cầu điểm danh ra" (trước đó máy chủ từ chối với thông báo khó hiểu).

**Chi tiết sự kiện (A06).** Các tab Tổng quan, Mã QR, Chia sẻ cho khoa (Đoàn trường, sự kiện cấp trường), Nhật ký (Đoàn trường). Nút: Công bố, Mở/Đóng điểm danh, Quay lại điều khiển theo giờ, Sửa, Nhân bản, Lưu trữ/Khôi phục, Hủy, Xóa hẳn (hủy và xóa bắt buộc gõ lại tên sự kiện + lý do). Tab Mã QR: tải PDF/PNG, **Tạo mã QR mới** (cảnh báo tờ đã in), **Đổi mã 4 số**. Xem sự kiện được chia sẻ chỉ có Tổng quan, mọi nút ẩn.

**Trình chiếu QR (P08, `/trinh-chieu/:id`).** Toàn màn hình, QR lớn, số đã điểm danh (làm mới 10 giây), đếm ngược đóng điểm danh, chuyển QR vào / QR ra / Mã 4 số, thanh điều khiển tự ẩn sau 5 giây, nhấp đôi để vào toàn màn hình. Cần đăng nhập vì có mã QR.

**Tra cứu lịch sử (P06, `/tra-cuu`)** cho sinh viên, có cảnh báo khi MSSV bị thiết bị khác điểm danh hộ, kèm các khiếu nại đã gửi; liên kết ở màn vé.

**Nhận diện.** Logo Đoàn, Hội, TDC thật (đã tách từ ảnh gốc, TDC đặt trong khung tròn trắng trên nền xanh đậm) ở thanh bên, đăng nhập, trang điểm danh, trình chiếu. Đăng nhập chia đôi theo thiết kế, có đầy đủ khẩu hiệu của trường.

**Backend.** Chỉ một thay đổi nhỏ: `unit.type` trong dữ liệu sự kiện, để giao diện biết sự kiện cấp trường (test mới).

## Kiểm thử

- API: 396 test qua (thêm 1). Web: **15 test mới** (nhãn trạng thái, đếm ngược, hộp thoại lý do và gõ lại tên, phân trang, kiểm tra vị trí); đã thử cố ý làm hỏng ô gõ lại tên, test đỏ đúng chỗ.
- **Chạy thật trên trình duyệt** (Chromium qua Playwright, API + MariaDB thật): đăng nhập, đổi mật khẩu bắt buộc, tạo sự kiện bằng cách bấm bản đồ, công bố, xem QR, trình chiếu, điểm danh trên điện thoại giả lập (iPhone 13, có GPS), xem vé, tra cứu, đóng điểm danh, vào màn duyệt, lọc danh sách. Tìm ra và sửa hai lỗi nhờ lần chạy này: mức Chặt không tự bật điểm danh ra; ba logo trang đăng nhập bị xếp dọc do CSS áp nhầm.

## Chưa kiểm chứng được

- **Ảnh nền bản đồ** (tile OpenStreetMap): môi trường thử không ra được Internet nên chỉ kiểm tra được ghim, vòng tròn và thao tác bấm, chưa thấy ảnh nền thật. Khi triển khai, CSP của nginx phải cho `img-src https://tile.openstreetmap.org` ở khu quản trị.
- Chưa thử trên iOS Safari / Android Chrome thật (chỉ giả lập iPhone 13 bằng Chromium); GPS thật cần HTTPS.
- Chưa có test giao diện cho từng trang lớn (EventDetail, EventForm); mới có test thành phần và hàm thuần.

## Còn lại ở giao diện sự kiện

Ngăn kéo chi tiết một lượt điểm danh có lịch sử sửa và các sự kiện khác của cùng MSSV (A07); bộ chọn "theo học kỳ" (chưa có lịch học kỳ); PDF dùng font Open Sans thay DejaVu.
