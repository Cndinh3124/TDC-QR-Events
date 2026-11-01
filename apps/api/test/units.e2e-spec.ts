// Test quan ly khoa + pham vi don vi - dac ta 2.3, 3.7, 8.2
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { as, createTestApp, login, makeUser, resetDb, Session, unitId } from './helpers';

describe('Don vi (khoa)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let admin: Session;
  let cntt: Session;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    ds = await resetDb(app);
    await makeUser(ds, { email: 'admin@tdc.edu.vn', role: 'SCHOOL_ADMIN' });
    await makeUser(ds, { email: 'cntt@tdc.edu.vn', role: 'FACULTY_MANAGER', unit: 'CNTT' });
    admin = await login(app, 'admin@tdc.edu.vn');
    cntt = await login(app, 'cntt@tdc.edu.vn');
  });

  it('QTV truong thay du 10 don vi (Doan truong + 9 khoa)', async () => {
    const res = await as(app, admin).get('/api/admin/units?limit=100').expect(200);
    expect(res.body.total).toBe(10);
    expect(res.body.items.filter((u: any) => u.type === 'FACULTY')).toHaveLength(9);
    expect(res.body.items.map((u: any) => u.code)).toContain('DLKS');
  });

  it('PHAM VI: quan ly khoa chi thay khoa minh; xem khoa khac -> 404 (khong lo ton tai)', async () => {
    const list = await as(app, cntt).get('/api/admin/units').expect(200);
    expect(list.body.items.map((u: any) => u.code)).toEqual(['CNTT']);
    const kt = await unitId(ds, 'KT');
    await as(app, cntt).get(`/api/admin/units/${kt}`).expect(404);
    await as(app, cntt).get(`/api/admin/units/${await unitId(ds, 'CNTT')}`).expect(200);
  });

  it('TU CHOI: quan ly khoa khong them / sua / khoa / xoa duoc don vi', async () => {
    const id = await unitId(ds, 'CNTT');
    await as(app, cntt).post('/api/admin/units').send({ name: 'Khoa Moi', code: 'MOI' }).expect(403);
    await as(app, cntt).patch(`/api/admin/units/${id}`).send({ name: 'Doi ten' }).expect(403);
    await as(app, cntt).post(`/api/admin/units/${id}/deactivate`).send({ reason: 'thu' }).expect(403);
    await as(app, cntt).del(`/api/admin/units/${id}`).send({ reason: 'thu' }).expect(403);
  });

  it('them khoa moi: thuoc Doan truong, ma tu dong viet hoa, nhat ky duoc ghi', async () => {
    const res = await as(app, admin).post('/api/admin/units').send({ name: 'Khoa Moi', code: ' moi1 ' }).expect(201);
    expect(res.body).toMatchObject({ code: 'MOI1', type: 'FACULTY', isActive: true });
    expect(res.body.parentId).toBe(await unitId(ds, 'DTN'));
    const logs = await as(app, admin).get('/api/admin/audit-logs?action=UNIT_CREATE').expect(200);
    expect(logs.body.total).toBe(1);
  });

  it('TU CHOI: ma trung (409), ma sai dinh dang (400), truong la (400), id sai (400)', async () => {
    await as(app, admin).post('/api/admin/units').send({ name: 'Khoa Trung', code: 'cntt' }).expect(409);
    await as(app, admin).post('/api/admin/units').send({ name: 'Khoa', code: 'a b!' }).expect(400);
    await as(app, admin).post('/api/admin/units').send({ name: 'Khoa Hay', code: 'HAY', type: 'SCHOOL' }).expect(400);
    await as(app, admin).get('/api/admin/units/khong-phai-uuid').expect(400);
  });

  it('sua ten / ma khoa, ghi truoc-sau vao nhat ky', async () => {
    const id = await unitId(ds, 'DP');
    const res = await as(app, admin).patch(`/api/admin/units/${id}`).send({ name: 'Khoa Dong phuong hoc' }).expect(200);
    expect(res.body.name).toBe('Khoa Dong phuong hoc');
    const logs = await as(app, admin).get('/api/admin/audit-logs?action=UNIT_UPDATE').expect(200);
    expect(logs.body.items[0].beforeJson.name).toBe('Khoa Đông phương');
  });

  it('TU CHOI: khong ngung hoat dong / xoa Doan truong; thieu ly do bi tu choi', async () => {
    const school = await unitId(ds, 'DTN');
    await as(app, admin).post(`/api/admin/units/${school}/deactivate`).send({ reason: 'thu nghiem' }).expect(400);
    await as(app, admin).del(`/api/admin/units/${school}`).send({ reason: 'thu nghiem' }).expect(400);
    await as(app, admin).post(`/api/admin/units/${await unitId(ds, 'DP')}/deactivate`).send({}).expect(400);
  });

  it('ngung hoat dong roi kich hoat lai; khong the gan TK moi vao khoa da ngung', async () => {
    const dp = await unitId(ds, 'DP');
    await as(app, admin).post(`/api/admin/units/${dp}/deactivate`).send({ reason: 'Khoa sap nhap' }).expect(200);
    await as(app, admin)
      .post('/api/admin/users')
      .send({ email: 'dp@tdc.edu.vn', fullName: 'Nguoi DP', role: 'FACULTY_MANAGER', unitId: dp, password: 'Mat-khau-manh-2026!' })
      .expect(400);
    const res = await as(app, admin).post(`/api/admin/units/${dp}/activate`).send({ reason: 'Giu lai' }).expect(200);
    expect(res.body.isActive).toBe(true);
  });

  it('xoa cung: khoa dang co tai khoan -> 409; khoa trong -> xoa duoc', async () => {
    await as(app, admin).del(`/api/admin/units/${await unitId(ds, 'CNTT')}`).send({ reason: 'xoa thu' }).expect(409);
    const created = await as(app, admin).post('/api/admin/units').send({ name: 'Khoa Tam', code: 'TAM' }).expect(201);
    await as(app, admin).del(`/api/admin/units/${created.body.id}`).send({ reason: 'tao nham' }).expect(204);
    await as(app, admin).get(`/api/admin/units/${created.body.id}`).expect(404);
  });
});
