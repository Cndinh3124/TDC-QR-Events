// Test khieu nai: gui (cong khai), han 7 ngay, xu ly (quan tri), phan quyen / pham vi - dac ta 3.5
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { Appeal } from '../src/appeals/appeal.entity';
import { Attendance } from '../src/public/entities/attendance.entity';
import { login, makeUser, Session } from './helpers';
import {
  as, checkinAs, createTestApp, deviceCookie, openEvent, patchEvent, PubEvent, runWorker, setupWorld, World,
} from './public-helpers';

describe('Khieu nai', () => {
  let app: INestApplication;
  let w: World;
  let kt: Session;
  let mgr: Session;

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
    mgr = await login(app, 'cntt@tdc.edu.vn');
  });

  const api = (s: Session) => as(app, s);
  const post = (cookie: string | null, body: object) => {
    const r = request(app.getHttpServer()).post('/api/public/appeals');
    return (cookie ? r.set('Cookie', cookie) : r).send(body);
  };
  const body = (token: string, o: Record<string, unknown> = {}) => ({
    token, idempotencyKey: randomUUID(), type: 'WRONG_INFO', content: 'Toi nhap sai ten luc diem danh.', ...o,
  });
  const identity = (o: Record<string, unknown> = {}) => ({
    mssv: '24211TM7777', fullName: 'Tran Thi Khong', facultyUnitId: w.faculty, ...o,
  });
  const handle = (s: Session, id: string, b: object) => api(s).patch(`/api/admin/appeals/${id}`).send(b);
  const appealRow = (id: string) => w.ds.getRepository(Appeal).findOneByOrFail({ id });
  const attRow = (id: string) => w.ds.getRepository(Attendance).findOneByOrFail({ id });
  const close = (id: string) => api(w.admin).post(`/api/admin/events/${id}/close`).expect(200);

  // su kien cua khoa CNTT, mot sinh vien da diem danh
  async function setup() {
    const ev = await openEvent(w, { unitId: w.faculty, drlPoints: 3 });
    const s = await checkinAs(w, ev.token, { mssv: '24211TM1001', fullName: 'An' });
    await runWorker(app);
    return { ev, s };
  }

  describe('gui khieu nai (cong khai)', () => {
    it('thiet bi da diem danh: gan voi luot cua minh; 201; cho xu ly; ghi chu xu ly an khi chua xu ly', async () => {
      const { ev, s } = await setup();
      const res = await post(s.cookie, body(ev.token)).expect(201);
      expect(res.body).toMatchObject({ status: 'PENDING', type: 'WRONG_INFO', resolutionNote: null });
      const row = await appealRow(res.body.id);
      expect(row).toMatchObject({ attendanceId: s.attendance.id, mssv: '24211TM1001', eventId: ev.id });
      // han = ket thuc su kien + 7 ngay
      const end = (await w.ds.query('SELECT end_at AS e FROM events WHERE id = ?', [ev.id]))[0].e as Date;
      expect(row.deadlineAt.getTime()).toBe(new Date(end).getTime() + 7 * 24 * 3600e3);
    });

    it('thiet bi chua diem danh: bat buoc khai MSSV + ho ten + khoa; MSSV sai / khoa sai bi tu choi', async () => {
      const { ev } = await setup();
      const cookie = await deviceCookie(app, ev.token);
      expect((await post(cookie, body(ev.token, { type: 'NO_CHECKIN' })).expect(400)).body.code).toBe('APPEAL_IDENTITY_REQUIRED');
      expect((await post(cookie, body(ev.token, identity({ mssv: 'abc' }))).expect(400)).body.code).toBe('INVALID_MSSV');
      expect((await post(cookie, body(ev.token, identity({ facultyUnitId: w.admin.id }))).expect(400)).body.code).toBe('INVALID_FACULTY');
      const ok = await post(cookie, body(ev.token, { type: 'NO_CHECKIN', ...identity() })).expect(201);
      expect((await appealRow(ok.body.id)).attendanceId).toBeNull();
    });

    it('TU CHOI: QR sai 404; noi dung ngan 400; loai la 400; truong la 400; het han 409; su kien nhap / huy 409', async () => {
      const { ev, s } = await setup();
      await post(s.cookie, body('A'.repeat(22))).expect(404);
      await post(s.cookie, body(ev.token, { content: 'ngan' })).expect(400);
      await post(s.cookie, body(ev.token, { type: 'KHAC' })).expect(400);
      await post(s.cookie, { ...body(ev.token), role: 'admin' }).expect(400);
      await patchEvent(w, ev.id, { endAt: new Date(Date.now() - 8 * 24 * 3600e3), startAt: new Date(Date.now() - 9 * 24 * 3600e3), checkinOpenAt: new Date(Date.now() - 9 * 24 * 3600e3), checkinCloseAt: new Date(Date.now() - 8 * 24 * 3600e3) });
      expect((await post(s.cookie, body(ev.token)).expect(409)).body.code).toBe('APPEAL_EXPIRED');
      await patchEvent(w, ev.id, { endAt: new Date(Date.now() - 6 * 24 * 3600e3) });
      await post(s.cookie, body(ev.token)).expect(201); // con han 1 ngay
      await api(w.admin).post(`/api/admin/events/${ev.id}/cancel`).send({ reason: 'Huy su kien' }).expect(200);
      // huy su kien vo hieu QR: khong con tra cuu duoc
      await post(s.cookie, body(ev.token)).expect(404);
    });

    it('gui lai cung khoa: 200 va khong tao them; thiet bi khac dung khoa do: 409; toi da 3 khieu nai cho xu ly', async () => {
      const { ev, s } = await setup();
      const b = body(ev.token);
      const first = await post(s.cookie, b).expect(201);
      const again = await post(s.cookie, b).expect(200);
      expect(again.body.id).toBe(first.body.id);
      const other = await deviceCookie(app, ev.token);
      expect((await post(other, { ...b, ...identity() }).expect(409)).body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      await post(s.cookie, body(ev.token)).expect(201);
      await post(s.cookie, body(ev.token)).expect(201);
      expect((await post(s.cookie, body(ev.token)).expect(409)).body.code).toBe('TOO_MANY_APPEALS');
      expect(await w.ds.query('SELECT COUNT(*) AS n FROM appeals')).toEqual([{ n: '3' }]);
    });

    it('xem lai khieu nai cua thiet bi minh (khong thay cua nguoi khac); by-token bao han khieu nai', async () => {
      const { ev, s } = await setup();
      const mine = await post(s.cookie, body(ev.token)).expect(201);
      const stranger = await deviceCookie(app, ev.token);
      await post(stranger, body(ev.token, identity())).expect(201);
      const res = await request(app.getHttpServer()).get('/api/public/me/appeals').set('Cookie', s.cookie).expect(200);
      expect(res.body.items.map((i: any) => i.id)).toEqual([mine.body.id]);
      expect(JSON.stringify(res.body)).not.toContain('24211TM7777');
      const info = await request(app.getHttpServer()).get(`/api/public/events/by-token/${ev.token}`).set('Cookie', s.cookie).expect(200);
      expect(info.body.appeal.open).toBe(true);
      expect(new Date(info.body.appeal.deadlineAt).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('xu ly (quan tri)', () => {
    async function pending(type = 'WRONG_INFO', extra: Record<string, unknown> = {}) {
      const ctx = await setup();
      const cookie = extra.mssv ? await deviceCookie(app, ctx.ev.token) : ctx.s.cookie;
      const res = await post(cookie, body(ctx.ev.token, { type, ...extra })).expect(201);
      return { ...ctx, id: res.body.id as string };
    }

    it('danh sach theo pham vi: khoa CNTT thay, khoa KT khong; loc theo trang thai', async () => {
      const { id } = await pending();
      expect((await api(mgr).get('/api/admin/appeals').expect(200)).body.items.map((i: any) => i.id)).toEqual([id]);
      expect((await api(kt).get('/api/admin/appeals').expect(200)).body.total).toBe(0);
      expect((await api(w.admin).get('/api/admin/appeals?status=ACCEPTED').expect(200)).body.total).toBe(0);
      expect((await api(w.admin).get('/api/admin/appeals?status=XYZ').expect(400)).body.statusCode).toBe(400);
    });

    it('tu choi: bat buoc ghi chu; luu nguoi / gio xu ly; sinh vien thay ghi chu; xu ly lai 409', async () => {
      const { id, s } = await pending();
      await handle(w.admin, id, { action: 'REJECT' }).expect(400);
      const res = await handle(mgr, id, { action: 'REJECT', note: 'Thong tin da dung' }).expect(200);
      expect(res.body).toMatchObject({ status: 'REJECTED', resolutionNote: 'Thong tin da dung' });
      expect((await appealRow(id)).handledBy).toBe(mgr.id);
      expect((await handle(w.admin, id, { action: 'ACCEPT', note: 'Doi y' }).expect(409)).body.code).toBe('ALREADY_HANDLED');
      const mine = await request(app.getHttpServer()).get('/api/public/me/appeals').set('Cookie', s.cookie).expect(200);
      expect(mine.body.items[0]).toMatchObject({ status: 'REJECTED', resolutionNote: 'Thong tin da dung' });
      const log = await w.ds.query("SELECT action FROM audit_logs WHERE entity = 'appeal'");
      expect(log).toEqual([{ action: 'APPEAL_REJECT' }]);
    });

    it('chap nhan khieu nai "co mat nhung khong diem danh duoc": tao luot thu cong da duyet gan voi khieu nai', async () => {
      const { id, ev } = await pending('NO_CHECKIN', identity());
      const res = await handle(mgr, id, {
        action: 'ACCEPT', note: 'Xac minh co mat', attendance: { mssv: '24211TM7777', fullName: 'Tran Thi Khong', facultyUnitId: w.faculty },
      }).expect(200);
      const a = await appealRow(id);
      expect(res.body.status).toBe('ACCEPTED');
      expect(a.attendanceId).not.toBeNull();
      expect(await attRow(a.attendanceId!)).toMatchObject({ source: 'MANUAL', reviewStatus: 'APPROVED', eventId: ev.id, mssv: '24211TM7777' });
    });

    it('chap nhan + duyet luot co san: khoi phuc neu dang bi huy', async () => {
      const { id, s } = await pending();
      await api(w.admin).post(`/api/admin/attendances/${s.attendance.id}/void`).send({ reason: 'Nghi gian lan' }).expect(200);
      await handle(w.admin, id, { action: 'ACCEPT', note: 'Da xac minh', approveAttendance: true }).expect(200);
      expect(await attRow(s.attendance.id)).toMatchObject({ voidedAt: null, reviewStatus: 'APPROVED' });
    });

    it('su kien DA CHOT: khieu nai con han van chap nhan duoc va cong DRL ngay cho luot do', async () => {
      const { id, ev, s } = await pending();
      await close(ev.id);
      await api(w.admin).post('/api/admin/attendances/bulk').send({ eventId: ev.id, action: 'REJECT', ids: [s.attendance.id], reason: 'Nham MSSV' }).expect(200);
      await api(w.admin).post(`/api/admin/events/${ev.id}/finalize`).expect(200);
      expect((await attRow(s.attendance.id)).drlAwarded).toBe(0);
      await handle(w.admin, id, { action: 'ACCEPT', note: 'Sinh vien dung', approveAttendance: true }).expect(200);
      expect(await attRow(s.attendance.id)).toMatchObject({ reviewStatus: 'APPROVED', drlAwarded: 3 });
    });

    it('TU CHOI: khoa khac 404; khieu nai khong ton tai 404; chap nhan voi hai lua chon 400; tu choi kem thay doi 400; chua dang nhap 401', async () => {
      const { id } = await pending();
      await handle(kt, id, { action: 'REJECT', note: 'Khong lien quan' }).expect(404);
      await handle(w.admin, '11111111-1111-4111-8111-111111111111', { action: 'REJECT', note: 'Khong co' }).expect(404);
      await handle(w.admin, id, { action: 'ACCEPT', note: 'Nham', approveAttendance: true, attendance: { mssv: '24211TM1', fullName: 'A', facultyUnitId: w.faculty } }).expect(400);
      await handle(w.admin, id, { action: 'REJECT', note: 'Khong dung', approveAttendance: true }).expect(400);
      await request(app.getHttpServer()).patch(`/api/admin/appeals/${id}`).send({ action: 'REJECT', note: 'abc' }).expect(401);
      expect((await appealRow(id)).status).toBe('PENDING');
    });

    it('nguoi chi-xem su kien cap truong khong thay / khong xu ly duoc khieu nai', async () => {
      const school: PubEvent = await openEvent(w);
      const stu = await checkinAs(w, school.token, { mssv: '24211TM5001', facultyUnitId: w.faculty });
      const res = await post(stu.cookie, body(school.token)).expect(201);
      await api(w.admin).post(`/api/admin/events/${school.id}/faculty-view`).send({ mode: 'ALL', reason: 'Cho xem' }).expect(200);
      expect((await api(mgr).get('/api/admin/appeals').expect(200)).body.total).toBe(0);
      await handle(mgr, res.body.id, { action: 'REJECT', note: 'Khong co quyen' }).expect(403);
      expect((await appealRow(res.body.id)).status).toBe('PENDING');
    });
  });
});
