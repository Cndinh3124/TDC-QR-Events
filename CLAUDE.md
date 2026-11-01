# TDC-QR-Events — hướng dẫn cho Claude Code

Hệ thống điểm danh bằng QR + quản lý hoạt động Đoàn – Hội, trường Cao đẳng Công nghệ Thủ Đức. Đặc tả đầy đủ nằm trong project **QRCode-GPS** trên claude.ai (`dac-ta-he-thong.md`, `dac-ta-chuc-nang-giao-dien.md`, `dac-ta-quan-ly-hoat-dong.md`, `chot-giao-dien.md`, `chot-backend-hieu-nang.md`, `quy-uoc-code.md`). Nhật ký từng giai đoạn: `docs/nhat-ky/`. Triển khai: `docs/trien-khai.md`.

## Ngôn ngữ

- Trả lời người dùng bằng **tiếng Việt có dấu**.
- Thông báo hiển thị cho người dùng: tiếng Việt có dấu.
- Chú thích trong mã: tiếng Việt **không dấu**, gắn thẻ `// [BM]` (bảo mật) hoặc `// [NV] <mục đặc tả>` (nghiệp vụ).

## Cấu trúc

`apps/api` (NestJS 11 + TypeORM 0.3 + MySQL 8.4), `apps/web` (React 19 + Vite, CSS tự viết, không dùng Ant Design), `deploy/` (nginx, sao lưu), `loadtest/` (k6). Module API: auth, users, units, events, attendances, appeals, students, reports, public, dashboard, settings, audit, **activities**, **retention**.

## Lệnh

```bash
npm run build                              # API + web
npm run -w apps/api lint && npm run -w apps/api typecheck
npm run -w apps/api test                   # cần DB: TEST_DB_PORT, DB riêng tdc_qr_test (mỗi test XÓA SẠCH rồi chạy lại migration)
npm run -w apps/web typecheck && npm run -w apps/web test
npm run -w apps/api migration:run          # sau khi build
```

## Quy ước bắt buộc

1. **Mọi tính năng kiểm tra vai trò VÀ phạm vi đơn vị trong service** (`UnitScopeService`); ngoài phạm vi → **404**, không phải 403. Chỉ riêng "đơn vị phối hợp chỉ đọc" trả 403 `READ_ONLY_ACTIVITY`.
2. Chỉ trả **DTO**, không trả entity thô. Không đưa bí mật vào log / nhật ký.
3. Mỗi tính năng có test, **gồm cả ca bị từ chối** (sai quyền, ngoài phạm vi, dữ liệu sai, sai trạng thái). Có `route-sweep.e2e-spec.ts` kiểm mọi route đều yêu cầu đăng nhập: route mới phải qua được.
4. Migration viết tay, đăng ký thủ công trong `apps/api/src/database/data-source.ts` (cả `ENTITIES` và `MIGRATIONS`); `synchronize` tắt.
5. **SQL thô: đặt tên cột trong dấu backtick.** `last_value` (và các từ khóa MySQL 8 khác) chạy được trên MariaDB cục bộ nhưng **lỗi trên MySQL 8.4 ở CI**. Test cục bộ chạy MariaDB, nên CI là nơi duy nhất bắt được loại lỗi này.
6. Mỗi giai đoạn có `docs/nhat-ky/giai-doan-N.md`: đã làm, kiểm thử, **lỗi tìm ra**, và **chưa kiểm chứng** — nói thật cái gì chưa chạy thử.
7. Xuất Excel luôn qua `safeCell` (chặn chèn công thức).

## Cạm bẫy đã gặp

- Giữ `typeorm@0.3.31`, `@nestjs/typeorm` và `@nestjs/platform-express` ở `^11` (bản 12 là ESM-only, Jest không đọc được). Dependabot hay đề xuất nâng — bỏ qua nâng bản lớn.
- `multer` được ghim bằng `overrides` ở `package.json` gốc (lỗi bảo mật).
- ID dùng `char(36)` sinh bằng `randomUUID()`; validate bằng `IsUUID(undefined)` (đừng ép phiên bản 4).
- Đừng đếm cứng số migration cần lùi trong test; lùi đến khi gặp migration đích.
- `links` / `coUnitIds` khi sửa hoạt động là **thay thế cả bộ**, không phải thêm.
- Nginx phải giữ nguyên `Host` kể cả cổng (`$http_host`): API so `Origin` với `Host`.
- Khi tắt tiến trình nền bằng shell, dùng file pid; **đừng `pkill -f` theo đường dẫn** (có thể giết chính shell).

## Trạng thái

Giai đoạn 1–7 xong (xem README). Còn: lịch hoạt động, nhập Excel, xuất PDF theo mẫu Đoàn, báo cáo đơn vị, ngăn kéo chi tiết điểm danh (A07) — cần mẫu biểu của nhà trường. Chưa kiểm chứng: Docker, MySQL 8.4 cục bộ, thiết bị thật, tải thật.
