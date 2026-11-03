// Test lich thang (A13): hoat dong + buoi diem danh giao voi khoang ngay, theo pham vi nguoi xem
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { as, createTestApp, login, makeUser, Session } from './helpers';
import { openEvent, setupWorld, World } from './public-helpers';

const DAY = 86_400_000;
// ngay theo gio Viet Nam
const vn = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

describe('Lich hoat dong (A13)', () => {
  let app: INestApplication;
  let w: World;
  let kt: Session;
  let yearId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    w = await setupWorld(app);
    await makeUser(w.ds, { email: 'kt@tdc.edu.vn', unit: 'KT' });
    kt = await login(app, 'kt@tdc.edu.vn');
    yearId = (await as(app, w.admin).post('/api/admin/academic-years')
      .send({ name: '2026–2027', startDate: vn(Date.now() - 90 * DAY), endDate: vn(Date.now() + 270 * DAY) }).expect(201)).body.id;
  });

  const activity = async (s: Session, name: string, startMs: number, endMs: number, o: Record<string, unknown> = {}) =>
    (await as(app, s).post('/api/admin/activities')
      .send({ academicYearId: yearId, name, startAt: iso(startMs), endAt: iso(endMs), ...o }).expect(201)).body;
  const cal = (s: Session, from: number, to: number, extra = '') =>
    as(app, s).get(`/api/admin/activity-calendar?from=${vn(Date.now() + from)}&to=${vn(Date.now() + to)}${extra}`);

  it('tra hoat dong va su kien giao voi khoang ngay (ke ca hoat dong keo dai qua dau thang), bo hoat dong ngoai khoang', async () => {
    await activity(w.cntt, 'Chiến dịch dài ngày', -20 * DAY, 20 * DAY);
    await activity(w.cntt, 'Trong tuần', 2 * DAY, 2 * DAY + 3_600_000);
    await activity(w.cntt, 'Ngoài khoảng', 40 * DAY, 41 * DAY);
    await openEvent(w, { unitId: w.faculty, title: 'Buổi điểm danh khoa' });
    const res = await cal(w.cntt, -3 * DAY, 10 * DAY).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.activities.map((a: any) => a.name)).toEqual(['Chiến dịch dài ngày', 'Trong tuần']);
    expect(res.body.activities[0]).toMatchObject({ status: 'DRAFT', coUnit: false, unit: { id: w.faculty } });
    expect(res.body.events.map((e: any) => e.title)).toEqual(['Buổi điểm danh khoa']);
    expect(res.body.events[0]).toMatchObject({ canManage: true });
    expect(res.body.truncated).toBe(false);
  });

  it('[BM] pham vi: khoa khac khong thay; don vi phoi hop thay va danh dau coUnit; su kien truong chi thay khi duoc chia se', async () => {
    await activity(w.cntt, 'Hoạt động CNTT', DAY, 2 * DAY);
    await activity(w.cntt, 'Phối hợp với KT', DAY, 2 * DAY, { coUnitIds: [w.faculty2] });
    const school = await openEvent(w, { title: 'Sự kiện cấp trường' });
    let res = (await cal(kt, -DAY, 5 * DAY).expect(200)).body;
    expect(res.activities.map((a: any) => [a.name, a.coUnit])).toEqual([['Phối hợp với KT', true]]);
    expect(res.events).toEqual([]);
    await as(app, w.admin).post(`/api/admin/events/${school.id}/faculty-view`).send({ mode: 'ALL', reason: 'Chia se cho cac khoa' }).expect(200);
    res = (await cal(kt, -DAY, 5 * DAY).expect(200)).body;
    expect(res.events).toEqual([expect.objectContaining({ title: 'Sự kiện cấp trường', canManage: false })]);
    // Doan truong thay het
    expect((await cal(w.admin, -DAY, 5 * DAY).expect(200)).body.activities).toHaveLength(2);
    // loc theo don vi
    expect((await cal(w.admin, -DAY, 5 * DAY, `&unitId=${w.faculty2}`).expect(200)).body.activities).toEqual([]);
  });

  it('TU CHOI: thieu / sai ngay 400, to truoc from 400, qua 62 ngay 400, chua dang nhap 401', async () => {
    await as(app, w.cntt).get('/api/admin/activity-calendar').expect(400);
    await as(app, w.cntt).get('/api/admin/activity-calendar?from=2026-13-01&to=2026-13-30').expect(400);
    await as(app, w.cntt).get('/api/admin/activity-calendar?from=01/11/2026&to=2026-11-30').expect(400);
    expect((await as(app, w.cntt).get('/api/admin/activity-calendar?from=2026-11-30&to=2026-11-01').expect(400)).body.code).toBe('INVALID_RANGE');
    expect((await as(app, w.cntt).get('/api/admin/activity-calendar?from=2026-01-01&to=2026-03-31').expect(400)).body.code).toBe('RANGE_TOO_LONG');
    await as(app, w.cntt).get('/api/admin/activity-calendar?from=2026-11-01&to=2026-11-30&unitId=abc').expect(400);
    await request(app.getHttpServer()).get('/api/admin/activity-calendar?from=2026-11-01&to=2026-11-30').expect(401);
  });
});
