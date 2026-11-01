# Kiểm thử tải điểm danh

Đo đường điểm danh công khai theo `chot-backend-hieu-nang.md`: **2.000 sinh viên ảo vào trong 3 phút**, sau đó **đợt đỉnh 100 lượt/giây trong 1 phút**; mục tiêu **p95 < 500 ms** và **không mất lượt** (mọi `/checkin` phải trả 201).

> Chỉ chạy vào máy chủ thử nghiệm của mình. Mỗi lần chạy tạo ~8.000 lượt điểm danh thật trong DB đích.

## Chạy

Cần [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) (hoặc `docker run --rm -i grafana/k6 run -`).

```bash
# Cách 1: để kịch bản tự tạo sự kiện thử (tài khoản Đoàn trường, không bị buộc đổi mật khẩu)
k6 run -e BASE_URL=https://thu-nghiem.example.vn -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... loadtest/checkin.js

# Cách 2: dùng sự kiện đã mở điểm danh sẵn (token lấy ở GET /api/admin/events/:id/qr)
k6 run -e BASE_URL=... -e TOKEN=... loadtest/checkin.js
```

Biến tùy chọn: `STUDENTS` (2000), `SPREAD_SEC` (170), `PEAK_RATE` (100), `PEAK_SEC` (60), `SUMMARY_FILE` (`loadtest/results/summary.json`), `DEBUG=1` (in lỗi từng lượt bị từ chối).

## Điều kiện để số đo có ý nghĩa

- Chạy từ máy **khác** máy chủ ứng dụng, cùng vùng mạng. Máy phát tải yếu sẽ làm sai p95.
- Đặt `PUBLIC_IP_RATE_LIMIT_PER_MIN` đủ lớn cho một IP phát tải (mặc định 20.000/phút; đợt đỉnh ~ 200 request/giây = 12.000/phút). Nếu thấy `checkin_rate_limited` > 0 thì đó là giới hạn IP, chưa phải giới hạn của hệ thống.
- Sự kiện thử **không có tọa độ** (có tọa độ thì GPS bắt buộc) và **không bắt điểm danh ra**.
- Đo cả khi worker gắn cờ đang chạy (`FLAG_WORKER_ENABLED=true`), vì thực tế nó chạy song song.
- Kết quả ghi vào `loadtest/results/summary.json` (đã bỏ khỏi git); so sánh giữa các lần chạy trước mỗi bản cập nhật lớn.
- Sau khi đo, hủy sự kiện thử (hoặc dọn DB thử nghiệm).
