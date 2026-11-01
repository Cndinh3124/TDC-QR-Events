// Test cau hinh he thong va nhat ky - dac ta 3.8, 8.6
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { as, createTestApp, login, makeUser, resetDb, Session } from './helpers';

describe('Cau hinh he thong', () => {
  let app: INestApplication;
  let ds: DataSource;
  let admin: Session;
  let faculty: Session;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    ds = await resetDb(app);
    await makeUser(ds, { email: 'admin@tdc.edu.vn', role: 'SCHOOL_ADMIN' });
    await makeUser(ds, { email: 'cntt@tdc.edu.vn' });
    admin = await login(app, 'admin@tdc.edu.vn');
    faculty = await login(app, 'cntt@tdc.edu.vn');
  });

  it('gia tri mac dinh dung dac ta: MSSV 24211TM1152, khieu nai 7 ngay', async () => {
    const res = await as(app, admin).get('/api/admin/settings').expect(200);
    expect(res.body).toMatchObject({
      appeal_days: 7,
      default_open_before_min: 30,
      default_grace_min: 15,
      data_retention_months: 6,
    });
    const re = new RegExp(res.body.mssv_regex);
    expect(re.test('24211TM1152')).toBe(true);
    expect(re.test('24211tm1152')).toBe(false);
    expect(re.test('2421TM1152')).toBe(false);
  });

  it('TU CHOI: quan ly khoa khong doc / sua duoc cau hinh', async () => {
    await as(app, faculty).get('/api/admin/settings').expect(403);
    await as(app, faculty).patch('/api/admin/settings').send({ appeal_days: 30 }).expect(403);
  });

  it('cap nhat hop le, ghi nhat ky truoc-sau', async () => {
    const res = await as(app, admin).patch('/api/admin/settings').send({ appeal_days: 10, default_grace_min: 20 }).expect(200);
    expect(res.body.appeal_days).toBe(10);
    const logs = await as(app, admin).get('/api/admin/audit-logs?action=SETTINGS_UPDATE').expect(200);
    expect(logs.body.items[0].beforeJson).toEqual({ appeal_days: 7, default_grace_min: 15 });
    expect(logs.body.items[0].afterJson).toEqual({ appeal_days: 10, default_grace_min: 20 });
  });

  it('TU CHOI: khoa la, gia tri sai kieu / ngoai khoang, body rong, mang', async () => {
    await as(app, admin).patch('/api/admin/settings').send({ jwt_secret: 'x' }).expect(400);
    await as(app, admin).patch('/api/admin/settings').send({ appeal_days: 0 }).expect(400);
    await as(app, admin).patch('/api/admin/settings').send({ appeal_days: 9999 }).expect(400);
    await as(app, admin).patch('/api/admin/settings').send({ appeal_days: '7' }).expect(400);
    await as(app, admin).patch('/api/admin/settings').send({ appeal_days: 1.5 }).expect(400);
    await as(app, admin).patch('/api/admin/settings').send({}).expect(400);
    await as(app, admin).patch('/api/admin/settings').send([{ appeal_days: 3 }]).expect(400);
  });

  it('TU CHOI: mot khoa sai thi KHONG khoa nao duoc ghi', async () => {
    await as(app, admin).patch('/api/admin/settings').send({ appeal_days: 20, default_grace_min: -5 }).expect(400);
    const res = await as(app, admin).get('/api/admin/settings').expect(200);
    expect(res.body.appeal_days).toBe(7);
  });

  it('TU CHOI: bieu thuc MSSV loi / dang ReDoS / khong khop mau mau', async () => {
    await as(app, admin).patch('/api/admin/settings').send({ mssv_regex: '([' }).expect(400);
    await as(app, admin).patch('/api/admin/settings').send({ mssv_regex: '^(a+)+$' }).expect(400);
    await as(app, admin).patch('/api/admin/settings').send({ mssv_regex: '^\\d{3}$' }).expect(400); // khong khop 24211TM1152
    await as(app, admin).patch('/api/admin/settings').send({ mssv_regex: 'x'.repeat(201) }).expect(400);
    await as(app, admin).patch('/api/admin/settings').send({ mssv_regex: 123 }).expect(400);
  });

  it('doi bieu thuc MSSV hop le (mo rong sang 12 ky tu)', async () => {
    const re = '^\\d{5}[A-Z]{2}\\d{4,5}$';
    const res = await as(app, admin).patch('/api/admin/settings').send({ mssv_regex: re }).expect(200);
    expect(res.body.mssv_regex).toBe(re);
  });
});

describe('Nhat ky he thong', () => {
  let app: INestApplication;
  let ds: DataSource;
  let admin: Session;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    ds = await resetDb(app);
    await makeUser(ds, { email: 'admin@tdc.edu.vn', role: 'SCHOOL_ADMIN' });
    admin = await login(app, 'admin@tdc.edu.vn');
  });

  it('ghi nhat ky dang nhap (kem IP) va loc theo nguoi thuc hien', async () => {
    const res = await as(app, admin).get(`/api/admin/audit-logs?actorId=${admin.id}&action=LOGIN`).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({ action: 'LOGIN', entity: 'user', actorId: admin.id });
    expect(res.body.items[0].ip).toBeTruthy();
  });

  it('TU CHOI: quan ly khoa khong xem duoc nhat ky', async () => {
    await makeUser(ds, { email: 'cntt@tdc.edu.vn' });
    const s = await login(app, 'cntt@tdc.edu.vn');
    await as(app, s).get('/api/admin/audit-logs').expect(403);
  });

  it('CHI DOC: khong co API sua / xoa nhat ky', async () => {
    await as(app, admin).del('/api/admin/audit-logs/1').expect(404);
    await as(app, admin).patch('/api/admin/audit-logs/1').send({ action: 'X' }).expect(404);
    await as(app, admin).post('/api/admin/audit-logs').send({ action: 'X' }).expect(404);
    await as(app, admin).del('/api/admin/audit-logs').expect(404);
  });

  it('loc theo khoang thoi gian + kiem tra tham so', async () => {
    const future = encodeURIComponent(new Date(Date.now() + 86400000).toISOString());
    const none = await as(app, admin).get(`/api/admin/audit-logs?from=${future}`).expect(200);
    expect(none.body.total).toBe(0);
    await as(app, admin).get('/api/admin/audit-logs?from=khong-phai-ngay').expect(400);
    await as(app, admin).get('/api/admin/audit-logs?page=0').expect(400);
  });

  it('nhat ky khong chua mat khau / hash / token', async () => {
    await as(app, admin)
      .post('/api/admin/users')
      .send({ email: 'x@tdc.edu.vn', fullName: 'Nguoi X', role: 'FACULTY_MANAGER', unitId: (await ds.query("SELECT id FROM units WHERE code='KT'"))[0].id, password: 'Mat-khau-bi-mat-2026!' })
      .expect(201);
    const all = await as(app, admin).get('/api/admin/audit-logs?limit=100').expect(200);
    expect(JSON.stringify(all.body)).not.toMatch(/Mat-khau-bi-mat|argon2|passwordHash|tdc_rt/i);
  });
});

describe('Healthz', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('cong khai, khong can dang nhap, chi tra trang thai', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app.getHttpServer()).get('/api/healthz').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('Header bao mat', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('CSP chat, khong lo X-Powered-By, chong nhung khung', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app.getHttpServer()).get('/api/healthz').expect(200);
    expect(res.headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('TU CHOI: body qua 100 KB', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email: 'a@b.vn', password: 'x'.repeat(150_000) })
      .expect(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('TU CHOI: JSON hong -> 400 (khong phai 500)', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ')
      .expect(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });
});
