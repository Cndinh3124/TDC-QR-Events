// Hang so cua duong diem danh cong khai - dac ta 3.4, 4, 5, 8.4
export const DEVICE_COOKIE = 'tdc_dev';
// ban sao cookie giu o localStorage cua client, gui lai khi cookie bi xoa; van kiem HMAC nen khong gia duoc
export const DEVICE_HEADER = 'x-device-token';
export const DEVICE_COOKIE_PATH = '/api/public'; // [BM] cookie chi gui toi nhom API nay
export const DEVICE_COOKIE_MAX_AGE_MS = 365 * 24 * 3600_000; // dac ta 4: 1 nam

export const MAX_EDITS = 3; // [NV] 3.4

// [BM] gioi han nhap sai ma 4 so (chi co 10.000 kha nang) - dac ta 5.2
export const CODE_MAX_FAILS = 5; // moi luot diem danh
export const CODE_LOCK_MS = 15 * 60_000;
export const EVENT_CODE_FAIL_LIMIT = 500; // tran chung cua su kien trong mot cua so, vi cookie thiet bi tao mien phi
export const EVENT_CODE_WINDOW_MS = 10 * 60_000;

export const GPS_LOW_ACCURACY_M = 150; // [NV] 5.3
export const BURST_WINDOW_MS = 60_000; // [NV] 5.3
export const BURST_MIN_MSSV = 3;
export const MAX_MSSV_LEN = 20; // = do dai cot, du khi QTV doi bieu thuc MSSV

export const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/; // 128-bit base64url, xem QrService.newToken
