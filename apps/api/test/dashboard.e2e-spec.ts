// Test man Tong quan + nhac viec - dac ta 3.6, 8.2, 10
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Appeal } from '../src/appeals/appeal.entity';
import { login, makeUser, Session } from './helpers';
import { as, checkinAs, createTestApp, H, openEvent, patchEvent, runWorker, setupWorld, World } from './public-helpers';

const DAY = 24 * H;

describe('Tong quan va nhac viec', () => {
  let app: INestApplication;
  let w: World;
  let kt: Session;

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
  });

  const api = (s: Session) => as(app, s);
  const overview = (s: Session, qs = '') => api(s).get(`/api/admin/dashboard/overview${qs}`);
  const reminders = (s: Session) => api(s).get('/api/admin/dashboard/reminders');
  const close = (id: string) => api(w.admin).post(`/api/admin/events/${id}/close`).expect(200);

  // su kien A cua CNTT: hai sinh vien CNTT + mot sinh vien KT; su kien B cua KT: mot sinh vien KT
  async function seed() {
    const a = await openEvent(w, { unitId: w.faculty, title: 'Su kien A', drlPoints: 3 });
    const ids: string[] = [];
    for (const [mssv, faculty] of [['24211TM1001', w.faculty], ['24211TM1002', w.faculty], ['24211TM1003', w.faculty2]]) {
      ids.push((await checkinAs(w, a.token, { mssv, fullName: 'SV ' + mssv, facultyUnitId: faculty })).attendance.id);
    }
    const b = await openEvent(w, { unitId: w.faculty2, title: 'Su kien B', drlPoints: 2 });
    const bid = (await checkinAs(w, b.token, { mssv: '24211TM1004', fullName: 'SV KT', facultyUnitId: w.faculty2 })).attendance.id;
    await runWorker(app);
    return { a, b, ids, bid };
  }

  describe('overview', () => {
    it('Doan truong: KPI, bieu do theo ngay + theo 9 khoa, su kien dang dien ra, su kien gan day', async () => {
      const { a, b } = await seed();
      const res = await overview(w.admin).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.range.days).toBe(30);
      expect(res.body.kpis).toMatchObject({
        attendance: { value: 4, previous: 0 }, students: { value: 4, previous: 0 }, drl: { value: 0 }, pendingReview: 0, openAppeals: 0,
      });
      expect(res.body.kpis.onTimeRate.value).toBe(1); // diem danh truoc gio bat dau
      expect(res.body.kpis.onTimeRate.previous).toBeNull(); // ky truoc khong co luot nao

      // du 30 ngay, ngay cuoi (hom nay) co 4 luot
      expect(res.body.daily).toHaveLength(30);
      expect(res.body.daily[29]).toMatchObject({ attendance: 4, onTime: 4 });
      expect(res.body.daily.slice(0, 29).every((d: any) => d.attendance === 0)).toBe(true);

      expect(res.body.byFaculty).toHaveLength(9);
      const f = Object.fromEntries(res.body.byFaculty.map((r: any) => [r.facultyId, r.attendance]));
      expect(f[w.faculty]).toBe(2);
      expect(f[w.faculty2]).toBe(2);

      const live = Object.fromEntries(res.body.live.map((e: any) => [e.id, e]));
      expect(Object.keys(live).sort()).toEqual([a.id, b.id].sort());
      expect(live[a.id]).toMatchObject({ title: 'Su kien A', checkinCount: 3, onTimeCount: 3, lateCount: 0 });
      expect(res.body.recent.map((e: any) => e.id).sort()).toEqual([a.id, b.id].sort());
      expect(res.body.recent.find((e: any) => e.id === a.id).attendanceCount).toBe(3);
    });

    it('so sanh ky truoc, ty le dung gio, luot da huy khong tinh', async () => {
      const { ids } = await seed();
      await w.ds.query('UPDATE attendances SET checkin_at = ? WHERE id = ?', [new Date(Date.now() - 40 * DAY), ids[0]]);
      await w.ds.query("UPDATE attendances SET timeliness = 'LATE' WHERE id = ?", [ids[1]]);
      let res = await overview(w.admin).expect(200);
      expect(res.body.kpis.attendance).toEqual({ value: 3, previous: 1 });
      expect(res.body.kpis.onTimeRate.value).toBeCloseTo(2 / 3);
      expect(res.body.kpis.onTimeRate.previous).toBe(1);

      await w.ds.query('UPDATE attendances SET voided_at = NOW(), void_reason = ? WHERE id = ?', ['Nham', ids[1]]);
      res = await overview(w.admin).expect(200);
      expect(res.body.kpis.attendance.value).toBe(2);
    });

    it('lo chua gop: hai MSSV da gop tinh la mot sinh vien', async () => {
      await seed();
      await api(w.admin).post('/api/admin/students/24211TM1002/merge').send({ intoMssv: '24211TM1001', reason: 'Trung ho so' }).expect(200);
      const res = await overview(w.admin).expect(200);
      expect(res.body.kpis.attendance.value).toBe(4);
      expect(res.body.kpis.students.value).toBe(3);
    });

    it('cho duyet + DRL: dong diem danh thi co luot cho duyet; chot xong thi cong diem va het cho duyet', async () => {
      const { a, ids } = await seed();
      await close(a.id);
      let res = await overview(w.admin).expect(200);
      expect(res.body.kpis.pendingReview).toBe(3);
      expect(res.body.live.map((e: any) => e.id)).not.toContain(a.id); // da dong thi het "dang dien ra"

      await api(w.admin).post('/api/admin/attendances/bulk').send({ eventId: a.id, action: 'APPROVE', ids }).expect(200);
      await api(w.admin).post(`/api/admin/events/${a.id}/finalize`).expect(200);
      res = await overview(w.admin).expect(200);
      expect(res.body.kpis.pendingReview).toBe(0);
      expect(res.body.kpis.drl.value).toBe(9);
      expect(res.body.byFaculty.find((r: any) => r.facultyId === w.faculty)).toMatchObject({ attendance: 2, drl: 6 });
    });

    it('bo loc: theo khoa va theo su kien; khoang ngay chon tay', async () => {
      const { a, b } = await seed();
      let res = await overview(w.admin, `?facultyUnitId=${w.faculty2}`).expect(200);
      expect(res.body.kpis.attendance.value).toBe(2);
      expect(res.body.byFaculty).toHaveLength(1);
      res = await overview(w.admin, `?eventId=${b.id}`).expect(200);
      expect(res.body.kpis.attendance.value).toBe(1);
      expect(res.body.live.map((e: any) => e.id)).toEqual([b.id]);
      expect(a.id).not.toBe(b.id);

      const today = new Date(Date.now() + 7 * H).toISOString().slice(0, 10);
      res = await overview(w.admin, `?from=${today}&to=${today}`).expect(200);
      expect(res.body.range).toEqual({ from: today, to: today, days: 1 });
      expect(res.body.kpis.attendance.value).toBe(4);
      res = await overview(w.admin, '?from=2020-01-01&to=2020-01-31').expect(200);
      expect(res.body.kpis.attendance.value).toBe(0);
      expect(res.body.daily).toHaveLength(31);
    });
  });

  describe('phan quyen va pham vi (TU CHOI)', () => {
    it('quan ly khoa chi thay su kien cua minh va sinh vien thuoc khoa minh', async () => {
      await seed();
      const res = await overview(w.cntt).expect(200);
      expect(res.body.kpis.attendance.value).toBe(2); // 2 SV CNTT cua su kien A; SV KT va su kien B nam ngoai
      expect(res.body.byFaculty.map((r: any) => r.facultyId)).toEqual([w.faculty]);
      expect(res.body.recent.map((e: any) => e.title)).toEqual(['Su kien A']);

      const other = await overview(kt).expect(200);
      expect(other.body.kpis.attendance.value).toBe(1);
      expect(other.body.recent.map((e: any) => e.title)).toEqual(['Su kien B']);
    });

    it('khoa / su kien ngoai pham vi -> 404, khong lo su ton tai', async () => {
      const { b } = await seed();
      await overview(w.cntt, `?facultyUnitId=${w.faculty2}`).expect(404);
      await overview(w.cntt, `?eventId=${b.id}`).expect(404);
      await overview(w.cntt, `?eventId=${randomUUID()}`).expect(404);
    });

    it('chua dang nhap -> 401', async () => {
      const r = await import('supertest');
      await r.default(app.getHttpServer()).get('/api/admin/dashboard/overview').expect(401);
      await r.default(app.getHttpServer()).get('/api/admin/dashboard/reminders').expect(401);
    });

    it('khoang ngay xau: sai dinh dang, ngay khong ton tai, dao nguoc, qua 366 ngay, id khong phai UUID -> 400', async () => {
      await overview(w.admin, '?from=01/11/2026').expect(400);
      await overview(w.admin, '?from=2026-02-31&to=2026-03-01').expect(400);
      await overview(w.admin, '?from=2026-05-02&to=2026-05-01').expect(400);
      await overview(w.admin, '?from=2024-01-01&to=2026-01-01').expect(400);
      await overview(w.admin, '?eventId=abc').expect(400);
      await overview(w.admin, '?foo=1').expect(400); // whitelist: khong nhan tham so la
    });
  });

  describe('nhac viec', () => {
    const insertAppeal = (eventId: string, o: Partial<Appeal>) =>
      w.ds.getRepository(Appeal).insert({
        id: randomUUID(), eventId, mssv: '24211TM1001', fullName: 'An', type: 'WRONG_INFO', content: 'Sai ten', status: 'PENDING',
        deadlineAt: new Date(Date.now() + DAY), ...o,
      });

    it('su kien da ket thuc con luot cho duyet: nhac nguoi duyet dung don vi', async () => {
      const { a, b } = await seed();
      // chua ket thuc -> chua nhac
      expect((await reminders(w.admin).expect(200)).body.pendingReview).toEqual([]);

      await close(a.id);
      await close(b.id);
      await patchEvent(w, a.id, { startAt: new Date(Date.now() - 3 * H), endAt: new Date(Date.now() - 2 * H), checkinOpenAt: new Date(Date.now() - 4 * H), checkinCloseAt: new Date(Date.now() - 2 * H) });
      const adm = (await reminders(w.admin).expect(200)).body;
      expect(adm.pendingReview).toHaveLength(1);
      expect(adm.pendingReview[0]).toMatchObject({ eventId: a.id, title: 'Su kien A', pendingCount: 3 });

      // quan ly CNTT thay su kien cua minh; quan ly KT khong thay su kien cua CNTT
      expect((await reminders(w.cntt).expect(200)).body.pendingReview.map((r: any) => r.eventId)).toEqual([a.id]);
      expect((await reminders(kt).expect(200)).body.pendingReview).toEqual([]);
    });

    it('xu ly het thi het nhac; luot da huy khong tinh; su kien da chot khong nhac', async () => {
      const { a, ids } = await seed();
      await close(a.id);
      await patchEvent(w, a.id, { startAt: new Date(Date.now() - 3 * H), endAt: new Date(Date.now() - 2 * H), checkinOpenAt: new Date(Date.now() - 4 * H), checkinCloseAt: new Date(Date.now() - 2 * H) });
      await api(w.admin).post(`/api/admin/attendances/${ids[0]}/void`).send({ reason: 'Nham' }).expect(200);
      expect((await reminders(w.admin)).body.pendingReview[0].pendingCount).toBe(2);
      await api(w.admin).post('/api/admin/attendances/bulk').send({ eventId: a.id, action: 'APPROVE', ids: ids.slice(1) }).expect(200);
      expect((await reminders(w.admin)).body.pendingReview).toEqual([]);
    });

    it('khieu nai sap het han (<= 2 ngay) va qua han thi nhac; con xa hoac da xu ly thi khong', async () => {
      const { a, b } = await seed();
      await insertAppeal(a.id, { mssv: '24211TM2001', deadlineAt: new Date(Date.now() + DAY) });
      await insertAppeal(a.id, { mssv: '24211TM2002', deadlineAt: new Date(Date.now() - DAY) });
      await insertAppeal(a.id, { mssv: '24211TM2003', deadlineAt: new Date(Date.now() + 5 * DAY) });
      await insertAppeal(a.id, { mssv: '24211TM2004', deadlineAt: new Date(Date.now() + DAY), status: 'ACCEPTED' });
      await insertAppeal(b.id, { mssv: '24211TM2005', deadlineAt: new Date(Date.now() + DAY) });

      const adm = (await reminders(w.admin).expect(200)).body.appealsDue;
      expect(adm.map((r: any) => [r.mssv, r.overdue])).toEqual([['24211TM2002', true], ['24211TM2001', false], ['24211TM2005', false]]);
      expect((await reminders(w.cntt)).body.appealsDue.map((r: any) => r.mssv)).toEqual(['24211TM2002', '24211TM2001']);
      expect((await reminders(kt)).body.appealsDue.map((r: any) => r.mssv)).toEqual(['24211TM2005']);

      // so khieu nai mo tren tong quan: khong phu thuoc han
      expect((await overview(w.admin).expect(200)).body.kpis.openAppeals).toBe(4);
      expect((await overview(w.cntt).expect(200)).body.kpis.openAppeals).toBe(3);
    });
  });
});
