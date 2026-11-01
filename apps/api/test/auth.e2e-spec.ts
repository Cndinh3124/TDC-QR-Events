// Test xac thuc - dac ta 8.1, 8.2. Gom ca truong hop bi tu choi.
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { loadEnv } from '../src/config/env';
import { AdminUser } from '../src/users/entities/admin-user.entity';
import { as, createTestApp, login, makeUser, PW, resetDb } from './helpers';

describe('Xac thuc quan tri', () => {
  let app: INestApplication;
  let ds: DataSource;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    ds = await resetDb(app);
    await makeUser(ds, { email: 'admin@tdc.edu.vn', role: 'SCHOOL_ADMIN' });
  });

  it('dang nhap dung: tra access token, cookie httpOnly, khong lo password_hash', async () => {
    const res = await http().post('/api/admin/auth/login').send({ email: 'ADMIN@tdc.edu.vn', password: PW }).expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe('admin@tdc.edu.vn');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|argon2/i);
    const cookie = String(([] as string[]).concat(res.headers['set-cookie'] as any)[0]);
    expect(cookie).toMatch(/tdc_rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/admin\/auth/);
  });

  it('TU CHOI: sai mat khau va TK khong ton tai cung mot thong bao', async () => {
    const a = await http().post('/api/admin/auth/login').send({ email: 'admin@tdc.edu.vn', password: 'sai-mat-khau-1' }).expect(401);
    const b = await http().post('/api/admin/auth/login').send({ email: 'khong.co@tdc.edu.vn', password: 'sai-mat-khau-1' }).expect(401);
    expect(a.body).toEqual(b.body);
    expect(a.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('TU CHOI: khoa tam sau 5 lan sai, ke ca nhap dung mat khau; het han khoa thi vao duoc', async () => {
    for (let i = 0; i < 5; i++) {
      await http().post('/api/admin/auth/login').send({ email: 'admin@tdc.edu.vn', password: 'sai-mat-khau-1' }).expect(401);
    }
    const locked = await http().post('/api/admin/auth/login').send({ email: 'admin@tdc.edu.vn', password: PW }).expect(401);
    expect(locked.body.code).toBe('INVALID_CREDENTIALS'); // [BM] khong lo TK dang bi khoa

    await ds.getRepository(AdminUser).update({ email: 'admin@tdc.edu.vn' }, { lockedUntil: new Date(Date.now() - 1000) });
    await http().post('/api/admin/auth/login').send({ email: 'admin@tdc.edu.vn', password: PW }).expect(200);
  });

  it('TU CHOI: du lieu dang nhap xau (thieu truong, truong la, kieu sai)', async () => {
    await http().post('/api/admin/auth/login').send({ email: 'khong-phai-email', password: PW }).expect(400);
    await http().post('/api/admin/auth/login').send({ email: 'admin@tdc.edu.vn' }).expect(400);
    await http().post('/api/admin/auth/login').send({ email: 'admin@tdc.edu.vn', password: PW, role: 'SCHOOL_ADMIN' }).expect(400);
    await http().post('/api/admin/auth/login').send({ email: { $ne: null }, password: PW }).expect(400);
  });

  it('TU CHOI: API quan tri khong co token / token gia / token het hieu luc', async () => {
    await http().get('/api/admin/units').expect(401);
    await http().get('/api/admin/units').set('Authorization', 'Bearer abc.def.ghi').expect(401);
    await http().get('/api/admin/units').set('Authorization', 'Basic xxx').expect(401);
    // token ky bang khoa khac
    const jwt = await import('jsonwebtoken');
    const u = await ds.getRepository(AdminUser).findOneByOrFail({ email: 'admin@tdc.edu.vn' });
    const forged = jwt.sign({ sub: u.id }, 'khoa-gia-khong-phai-cua-server-0123456789');
    await http().get('/api/admin/units').set('Authorization', `Bearer ${forged}`).expect(401);
    // alg none
    const none = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url') + '.' + Buffer.from(`{"sub":"${u.id}"}`).toString('base64url') + '.';
    await http().get('/api/admin/units').set('Authorization', `Bearer ${none}`).expect(401);
  });

  it('TU CHOI: TK bi khoa thi token dang dung vo hieu NGAY', async () => {
    const s = await login(app, 'admin@tdc.edu.vn');
    await as(app, s).get('/api/admin/units').expect(200);
    await ds.getRepository(AdminUser).update({ id: s.id }, { isActive: false });
    await as(app, s).get('/api/admin/units').expect(401);
  });

  it('refresh: xoay vong token; dung lai token cu bi tu choi va thu hoi het phien', async () => {
    const s = await login(app, 'admin@tdc.edu.vn');
    const r1 = await http().post('/api/admin/auth/refresh').set('Cookie', s.cookie).expect(200);
    const cookie2 = String(([] as string[]).concat(r1.headers['set-cookie'] as any)[0]).split(';')[0];
    expect(cookie2).not.toBe(s.cookie);

    // dung lai token cu -> nghi bi danh cap
    await http().post('/api/admin/auth/refresh').set('Cookie', s.cookie).expect(401);
    // token moi cung bi thu hoi theo
    await http().post('/api/admin/auth/refresh').set('Cookie', cookie2).expect(401);
  });

  it('TU CHOI: refresh khong cookie / cookie gia / Origin la (CSRF)', async () => {
    await http().post('/api/admin/auth/refresh').expect(401);
    await http().post('/api/admin/auth/refresh').set('Cookie', 'tdc_rt=gia-mao').expect(401);
    const s = await login(app, 'admin@tdc.edu.vn');
    await http().post('/api/admin/auth/refresh').set('Cookie', s.cookie).set('Origin', 'https://trang-doc-hai.example').expect(403);
  });

  it('dang xuat thu hoi refresh token', async () => {
    const s = await login(app, 'admin@tdc.edu.vn');
    await http().post('/api/admin/auth/logout').set('Cookie', s.cookie).expect(204);
    await http().post('/api/admin/auth/refresh').set('Cookie', s.cookie).expect(401);
  });

  it('TK bi buoc doi mat khau: chi vao duoc me / doi mat khau', async () => {
    await makeUser(ds, { email: 'moi@tdc.edu.vn', role: 'FACULTY_MANAGER', mustChange: true });
    const s = await login(app, 'moi@tdc.edu.vn');
    const blocked = await as(app, s).get('/api/admin/units').expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await as(app, s).get('/api/admin/auth/me').expect(200);

    // mat khau moi yeu / trung cu / sai mat khau hien tai -> tu choi
    await as(app, s).patch('/api/admin/auth/password').send({ currentPassword: PW, newPassword: 'ngan' }).expect(400);
    await as(app, s).patch('/api/admin/auth/password').send({ currentPassword: PW, newPassword: PW }).expect(400);
    await as(app, s).patch('/api/admin/auth/password').send({ currentPassword: 'sai-hien-tai-1', newPassword: 'Mat-khau-moi-2026!' }).expect(400);

    const ok = await as(app, s).patch('/api/admin/auth/password').send({ currentPassword: PW, newPassword: 'Mat-khau-moi-2026!' }).expect(200);
    // phien moi dung duoc ngay, phien/refresh cu bi thu hoi
    await request(app.getHttpServer()).get('/api/admin/units').set('Authorization', `Bearer ${ok.body.accessToken}`).expect(200);
    await http().post('/api/admin/auth/refresh').set('Cookie', s.cookie).expect(401);
    await login(app, 'moi@tdc.edu.vn', 'Mat-khau-moi-2026!');
  });

  it('khoi dong: bi mat JWT yeu / thieu -> tu choi chay', () => {
    const base = { DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p-dai-du-manh-123', DB_NAME: 'd', DEVICE_SECRET: 'Kd83mZq1Wx7Lp4Vn9Rt2Yb6Hc0FgJsUeAoXiMq5Bv3' };
    expect(() => loadEnv({ ...base } as any)).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'ngan' } as any)).toThrow(/qua yeu/);
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'changeme-changeme-changeme-changeme-0000' } as any)).toThrow(/qua yeu/);
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'x7Qm2Vb9Lk4Zp8Wt3Rn6Yc1Hd5Fg0JsAeUo' } as any)).not.toThrow();
  });

  it('[BM] khoi dong: DEVICE_SECRET thieu / yeu / trung khoa JWT -> tu choi chay', () => {
    const jwt = 'x7Qm2Vb9Lk4Zp8Wt3Rn6Yc1Hd5Fg0JsAeUo7XiMq2Bv';
    const base = { DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p-dai-du-manh-123', DB_NAME: 'd', JWT_ACCESS_SECRET: jwt };
    expect(() => loadEnv({ ...base } as any)).toThrow(/DEVICE_SECRET/);
    expect(() => loadEnv({ ...base, DEVICE_SECRET: 'ngan' } as any)).toThrow(/DEVICE_SECRET qua yeu/);
    expect(() => loadEnv({ ...base, DEVICE_SECRET: 'changeme-changeme-changeme-changeme-0000' } as any)).toThrow(/DEVICE_SECRET qua yeu/);
    expect(() => loadEnv({ ...base, DEVICE_SECRET: jwt } as any)).toThrow(/khac JWT_ACCESS_SECRET/);
    expect(loadEnv({ ...base, DEVICE_SECRET: 'Kd83mZq1Wx7Lp4Vn9Rt2Yb6Hc0FgJsUeAoXiMq5Bv3' } as any).deviceSecret).toHaveLength(42);
    expect(loadEnv({ ...base, DEVICE_SECRET: 'Kd83mZq1Wx7Lp4Vn9Rt2Yb6Hc0FgJsUeAoXiMq5Bv3' } as any)).toMatchObject({
      publicDeviceRateLimitPerMin: 10, publicEditRateLimitPerHour: 5, publicIpRateLimitPerMin: 20000, publicNoCookieRateLimitPerMin: 120, flagWorkerEnabled: true,
    });
    expect(loadEnv({ ...base, DEVICE_SECRET: 'Kd83mZq1Wx7Lp4Vn9Rt2Yb6Hc0FgJsUeAoXiMq5Bv3', FLAG_WORKER_ENABLED: 'false' } as any).flagWorkerEnabled).toBe(false);
  });
});
