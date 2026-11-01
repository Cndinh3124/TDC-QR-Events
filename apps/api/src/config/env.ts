// Doc + kiem tra bien moi truong luc khoi dong - dac ta 8.5
// [BM] thieu hoac yeu thi ung dung KHONG chay, khong dung gia tri mac dinh cho bi mat.

export interface AppEnv {
  nodeEnv: string;
  port: number;
  db: { host: string; port: number; user: string; password: string; name: string; ssl: boolean };
  jwtAccessSecret: string;
  cookieSecure: boolean;
  trustProxy: boolean;
  loginRateLimitPerMin: number;
  globalRateLimitPerMin: number;
  // goc URL trang diem danh cong khai, dung de dung noi dung ma QR - dac ta 3.2
  publicBaseUrl: string;
  // [BM] khoa HMAC ky cookie thiet bi (dac ta 4); rieng voi JWT de lo mot khoa khong keo theo khoa kia
  deviceSecret: string;
  // gioi han tan suat diem danh cong khai (dac ta 8.4); IP chi o muc chong DDoS vi ca hoi truong dung chung IP
  publicDeviceRateLimitPerMin: number;
  publicEditRateLimitPerHour: number;
  publicIpRateLimitPerMin: number;
  publicNoCookieRateLimitPerMin: number;
  // worker nen danh gia luat gan co; test tat de tu goi tay cho on dinh
  flagWorkerEnabled: boolean;
  // thu muc chua cum3logo.png de thay logo di kem trong PDF; rong = dung logo dong goi san (assets/brand)
  brandDir: string;
}

const WEAK = /^(change|secret|password|test|example|default|12345|qwerty)/i;

function required(src: NodeJS.ProcessEnv, key: string): string {
  const v = src[key];
  if (!v || !v.trim()) throw new Error(`Thieu bien moi truong bat buoc: ${key}`);
  return v.trim();
}

function toInt(src: NodeJS.ProcessEnv, key: string, def: number): number {
  const raw = src[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Bien ${key} phai la so nguyen khong am`);
  return n;
}

// [BM] ma QR in ra giay khong sua duoc, nen production bat buoc khai bao ro va dung https
function parseBaseUrl(src: NodeJS.ProcessEnv, nodeEnv: string): string {
  const raw = (src.PUBLIC_BASE_URL || '').trim();
  if (!raw) {
    if (nodeEnv === 'production') throw new Error('Thieu bien moi truong bat buoc: PUBLIC_BASE_URL');
    return 'http://localhost:5173';
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('PUBLIC_BASE_URL khong phai URL hop le');
  }
  if (nodeEnv === 'production' && url.protocol !== 'https:') throw new Error('PUBLIC_BASE_URL phai dung https o production');
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('PUBLIC_BASE_URL phai la http(s)');
  return url.origin;
}

export function loadEnv(src: NodeJS.ProcessEnv = process.env): AppEnv {
  const nodeEnv = src.NODE_ENV || 'development';
  const secret = required(src, 'JWT_ACCESS_SECRET');
  // [BM] bi mat JWT toi thieu 32 ky tu, khong bat dau bang tu de doan
  if (secret.length < 32 || WEAK.test(secret)) {
    throw new Error('JWT_ACCESS_SECRET qua yeu: can >= 32 ky tu ngau nhien');
  }
  const deviceSecret = required(src, 'DEVICE_SECRET');
  if (deviceSecret.length < 32 || WEAK.test(deviceSecret)) {
    throw new Error('DEVICE_SECRET qua yeu: can >= 32 ky tu ngau nhien');
  }
  if (deviceSecret === secret) throw new Error('DEVICE_SECRET phai khac JWT_ACCESS_SECRET');
  const password = required(src, 'DB_PASSWORD');
  if (nodeEnv === 'production' && WEAK.test(password)) {
    throw new Error('DB_PASSWORD qua yeu cho moi truong production');
  }
  return {
    nodeEnv,
    port: toInt(src, 'PORT', 3000),
    db: {
      host: required(src, 'DB_HOST'),
      port: toInt(src, 'DB_PORT', 3306),
      user: required(src, 'DB_USER'),
      password,
      name: required(src, 'DB_NAME'),
      ssl: src.DB_SSL === 'true',
    },
    jwtAccessSecret: secret,
    // [BM] cookie Secure bat mac dinh o production
    cookieSecure: src.COOKIE_SECURE ? src.COOKIE_SECURE === 'true' : nodeEnv === 'production',
    trustProxy: src.TRUST_PROXY === 'true',
    loginRateLimitPerMin: toInt(src, 'LOGIN_RATE_LIMIT_PER_MIN', 5),
    // gioi han chung chi o muc chong DDoS (dac ta 8.4)
    globalRateLimitPerMin: toInt(src, 'GLOBAL_RATE_LIMIT_PER_MIN', 3000),
    deviceSecret,
    publicDeviceRateLimitPerMin: toInt(src, 'PUBLIC_DEVICE_RATE_LIMIT_PER_MIN', 10),
    publicEditRateLimitPerHour: toInt(src, 'PUBLIC_EDIT_RATE_LIMIT_PER_HOUR', 5),
    publicIpRateLimitPerMin: toInt(src, 'PUBLIC_IP_RATE_LIMIT_PER_MIN', 20000),
    publicNoCookieRateLimitPerMin: toInt(src, 'PUBLIC_NO_COOKIE_RATE_LIMIT_PER_MIN', 120),
    flagWorkerEnabled: src.FLAG_WORKER_ENABLED !== 'false',
    publicBaseUrl: parseBaseUrl(src, nodeEnv),
    brandDir: (src.BRAND_DIR || '').trim(),
  };
}
