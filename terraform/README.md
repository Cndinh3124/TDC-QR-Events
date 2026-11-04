# Triển khai AWS bằng Terraform (bản demo, chi phí thấp nhất)

Một máy EC2 chạy MySQL 8.4 + API (Docker) + nginx, có Elastic IP, bản ghi DNS ở Route 53 và chứng chỉ Let's Encrypt. Không dùng ALB, RDS, NAT hay CloudFront. **Chỉ phù hợp demo / báo cáo đồ án**, không phải bản chạy thật (xem "Giới hạn").

```
Internet ──443──▶ EC2 (Ubuntu 24.04, t3.small) ── nginx ──/api──▶ API (Docker, 127.0.0.1:3000) ──▶ MySQL (Docker)
                     ▲ SSM Session Manager (không mở SSH)          └── tệp tĩnh giao diện
Route 53: diemdanh.doanhoitdc.id.vn ──A──▶ Elastic IP
```

Tài nguyên (20): S3 bucket riêng tư chứa mã nguồn, 4 tham số SSM SecureString (mật khẩu DB, hai khóa ký, mật khẩu admin), IAM role (chỉ đọc đúng bucket và đúng tham số), security group (chỉ 80/443), EC2, Elastic IP, bản ghi A.

## Dùng

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars     # sửa admin_email
terraform init
terraform plan -out=.build/plan.tfplan
terraform apply .build/plan.tfplan               # ~2 phút tạo; máy tự cài đặt thêm ~10–15 phút
terraform output -raw admin_password             # mật khẩu tạm; bắt buộc đổi ở lần đăng nhập đầu
```

Cần thông tin đăng nhập AWS trong shell (`~/.aws` hoặc biến `AWS_*`) và đã `git commit` mã cần triển khai: kịch bản `scripts/package-source.sh` đóng gói **bản commit HEAD** (`git archive`), nên `.env` và tệp chưa commit không bao giờ lên S3.

Theo dõi khởi tạo: `aws ssm start-session --target <instance_id>` rồi `sudo tail -f /var/log/tdc-bootstrap.log`. Xong khi thấy `tdc-deploy xong: https://...`. Nếu Let's Encrypt chưa xác thực được (DNS chưa lan truyền), kịch bản thử lại tới ~15 phút.

## Cập nhật mã nguồn

```bash
git commit ...                 # trên máy dev
terraform apply                # đẩy bản mới lên S3 (chỉ thay object source.tar.gz)
# trên máy chủ (qua SSM):
sudo tdc-deploy                # tải bản mới, dựng lại giao diện + image, migration tự chạy
```

`user_data` và AMI bị `ignore_changes` để một lần `apply` vô ý không **tạo lại máy và mất CSDL**. Hệ quả: sửa `user_data.sh.tftpl` không tự áp dụng lên máy đang chạy.

## Chi phí và tắt khi không dùng

Ước tính (chưa tra bảng giá hiện hành) khoảng 20–25 USD/tháng nếu chạy liên tục ở Singapore: EC2 t3.small, Elastic IP (tính phí IPv4 công cộng kể cả khi máy tắt), ổ 20 GB. Hosted zone đã có sẵn nên không tính thêm.

- Tạm dừng giữa các buổi demo: dừng instance (dữ liệu trên ổ đĩa còn nguyên; chỉ còn phí ổ + IP).
- Xóa hết sau khi báo cáo: `terraform destroy` (**mất toàn bộ dữ liệu**, kể cả CSDL).

## Giới hạn — hãy đọc trước khi dùng cho dữ liệu thật

- **Một máy, không dự phòng.** Máy hỏng hoặc bị xóa là mất CSDL. **Chưa có sao lưu tự động**; `deploy/backup/backup.sh` chưa được lên lịch ở đây. Muốn giữ dữ liệu: chụp snapshot ổ đĩa hoặc chạy backup.sh rồi chép ra S3.
- **State Terraform nằm trên máy bạn** (`terraform.tfstate`, đã gitignore) và **chứa mật khẩu / khóa ký ở dạng rõ**. Đừng commit, đừng gửi đi. Mất file state thì phải import lại tài nguyên.
- Mật khẩu admin tạm cũng nằm trong SSM và state; đổi ngay sau lần đăng nhập đầu.
- Dùng cho thật (trường, hàng nghìn sinh viên): chuyển CSDL sang RDS MySQL 8.4, API sang ECS/Fargate sau ALB, giao diện lên S3 + CloudFront, state sang S3 + khóa DynamoDB; đó là hướng mà `docs/trien-khai.md` mô tả.

## Đã kiểm chứng / chưa kiểm chứng

Đã làm: `terraform fmt`, `validate`, `plan` (20 tài nguyên cần tạo, không lỗi, với tài khoản `631367363601`); kiểm cú pháp `bash -n` trên kịch bản khởi tạo đã render; kiểm phép `sed` sinh cấu hình nginx trên GNU sed (Ubuntu); kiểm gói mã nguồn không chứa `.env`.

**Chưa chạy `apply`, nên chưa kiểm chứng:** máy khởi tạo thành công, `docker compose` và image production trên EC2 (CLAUDE.md đã ghi Docker chưa từng chạy thử), Let's Encrypt cấp chứng chỉ, nginx 1.24 với cấu hình thật, tạo admin tự động, và chi phí thực. Lỗi nhiều khả năng gặp ở lần chạy đầu: thiếu RAM khi `npm ci` (đã thêm swap 2 GB), DNS chưa lan truyền.
