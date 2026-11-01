// Test sua thong tin (toi da 3 lan, dung thiet bi, con mo) va lich su - dac ta 3.4, 5.4
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { Attendance } from '../src/public/entities/attendance.entity';
import { checkinAs, checkinBody, createTestApp, deviceCookie, openEvent, postCheckin, setupWorld, World } from './public-helpers';

describe('Diem danh cong khai - sua thong tin va lich su', () => {
  let app: INestApplication;
  let w: World;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    w = await setupWorld(app);
  });

  const patch = (cookie: string | null, id: string, body: object) => {
    const r = request(app.getHttpServer()).patch(`/api/public/attendances/${id}`);
    return (cookie ? r.set('Cookie', cookie) : r).send({ idempotencyKey: randomUUID(), ...body });
  };
  const row = (id: string) => w.ds.getRepository(Attendance).findOneByOrFail({ id });
  const edits = (id: string) => w.ds.query('SELECT * FROM attendance_edits WHERE attendance_id = ? ORDER BY id', [id]);
  const history = (cookie: string | null) => {
    const r = request(app.getHttpServer()).get('/api/public/me/history');
    return cookie ? r.set('Cookie', cookie) : r;
  };

  describe('sua thong tin', () => {
    it('[NV] 3.4: sua ten / khoa / email = cap nhat luot cu (cung id, gio vao giu nguyen), ghi lich su truoc-sau, tang edit_count', async () => {
      const ev = await openEvent(w);
      const { cookie, attendance } = await checkinAs(w, ev.token, { fullName: 'Nguyen Van A' });
      const before = await row(attendance.id);
      const res = await patch(cookie, attendance.id, { fullName: 'Nguyễn Văn An', facultyUnitId: w.faculty2, email: 'an@tdc.edu.vn' }).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.attendance).toMatchObject({
        id: attendance.id, fullName: 'Nguyễn Văn An', facultyUnitId: w.faculty2, email: 'an@tdc.edu.vn', editCount: 1, editsLeft: 2, canEdit: true,
      });
      const after = await row(attendance.id);
      expect(after.checkinAt).toEqual(before.checkinAt);
      expect(after.confirmCode).toBe(before.confirmCode);
      expect(await w.ds.getRepository(Attendance).count()).toBe(1);
      const [e] = await edits(attendance.id);
      expect(e).toMatchObject({ actor_type: 'STUDENT', old_json: { fullName: 'Nguyen Van A', facultyUnitId: w.faculty, email: null }, new_json: { fullName: 'Nguyễn Văn An', facultyUnitId: w.faculty2, email: 'an@tdc.edu.vn' } });
      // chi ghi truong thuc su doi
      await patch(cookie, attendance.id, { fullName: 'Nguyễn Văn An', email: null }).expect(200);
      expect((await edits(attendance.id))[1].new_json).toEqual({ email: null });
      expect((await row(attendance.id)).email).toBeNull();
    });

    it('[NV] 3.4: toi da 3 lan; lan 4 -> 409 EDIT_LIMIT_REACHED, du lieu khong doi; gui lai lan 3 voi cung khoa -> van 200', async () => {
      const ev = await openEvent(w);
      const { cookie, attendance } = await checkinAs(w, ev.token);
      for (const n of ['Ten Mot', 'Ten Hai']) await patch(cookie, attendance.id, { fullName: n }).expect(200);
      const third = { idempotencyKey: randomUUID(), fullName: 'Ten Ba' };
      const ok = await request(app.getHttpServer()).patch(`/api/public/attendances/${attendance.id}`).set('Cookie', cookie).send(third).expect(200);
      expect(ok.body.attendance).toMatchObject({ editCount: 3, editsLeft: 0, canEdit: false });
      const res = await patch(cookie, attendance.id, { fullName: 'Ten Bon' }).expect(409);
      expect(res.body.code).toBe('EDIT_LIMIT_REACHED');
      const replay = await request(app.getHttpServer()).patch(`/api/public/attendances/${attendance.id}`).set('Cookie', cookie).send(third).expect(200);
      expect(replay.body.attendance.editCount).toBe(3);
      expect(await row(attendance.id)).toMatchObject({ fullName: 'Ten Ba', editCount: 3 });
      expect(await edits(attendance.id)).toHaveLength(3);
    });

    it('[NV] 3.4: 6 lan sua CUNG LUC -> dung 3 lan thanh cong, edit_count = 3, co 3 dong lich su', async () => {
      const ev = await openEvent(w);
      const { cookie, attendance } = await checkinAs(w, ev.token);
      const res = await Promise.all(Array.from({ length: 6 }, (_, i) => patch(cookie, attendance.id, { fullName: `Ten So ${i}` })));
      expect(res.filter((r) => r.status === 200)).toHaveLength(3);
      expect(res.filter((r) => r.status === 409)).toHaveLength(3);
      expect((await row(attendance.id)).editCount).toBe(3);
      expect(await edits(attendance.id)).toHaveLength(3);
    });

    it('[BM] TU CHOI: thiet bi khac / khong cookie / cookie gia / id khong ton tai -> cung mot 404, du lieu khong doi', async () => {
      const ev = await openEvent(w);
      const { attendance } = await checkinAs(w, ev.token, { fullName: 'Chu Nhan' });
      const other = await deviceCookie(app, ev.token);
      const bodies = [];
      for (const [c, id] of [[other, attendance.id], [null, attendance.id], ['tdc_dev=gia.mao', attendance.id], [other, randomUUID()]] as const) {
        const res = await patch(c, id, { fullName: 'Ke Pha Hoai' }).expect(404);
        bodies.push(res.body);
      }
      expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
      expect((await row(attendance.id)).fullName).toBe('Chu Nhan');
      expect(await edits(attendance.id)).toHaveLength(0);
    });

    it('[NV] 3.4: da dong diem danh -> 409 EDIT_CLOSED (phai gui khieu nai), du lieu khong doi', async () => {
      const ev = await openEvent(w);
      const { cookie, attendance } = await checkinAs(w, ev.token);
      await w.ds.query("UPDATE events SET status = 'CHECKIN_CLOSED' WHERE id = ?", [ev.id]);
      expect((await patch(cookie, attendance.id, { fullName: 'Muon Roi' }).expect(409)).body.code).toBe('EDIT_CLOSED');
      const info = await request(app.getHttpServer()).get(`/api/public/events/by-token/${ev.token}`).set('Cookie', cookie).expect(200);
      expect(info.body).toMatchObject({ state: 'CLOSED', attendance: { canEdit: false } });
    });

    it('TU CHOI: khong co gi doi / chi co khoa -> 400 NO_CHANGES va khong tieu mot luot sua', async () => {
      const ev = await openEvent(w);
      const { cookie, attendance } = await checkinAs(w, ev.token, { fullName: 'Nguyen Van An' });
      for (const b of [{}, { fullName: 'Nguyen Van An' }, { mssv: attendance.mssv.toLowerCase() }, { facultyUnitId: w.faculty }]) {
        expect((await patch(cookie, attendance.id, b).expect(400)).body.code).toBe('NO_CHANGES');
      }
      expect((await row(attendance.id)).editCount).toBe(0);
    });

    it.each([
      ['mssv sai', { mssv: '123' }], ['mssv tiem SQL', { mssv: "24211TM1152'; DROP TABLE attendances;--" }], ['ten 1 ky tu', { fullName: 'A' }],
      ['ten co ky tu dieu khien', { fullName: 'An\u0007Binh' }], ['khoa khong phai uuid', { facultyUnitId: '1' }], ['email sai', { email: 'x@' }],
      ['truong la', { editCount: 0 }], ['truong checkinAt', { checkinAt: new Date().toISOString() }], ['truong deviceId', { deviceId: 'abc' }],
      ['thieu key', { idempotencyKey: undefined, fullName: 'Ten Moi Ne' }],
    ])('TU CHOI: du lieu xau (%s) -> 400, du lieu khong doi', async (_n, b) => {
      const ev = await openEvent(w);
      const { cookie, attendance } = await checkinAs(w, ev.token, { fullName: 'Ten Goc' });
      await patch(cookie, attendance.id, b).expect(400);
      expect(await row(attendance.id)).toMatchObject({ fullName: 'Ten Goc', editCount: 0 });
    });

    it('TU CHOI: khoa khong hop le (Doan truong / ngung hoat dong / khong ton tai) -> 400 INVALID_FACULTY', async () => {
      const ev = await openEvent(w);
      const { cookie, attendance } = await checkinAs(w, ev.token);
      const dtn = (await w.ds.query("SELECT id FROM units WHERE code = 'DTN'"))[0].id;
      for (const id of [dtn, randomUUID()]) expect((await patch(cookie, attendance.id, { facultyUnitId: id }).expect(400)).body.code).toBe('INVALID_FACULTY');
      expect((await row(attendance.id)).editCount).toBe(0);
    });

    it('[NV] 5.3: doi MSSV -> chuan hoa, them cap MSSV/thiet bi moi, viec nen tinh lai co', async () => {
      const ev = await openEvent(w);
      const { cookie, attendance } = await checkinAs(w, ev.token, { mssv: '24211TM1001' });
      const res = await patch(cookie, attendance.id, { mssv: ' 24211tm2002 ' }).expect(200);
      expect(res.body.attendance.mssv).toBe('24211TM2002');
      const bind = await w.ds.query('SELECT mssv FROM student_devices ORDER BY mssv');
      expect(bind.map((b: any) => b.mssv)).toEqual(['24211TM1001', '24211TM2002']);
      const jobs = await w.ds.query('SELECT payload_json AS p FROM attendance_jobs ORDER BY id');
      expect(jobs.map((j: any) => j.p)).toEqual([{ newDevice: false }, { edit: true }]);
    });

    it('khong the sua luot cua thiet bi khac ngay ca khi MSSV trung (chu that khong "lay lai" duoc luot cua nguoi diem danh ho)', async () => {
      const ev = await openEvent(w);
      const { attendance } = await checkinAs(w, ev.token, { mssv: '24211TM5005' });
      const victim = await deviceCookie(app, ev.token);
      await postCheckin(app, victim, checkinBody(w, ev.token, { mssv: '24211TM5005' })).expect(201);
      await patch(victim, attendance.id, { fullName: 'Chiem Doat' }).expect(404);
      expect((await row(attendance.id)).fullName).not.toBe('Chiem Doat');
    });
  });

  describe('lich su (5.4)', () => {
    it('thiet bi thay luot cua minh kem ma xac nhan; chua tung diem danh / khong cookie -> danh sach rong', async () => {
      const a = await openEvent(w, { title: 'Sự kiện A' });
      const b = await openEvent(w, { title: 'Sự kiện B' });
      const { cookie, attendance } = await checkinAs(w, a.token, { mssv: '24211TM6001' });
      await postCheckin(app, cookie, checkinBody(w, b.token, { mssv: '24211TM6001' })).expect(201);
      const res = await history(cookie).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.items.map((i: any) => i.eventTitle).sort()).toEqual(['Sự kiện A', 'Sự kiện B']);
      expect(res.body.items.every((i: any) => i.viaThisDevice && /^[A-Z2-9]{8}$/.test(i.confirmCode))).toBe(true);
      expect(res.body.items[0]).toHaveProperty('timeliness');
      expect(attendance.confirmCode).toBe(res.body.items.find((i: any) => i.eventTitle === 'Sự kiện A').confirmCode);
      expect((await history(null).expect(200)).body).toEqual({ items: [] });
      expect((await history(await deviceCookie(app, a.token)).expect(200)).body).toEqual({ items: [] });
    });

    it('[NV] 5.4: nguoi bi diem danh ho thay luot do thiet bi khac, nhung KHONG thay ma xac nhan hay thong tin nguoi kia nhap', async () => {
      const ev = await openEvent(w, { title: 'Sự kiện bị mạo danh' });
      const victim = '24211TM7007';
      const fraud = await checkinAs(w, ev.token, { mssv: victim, fullName: 'Ke Mao Danh' });
      const otherEvent = await openEvent(w, { title: 'Sự kiện thật' });
      const real = await checkinAs(w, otherEvent.token, { mssv: victim, fullName: 'Chu That' });
      const seen = (await history(real.cookie).expect(200)).body.items;
      const mine = seen.find((i: any) => i.eventTitle === 'Sự kiện thật');
      const theirs = seen.find((i: any) => i.eventTitle === 'Sự kiện bị mạo danh');
      expect(mine).toMatchObject({ viaThisDevice: true });
      expect(theirs).toMatchObject({ viaThisDevice: false, confirmCode: null });
      const text = JSON.stringify(seen);
      for (const secret of ['Ke Mao Danh', fraud.attendance.confirmCode, 'deviceId', 'ip']) expect(text).not.toContain(secret);
      expect(Object.keys(theirs).sort()).toEqual(['checkinAt', 'checkoutAt', 'confirmCode', 'eventStartAt', 'eventTitle', 'timeliness', 'viaThisDevice']);
    });

    it('[BM] thiet bi KHONG thay lich su cua MSSV khac (khong gan voi thiet bi nay); luot da huy khong hien', async () => {
      const ev = await openEvent(w);
      await checkinAs(w, ev.token, { mssv: '24211TM8001', fullName: 'Nguoi Khac' });
      const mine = await checkinAs(w, ev.token, { mssv: '24211TM8002' });
      const res = (await history(mine.cookie).expect(200)).body;
      expect(res.items).toHaveLength(1);
      expect(JSON.stringify(res)).not.toContain('Nguoi Khac');
      await w.ds.query('UPDATE attendances SET voided_at = NOW(3), void_reason = ? WHERE id = ?', ['huy thu', mine.attendance.id]);
      expect((await history(mine.cookie).expect(200)).body.items).toHaveLength(0);
    });

    it('MSSV da sua nham roi sua lai thi khong con lich su cua MSSV nham (nguoi khac)', async () => {
      const ev = await openEvent(w);
      const { cookie, attendance } = await checkinAs(w, ev.token, { mssv: '24211TM9001' });
      const e2 = await openEvent(w, { title: 'Sự kiện của người khác' });
      await checkinAs(w, e2.token, { mssv: '24211TM9001' }); // nguoi that cua MSSV nham
      await patch(cookie, attendance.id, { mssv: '24211TM9002' }).expect(200);
      const items = (await history(cookie).expect(200)).body.items;
      expect(items.map((i: any) => i.eventTitle)).not.toContain('Sự kiện của người khác');
    });

    it('lich su toi da 50 dong, moi nhat truoc', async () => {
      const first = await openEvent(w);
      const { cookie } = await checkinAs(w, first.token, { mssv: '24211TM1111' });
      // chen thang 51 luot khac cua cung MSSV de khong phai goi 51 lan diem danh
      for (let i = 0; i < 51; i++) {
        const e = await openEvent(w, { title: `Sự kiện ${i}` });
        await w.ds.query(
          `INSERT INTO attendances (id, event_id, device_id, mssv, full_name, faculty_unit_id, checkin_at, timeliness, confirm_code)
           VALUES (UUID(), ?, NULL, '24211TM1111', 'X', ?, NOW(3) + INTERVAL ? SECOND, 'LATE', 'AAAAAAAA')`,
          [e.id, w.faculty, i + 1],
        );
      }
      const items = (await history(cookie).expect(200)).body.items;
      expect(items).toHaveLength(50);
      const times = items.map((i: any) => new Date(i.checkinAt).getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      expect(items[0].eventTitle).toBe('Sự kiện 50');
    });
  });
});
