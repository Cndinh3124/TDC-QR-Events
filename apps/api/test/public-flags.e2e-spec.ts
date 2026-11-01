// Test worker gan co (5.3), bang dem truc tiep, va cac ham thuan cua luat gan co
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { findBurst, haversineM, isSimilar, levenshtein, normalizeMssv, normalizeName } from '../src/public/flag-rules';
import { FlagWorker } from '../src/public/flag.worker';
import { SettingsService } from '../src/settings/settings.service';
import {
  as, checkinAs, checkinBody, createTestApp, deviceCookie, openEvent, patchEvent, postCheckin, runWorker, setupWorld, World, flagsOf,
} from './public-helpers';
import { makeUser, login } from './helpers';

describe('Luat gan co chay nen', () => {
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

  const patch = (cookie: string, id: string, body: object) =>
    request(app.getHttpServer()).patch(`/api/public/attendances/${id}`).set('Cookie', cookie).send({ idempotencyKey: randomUUID(), ...body });
  const flags = (id: string) => flagsOf(w.ds, id);
  const jobs = () => w.ds.query('SELECT id, status, attempts, run_at AS runAt FROM attendance_jobs ORDER BY id');
  const GEO = { latitude: 10.85, longitude: 106.77, radiusM: 100 };
  const IN_RADIUS = { lat: 10.85, lng: 106.77, accuracyM: 20 };

  describe('GPS (5.3)', () => {
    // diem danh ngoai ban kinh / thieu GPS da bi CHAN luc diem danh (xem public-geo.e2e-spec.ts);
    // worker van danh gia lai de bat truong hop QTV doi toa do SAU khi sinh vien da diem danh
    it('QTV doi toa do sau khi da diem danh: worker danh gia theo toa do moi -> GPS_OUTSIDE + luu khoang cach', async () => {
      const ev = await openEvent(w, GEO);
      const ok = await checkinAs(w, ev.token, { lat: 10.85, lng: 106.77, accuracyM: 20 });
      expect((await w.ds.query('SELECT distance_m AS d FROM attendances WHERE id = ?', [ok.attendance.id]))[0].d).toBeLessThan(5);
      await patchEvent(w, ev.id, { latitude: 10.9, longitude: 106.77 });
      await runWorker(app);
      expect(await flags(ok.attendance.id)).toEqual(['GPS_OUTSIDE']);
      const detail = (await w.ds.query("SELECT detail_json AS j FROM attendance_flags WHERE code = 'GPS_OUTSIDE'"))[0].j;
      expect(Object.keys(detail).sort()).toEqual(['distanceM', 'radiusM']);
      const all = JSON.stringify(await w.ds.query('SELECT detail_json FROM attendance_flags'));
      expect(all).not.toContain('10.9');
      expect(all).not.toContain('106.77');
    });

    it('su kien khong co toa do: khong gan co GPS du co gui hay khong', async () => {
      const ev = await openEvent(w);
      const a = await checkinAs(w, ev.token, { lat: 1, lng: 1, accuracyM: 500 });
      const b = await checkinAs(w, ev.token);
      await runWorker(app);
      expect(await flags(a.attendance.id)).toEqual([]);
      expect(await flags(b.attendance.id)).toEqual([]);
    });
  });

  describe('thiet bi / MSSV (5.3)', () => {
    it('diem danh sach (co cookie, khong trung) -> khong co nao; khong cookie -> NEW_DEVICE', async () => {
      const ev = await openEvent(w);
      const clean = await checkinAs(w, ev.token);
      const noCookie = (await postCheckin(app, null, checkinBody(w, ev.token)).expect(201)).body.attendance;
      await runWorker(app);
      expect(await flags(clean.attendance.id)).toEqual([]);
      expect(await flags(noCookie.id)).toEqual(['NEW_DEVICE']);
    });

    it('DUPLICATE_MSSV: cung MSSV tu 2 thiet bi trong su kien -> CA HAI luot deu bi gan co; MSSV_MULTI_DEVICE chi o nguoi den sau', async () => {
      const ev = await openEvent(w);
      const first = await checkinAs(w, ev.token, { mssv: '24211TM1500' });
      await runWorker(app);
      expect(await flags(first.attendance.id)).toEqual([]);
      const second = await checkinAs(w, ev.token, { mssv: '24211TM1500', fullName: 'Nguyễn Văn An' });
      await runWorker(app);
      expect(await flags(first.attendance.id)).toEqual(['DUPLICATE_MSSV']);
      expect(await flags(second.attendance.id)).toEqual(['DUPLICATE_MSSV', 'MSSV_MULTI_DEVICE']);
    });

    it('MSSV_MULTI_DEVICE o su kien khac: khong phai DUPLICATE (khac su kien), chi nguoi den sau bi gan', async () => {
      const a = await openEvent(w);
      const b = await openEvent(w);
      const one = await checkinAs(w, a.token, { mssv: '24211TM1600' });
      const two = await checkinAs(w, b.token, { mssv: '24211TM1600' });
      await runWorker(app);
      expect(await flags(one.attendance.id)).toEqual([]);
      expect(await flags(two.attendance.id)).toEqual(['MSSV_MULTI_DEVICE']);
    });

    it('DEVICE_MULTI_MSSV: mot thiet bi diem danh MSSV khac han o su kien khac -> gan co; go nham 1-2 ky tu thi KHONG', async () => {
      const a = await openEvent(w);
      const b = await openEvent(w);
      const cookie = await deviceCookie(app, a.token);
      await postCheckin(app, cookie, checkinBody(w, a.token, { mssv: '24211TM1001' })).expect(201);
      const far = (await postCheckin(app, cookie, checkinBody(w, b.token, { mssv: '24211TM9876' })).expect(201)).body.attendance;
      // thiet bi khac: MSSV lech 1 ky tu
      const c = await openEvent(w);
      const d = await openEvent(w);
      const cookie2 = await deviceCookie(app, c.token);
      await postCheckin(app, cookie2, checkinBody(w, c.token, { mssv: '24211TM3001' })).expect(201);
      const typo = (await postCheckin(app, cookie2, checkinBody(w, d.token, { mssv: '24211TM3002' })).expect(201)).body.attendance;
      await runWorker(app);
      expect(await flags(far.id)).toEqual(['DEVICE_MULTI_MSSV']);
      expect(await flags(typo.id)).toEqual([]);
    });

    it('DEVICE_MULTI_MSSV: chi tinh trong khoang so ngay cau hinh', async () => {
      const a = await openEvent(w);
      const b = await openEvent(w);
      const cookie = await deviceCookie(app, a.token);
      await postCheckin(app, cookie, checkinBody(w, a.token, { mssv: '24211TM4001' })).expect(201);
      await w.ds.query('UPDATE student_devices SET first_seen_at = NOW(3) - INTERVAL 200 DAY'); // ngoai 180 ngay
      const later = (await postCheckin(app, cookie, checkinBody(w, b.token, { mssv: '24211TM4999' })).expect(201)).body.attendance;
      await runWorker(app);
      expect(await flags(later.id)).toEqual([]);
      await as(app, w.admin).patch('/api/admin/settings').send({ device_mssv_window_days: 365 }).expect(200);
      await w.ds.query("UPDATE attendance_jobs SET status = 'PENDING', run_at = NOW(3)");
      await runWorker(app);
      expect(await flags(later.id)).toEqual(['DEVICE_MULTI_MSSV']);
    });

    it('sua MSSV sang so khac han -> viec nen gan DEVICE_MULTI_MSSV; sua nho (go nham) thi khong', async () => {
      const ev = await openEvent(w);
      const far = await checkinAs(w, ev.token, { mssv: '24211TM5001' });
      const near = await checkinAs(w, ev.token, { mssv: '24211TM5101' });
      await runWorker(app);
      await patch(far.cookie, far.attendance.id, { mssv: '24211TM9876' }).expect(200);
      await patch(near.cookie, near.attendance.id, { mssv: '24211TM5102' }).expect(200);
      await runWorker(app);
      expect(await flags(far.attendance.id)).toEqual(['DEVICE_MULTI_MSSV']);
      expect(await flags(near.attendance.id)).toEqual([]);
    });
  });

  describe('ten / khoa / burst (5.3)', () => {
    it('NAME_MISMATCH khi ten lech nhieu so voi lan truoc; lech <= 2 ky tu hoac khac dau thi KHOP', async () => {
      const a = await openEvent(w);
      const b = await openEvent(w);
      const c = await openEvent(w);
      await checkinAs(w, a.token, { mssv: '24211TM6001', fullName: 'Nguyễn Văn An' });
      const diff = await checkinAs(w, b.token, { mssv: '24211TM6001', fullName: 'Trần Thị Bích' });
      const same = await checkinAs(w, c.token, { mssv: '24211TM6001', fullName: 'NGUYEN  VAN  ANH' }); // so voi luot truoc (Tran Thi Bich) van khac
      await runWorker(app);
      expect(await flags(diff.attendance.id)).toContain('NAME_MISMATCH');
      expect(await flags(same.attendance.id)).toContain('NAME_MISMATCH');
      // truong hop khop: so voi luot ngay truoc no
      const d1 = await openEvent(w);
      const d2 = await openEvent(w);
      await checkinAs(w, d1.token, { mssv: '24211TM6002', fullName: 'Lê Thị Đào' });
      const ok = await checkinAs(w, d2.token, { mssv: '24211TM6002', fullName: 'le thi dao ' });
      await runWorker(app);
      expect(await flags(ok.attendance.id)).not.toContain('NAME_MISMATCH');
    });

    it('FACULTY_MISMATCH khi khoa khac lan truoc cua cung MSSV', async () => {
      const a = await openEvent(w);
      const b = await openEvent(w);
      await checkinAs(w, a.token, { mssv: '24211TM6100' });
      const other = await checkinAs(w, b.token, { mssv: '24211TM6100', facultyUnitId: w.faculty2 });
      await runWorker(app);
      expect(await flags(other.attendance.id)).toContain('FACULTY_MISMATCH');
      expect(await flags(other.attendance.id)).not.toContain('NAME_MISMATCH');
    });

    it('BURST_SAME_FINGERPRINT: >= 3 MSSV trong 60 giay cung fingerprint + IP -> gan ca 3; chi 2 thi khong', async () => {
      const ev = await openEvent(w);
      const fp = { fingerprint: 'fp-cung-mot-may-1234' };
      const two = [await checkinAs(w, ev.token, fp), await checkinAs(w, ev.token, fp)];
      await runWorker(app);
      for (const t of two) expect(await flags(t.attendance.id)).toEqual([]);
      const three = await checkinAs(w, ev.token, fp);
      const other = await checkinAs(w, ev.token, { fingerprint: 'fp-may-khac-nhau-5678' });
      await runWorker(app);
      for (const t of [...two, three]) expect(await flags(t.attendance.id)).toEqual(['BURST_SAME_FINGERPRINT']);
      expect(await flags(other.attendance.id)).toEqual([]);
    });

    it('BURST: 3 luot cach nhau hon 60 giay khong tinh; fingerprint luu dang hash, khong luu ro', async () => {
      const ev = await openEvent(w);
      const fp = { fingerprint: 'fp-cung-mot-may-9999' };
      const rows = [await checkinAs(w, ev.token, fp), await checkinAs(w, ev.token, fp), await checkinAs(w, ev.token, fp)];
      await w.ds.query('UPDATE attendances SET checkin_at = checkin_at - INTERVAL 5 MINUTE WHERE id = ?', [rows[0].attendance.id]);
      await w.ds.query('UPDATE attendances SET checkin_at = checkin_at - INTERVAL 10 MINUTE WHERE id = ?', [rows[1].attendance.id]);
      await runWorker(app);
      for (const r of rows) expect(await flags(r.attendance.id)).toEqual([]);
      expect(JSON.stringify(await w.ds.query('SELECT * FROM devices'))).not.toContain('fp-cung-mot-may');
    });
  });

  describe('worker (do tin cay)', () => {
    it('worker tao ho so sinh vien (students) va danh dau viec DONE', async () => {
      const ev = await openEvent(w);
      await checkinAs(w, ev.token, { mssv: '24211TM7001', fullName: 'Phạm Văn Cường' });
      expect(await runWorker(app)).toBe(1);
      expect(await w.ds.query("SELECT full_name_latest AS n FROM students WHERE mssv = '24211TM7001'")).toEqual([{ n: 'Phạm Văn Cường' }]);
      expect((await jobs()).map((j: any) => j.status)).toEqual(['DONE']);
      expect(await runWorker(app)).toBe(0); // chay lai khong lam gi
    });

    it('luot da huy: viec xong, khong gan co', async () => {
      const ev = await openEvent(w);
      const a = await checkinAs(w, ev.token, { mssv: '24211TM7100' });
      await w.ds.query('UPDATE attendances SET voided_at = NOW(3), void_reason = ? WHERE id = ?', ['huy thu', a.attendance.id]);
      await runWorker(app);
      expect(await flags(a.attendance.id)).toEqual([]);
      expect((await jobs())[0].status).toBe('DONE');
    });

    it('loi giua chung: viec o lai PENDING de thu lai, khong mat; thu lai thanh cong thi ra co; qua 5 lan thi FAILED', async () => {
      const ev = await openEvent(w, GEO);
      const a = await checkinAs(w, ev.token, IN_RADIUS);
      await patchEvent(w, ev.id, { latitude: 10.9 }); // doi toa do -> se co GPS_OUTSIDE khi chay xong
      const spy = jest.spyOn(app.get(SettingsService), 'get').mockRejectedValue(Object.assign(new Error('boom: 24211TM1234'), { code: 'BOOM' }));
      try {
        await runWorker(app);
        let [j] = await jobs();
        expect(j).toMatchObject({ status: 'PENDING', attempts: 1 });
        expect(await flags(a.attendance.id)).toEqual([]);
        spy.mockRestore();
        await w.ds.query('UPDATE attendance_jobs SET run_at = NOW(3) - INTERVAL 1 SECOND');
        await runWorker(app);
        [j] = (await jobs());
        expect(j.status).toBe('DONE');
        expect(await flags(a.attendance.id)).toEqual(['GPS_OUTSIDE']);
      } finally {
        spy.mockRestore();
      }
      // loi vinh vien
      const b = await checkinAs(w, ev.token, { lat: 10.9, lng: 106.77, accuracyM: 20 }); // trong ban kinh cua toa do moi
      const spy2 = jest.spyOn(app.get(SettingsService), 'get').mockRejectedValue(Object.assign(new Error('x'), { code: 'BOOM' }));
      try {
        for (let i = 0; i < 6; i++) {
          await w.ds.query("UPDATE attendance_jobs SET run_at = NOW(3) - INTERVAL 1 SECOND WHERE status = 'PENDING'");
          await runWorker(app);
        }
      } finally {
        spy2.mockRestore();
      }
      const all = await jobs();
      expect(all[1]).toMatchObject({ status: 'FAILED', attempts: 5 });
      expect(await flags(b.attendance.id)).toEqual([]);
    });

    it('[BM] log loi cua worker chi co ma loi, khong lo MSSV / noi dung thong bao loi', async () => {
      const ev = await openEvent(w);
      await checkinAs(w, ev.token);
      const logged: string[] = [];
      const log = jest.spyOn((app.get(FlagWorker) as any).log, 'error').mockImplementation((m: unknown) => void logged.push(String(m)));
      const spy = jest.spyOn(app.get(SettingsService), 'get').mockRejectedValue(Object.assign(new Error('Duplicate entry 24211TM1234'), { code: 'ER_DUP_ENTRY' }));
      try {
        await runWorker(app);
      } finally {
        spy.mockRestore();
        log.mockRestore();
      }
      expect(logged).toHaveLength(1);
      expect(logged[0]).toContain('ER_DUP_ENTRY');
      expect(logged[0]).not.toContain('24211TM1234');
    });

    it('hai worker chay cung luc: moi viec chi xu ly dung 1 lan (SKIP LOCKED), moi co khong bi nhan doi', async () => {
      const ev = await openEvent(w);
      const fp = { fingerprint: 'fp-cung-mot-may-0000' };
      await Promise.all(Array.from({ length: 40 }, async () => {
        const cookie = await deviceCookie(app, ev.token);
        await postCheckin(app, cookie, checkinBody(w, ev.token, fp)).expect(201);
      }));
      const worker = app.get(FlagWorker);
      const done = await Promise.all([worker.drain(), worker.drain(), worker.drain()]);
      expect(done.reduce((a, b) => a + b, 0)).toBe(40);
      const all = await jobs();
      expect(all).toHaveLength(40);
      expect(all.every((j: any) => j.status === 'DONE' && Number(j.attempts) === 1)).toBe(true);
      const [{ n, uniq }] = await w.ds.query("SELECT COUNT(*) AS n, COUNT(DISTINCT attendance_id) AS uniq FROM attendance_flags WHERE code = 'BURST_SAME_FINGERPRINT'");
      expect(Number(n)).toBe(Number(uniq));
    });

    it('worker tu chay nen khi bat FLAG_WORKER_ENABLED (khong can goi tay)', async () => {
      const prev = process.env.FLAG_WORKER_ENABLED;
      process.env.FLAG_WORKER_ENABLED = 'true';
      const live = await createTestApp();
      process.env.FLAG_WORKER_ENABLED = prev;
      try {
        const ev = await openEvent(w);
        const a = await checkinAs(w, ev.token, { mssv: '24211TM7300' });
        const noCookie = (await postCheckin(app, null, checkinBody(w, ev.token)).expect(201)).body.attendance;
        let done = false;
        for (let i = 0; i < 40 && !done; i++) {
          await new Promise((r) => setTimeout(r, 250));
          done = (await jobs()).every((j: any) => j.status === 'DONE');
        }
        expect(done).toBe(true);
        expect(await flags(noCookie.id)).toEqual(['NEW_DEVICE']);
        expect(await flags(a.attendance.id)).toEqual([]);
      } finally {
        await live.close();
      }
    });
  });

  describe('bang dem truc tiep (admin)', () => {
    const counters = (s: { token: string }, id: string) =>
      request(app.getHttpServer()).get(`/api/admin/events/${id}/counters`).set('Authorization', `Bearer ${s.token}`);

    it('khop voi so luot that sau nhieu luot cung luc (vao, ra, dung gio / muon)', async () => {
      const ev = await openEvent(w, { requireCheckout: true });
      const res = await Promise.all(Array.from({ length: 30 }, async () => {
        const cookie = await deviceCookie(app, ev.token);
        await postCheckin(app, cookie, checkinBody(w, ev.token)).expect(201);
        return cookie;
      }));
      await Promise.all(res.slice(0, 12).map((c) => request(app.getHttpServer()).post('/api/public/checkout').set('Cookie', c).send({ token: ev.outToken, idempotencyKey: randomUUID() }).expect(201)));
      const real = (await w.ds.query("SELECT COUNT(*) AS n, SUM(timeliness = 'ON_TIME') AS ot, SUM(checkout_at IS NOT NULL) AS o FROM attendances"))[0];
      const res2 = (await counters(w.admin, ev.id).expect(200)).body;
      expect(res2).toEqual({ checkinCount: Number(real.n), checkoutCount: Number(real.o), onTimeCount: Number(real.ot), lateCount: Number(real.n) - Number(real.ot) });
      expect(res2).toMatchObject({ checkinCount: 30, checkoutCount: 12 });
    });

    it('[BM] phan quyen: chua dang nhap 401; khoa khac 404; su kien cap truong: khong chia se 404, chia se cho khoa thi 200 (chi so tong)', async () => {
      await makeUser(w.ds, { email: 'kt@tdc.edu.vn', unit: 'KT' });
      const kt = await login(app, 'kt@tdc.edu.vn');
      const own = await openEvent(w); // do Doan truong tao -> cap truong
      await request(app.getHttpServer()).get(`/api/admin/events/${own.id}/counters`).expect(401);
      await counters(w.cntt, own.id).expect(404); // NONE
      await counters(kt, own.id).expect(404);
      await as(app, w.admin).post(`/api/admin/events/${own.id}/faculty-view`).send({ mode: 'SELECTED', unitIds: [w.faculty], reason: 'cho khoa xem' }).expect(200);
      expect((await counters(w.cntt, own.id).expect(200)).body).toHaveProperty('checkinCount');
      await counters(kt, own.id).expect(404); // khoa khong duoc chon
      // su kien cua khoa CNTT: khoa KT khong thay
      const mine = (await as(app, w.cntt).post('/api/admin/events').send({ title: 'Sự kiện khoa CNTT', hasDrl: false, startAt: new Date(Date.now() + 3600_000).toISOString(), endAt: new Date(Date.now() + 7200_000).toISOString() }).expect(201)).body;
      await counters(w.cntt, mine.id).expect(200);
      await counters(kt, mine.id).expect(404);
      await counters(w.admin, mine.id).expect(200);
      await counters(w.admin, randomUUID()).expect(404);
      await counters(w.admin, 'khong-phai-uuid').expect(400);
    });

    it('su kien chua co luot nao: toan 0', async () => {
      const ev = await openEvent(w);
      expect((await counters(w.admin, ev.id).expect(200)).body).toEqual({ checkinCount: 0, checkoutCount: 0, onTimeCount: 0, lateCount: 0 });
    });
  });

  describe('ham thuan', () => {
    it('chuan hoa MSSV va ten', () => {
      expect(normalizeMssv(' 24 211tm 1152\t')).toBe('24211TM1152');
      expect(normalizeName('  Nguyễn   Văn  ĐẠT ')).toBe('nguyen van dat');
      expect(isSimilar('nguyen van an', 'nguyen van anh')).toBe(true);
      expect(isSimilar('nguyen van an', 'tran thi bich')).toBe(false);
      expect(levenshtein('', 'abc')).toBe(3);
      expect(levenshtein('24211TM1152', '24211TM1152')).toBe(0);
    });

    it('haversine: 0.001 do vi do ~ 111 m; cung diem = 0', () => {
      expect(haversineM(10, 106, 10, 106)).toBe(0);
      expect(haversineM(10, 106, 10.001, 106)).toBeGreaterThan(105);
      expect(haversineM(10, 106, 10.001, 106)).toBeLessThan(115);
    });

    it('findBurst: can >= 3 MSSV KHAC NHAU trong 60 giay va co luot dang xet', () => {
      const t = Date.parse('2026-12-05T08:00:00Z');
      const r = (id: string, mssv: string, s: number) => ({ id, mssv, at: t + s * 1000 });
      expect(findBurst([r('a', 'A', 0), r('b', 'B', 30), r('c', 'C', 59)], 'b').sort()).toEqual(['a', 'b', 'c']);
      expect(findBurst([r('a', 'A', 0), r('b', 'B', 30), r('c', 'C', 61)], 'b')).toEqual([]);
      expect(findBurst([r('a', 'A', 0), r('b', 'A', 10), r('c', 'B', 20)], 'a')).toEqual([]); // chi 2 MSSV khac nhau
      expect(findBurst([r('a', 'A', 0), r('b', 'B', 10), r('c', 'C', 20), r('d', 'D', 500)], 'd')).toEqual([]); // luot dang xet ngoai cum
    });
  });
});
