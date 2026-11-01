// Test diem danh ra + ma 4 so + gioi han nhap sai - dac ta 3.3, 5.2, 8.4
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { QrService } from '../src/events/qr.service';
import { Attendance } from '../src/public/entities/attendance.entity';
import {
  as, checkinAs, createTestApp, deviceCookie, openEvent, patchEvent, setupWorld, World,
} from './public-helpers';

describe('Diem danh cong khai - ra va ma 4 so', () => {
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

  const out = (cookie: string | null, body: object) => {
    const r = request(app.getHttpServer()).post('/api/public/checkout');
    return (cookie ? r.set('Cookie', cookie) : r).send(body);
  };
  const body = (token: string, o: Record<string, unknown> = {}) => ({ token, idempotencyKey: randomUUID(), ...o });
  const wrongCode = (real: string) => (real === '0000' ? '1111' : '0000');
  const att = (id: string) => w.ds.getRepository(Attendance).findOneByOrFail({ id });
  const counters = async (id: string) => (await as(app, w.admin).get(`/api/admin/events/${id}/counters`).expect(200)).body;
  const tight = () => openEvent(w, { drlPoints: 8, controlLevel: 'TIGHT' });

  describe('diem danh ra', () => {
    it('muc Thuong khong bat diem danh ra: QR vao khong dung de ra (404), khong co QR ra', async () => {
      const ev = await openEvent(w);
      expect(ev.outToken).toBeNull();
      const { cookie } = await checkinAs(w, ev.token);
      await out(cookie, body(ev.token)).expect(404);
    });

    it('bat diem danh ra o muc Thuong: khong can ma 4 so; ghi gio ra, bo dem tang, gio vao giu nguyen', async () => {
      const ev = await openEvent(w, { requireCheckout: true });
      expect(ev.verifyCode).toBeNull();
      const { cookie, attendance } = await checkinAs(w, ev.token);
      const before = await att(attendance.id);
      const res = await out(cookie, body(ev.outToken!)).expect(201);
      expect(res.body.attendance.checkoutAt).not.toBeNull();
      const after = await att(attendance.id);
      expect(after.checkoutAt).not.toBeNull();
      expect(after.checkinAt).toEqual(before.checkinAt);
      expect(await counters(ev.id)).toMatchObject({ checkinCount: 1, checkoutCount: 1 });
    });

    it('TU CHOI: chua diem danh vao (thiet bi khac / khong cookie) -> 409 NO_CHECKIN, khong lo luot cua nguoi khac', async () => {
      const ev = await tight();
      const { attendance } = await checkinAs(w, ev.token, { mssv: '24211TM4001' });
      for (const cookie of [await deviceCookie(app, ev.token), null]) {
        const res = await out(cookie, body(ev.outToken!, { verifyCode: ev.verifyCode })).expect(409);
        expect(res.body.code).toBe('NO_CHECKIN');
        expect(JSON.stringify(res.body)).not.toContain('24211TM4001');
      }
      expect((await att(attendance.id)).checkoutAt).toBeNull();
    });

    it('TU CHOI: QR vao dung de ra, QR sai, QR da doi ma -> 404', async () => {
      const ev = await tight();
      const { cookie } = await checkinAs(w, ev.token);
      for (const token of [ev.token, 'c'.repeat(22), 'ngan']) {
        await out(cookie, body(token, { verifyCode: ev.verifyCode })).expect(404);
      }
      await as(app, w.admin).post(`/api/admin/events/${ev.id}/qr/rotate`).send({ purpose: 'CHECKOUT', reason: 'nghi lo ma' }).expect(200);
      await out(cookie, body(ev.outToken!, { verifyCode: ev.verifyCode })).expect(404);
    });

    it('TU CHOI: da dong diem danh -> 409 CHECKIN_CLOSED', async () => {
      const ev = await openEvent(w, { requireCheckout: true });
      const { cookie, attendance } = await checkinAs(w, ev.token);
      await as(app, w.admin).post(`/api/admin/events/${ev.id}/close`).expect(200);
      expect((await out(cookie, body(ev.outToken!)).expect(409)).body.code).toBe('CHECKIN_CLOSED');
      expect((await att(attendance.id)).checkoutAt).toBeNull();
    });

    it('da ra roi: khoa khac -> 409 ALREADY_CHECKED_OUT; gui lai cung khoa -> 200 ket qua cu, bo dem khong tang', async () => {
      const ev = await openEvent(w, { requireCheckout: true });
      const { cookie } = await checkinAs(w, ev.token);
      const first = body(ev.outToken!);
      await out(cookie, first).expect(201);
      const again = await out(cookie, first).expect(200);
      expect(again.body.attendance.checkoutAt).not.toBeNull();
      expect((await out(cookie, body(ev.outToken!)).expect(409)).body.code).toBe('ALREADY_CHECKED_OUT');
      expect((await counters(ev.id)).checkoutCount).toBe(1);
    });

    it('20 request ra CUNG LUC -> bo dem checkout dung 1', async () => {
      const ev = await openEvent(w, { requireCheckout: true });
      const { cookie } = await checkinAs(w, ev.token);
      const res = await Promise.all(Array.from({ length: 20 }, () => out(cookie, body(ev.outToken!))));
      expect(res.filter((r) => r.status === 201)).toHaveLength(1);
      expect(res.every((r) => [201, 409].includes(r.status))).toBe(true);
      expect((await counters(ev.id)).checkoutCount).toBe(1);
    });

    it.each([
      ['token thieu', { token: undefined }], ['key sai', { idempotencyKey: 'x' }], ['truong la', { mssv: '24211TM1152' }],
      ['ma 3 so', { verifyCode: '123' }], ['ma 5 so', { verifyCode: '12345' }], ['ma la chu', { verifyCode: 'abcd' }], ['ma la so', { verifyCode: 1234 }],
    ])('TU CHOI: du lieu xau (%s) -> 400', async (_n, patch) => {
      const ev = await tight();
      const { cookie } = await checkinAs(w, ev.token);
      await out(cookie, { ...body(ev.outToken!), ...patch }).expect(400);
    });
  });

  describe('ma 4 so (muc Chat)', () => {
    it('bat buoc co ma; ma dung thi ra duoc va reset so lan sai', async () => {
      const ev = await tight();
      const { cookie, attendance } = await checkinAs(w, ev.token);
      expect((await out(cookie, body(ev.outToken!)).expect(400)).body.code).toBe('VERIFY_CODE_REQUIRED');
      const bad = await out(cookie, body(ev.outToken!, { verifyCode: wrongCode(ev.verifyCode!) })).expect(400);
      expect(bad.body).toMatchObject({ code: 'VERIFY_CODE_INVALID', attemptsLeft: 4 });
      expect((await att(attendance.id)).checkoutAt).toBeNull();
      await out(cookie, body(ev.outToken!, { verifyCode: ev.verifyCode })).expect(201);
      expect(await att(attendance.id)).toMatchObject({ codeFailCount: 0, codeLockedUntil: null });
    });

    it('[BM] by-token cua QR ra bao can ma 4 so nhung khong tra ma / hash', async () => {
      const ev = await tight();
      const res = await request(app.getHttpServer()).get(`/api/public/events/by-token/${ev.outToken}`).expect(200);
      expect(res.body).toMatchObject({ purpose: 'CHECKOUT', verifyCodeRequired: true });
      expect(JSON.stringify(res.body)).not.toContain(ev.verifyCode!);
    });

    it('[BM] sai 5 lan -> khoa 15 phut: lan thu 6 dung ma DUNG van bi tu choi (429 CODE_LOCKED); het khoa thi ra duoc', async () => {
      const ev = await tight();
      const { cookie, attendance } = await checkinAs(w, ev.token);
      const wrong = wrongCode(ev.verifyCode!);
      for (let i = 1; i <= 5; i++) {
        const r = await out(cookie, body(ev.outToken!, { verifyCode: wrong })).expect(400);
        expect(r.body.attemptsLeft).toBe(5 - i);
      }
      const locked = await out(cookie, body(ev.outToken!, { verifyCode: ev.verifyCode })).expect(429);
      expect(locked.body.code).toBe('CODE_LOCKED');
      expect((await att(attendance.id)).checkoutAt).toBeNull();
      expect((await att(attendance.id)).codeLockedUntil).not.toBeNull();
      // het han khoa (gia lap bang cach lui moc thoi gian)
      await w.ds.query('UPDATE attendances SET code_locked_until = NOW() - INTERVAL 1 MINUTE WHERE id = ?', [attendance.id]);
      await out(cookie, body(ev.outToken!, { verifyCode: ev.verifyCode })).expect(201);
    });

    it('[BM] het khoa roi lai sai: dem lai tu dau (5 phieu moi), khong duoc "tich" them', async () => {
      const ev = await tight();
      const { cookie, attendance } = await checkinAs(w, ev.token);
      const wrong = wrongCode(ev.verifyCode!);
      for (let i = 0; i < 5; i++) await out(cookie, body(ev.outToken!, { verifyCode: wrong })).expect(400);
      await w.ds.query('UPDATE attendances SET code_locked_until = NOW() - INTERVAL 1 MINUTE WHERE id = ?', [attendance.id]);
      const again = await out(cookie, body(ev.outToken!, { verifyCode: wrong })).expect(400);
      expect(again.body.attemptsLeft).toBe(4);
      expect((await att(attendance.id)).codeLockedUntil).toBeNull();
    });

    it('[BM] 40 lan thu SONG SONG tren mot luot: toi da 5 lan duoc so sanh ma, con lai 429 (khong vuot qua 5 phieu)', async () => {
      const ev = await tight();
      const { cookie } = await checkinAs(w, ev.token);
      const wrong = wrongCode(ev.verifyCode!);
      const res = await Promise.all(Array.from({ length: 40 }, () => out(cookie, body(ev.outToken!, { verifyCode: wrong }))));
      expect(res.filter((r) => r.status === 400)).toHaveLength(5);
      expect(res.filter((r) => r.status === 429)).toHaveLength(35);
      const [row] = await w.ds.query('SELECT fail_count AS n FROM event_code_failures');
      expect(Number(row.n)).toBe(5);
    });

    it('[BM] doi thiet bi khong giup do ma: thiet bi moi chua co luot vao khong duoc thu ma (409), khong tieu phieu cua ai', async () => {
      const ev = await tight();
      const { attendance } = await checkinAs(w, ev.token);
      for (let i = 0; i < 10; i++) {
        const fresh = await deviceCookie(app, ev.outToken!);
        const r = await out(fresh, body(ev.outToken!, { verifyCode: String(i).padStart(4, '0') })).expect(409);
        expect(r.body.code).toBe('NO_CHECKIN');
      }
      expect(await w.ds.query('SELECT COUNT(*) AS n FROM event_code_failures')).toEqual([{ n: '0' }]);
      expect((await att(attendance.id)).codeFailCount).toBe(0);
    });

    it('[BM] tran chung cua su kien: qua 500 lan sai trong cua so -> moi luot (ke ca ma dung) bi tam dung 429 CODE_ENTRY_PAUSED', async () => {
      const ev = await tight();
      const { cookie, attendance } = await checkinAs(w, ev.token);
      await w.ds.query('INSERT INTO event_code_failures (event_id, window_started_at, fail_count) VALUES (?, NOW(3), 500)', [ev.id]);
      const res = await out(cookie, body(ev.outToken!, { verifyCode: ev.verifyCode })).expect(429);
      expect(res.body.code).toBe('CODE_ENTRY_PAUSED');
      expect((await att(attendance.id)).checkoutAt).toBeNull();
      expect((await att(attendance.id)).codeFailCount).toBe(0); // chua tieu phieu
      // het cua so thi nhan lai
      await w.ds.query('UPDATE event_code_failures SET window_started_at = NOW(3) - INTERVAL 11 MINUTE');
      await out(cookie, body(ev.outToken!, { verifyCode: ev.verifyCode })).expect(201);
    });

    it('moi lan sai cong vao tran su kien; cua so cu het han thi dem lai tu 1', async () => {
      const ev = await tight();
      const a = await checkinAs(w, ev.token);
      const b = await checkinAs(w, ev.token);
      const wrong = wrongCode(ev.verifyCode!);
      await out(a.cookie, body(ev.outToken!, { verifyCode: wrong })).expect(400);
      await out(b.cookie, body(ev.outToken!, { verifyCode: wrong })).expect(400);
      expect((await w.ds.query('SELECT fail_count AS n FROM event_code_failures'))[0].n).toBe(2);
      await w.ds.query('UPDATE event_code_failures SET window_started_at = NOW(3) - INTERVAL 11 MINUTE');
      await out(a.cookie, body(ev.outToken!, { verifyCode: wrong })).expect(400);
      expect((await w.ds.query('SELECT fail_count AS n FROM event_code_failures'))[0].n).toBe(1);
    });

    it('[BM] doi ma 4 so thi ma cu khong con dung, ma moi dung duoc', async () => {
      const ev = await tight();
      let fresh = ev.verifyCode!;
      for (let i = 0; i < 5 && fresh === ev.verifyCode; i++) {
        fresh = (await as(app, w.admin).post(`/api/admin/events/${ev.id}/verify-code/rotate`).send({ reason: 'lo ma' }).expect(200)).body.verifyCode;
      }
      expect(fresh).not.toBe(ev.verifyCode);
      const { cookie } = await checkinAs(w, ev.token);
      expect((await out(cookie, body(ev.outToken!, { verifyCode: ev.verifyCode })).expect(400)).body.code).toBe('VERIFY_CODE_INVALID');
      await out(cookie, body(ev.outToken!, { verifyCode: fresh })).expect(201);
    });

    it('[BM] hash ma 4 so gan voi id su kien: hash hop le cua su kien KHAC khong qua duoc kiem tra', async () => {
      const a = await tight();
      const b = await tight();
      const qr = app.get(QrService);
      // dat hash "dung cho su kien b voi ma 1234" vao su kien a: nhap 1234 o a van phai bi tu choi
      await patchEvent(w, a.id, { verifyCodeHash: qr.hashVerifyCode(b.id, '1234') });
      const { cookie } = await checkinAs(w, a.token);
      expect((await out(cookie, body(a.outToken!, { verifyCode: '1234' })).expect(400)).body.code).toBe('VERIFY_CODE_INVALID');
      await patchEvent(w, a.id, { verifyCodeHash: qr.hashVerifyCode(a.id, '1234') });
      await out(cookie, body(a.outToken!, { verifyCode: '1234' })).expect(201);
    });

    it('[BM] muc Chat ma mat hash (du lieu hong): tu choi het, khong cho qua', async () => {
      const ev = await tight();
      const { cookie } = await checkinAs(w, ev.token);
      await patchEvent(w, ev.id, { verifyCodeHash: null });
      expect((await out(cookie, body(ev.outToken!, { verifyCode: ev.verifyCode })).expect(400)).body.code).toBe('VERIFY_CODE_INVALID');
    });

    it('[BM] ma 4 so khong bao gio nam ro trong DB', async () => {
      const ev = await tight();
      const { cookie } = await checkinAs(w, ev.token);
      await out(cookie, body(ev.outToken!, { verifyCode: ev.verifyCode })).expect(201);
      const dump = JSON.stringify(await w.ds.query('SELECT * FROM events'))
        + JSON.stringify(await w.ds.query('SELECT * FROM attendances'))
        + JSON.stringify(await w.ds.query('SELECT * FROM event_code_failures'));
      expect(dump).not.toContain(`"${ev.verifyCode}"`);
    });
  });
});
