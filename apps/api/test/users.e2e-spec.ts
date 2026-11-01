// Test quan ly tai khoan quan tri - dac ta 3.7, 8.1
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { as, createTestApp, login, makeUser, PW, resetDb, Session, unitId } from './helpers';

describe('Tai khoan quan tri', () => {
  let app: INestApplication;
  let ds: DataSource;
  let admin: Session;
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
    admin = await login(app, 'admin@tdc.edu.vn');
  });

  const body = async (o: Record<string, unknown> = {}) => ({
    email: 'moi@tdc.edu.vn',
    fullName: 'Nguyen Van Moi',
    role: 'FACULTY_MANAGER',
    unitId: await unitId(ds, 'KT'),
    password: 'Mat-khau-ban-dau-2026!',
    ...o,
  });

  it('TU CHOI: quan ly khoa khong vao duoc quan ly tai khoan', async () => {
    await makeUser(ds, { email: 'cntt@tdc.edu.vn', role: 'FACULTY_MANAGER', unit: 'CNTT' });
    const s = await login(app, 'cntt@tdc.edu.vn');
    await as(app, s).get('/api/admin/users').expect(403);
    await as(app, s).post('/api/admin/users').send(await body()).expect(403);
    const other = await makeUser(ds, { email: 'kt@tdc.edu.vn', unit: 'KT' });
    await as(app, s).post(`/api/admin/users/${other.id}/lock`).send({ reason: 'thu nghiem' }).expect(403);
    await as(app, s).post(`/api/admin/users/${other.id}/reset-password`).send({ newPassword: 'Mat-khau-hacker-2026!' }).expect(403);
  });

  it('tao TK: khong tra password_hash, buoc doi mat khau, dang nhap duoc, nhat ky khong chua mat khau', async () => {
    const res = await as(app, admin).post('/api/admin/users').send(await body()).expect(201);
    expect(res.body).toMatchObject({ email: 'moi@tdc.edu.vn', role: 'FACULTY_MANAGER', mustChangePassword: true });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2|Mat-khau/i);
    await login(app, 'moi@tdc.edu.vn', 'Mat-khau-ban-dau-2026!');
    const logs = await as(app, admin).get('/api/admin/audit-logs?action=USER_CREATE').expect(200);
    expect(JSON.stringify(logs.body)).not.toMatch(/Mat-khau|argon2|passwordHash/i);
  });

  it('TU CHOI: mat khau yeu, email trung, sai vai tro/don vi, truong la', async () => {
    await as(app, admin).post('/api/admin/users').send(await body({ password: 'ngan' })).expect(400);
    await as(app, admin).post('/api/admin/users').send(await body({ password: 'password123' })).expect(400);
    await as(app, admin).post('/api/admin/users').send(await body({ email: 'sai-email' })).expect(400);
    await as(app, admin).post('/api/admin/users').send(await body({ isActive: false })).expect(400);
    // quan ly khoa nhung gan vao Doan truong / QTV truong nhung gan vao khoa
    const mismatch1 = await as(app, admin).post('/api/admin/users').send(await body({ unitId: await unitId(ds, 'DTN') })).expect(400);
    expect(mismatch1.body.code).toBe('ROLE_UNIT_MISMATCH');
    await as(app, admin).post('/api/admin/users').send(await body({ role: 'SCHOOL_ADMIN' })).expect(400);
    await as(app, admin).post('/api/admin/users').send(await body({ unitId: '00000000-0000-4000-8000-000000000000' })).expect(400);
    await as(app, admin).post('/api/admin/users').send(await body()).expect(201);
    const dup = await as(app, admin).post('/api/admin/users').send(await body({ email: 'MOI@tdc.edu.vn' })).expect(409);
    expect(dup.body.code).toBe('EMAIL_EXISTS');
  });

  it('khoa TK: dang xuat NGAY (token cu vo hieu, refresh bi thu hoi); mo khoa lai duoc', async () => {
    const u = await makeUser(ds, { email: 'cntt@tdc.edu.vn', unit: 'CNTT' });
    const s = await login(app, 'cntt@tdc.edu.vn');
    await as(app, s).get('/api/admin/units').expect(200);

    await as(app, admin).post(`/api/admin/users/${u.id}/lock`).send({ reason: 'Nghi ngo lo mat khau' }).expect(200);
    await as(app, s).get('/api/admin/units').expect(401);
    await http().post('/api/admin/auth/refresh').set('Cookie', s.cookie).expect(401);
    await http().post('/api/admin/auth/login').send({ email: 'cntt@tdc.edu.vn', password: PW }).expect(401);

    await as(app, admin).post(`/api/admin/users/${u.id}/unlock`).send({ reason: 'Da xac minh' }).expect(200);
    await login(app, 'cntt@tdc.edu.vn');
  });

  it('TU CHOI: tu khoa / tu xoa / tu doi vai tro cua chinh minh; thieu ly do', async () => {
    await as(app, admin).post(`/api/admin/users/${admin.id}/lock`).send({ reason: 'thu nghiem' }).expect(400);
    await as(app, admin).del(`/api/admin/users/${admin.id}`).send({ reason: 'thu nghiem' }).expect(400);
    await as(app, admin).patch(`/api/admin/users/${admin.id}`).send({ role: 'FACULTY_MANAGER', unitId: await unitId(ds, 'CNTT') }).expect(400);
    const u = await makeUser(ds, { email: 'cntt@tdc.edu.vn' });
    await as(app, admin).post(`/api/admin/users/${u.id}/lock`).send({}).expect(400);
  });

  it('TRANH TRANH CHAP: hai QTV cung luc khoa nhau thi van con it nhat 1 QTV hoat dong', async () => {
    const second = await makeUser(ds, { email: 'admin2@tdc.edu.vn', role: 'SCHOOL_ADMIN' });
    const s2 = await login(app, 'admin2@tdc.edu.vn');
    const results = await Promise.all([
      as(app, admin).post(`/api/admin/users/${second.id}/lock`).send({ reason: 'khoa nhau 1' }),
      as(app, s2).post(`/api/admin/users/${admin.id}/lock`).send({ reason: 'khoa nhau 2' }),
    ]);
    // it nhat mot yeu cau bi tu choi (400 LAST_SCHOOL_ADMIN hoac 401 do TK da bi khoa)
    expect(results.some((r) => r.status !== 200)).toBe(true);
    const active = await ds.query("SELECT COUNT(*) AS n FROM admin_users WHERE role = 'SCHOOL_ADMIN' AND is_active = 1");
    expect(Number(active[0].n)).toBeGreaterThanOrEqual(1);
  });

  it('QTV hoat dong ha quyen / khoa QTV khac duoc khi con QTV khac hoat dong', async () => {
    const second = await makeUser(ds, { email: 'admin2@tdc.edu.vn', role: 'SCHOOL_ADMIN' });
    await as(app, admin)
      .patch(`/api/admin/users/${second.id}`)
      .send({ role: 'FACULTY_MANAGER', unitId: await unitId(ds, 'CNTT') })
      .expect(200);
  });

  it('doi vai tro / don vi: thu hoi phien cu', async () => {
    const u = await makeUser(ds, { email: 'cntt@tdc.edu.vn', unit: 'CNTT' });
    const s = await login(app, 'cntt@tdc.edu.vn');
    const res = await as(app, admin).patch(`/api/admin/users/${u.id}`).send({ unitId: await unitId(ds, 'KT') }).expect(200);
    expect(res.body.unitId).toBe(await unitId(ds, 'KT'));
    await http().post('/api/admin/auth/refresh').set('Cookie', s.cookie).expect(401);
  });

  it('dat lai mat khau: buoc doi lai, thu hoi phien, mat khau yeu bi tu choi', async () => {
    const u = await makeUser(ds, { email: 'cntt@tdc.edu.vn' });
    const s = await login(app, 'cntt@tdc.edu.vn');
    await as(app, admin).post(`/api/admin/users/${u.id}/reset-password`).send({ newPassword: '123' }).expect(400);
    await as(app, admin).post(`/api/admin/users/${u.id}/reset-password`).send({ newPassword: 'Mat-khau-reset-2026!' }).expect(200);
    await http().post('/api/admin/auth/refresh').set('Cookie', s.cookie).expect(401);
    const s2 = await login(app, 'cntt@tdc.edu.vn', 'Mat-khau-reset-2026!');
    const blocked = await as(app, s2).get('/api/admin/units').expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('xoa cung: TK chua tung thao tac -> xoa duoc; TK da dang nhap -> 409 chi khoa', async () => {
    const fresh = await as(app, admin).post('/api/admin/users').send(await body()).expect(201);
    await as(app, admin).del(`/api/admin/users/${fresh.body.id}`).send({ reason: 'tao nham' }).expect(204);
    await as(app, admin).get(`/api/admin/users/${fresh.body.id}`).expect(404);

    const used = await makeUser(ds, { email: 'cntt@tdc.edu.vn' });
    await login(app, 'cntt@tdc.edu.vn'); // ghi nhat ky LOGIN
    const res = await as(app, admin).del(`/api/admin/users/${used.id}`).send({ reason: 'nghi viec' }).expect(409);
    expect(res.body.code).toBe('USER_HAS_ACTIVITY');
  });

  it('danh sach: loc theo don vi, tim kiem (ky tu dac biet LIKE khong pha logic), phan trang', async () => {
    await makeUser(ds, { email: 'a_b@tdc.edu.vn', unit: 'KT' });
    await makeUser(ds, { email: 'axb@tdc.edu.vn', unit: 'KT' });
    await makeUser(ds, { email: 'c@tdc.edu.vn', unit: 'CNTT' });
    const kt = await as(app, admin).get(`/api/admin/users?unitId=${await unitId(ds, 'KT')}`).expect(200);
    expect(kt.body.total).toBe(2);
    const q = await as(app, admin).get('/api/admin/users?q=a_b').expect(200);
    expect(q.body.items.map((u: any) => u.email)).toEqual(['a_b@tdc.edu.vn']); // dau _ khong phai ky tu thay the
    const page = await as(app, admin).get('/api/admin/users?limit=2&page=2').expect(200);
    expect(page.body).toMatchObject({ page: 2, limit: 2, total: 4 });
    await as(app, admin).get('/api/admin/users?limit=1000').expect(400);
  });
});
