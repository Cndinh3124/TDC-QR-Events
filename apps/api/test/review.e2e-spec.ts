// Test duyet luot diem danh, chot su kien, DRL, phan quyen / pham vi - dac ta 3.6, 3.7, 2.4
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Attendance } from '../src/public/entities/attendance.entity';
import { Event } from '../src/events/entities/event.entity';
import { login, makeUser, Session } from './helpers';
import {
  as, checkinAs, createTestApp, openEvent, PubEvent, runWorker, setupWorld, World,
} from './public-helpers';

describe('Duyet va chot su kien', () => {
  let app: INestApplication;
  let w: World;
  let kt: Session; // quan ly khoa KT (khong lien quan den su kien CNTT)

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
  const list = (s: Session, id: string, qs = '') => api(s).get(`/api/admin/events/${id}/attendances${qs}`);
  const summary = async (id: string) => (await api(w.admin).get(`/api/admin/events/${id}/attendances/summary`).expect(200)).body;
  const close = (id: string) => api(w.admin).post(`/api/admin/events/${id}/close`).expect(200);
  const review = (s: Session, id: string, body: object) => api(s).patch(`/api/admin/attendances/${id}/review`).send(body);
  const bulk = (s: Session, body: object) => api(s).post('/api/admin/attendances/bulk').send(body);
  const finalize = (s: Session, id: string) => api(s).post(`/api/admin/events/${id}/finalize`);
  const row = (id: string) => w.ds.getRepository(Attendance).findOneByOrFail({ id });
  const eventRow = (id: string) => w.ds.getRepository(Event).findOneByOrFail({ id });

  // su kien cua khoa CNTT, 4 luot: a, b sach; c, d cung MSSV tu hai thiet bi (DUPLICATE_MSSV)
  async function setup(o: Record<string, unknown> = {}) {
    const ev = await openEvent(w, { unitId: w.faculty, drlPoints: 3, ...o });
    const a = await checkinAs(w, ev.token, { mssv: '24211TM1001', fullName: 'An' });
    const b = await checkinAs(w, ev.token, { mssv: '24211TM1002', fullName: 'Binh' });
    const c = await checkinAs(w, ev.token, { mssv: '24211TM1003', fullName: 'Chi' });
    const d = await checkinAs(w, ev.token, { mssv: '24211TM1003', fullName: 'Chi' });
    await runWorker(app);
    return { ev, a: a.attendance.id, b: b.attendance.id, c: c.attendance.id, d: d.attendance.id };
  }

  describe('doc danh sach', () => {
    it('hien co kem co; loc theo co / trang thai; tom tat dem dung', async () => {
      const { ev, c } = await setup();
      await close(ev.id);
      const res = await list(w.admin, ev.id).expect(200);
      expect(res.body.total).toBe(4);
      const flagged = res.body.items.filter((i: any) => i.flags.length > 0).map((i: any) => i.id);
      expect(flagged).toHaveLength(2);
      expect(flagged).toContain(c);
      expect((await list(w.admin, ev.id, '?flagged=no').expect(200)).body.total).toBe(2);
      expect((await list(w.admin, ev.id, '?flag=DUPLICATE_MSSV').expect(200)).body.total).toBe(2);
      expect((await list(w.admin, ev.id, '?q=Binh').expect(200)).body.total).toBe(1);
      expect(await summary(ev.id)).toMatchObject({ total: 4, pending: 4, approved: 0, flagged: 2, cleanPending: 2 });
    });

    it('[BM] khong lo IP, user-agent, toa do, ma thiet bi day du', async () => {
      const { ev } = await setup();
      const text = JSON.stringify((await list(w.admin, ev.id).expect(200)).body);
      for (const k of ['"ip"', 'userAgent', '"lat"', '"lng"', 'deviceId', 'idempotency']) expect(text).not.toContain(k);
    });

    it('TU CHOI: khoa khac -> 404; chua dang nhap -> 401', async () => {
      const { ev } = await setup();
      await list(kt, ev.id).expect(404);
      await api(kt).get(`/api/admin/events/${ev.id}/attendances/summary`).expect(404);
      await request(app.getHttpServer()).get(`/api/admin/events/${ev.id}/attendances`).expect(401);
    });
  });

  describe('duyet', () => {
    it('TU CHOI: con mo diem danh -> 409 CHECKIN_STILL_OPEN', async () => {
      const { a } = await setup();
      const res = await review(w.admin, a, { status: 'APPROVED' }).expect(409);
      expect(res.body.code).toBe('CHECKIN_STILL_OPEN');
    });

    it('dong diem danh roi duyet: tu vao REVIEWING; duyet / tu choi (bat buoc ly do) / tra ve cho duyet', async () => {
      const { ev, a, b } = await setup();
      await close(ev.id);
      await review(w.admin, a, { status: 'APPROVED' }).expect(200);
      expect((await eventRow(ev.id)).status).toBe('REVIEWING');
      expect((await review(w.admin, b, { status: 'REJECTED' }).expect(400)).body.code).toBe('REASON_REQUIRED');
      const rej = await review(w.admin, b, { status: 'REJECTED', reason: 'Khong co mat tai cho' }).expect(200);
      expect(rej.body).toMatchObject({ reviewStatus: 'REJECTED', reviewNote: 'Khong co mat tai cho' });
      const back = await review(w.admin, b, { status: 'PENDING' }).expect(200);
      expect(back.body).toMatchObject({ reviewStatus: 'PENDING', reviewNote: null, reviewedAt: null });
      const log = await w.ds.query("SELECT action FROM audit_logs WHERE entity = 'attendance' AND action = 'ATTENDANCE_REVIEW'");
      expect(log).toHaveLength(3);
    });

    it('TU CHOI: khoa khac -> 404; luot khong ton tai -> 404; trang thai la -> 400', async () => {
      const { ev, a } = await setup();
      await close(ev.id);
      await review(kt, a, { status: 'APPROVED' }).expect(404);
      await review(w.admin, '11111111-1111-4111-8111-111111111111', { status: 'APPROVED' }).expect(404);
      await review(w.admin, a, { status: 'DONE' }).expect(400);
      expect((await row(a)).reviewStatus).toBe('PENDING');
    });

    it('duyet hang loat: APPROVE_CLEAN chi duyet luot sach; APPROVE theo id; REJECT can ly do; khong vuot qua su kien khac', async () => {
      const { ev, a, b, c, d } = await setup();
      const other = await openEvent(w, { unitId: w.faculty });
      const foreign = (await checkinAs(w, other.token, { mssv: '24211TM1009' })).attendance.id;
      await close(ev.id);
      await close(other.id);

      const clean = await bulk(w.admin, { eventId: ev.id, action: 'APPROVE_CLEAN' }).expect(200);
      expect(clean.body).toEqual({ updated: 2, skipped: 0 });
      expect((await row(a)).reviewStatus).toBe('APPROVED');
      expect((await row(c)).reviewStatus).toBe('PENDING');

      expect((await bulk(w.admin, { eventId: ev.id, action: 'REJECT', ids: [c, d] }).expect(400)).body.code).toBe('REASON_REQUIRED');
      const rej = await bulk(w.admin, { eventId: ev.id, action: 'REJECT', ids: [c, d, foreign], reason: 'Trung MSSV' }).expect(200);
      // luot cua su kien khac bi bo qua, khong bi dong cham
      expect(rej.body).toEqual({ updated: 2, skipped: 1 });
      expect((await row(foreign)).reviewStatus).toBe('PENDING');
      expect((await row(b)).reviewStatus).toBe('APPROVED');
    });

    it('TU CHOI hang loat: khoa khac 404; qua 500 id 400; id sai dinh dang 400', async () => {
      const { ev, a } = await setup();
      await close(ev.id);
      await bulk(kt, { eventId: ev.id, action: 'APPROVE', ids: [a] }).expect(404);
      await bulk(w.admin, { eventId: ev.id, action: 'APPROVE', ids: ['abc'] }).expect(400);
      const many = Array.from({ length: 501 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
      await bulk(w.admin, { eventId: ev.id, action: 'APPROVE', ids: many }).expect(400);
      await bulk(w.admin, { eventId: ev.id, action: 'APPROVE', ids: [] }).expect(400);
      expect((await row(a)).reviewStatus).toBe('PENDING');
    });
  });

  describe('chot su kien va DRL', () => {
    it('TU CHOI chot khi con luot cho duyet (409 PENDING_LEFT); duyet het roi chot: chi luot da duyet duoc cong DRL', async () => {
      const { ev, a, b, c, d } = await setup();
      await close(ev.id);
      const blocked = await finalize(w.admin, ev.id).expect(409);
      expect(blocked.body.code).toBe('PENDING_LEFT');

      await bulk(w.admin, { eventId: ev.id, action: 'APPROVE', ids: [a, b, c] }).expect(200);
      await review(w.admin, d, { status: 'REJECTED', reason: 'Trung MSSV' }).expect(200);
      const done = await finalize(w.admin, ev.id).expect(200);
      expect(done.body).toEqual({ status: 'FINALIZED', awardedCount: 3, totalDrl: 9 });
      expect((await eventRow(ev.id)).status).toBe('FINALIZED');
      expect(await Promise.all([a, b, c, d].map(async (i) => (await row(i)).drlAwarded))).toEqual([3, 3, 3, 0]);
    });

    it('mot sinh vien chi nhan DRL mot lan: hai luot da duyet cung MSSV -> chi luot som nhat', async () => {
      const { ev, a, b, c, d } = await setup();
      await close(ev.id);
      await bulk(w.admin, { eventId: ev.id, action: 'APPROVE', ids: [a, b, c, d] }).expect(200);
      const done = await finalize(w.admin, ev.id).expect(200);
      expect(done.body).toMatchObject({ awardedCount: 3, totalDrl: 9 });
      const earliest = (await row(c)).checkinAt <= (await row(d)).checkinAt ? c : d;
      const later = earliest === c ? d : c;
      expect((await row(earliest)).drlAwarded).toBe(3);
      expect((await row(later)).drlAwarded).toBe(0);
    });

    it('su kien bat buoc diem danh ra: khong co luot ra thi co NO_CHECKOUT va khong duoc cong diem', async () => {
      const ev = await openEvent(w, { unitId: w.faculty, drlPoints: 8, controlLevel: 'TIGHT' });
      const x = await checkinAs(w, ev.token, { mssv: '24211TM2001' });
      const y = await checkinAs(w, ev.token, { mssv: '24211TM2002' });
      // y diem danh ra duoc
      await request(app.getHttpServer()).post('/api/public/checkout').set('Cookie', y.cookie)
        .send({ token: ev.outToken, idempotencyKey: '9d1b2f6e-3c4a-4b8e-9f10-2a3b4c5d6e7f', verifyCode: ev.verifyCode }).expect(201);
      await runWorker(app);
      await close(ev.id);
      await api(w.admin).post(`/api/admin/events/${ev.id}/review/start`).expect(200);
      const flagsX = (await list(w.admin, ev.id, '?flag=NO_CHECKOUT').expect(200)).body.items.map((i: any) => i.id);
      expect(flagsX).toEqual([x.attendance.id]);
      await bulk(w.admin, { eventId: ev.id, action: 'APPROVE', ids: [x.attendance.id, y.attendance.id] }).expect(200);
      await finalize(w.admin, ev.id).expect(200);
      expect((await row(x.attendance.id)).drlAwarded).toBe(0);
      expect((await row(y.attendance.id)).drlAwarded).toBe(8);
    });

    it('su kien khong cong DRL: drl_awarded de NULL', async () => {
      const ev = await openEvent(w, { unitId: w.faculty, hasDrl: false, drlPoints: undefined });
      const a = (await checkinAs(w, ev.token)).attendance.id;
      await close(ev.id);
      await bulk(w.admin, { eventId: ev.id, action: 'APPROVE', ids: [a] }).expect(200);
      expect((await finalize(w.admin, ev.id).expect(200)).body).toMatchObject({ awardedCount: 0, totalDrl: 0 });
      expect((await row(a)).drlAwarded).toBeNull();
    });

    it('sau khi chot: sua / duyet / huy / them deu 409; chot lai 409', async () => {
      const { ev, a } = await setup();
      await close(ev.id);
      await bulk(w.admin, { eventId: ev.id, action: 'APPROVE', ids: [a] }).expect(200);
      await bulk(w.admin, { eventId: ev.id, action: 'REJECT', ids: (await w.ds.query('SELECT id FROM attendances WHERE id <> ?', [a])).map((r: any) => r.id), reason: 'Khong hop le' }).expect(200);
      await finalize(w.admin, ev.id).expect(200);
      expect((await review(w.admin, a, { status: 'REJECTED', reason: 'Doi y' }).expect(409)).body.code).toBe('EVENT_FINALIZED');
      await api(w.admin).post(`/api/admin/attendances/${a}/void`).send({ reason: 'Nham lan' }).expect(409);
      await api(w.admin).patch(`/api/admin/attendances/${a}`).send({ fullName: 'Sai', reason: 'Sua ten' }).expect(409);
      await api(w.admin).post(`/api/admin/events/${ev.id}/attendances`).send(manualBody()).expect(409);
      await finalize(w.admin, ev.id).expect(409);
      expect((await row(a)).reviewStatus).toBe('APPROVED');
    });

    it('mo khoa: chi Doan truong, bat buoc ly do; diem bi huy; chot lai tinh lai', async () => {
      const { ev, a, b, c, d } = await setup();
      await close(ev.id);
      await bulk(w.admin, { eventId: ev.id, action: 'APPROVE', ids: [a, b, c] }).expect(200);
      await bulk(w.admin, { eventId: ev.id, action: 'REJECT', ids: [d], reason: 'Trung' }).expect(200);
      await finalize(w.admin, ev.id).expect(200);

      const mgr = await login(app, 'cntt@tdc.edu.vn');
      await api(mgr).post(`/api/admin/events/${ev.id}/unlock`).send({ reason: 'Muon sua' }).expect(403);
      await api(w.admin).post(`/api/admin/events/${ev.id}/unlock`).send({}).expect(400);
      await api(w.admin).post(`/api/admin/events/${ev.id}/unlock`).send({ reason: 'Sua loi duyet' }).expect(200);
      expect((await eventRow(ev.id)).status).toBe('REVIEWING');
      expect((await row(a)).drlAwarded).toBeNull();

      await review(w.admin, a, { status: 'REJECTED', reason: 'Phat hien sai' }).expect(200);
      expect((await finalize(w.admin, ev.id).expect(200)).body).toMatchObject({ awardedCount: 2, totalDrl: 6 });
    });

    it('TU CHOI chot: khoa khac 404; quan ly khoa CNTT duoc chot su kien khoa minh; nhap / chua dong khong chot duoc', async () => {
      const { ev, a } = await setup();
      await finalize(w.admin, ev.id).expect(409); // con mo diem danh
      await close(ev.id);
      await finalize(kt, ev.id).expect(404);
      const mgr = await login(app, 'cntt@tdc.edu.vn');
      await bulk(mgr, { eventId: ev.id, action: 'APPROVE_CLEAN' }).expect(200);
      expect((await row(a)).reviewStatus).toBe('APPROVED');
      const draft = (await api(w.admin).post('/api/admin/events').send({
        title: 'Nhap', hasDrl: false, startAt: new Date(Date.now() + 3600e3).toISOString(), endAt: new Date(Date.now() + 7200e3).toISOString(), unitId: w.faculty,
      }).expect(201)).body;
      await finalize(w.admin, draft.id).expect(409);
    });
  });

  describe('them thu cong / sua / huy', () => {
    it('them thu cong: luot da duyet, co MANUAL_ENTRY, nhat ky; trung MSSV 409; ngoai khung gio 400', async () => {
      const { ev } = await setup();
      const res = await api(w.admin).post(`/api/admin/events/${ev.id}/attendances`).send(manualBody({ mssv: '24211tm3001' })).expect(201);
      expect(res.body).toMatchObject({ mssv: '24211TM3001', source: 'MANUAL', reviewStatus: 'APPROVED', deviceRef: null });
      expect(res.body.flags.map((f: any) => f.code)).toEqual(['MANUAL_ENTRY']);
      expect(res.body.confirmCode).toHaveLength(8);
      expect(await w.ds.query("SELECT 1 FROM students WHERE mssv = '24211TM3001'")).toHaveLength(1);

      expect((await api(w.admin).post(`/api/admin/events/${ev.id}/attendances`).send(manualBody({ mssv: '24211TM3001' })).expect(409)).body.code).toBe('DUPLICATE_MSSV');
      const early = new Date(Date.now() - 48 * 3600e3).toISOString();
      expect((await api(w.admin).post(`/api/admin/events/${ev.id}/attendances`).send(manualBody({ mssv: '24211TM3002', checkinAt: early })).expect(400)).body.code).toBe('CHECKIN_OUT_OF_RANGE');
    });

    it('TU CHOI them: thieu ly do, MSSV sai, khoa sai, truong la, khoa khac 404, su kien nhap 409', async () => {
      const { ev } = await setup();
      const url = `/api/admin/events/${ev.id}/attendances`;
      await api(w.admin).post(url).send({ ...manualBody(), reason: undefined }).expect(400);
      expect((await api(w.admin).post(url).send(manualBody({ mssv: 'abc' })).expect(400)).body.code).toBe('INVALID_MSSV');
      expect((await api(w.admin).post(url).send(manualBody({ facultyUnitId: w.admin.id })).expect(400)).body.code).toBe('INVALID_FACULTY');
      await api(w.admin).post(url).send({ ...manualBody(), role: 'x' }).expect(400);
      await api(kt).post(url).send(manualBody()).expect(404);
      expect(await w.ds.query("SELECT 1 FROM attendances WHERE source = 'MANUAL'")).toHaveLength(0);
    });

    it('sua: bat buoc ly do, ghi lich su ADMIN va nhat ky; khong doi gi -> 400; trung MSSV -> 409; doi gio vao tinh lai dung gio', async () => {
      const { ev, a, b } = await setup();
      await api(w.admin).patch(`/api/admin/attendances/${a}`).send({ fullName: 'Moi' }).expect(400);
      const ok = await api(w.admin).patch(`/api/admin/attendances/${a}`).send({ fullName: 'An Moi', reason: 'Sai chinh ta' }).expect(200);
      expect(ok.body.fullName).toBe('An Moi');
      const edits = await w.ds.query('SELECT actor_type AS t, reason FROM attendance_edits WHERE attendance_id = ?', [a]);
      expect(edits).toEqual([{ t: 'ADMIN', reason: 'Sai chinh ta' }]);
      expect((await api(w.admin).patch(`/api/admin/attendances/${a}`).send({ fullName: 'An Moi', reason: 'Lai' }).expect(400)).body.code).toBe('NO_CHANGES');
      expect((await api(w.admin).patch(`/api/admin/attendances/${a}`).send({ mssv: '24211TM1002', reason: 'Doi MSSV' }).expect(409)).body.code).toBe('DUPLICATE_MSSV');
      const late = new Date((await eventRow(ev.id)).startAt.getTime() + 3600e3); // trong khung diem danh nhung qua an han
      const lateRes = await api(w.admin).patch(`/api/admin/attendances/${b}`).send({ checkinAt: late.toISOString(), reason: 'Sua gio' }).expect(200);
      expect(lateRes.body.timeliness).toBe('LATE');
      const tooLate = new Date((await eventRow(ev.id)).endAt.getTime() + 3600e3).toISOString();
      expect((await api(w.admin).patch(`/api/admin/attendances/${b}`).send({ checkinAt: tooLate, reason: 'Qua khung' }).expect(400)).body.code).toBe('CHECKIN_OUT_OF_RANGE');
    });

    it('TU CHOI: khoi phuc luot khi MSSV da co luot khac con hieu luc -> 409 DUPLICATE_MSSV', async () => {
      const { c, d } = await setup(); // c, d cung MSSV
      await api(w.admin).post(`/api/admin/attendances/${c}/void`).send({ reason: 'Trung MSSV' }).expect(200);
      const r = await api(w.admin).post(`/api/admin/attendances/${c}/restore`).send({ reason: 'Khoi phuc' }).expect(409);
      expect(r.body.code).toBe('DUPLICATE_MSSV');
      expect((await row(c)).voidedAt).not.toBeNull();
      await api(w.admin).post(`/api/admin/attendances/${d}/void`).send({ reason: 'Luot ho' }).expect(200);
      await api(w.admin).post(`/api/admin/attendances/${c}/restore`).send({ reason: 'Khoi phuc' }).expect(200);
    });

    it('huy / khoi phuc: ly do bat buoc, khong xoa cung, khoi phuc ve cho duyet, luot huy khong duoc cong diem', async () => {
      const { ev, a, b } = await setup();
      await api(w.admin).post(`/api/admin/attendances/${a}/void`).send({}).expect(400);
      const v = await api(w.admin).post(`/api/admin/attendances/${a}/void`).send({ reason: 'Nhap nham' }).expect(200);
      expect(v.body.voidedAt).not.toBeNull();
      await api(w.admin).post(`/api/admin/attendances/${a}/void`).send({ reason: 'Nhap nham' }).expect(409);
      expect((await list(w.admin, ev.id).expect(200)).body.total).toBe(3);
      expect((await list(w.admin, ev.id, '?voided=only').expect(200)).body.total).toBe(1);
      expect((await review(w.admin, a, { status: 'APPROVED' }).expect(409)).body.code).toBe('ATTENDANCE_VOIDED');
      expect(await w.ds.query('SELECT COUNT(*) AS n FROM attendances')).toEqual([{ n: '4' }]);

      const r = await api(w.admin).post(`/api/admin/attendances/${a}/restore`).send({ reason: 'Nham, khoi phuc' }).expect(200);
      expect(r.body).toMatchObject({ voidedAt: null, reviewStatus: 'PENDING' });

      await close(ev.id);
      await api(w.admin).post(`/api/admin/attendances/${b}/void`).send({ reason: 'Khong hop le' }).expect(200);
      await bulk(w.admin, { eventId: ev.id, action: 'APPROVE_CLEAN' }).expect(200);
      expect((await row(b)).reviewStatus).toBe('PENDING'); // luot huy khong bi duyet nham
    });
  });

  describe('xem sinh vien cua su kien cap truong duoc chia se (2.4)', () => {
    let school: PubEvent;
    let ktA: string;
    let cnttA: string;

    beforeEach(async () => {
      school = await openEvent(w); // su kien cap truong
      ktA = (await checkinAs(w, school.token, { mssv: '24211TM5001', facultyUnitId: w.faculty2 })).attendance.id;
      cnttA = (await checkinAs(w, school.token, { mssv: '24211TM5002', facultyUnitId: w.faculty })).attendance.id;
      await close(school.id);
    });

    it('chua chia se -> 404; chia se ALL -> chi thay sinh vien khoa minh, khong thay ma xac nhan', async () => {
      const mgr = await login(app, 'cntt@tdc.edu.vn');
      await list(mgr, school.id).expect(404);
      await api(w.admin).post(`/api/admin/events/${school.id}/faculty-view`).send({ mode: 'ALL', reason: 'Cho khoa xem' }).expect(200);
      const res = await list(mgr, school.id).expect(200);
      expect(res.body.items.map((i: any) => i.id)).toEqual([cnttA]);
      expect(res.body.items[0].confirmCode).toBeNull();
      expect((await api(mgr).get(`/api/admin/events/${school.id}/attendances/summary`).expect(200)).body.total).toBe(1);
      expect(res.body.items.map((i: any) => i.id)).not.toContain(ktA);
    });

    it('nguoi chi-xem khong duyet / sua / huy / them duoc (403), du biet id', async () => {
      await api(w.admin).post(`/api/admin/events/${school.id}/faculty-view`).send({ mode: 'ALL', reason: 'Cho khoa xem' }).expect(200);
      const mgr = await login(app, 'cntt@tdc.edu.vn');
      await review(mgr, cnttA, { status: 'APPROVED' }).expect(403);
      await bulk(mgr, { eventId: school.id, action: 'APPROVE_CLEAN' }).expect(403);
      await api(mgr).patch(`/api/admin/attendances/${cnttA}`).send({ fullName: 'Xy', reason: 'Thu' }).expect(403);
      await api(mgr).post(`/api/admin/attendances/${cnttA}/void`).send({ reason: 'Thu' }).expect(403);
      await api(mgr).post(`/api/admin/events/${school.id}/attendances`).send(manualBody()).expect(403);
      await finalize(mgr, school.id).expect(403);
      expect((await row(cnttA)).reviewStatus).toBe('PENDING');
    });
  });

  // thieu truong thi dung gia tri mac dinh
  function manualBody(o: Record<string, unknown> = {}) {
    return { mssv: '24211TM9001', fullName: 'Le Van Nhap', facultyUnitId: w.faculty, reason: 'Co mat nhung bi chan GPS', ...o };
  }

});
