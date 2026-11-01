// Chinh sach mat khau - dac ta 8.1 (>= 10 ky tu, chan mat khau pho bien)
import { Err } from './errors';

const COMMON = new Set([
  'password12', 'password123', 'password1234', '1234567890', '12345678910', 'qwertyuiop',
  'qwerty12345', 'admin12345', 'administrator', 'letmein1234', 'welcome1234', 'iloveyou123',
  'tdc1234567', 'tdc@123456', 'doanhoi1234', 'thuduc12345',
]);

export function assertStrongPassword(pw: string, email?: string): void {
  if (pw.length < 10) {
    throw Err.bad('WEAK_PASSWORD', 'Mật khẩu phải có ít nhất 10 ký tự.');
  }
  const lower = pw.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(pw)) {
    throw Err.bad('WEAK_PASSWORD', 'Mật khẩu quá phổ biến, vui lòng chọn mật khẩu khác.');
  }
  // khong cho dung phan truoc @ cua email lam mat khau
  if (email && lower === email.split('@')[0].toLowerCase()) {
    throw Err.bad('WEAK_PASSWORD', 'Mật khẩu không được trùng với tên email.');
  }
}
