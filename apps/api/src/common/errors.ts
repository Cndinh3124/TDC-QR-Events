// Loi nghiep vu thong nhat { statusCode, code, message } - dac ta 7
import { HttpException } from '@nestjs/common';

export function appError(status: number, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, code, message }, status);
}

export const Err = {
  unauthorized: () => appError(401, 'UNAUTHORIZED', 'Bạn cần đăng nhập để tiếp tục.'),
  // [BM] mot thong bao chung cho moi truong hop that bai (sai mat khau, TK khong ton tai, TK bi khoa)
  invalidLogin: () =>
    appError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng, hoặc tài khoản đang tạm khóa.'),
  forbidden: () => appError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.'),
  passwordChangeRequired: () =>
    appError(403, 'PASSWORD_CHANGE_REQUIRED', 'Bạn cần đổi mật khẩu trước khi tiếp tục.'),
  notFound: (what: string) => appError(404, 'NOT_FOUND', `Không tìm thấy ${what}.`),
  conflict: (code: string, message: string) => appError(409, code, message),
  bad: (code: string, message: string) => appError(400, code, message),
};

// loi trung khoa duy nhat cua MySQL (ER_DUP_ENTRY / errno 1062)
export function isDuplicateError(e: any): boolean {
  const d = e?.driverError ?? e;
  return d?.code === 'ER_DUP_ENTRY' || d?.errno === 1062;
}

// loi vi pham khoa ngoai (ER_ROW_IS_REFERENCED_2 / errno 1451)
export function isForeignKeyError(e: any): boolean {
  const d = e?.driverError ?? e;
  return d?.code === 'ER_ROW_IS_REFERENCED_2' || d?.errno === 1451;
}
