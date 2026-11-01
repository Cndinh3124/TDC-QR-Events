// Bien moi truong cho test - chay truoc moi file test. Dung DB rieng tdc_qr_test.
process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.TEST_DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.TEST_DB_PORT || '3306';
process.env.DB_USER = process.env.TEST_DB_USER || 'tdc_app';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'dev_only_pw_123';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'tdc_qr_test';
process.env.JWT_ACCESS_SECRET = 'x7Qm2Vb9Lk4Zp8Wt3Rn6Yc1Hd5Fg0JsAeUo7XiMq2Bv';
process.env.COOKIE_SECURE = 'false';
process.env.LOGIN_RATE_LIMIT_PER_MIN = '1000';
process.env.GLOBAL_RATE_LIMIT_PER_MIN = '100000';
process.env.DEVICE_SECRET = 'Kd83mZq1Wx7Lp4Vn9Rt2Yb6Hc0FgJsUeAoXiMq5Bv3';
process.env.FLAG_WORKER_ENABLED = 'false'; // test tu goi worker bang tay
// gioi han diem danh cong khai de rong cho test thong thuong; test gioi han tu dat gia tri nho
process.env.PUBLIC_DEVICE_RATE_LIMIT_PER_MIN = '1000';
process.env.PUBLIC_EDIT_RATE_LIMIT_PER_HOUR = '1000';
process.env.PUBLIC_NO_COOKIE_RATE_LIMIT_PER_MIN = '100000';
process.env.PUBLIC_IP_RATE_LIMIT_PER_MIN = '1000000';
